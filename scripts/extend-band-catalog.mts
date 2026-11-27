import { posix } from 'node:path';
import { readFile } from 'node:fs/promises';
import { bandDreamManifest } from '../src/library/band-dream-export.ts';
import type { GalleryEntry, GameCue, ModelCatalog } from '../src/library/catalog.ts';
import { json, pool, raw, tree } from './game-sources.mts';

const repo = 'haneoka-gakuen/bangdream-live2d';
const revision = '273b1cd994abc01622f35fc2eddbe8290c19e6a3';
const base = raw + repo + '/' + revision + '/';
const prefix = 'live2d/chara/';
type Characters = Record<string, Record<string, string | number>>;
type Costume = { description?: string[]; publishedAt?: (string | number)[] };

export async function extendBandCatalog(
  catalog: ModelCatalog,
  characterIds: Characters,
  byCostume: Map<string, Costume>,
) {
  const [files, story] = await Promise.all([
    tree(repo, revision),
    readFile(new URL('../catalog/games/voices/event154-06.json', import.meta.url), 'utf8')
      .then(text => JSON.parse(text) as { id: string; cues: Record<string, GameCue> }),
  ]);
  const aliases = new Map<string, { band: string; code: string }>();
  for (const [band, characters] of Object.entries(characterIds)) {
    for (const [code, id] of Object.entries(characters)) {
      if (/^\d+$/.test(String(id))) {
        aliases.set(String(id).padStart(3, '0'), { band, code: code.padStart(3, '0') });
      }
    }
  }
  const existing = new Set<string>();
  const characters = new Map<string, GalleryEntry>();
  for (const id of Object.keys(catalog.models)) {
    const [band, code, outfit] = id.split('/');
    const character = characterIds[band]?.[String(Number(code))];
    if (!character || !/^\d+$/.test(String(character))) continue;
    const canonical = String(character).padStart(3, '0');
    existing.add((canonical + outfit.slice(3)).replace(/_活动\d+$/, '').toLowerCase());
    const entry = catalog.gallery?.[id];
    if (entry && !characters.has(canonical)) characters.set(canonical, entry);
  }

  const entries = new Map<string, { path: string; display: GalleryEntry; repairs?: Record<string, string | null>; cues?: Record<string, GameCue> }>();
  const unavailable = new Map<string, string>();
  const missingPhysics = new Map<string, string>();
  const manifests = [...files.keys()].filter(path => {
    const match = /^live2d\/chara\/((\d{3})_.+)_rip\/buildData\.asset$/.exec(path);
    return match && !match[1].endsWith('_general') && !existing.has(match[1].toLowerCase()) && aliases.has(match[2]);
  });
  await pool(manifests, async path => {
    const bundle = posix.basename(posix.dirname(path)).slice(0, -4);
    const canonical = bundle.slice(0, 3);
    const identity = aliases.get(canonical)!;
    const character = characters.get(canonical);
    if (!character) return;
    const id = identity.band + '/' + identity.code + '/' + bundle;
    const data: unknown = await json(base + path);
    let manifest: ReturnType<typeof bandDreamManifest>;
    try {
      manifest = bandDreamManifest(data);
    } catch (error) {
      unavailable.set(id, String(error));
      return;
    }
    const refs = [manifest.model, ...manifest.textures, ...manifest.expressions.map(e => e.file),
      ...Object.values(manifest.motions).flat().map(m => m.file)];
    const missing = refs.find(file => file && !files.has(posix.join(posix.dirname(path), file)));
    if (missing || !manifest.motions.idle?.length) {
      unavailable.set(id, missing ?? 'No native idle motion');
      return;
    }
    const cues = id === story.id ? story.cues : undefined;
    if (cues && Object.keys(cues).some(file => !refs.includes(file)))
      throw Error('Story cue references an unknown motion in ' + id);
    let repairs: Record<string, string | null> | undefined;
    const physics = manifest.physics;
    if (physics && !files.has(posix.join(posix.dirname(path), physics))) {
      // Look for the exact referenced filename in this character's bundles. If
      // revisions disagree, only consider another export from the same event.
      const sameCharacter = [...files.keys()].filter(file =>
        file.startsWith(prefix + canonical + '_') && posix.basename(file) === posix.basename(physics));
      const event = /^\d{3}_event_\d+_story_/.exec(bundle)?.[0];
      const candidates = new Set(sameCharacter.map(file => files.get(file))).size > 1
        ? sameCharacter.filter(file => event && file.startsWith(prefix + event)) : sameCharacter;
      if (new Set(candidates.map(file => files.get(file))).size === 1) {
        repairs = { [physics]: base + candidates[0] };
      } else {
        missingPhysics.set(id, physics);
        repairs = { [physics]: null };
      }
    }
    const costume = byCostume.get(bundle);
    entries.set(id, { path: path.slice(prefix.length), repairs, cues, display: {
      name: character.name,
      en: character.en,
      outfit: costume?.description?.[3] || bundle.slice(4).replaceAll('_', ' '),
      outfitEn: costume?.description?.[1] || undefined,
      date: Number(costume?.publishedAt?.[0]) || undefined,
      portrait: character.portrait,
    } });
  });
  catalog.sources.bestdori = { baseUrl: base + prefix };
  if (entries.get(story.id)?.cues) catalog.sources.story = { baseUrl: './voices/' };
  for (const [id, { path, display, repairs, cues }] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    catalog.models[id] = [{ source: 'bestdori', manifest: path, files: repairs, cueSource: cues ? 'story' : undefined, cues }];
    (catalog.gallery ??= {})[id] = display;
  }
  return { added: entries.size, unavailable, missingPhysics };
}

export async function importRecoveredBandCostumes(catalog: ModelCatalog) {
  const file = new URL('../catalog/games/band-dream-cn/sources.json', import.meta.url);
  const { entries } = JSON.parse(await readFile(file, 'utf8')) as {
    entries: { id: string; manifest: string; display: GalleryEntry }[];
  };
  const source = 'bestdori-cn-snapshot';
  catalog.sources[source] = { baseUrl: './band-dream-cn/' };
  catalog.gallery ??= {};
  for (const { id, manifest, display } of entries) {
    if (catalog.models[id]) throw Error('Duplicate recovered BanG Dream costume ' + id);
    catalog.models[id] = [{ source, manifest }];
    catalog.gallery[id] = display;
  }
}

export async function importOurNotesCostumes(catalog: ModelCatalog) {
  const manifest = new URL('../catalog/games/our-notes/sources.json', import.meta.url);
  const { packs } = JSON.parse(await readFile(manifest, 'utf8')) as {
    packs: { name: string; tag: string; entries: { id: string; manifest: string; display: GalleryEntry }[] }[];
  };
  catalog.gallery ??= {};
  for (const { name, tag, entries } of packs) {
    const source = 'our-notes-' + name;
    catalog.sources[source] = { baseUrl: 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@' + tag + '/' };
    for (const { id, manifest, display } of entries) {
      if (catalog.models[id]) throw Error('Duplicate Our Notes costume ' + id);
      catalog.models[id] = [{ source, manifest }];
      catalog.gallery[id] = display;
    }
  }
}
