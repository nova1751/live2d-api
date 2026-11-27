import { posix } from 'node:path';
import type { ModelCatalog, GameCue } from '../src/library/catalog.ts';
import { json, pool, raw, tree } from './game-sources.mts';

const modelRepo = 'Eikanya/Live2d-model';
const modelRevision = '7e446cbd95ec352cdb0f73c079e4d075d7d528ac';
const modelTree = '8633c05afec0e127730344863182ac814520637f';
const modelBase = raw + modelRepo + '/' + modelRevision + '/碧蓝航线 Azue Lane/';
const voiceRepo = 'Fernando2603/AzurLane';
const voiceRevision = 'b2bad4ad4e1ff9e7bafa227812d0cfba3c2ef18c';
const voiceBase = raw + voiceRepo + '/' + voiceRevision + '/';
const dataBase = raw + 'AzurLaneTools/AzurLaneLuaScripts/0d35256720813b8dec897935cb667130e4dd8adc/CN/';

type Fields = Record<string, string>;
type Localize = (text: string) => string;
type Line = { link?: string; line?: string };

async function readData(file: string) {
  const response = await fetch(dataBase + file, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw Error(response.status + ' ' + response.url);
  return response.text();
}

async function luaRows(file: string) {
  const source = await readData('sharecfgdata/' + file);
  const rows = new Map<number, Fields>();
  // Read only the top-level scalar fields used by the catalog. Lua code is never evaluated.
  for (const [, id, block] of source.matchAll(/^_G\.pg\.base\.\w+\[(\d+)\] = \{\n([\s\S]*?)^\}/gm)) {
    const row: Fields = {};
    for (const [, key, string, number] of block.matchAll(/^\t(\w+) = (?:"((?:[^"\\]|\\.)*)"|(-?\d+)),?$/gm)) {
      row[key] = number ?? string.replace(/\\(["\\nrt])/g, (_, escape) =>
        ({ n: '\n', r: '\r', t: '\t' })[escape] ?? escape);
    }
    rows.set(Number(id), row);
  }
  if (!rows.size) throw Error('No Azur Lane rows in ' + file);
  return rows;
}

const line = (s?: string) => {
  const text = s?.trim();
  return text && text !== 'nil' ? text : undefined;
};

export async function extendAzurCatalog(catalog: ModelCatalog, keys: Record<string, string>, localize: Localize, english: Localize) {
  const [files, audio, icons, skins, words, names, enSkins, enWords] = await Promise.all([
    tree(modelRepo, modelTree),
    tree(voiceRepo, '10d656d9a093bd2e427e71a985b72367e2620b92'),
    tree(voiceRepo, 'e7445ec62921b1b5df4493188c62d369a18e641c'),
    luaRows('ship_skin_template.lua'),
    luaRows('ship_skin_words.lua'),
    readData('sharecfg/name_code.lua'),
    json(voiceBase + 'skin.json') as Promise<Record<number, { name?: string }>>,
    json(voiceBase + 'voiceline.json') as Promise<Record<number, Record<string, Line>>>,
  ]);
  const nameCodes = new Map([...names.matchAll(/pg\.base\.name_code\[(\d+)\] = \{\n\s+name = "([^"]*)"/g)]
    .map(([, id, name]) => [id, name]));
  const chinese = (text: string) => localize(text.replace(/\{namecode:(\d+)\}/g, (token, id) => nameCodes.get(id) ?? token));
  const byPainting = new Map<string, number>();
  for (const [id, skin] of skins) {
    const painting = skin.painting?.toLowerCase();
    if (!painting || /^900\d{3}$/.test(skin.ship_group)) continue;
    if (byPainting.has(painting)) continue;
    byPainting.set(painting, id);
  }

  const existing = new Set(Object.keys(catalog.models).map(id => id.split('/').at(-1)?.toLowerCase()));
  const paths = [...files.keys()].filter(path => {
    const code = posix.basename(posix.dirname(path));
    return posix.basename(path) === code + '.model3.json' && !existing.has(code.toLowerCase());
  });
  const added = new Map<string, { variant: ModelCatalog['models'][string][number]; display: NonNullable<ModelCatalog['gallery']>[string] }>();
  await pool(paths, async path => {
    const code = posix.basename(posix.dirname(path));
    const skinId = byPainting.get(code.toLowerCase().replace(/_hx$/, ''));
    const skin = skinId && skins.get(skinId);
    if (!skin || !skinId) throw Error('Unknown supplemental Azur Lane outfit ' + code);
    const manifest = await json(modelBase + path);
    const refs = manifest.FileReferences;
    const clips = Object.values(refs.Motions ?? {}).flat() as { File: string; Sound?: string }[];
    const dependencies = [
      refs.Moc, ...(refs.Textures ?? []), refs.Physics, refs.Pose, refs.DisplayInfo, refs.UserData,
      ...(refs.Expressions ?? []).map((entry: { File: string }) => entry.File),
      ...clips.flatMap(clip => [clip.File, clip.Sound]),
    ].filter(Boolean);
    if (!refs.Moc || !refs.Textures?.length || !clips.length ||
        dependencies.some(file => !files.has(posix.join(posix.dirname(path), file)))) {
      throw Error('Incomplete supplemental Azur Lane outfit ' + code);
    }

    const shipId = Number(skin.ship_group) * 10;
    const cues: Record<string, GameCue> = {};
    for (const group of Object.keys(refs.Motions ?? {})) {
      const main = /^main_(\d+)$/.exec(group);
      const key = main ? 'main' + main[1] : keys[group];
      if (!key) continue;
      const field = main ? 'main' : key;
      const zhLine = (row?: Fields) => line(main ? row?.[field]?.split('|')[Number(main[1]) - 1] : row?.[field]);
      const zh = zhLine(words.get(skinId));
      const asset = 'voiceline/' + skinId + '/' + key + '.ogg';
      const enEntry = enWords[skinId]?.[key];
      const en = enEntry?.link?.endsWith('/audio/' + asset) ? line(enEntry.line) : undefined;
      const sound = audio.has(asset) ? voiceBase + 'audio/' + asset : undefined;
      if (sound || zh || en) cues[group] = {
        sound,
        caption: zh && chinese(zh),
        captionEn: en && english(en),
      };
    }

    const ship = skins.get(shipId);
    const suffix = code.endsWith('_hx') ? ' · HX' : '';
    const icon = skinId + '/icon.png';
    added.set('ship/' + skin.ship_group + '/' + code, {
      variant: { source: 'eikanya', manifest: path, cues },
      display: {
        name: chinese(ship?.name ?? skin.name),
        en: enSkins[shipId]?.name && english(enSkins[shipId].name),
        outfit: (skin.group_index === '0' ? '原版' : chinese(skin.name)) + suffix,
        outfitEn: enSkins[skinId]?.name && (skin.group_index === '0' ? 'Original' : english(enSkins[skinId].name!)) + suffix,
        date: skinId,
        portrait: icons.has(icon) ? voiceBase + 'images/skin/' + icon : undefined,
      },
    });
  });

  catalog.sources.eikanya = { baseUrl: modelBase };
  for (const [id, { variant, display }] of [...added].sort(([a], [b]) => a.localeCompare(b))) {
    catalog.models[id] = [variant];
    (catalog.gallery ??= {})[id] = display;
  }
  return added.size;
}
