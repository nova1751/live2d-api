import { posix } from 'node:path';
import type { Library } from './library-files.mts';

interface Clip {
  file?: string;
  sound?: string;
  text?: string;
  command?: string;
}
interface Classic {
  model: string | Record<string, string>;
  textures: string[];
  physics?: string;
  pose?: string;
  expressions?: { file: string }[];
  motions?: Record<string, Clip[]>;
}
type Report = { id: string; original: string; replacements: Record<string, string | null> };
export function archiveClassicVariants(
  library: Library,
  entries: Map<string, string>,
  read: (oid: string) => string,
  write: (path: string, data: string) => void,
) {
  const base = decodeURIComponent(library.sources.eikanya.baseUrl).replace(/^\//, '');
  const folders = new Map<string, string[]>();
  for (const path of entries.keys()) {
    if (!path.startsWith(base) || !path.includes('/live2dold/')) continue;
    const folder = posix.dirname(path);
    (folders.get(folder) ?? folders.set(folder, []).get(folder)!).push(path);
  }
  const report: Report[] = [];
  const clean = (s: string) =>
    s
      .replace(/ #\d+(?=\.|$)/g, '')
      .replace(/ +\./g, '.')
      .replace(/\.exp\.json$/i, '.exp')
      .toLowerCase();
  const encoded = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  for (const [id, variants] of Object.entries(library.models)) {
    for (const v of variants) {
      if (v.source !== 'eikanya' || !v.binary?.includes('/live2dold/') || !v.binary.endsWith('.moc'))
        continue;
      const original = v.manifest ?? posix.join(posix.dirname(v.binary), 'model.json');
      const path = base + original,
        oid = entries.get(path);
      if (!oid) continue;
      const rig = posix.basename(v.binary);
      const dir = posix.dirname(path);
      let text = read(oid);
      const repairs: Record<string, string | null> = {};
      // Two Lewis exports end with an extra closing brace. ZB-26 has an empty clip after its last entry.
      if (
        ['37df4cf2327d9533d91290b43820b3f476f25ae0', 'e11efe5b464cc8c6655b1574bf4765f38e7001c8'].includes(
          oid,
        )
      ) {
        text = text.trimEnd().slice(0, -1);
        repairs['extra closing brace'] = null;
      }
      if (oid === 'd77850cb1df6837ec2a9c27c15e959604e3d066a') {
        text = text.replace(/\s+\{"file":""\}/, '');
        repairs['empty motion entry'] = null;
      }
      const model: Classic = JSON.parse(
        text
          .replace(/^\uFEFF/, '')
          .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (token, close) => close || token),
      );
      if (!v.manifest && (typeof model.model !== 'object' || !Object.values(model.model).includes(rig)))
        continue;
      if (typeof model.model === 'object') {
        if (!Object.values(model.model).includes(rig)) throw Error('Unlisted fairy rig ' + v.binary);
        model.model = rig;
        repairs['tier ' + id.split('/')[2]] = rig;
      }
      const available = [
        ...(folders.get(dir) ?? []),
        ...['motions', 'expressions', 'sounds', 'model.1024', 'model.2048', 'texture'].flatMap(
          (d) => folders.get(posix.join(dir, d)) ?? [],
        ),
      ];
      function file(input: string, required = false): string | undefined {
        const full = posix.join(dir, input);
        let match: string | undefined;
        if (entries.has(full)) match = full;
        else {
          const candidates = available.filter(
            (f) => clean(posix.basename(f)) === clean(posix.basename(input)),
          );
          if (candidates.length === 1) match = candidates[0];
        }
        if (!match && required) throw Error('Cannot resolve required file ' + full);
        const replacement = match && encoded(posix.relative(dir, match));
        if (replacement !== input) repairs[input] = replacement ?? null;
        return replacement;
      }
      model.model = file(model.model, true)!;
      model.textures = model.textures.map((x) => file(x, true)!);
      for (const field of ['physics', 'pose'] as const) if (model[field]) model[field] = file(model[field]);
      if (model.expressions)
        model.expressions = model.expressions.flatMap((e) => {
          const f = file(e.file);
          return f ? [{ ...e, file: f }] : [];
        });
      for (const [group, clips] of Object.entries(model.motions ?? {})) {
        model.motions![group] = clips.flatMap((c) => {
          if (c.sound) c.sound = file(c.sound);
          if (c.file) c.file = file(c.file);
          return c.file || c.sound || c.text || c.command ? [c] : [];
        });
      }
      if (!Object.keys(repairs).length) continue;
      // Keep the original file and write a playable sibling to preserve its relative asset paths.
      const sibling = posix.join(
        posix.dirname(original),
        'archive-' + posix.basename(v.binary, '.moc') + '-' + posix.basename(original),
      );
      write(base + sibling, JSON.stringify(model));
      v.manifest = sibling;
      report.push({ id, original, replacements: repairs });
    }
  }
  return report;
}
