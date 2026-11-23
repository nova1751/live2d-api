import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, posix, resolve } from 'node:path';
import { readJson, type Library } from './library-files.mts';

interface Clip {
  file?: string;
  sound?: string;
  command?: string;
  text?: string;
}
interface Native {
  variant: string;
  motionData: Record<
    string,
    { motion_name: string; probability: number; is_hurt: number; delay: number; touch_area: string }
  >;
  voiceData: Record<string, { char_code: string; voice_key: string; caption?: string }>;
}

// Only upgrade a silent conversion when the same form contains its old motions and a playable voiced hit.
export function recoverNativeEvents(catalog: Library, root: string) {
  const source = catalog.sources.dump;
  const checkout = resolve(root, 'sources/dump').replaceAll('\\', '/');
  const revision = source.commit;
  const tree = execFileSync(
    'git',
    ['-c', 'safe.directory=' + checkout, '-C', checkout, 'ls-tree', '-rlz', revision],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const sizes = new Map<string, number>();
  for (const entry of tree.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t'),
      path = entry.slice(tab + 1);
    const dir = path
      .split('/')
      .slice(0, path.startsWith('models/') ? 3 : 2)
      .join('/');
    sizes.set(dir, (sizes.get(dir) ?? 0) + Number(entry.slice(0, tab).trim().split(/\s+/).at(-1)));
  }
  const audio = new Map(catalog.audio.dump.map((path) => [path.toUpperCase(), path]));
  const dirs = new Set<string>();
  const stem = (path: string) =>
    posix
      .basename(path)
      .replace(/\.(mtn|motion3\.json)$/i, '')
      .toLowerCase();
  let forms = 0,
    retained = 0;
  for (const [id, variants] of Object.entries(catalog.models)) {
    const [classic] = variants,
      native = variants.find((v) => v.source === 'dump' && v.dialogue);
    if (
      classic.source !== 'widget' ||
      !classic.manifest ||
      !native?.manifest ||
      !native.dialogue ||
      id.startsWith('doll/ots14/')
    )
      continue;
    delete native.collectionDefault;
    if (classic.cueSource === 'dump') {
      delete classic.cueSource;
      delete classic.cues;
    }
    const old = readJson<{ motions: Record<string, Clip[]> }>(join(root, 'sources/widget', classic.manifest));
    const clips = Object.values(old.motions || {}).flat();
    if (clips.some((c) => c.sound || c.command || c.text)) continue;
    const { FileReferences, HitAreas } = readJson<{
      FileReferences: { Motions: Record<string, { File: string }[]> };
      HitAreas?: { Name: string }[];
    }>(join(checkout, native.manifest));
    const files = new Set(
      Object.values(FileReferences.Motions || {})
        .flat()
        .map((c) => stem(c.File)),
    );
    const data = readJson<Native>(join(checkout, native.dialogue));
    const areas = new Set((HitAreas || []).map((a) => a.Name.toLowerCase()));
    const recording = (line?: Native['voiceData'][string]) =>
      line?.voice_key &&
      audio.get(
        ('audio/' + line.char_code + '/' + line.char_code + '_' + line.voice_key + '_JP.ogg').toUpperCase(),
      );
    if (clips.some((c) => c.file && !files.has(stem(c.file)))) {
      // Keep the old rig's unique motions. Only augment a clip with an unambiguous,
      // zero-delay cue for this exact filename and form in the native event table.
      const cues: NonNullable<typeof classic.cues> = {};
      for (const clip of clips) {
        if (!clip.file) continue;
        const events = Object.entries(data.motionData).filter(
          ([, m]) =>
            m.motion_name === clip.file &&
            Boolean(m.is_hurt) === (data.variant === 'destroy') &&
            m.probability > 0,
        );
        if (!events.length || events.some(([, m]) => m.delay || !m.touch_area || m.touch_area === '0'))
          continue;
        const lines = events.map(([id]) => data.voiceData[id]);
        const first = lines[0];
        if (
          !first?.voice_key ||
          !lines.every(
            (l) =>
              l?.char_code === first.char_code &&
              l?.voice_key === first.voice_key &&
              l?.caption === first.caption,
          )
        )
          continue;
        const sound = recording(first) || undefined;
        const key = (first.char_code + '|' + first.voice_key).toUpperCase();
        const caption = catalog.presentation?.captions[key] || first.caption;
        if (!sound && !caption) continue;
        cues[clip.file] = { sound, caption, captionEn: first.caption };
        if (sound) dirs.add(posix.dirname(sound));
      }
      if (Object.keys(cues).length) {
        classic.cues = cues;
        classic.cueSource = 'dump';
        retained++;
      }
      continue;
    }
    const hit = Object.entries(data.motionData).some(
      ([key, m]) =>
        m.probability > 0 &&
        areas.has(m.touch_area.toLowerCase()) &&
        Boolean(m.is_hurt) === (data.variant === 'destroy') &&
        (!m.motion_name || files.has(stem(m.motion_name))) &&
        recording(data.voiceData[key]),
    );
    if (!hit) continue;
    native.collectionDefault = true;
    forms++;
    dirs.add(posix.dirname(native.manifest));
    for (const line of Object.values(data.voiceData)) {
      const path = recording(line);
      if (path) dirs.add(posix.dirname(path));
    }
  }
  // The previous release already published the OTs-14 pack. Preserve its immutable URL.
  const packs = (source.packs ?? []).filter((pack) => !pack.baseUrl.includes('@cdn-gfl-'));
  const covered = new Set(packs.flatMap((pack) => pack.directories));
  let directories: string[] = [],
    bytes = 0;
  function flush() {
    if (!directories.length) return;
    const digest = createHash('sha256')
      .update([revision, ...directories].join('\n'))
      .digest('hex')
      .slice(0, 16);
    packs.push({
      baseUrl: 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-gfl-' + digest + '/',
      directories,
    });
    directories = [];
    bytes = 0;
  }
  for (const dir of [...dirs].sort()) {
    if (covered.has(dir)) continue;
    const size = sizes.get(dir);
    assert.ok(size && size < 38_000_000, 'Missing or oversized directory ' + dir);
    if (bytes + size >= 38_000_000) flush();
    directories.push(dir);
    bytes += size;
  }
  flush();
  source.packs = packs;
  console.log(
    forms,
    'native upgrades;',
    retained,
    'classic rigs with recovered cues;',
    packs.length,
    'native asset packs',
  );
}
