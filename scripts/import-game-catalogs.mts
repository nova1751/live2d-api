import { recoverHoukai } from './recover-houkai.mts';
import { extendAzurCatalog } from './extend-azur-catalog.mts';
import { extendBandCatalog } from './extend-band-catalog.mts';
import { preserveSceneCurtains } from './library-files.mts';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { bands, cache, json, pool, raw, tree } from './game-sources.mts';

const destination = 'catalog/games';
await mkdir(destination, { recursive: true });
const repairs = [],
  unresolved = [],
  unavailable = [];
function library() {
  return { schemaVersion: 1, sources: {}, models: {}, gallery: {} };
}
function add(lib, id, source, manifest, options, display) {
  if (lib.models[id]) throw Error('Duplicate model ' + id);
  lib.models[id] = [{ source, manifest, ...options }];
  lib.gallery[id] = display;
}
async function save(name, data) {
  // Every collection keeps its reviewed curtains and skipped effect layers.
  preserveSceneCurtains(join(destination, name + '.json'), data);
  await writeFile(
    join(destination, name + '.json'),
    JSON.stringify(data) + '\n',
  );
}
function pathsFor(manifest) {
  return [
    manifest.model,
    ...(manifest.textures || []),
    manifest.physics,
    manifest.pose,
    ...(manifest.expressions || []).map((e) => e.file),
    ...Object.values(manifest.motions || {})
      .flat()
      .flatMap((c) => [c.file, c.sound]),
  ].filter(Boolean);
}
// The web archive uses standalone character numbers. Match the costume to its original
// game character and read buildData's per-file bundle path before recovering a clip.
const bandArchive =
  raw +
  'haneoka-gakuen/bangdream-live2d/2ed0434efb999b78bc282ad27b3964395a32340a/';
const recoveryOutfits = {
  'hhw/012/012_dream_festival_4_ur': '014_dream_festival_4_ur',
  'mygo/039/039_live_event_297_ur_活动297': '039_live_event_297_ur',
};
async function legacyOptions(files, folder, manifest, id, recovery) {
  const aliases = { ...recovery?.files };
  if (!manifest.model || !manifest.textures?.length) {
    unavailable.push({ id, reason: 'Missing model or textures' });
    return;
  }
  for (const file of new Set(pathsFor(manifest))) {
    if (files.has(posix.join(folder, file)) || aliases[file]) continue;
    if (file === manifest.model || manifest.textures.includes(file)) {
      unavailable.push({ id, file });
      return;
    }
    const outfit = recoveryOutfits[id];
    if (outfit) {
      const manifestUrl =
        bandArchive + 'live2d/chara/' + outfit + '_rip/buildData.asset';
      const source = (await json(manifestUrl)).Base;
      const name = posix.basename(file);
      const ref = [...source.expressions, ...source.motions].find(
        (entry) => entry.fileName.replace(/\.bytes$/, '') === name,
      );
      if (ref) {
        const from = bandArchive + ref.bundleName + '_rip/' + name;
        const response = await fetch(from);
        if (!response.ok) throw Error('Missing original ' + from);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (name.endsWith('.json')) JSON.parse(bytes.toString('utf8'));
        else if (!bytes.toString('utf8', 0, 80).includes('Live2D'))
          throw Error('Invalid motion ' + from);
        aliases[file] = from;
        repairs.push({
          id,
          file,
          from,
          manifestUrl,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        continue;
      }
    }
    aliases[file] = null;
    unresolved.push({ id, file });
  }
  return Object.keys(aliases).length ? { files: aliases } : {};
}
const costumeData =
  'haneoka-gakuen/bangdream-live2d/2ed0434efb999b78bc282ad27b3964395a32340a/data/';
const [characterIds, characters, costumes] = await Promise.all([
  readFile(new URL('./game-characters.json', import.meta.url), 'utf8').then(
    JSON.parse,
  ),
  json(raw + costumeData + 'characters.all.5.json'),
  json(raw + costumeData + 'costumes.all.5.json'),
]);
const byCostume = new Map(
  Object.values(costumes).map((c) => [c.assetBundleName, c]),
);
const casual = {
  casual: '日常服装',
  live_default: '演出服',
  school_summer: '夏季校服',
  school_winter: '冬季校服',
  casual_summer: '夏季便服',
  casual_winter: '冬季便服',
};
const bandLibrary = library();
const bandPacks = {
  '880be40fc1f06e0a317aa10e5830a0a2d5723749': '013_live_event_93_sr',
  '57da53a60df8f55de0245f7898c3dc0c9021dd55': '047_live_event_139_r',
  'cdef09188bd51d13b6423f49665082cf2e37db6b': '019_casual',
};
for (const [band, [commit, sha]] of Object.entries(bands)) {
  const repo = 'U1s1-king/dsh-live2d-' + band;
  const base = raw + repo + '/' + commit + '/assets/';
  const files = await tree(repo, sha);
  const folders = [...files.keys()]
    .filter((f) => f.endsWith('/index.json'))
    .map(posix.dirname);
  const packed = bandPacks[commit];
  bandLibrary.sources[band] = {
    baseUrl: base + 'model/',
    ...(packed && { packs: [{
      baseUrl: 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-bang-dream-' + band + '-' + commit.slice(0, 12) + '/assets/model/',
      directories: [packed],
    }] }),
  };
  const manifests = new Map();
  await pool(folders, async (folder) =>
    manifests.set(folder, await json(base + 'model/' + folder + '/index.json')),
  );
  for (const folder of folders) {
    const m = manifests.get(folder);
    const [number, ...parts] = folder.split('_'),
      code = parts.join('_');
    const person = characterIds[band][+number];
    if (!person) throw Error('Unknown character ' + band + '/' + number);
    const character = characters[person];
    const actual = String(person).padStart(3, '0') + '_' + code;
    const costume = byCostume.get(actual);
    const id = band + '/' + number + '/' + folder;
    const opts = await legacyOptions(files, folder, m, id);
    if (!opts) continue;
    const title =
      casual[code] ||
      costume?.description[3] ||
      code.split('_').findLast((v) => /[\u3400-\u9fff]/.test(v)) ||
      code.replaceAll('_', ' ');
    const name =
      band === 'hhw' && +number === 22
        ? '奥泽美咲'
        : character?.characterName[3]?.replaceAll(' ', '') || person;
    add(bandLibrary, id, band, folder + '/index.json', opts, {
      name,
      en: character?.characterName[1],
      outfit: title,
      outfitEn: costume?.description[1],
      date:
        code === 'casual' ? 0 : Number(costume?.publishedAt?.[0]) || undefined,
      portrait: base + 'assets/chara_icon_' + Number(number) + '.png',
    });
  }
}
const bandExpansion = await extendBandCatalog(bandLibrary, characterIds, byCostume);
for (const [id, reason] of bandExpansion.unavailable) unavailable.push({ id, reason });
await save('bang-dream', bandLibrary);

const houkai = library(),
  bhRepo = 'Eikanya/Live2d-model',
  bhCommit = '7e446cbd95ec352cdb0f73c079e4d075d7d528ac';
const bhFiles = await tree(bhRepo, 'cdf9de1d37f197e37b6b3c6fe40c487c17867714');
const bhBase = raw + bhRepo + '/' + bhCommit + '/崩坏学园2/';
houkai.sources.archive = { baseUrl: bhBase };
const bhNames = {
  mie: '雷电芽衣',
  BYC: '八重樱',
  Kiana: '琪亚娜',
  Kiro: '时雨绮罗',
  Lita: '丽塔',
  Nina: '妮娜',
  Nindi: '宁蒂',
  bronya: '布洛妮娅',
  delisha: '德丽莎',
  himeko: '姬子',
  houraiji: '蓬莱寺九霄',
  kaguya: '耀夜姬',
  keluoyi: '柯罗伊',
  shin: '杏',
  xier: '希儿',
  'xilin2.1': '西琳',
  yazakura: '八重樱',
  yiselin: '伊瑟琳',
};
for (const f of bhFiles.keys()) {
  if (!f.endsWith('/model.json')) continue;
  const folder = posix.dirname(f),
    m = await json(bhBase + f);
  const person = folder === 'BYC' ? 'yazakura' : folder,
    id = 'character/' + person + '/' + folder;
  const recovery = await recoverHoukai(folder, m, bhBase, bhFiles);
  const options = await legacyOptions(bhFiles, folder, m, id, recovery);
  if (recovery && options) { options.cues = recovery.cues; repairs.push(...recovery.repairs); }
  if (options)
    add(houkai, id, 'archive', f, options, {
      name: bhNames[folder] || folder,
      en: folder === 'mie' ? 'Raiden Mei' : person,
      outfitEn: folder === 'BYC' || folder === 'yazakura' ? folder : 'Original',
      outfit: folder === 'BYC' || folder === 'yazakura' ? folder : '原版',
      portrait: './games/portraits/' + folder + '.webp',
    });
}
await save('houkai2', houkai);

const az = library(),
  azRepo = 'Chaoray/AzurLane-Live2D-Viewer',
  azCommit = '88cb6e56a0ad472fe7e546509f096545d2bbc5b9';
const files = await tree(azRepo, azCommit),
  base = raw + azRepo + '/' + azCommit + '/';
az.sources.archive = { baseUrl: base };
const data =
  raw +
  'AzurLaneTools/AzurLaneData/4cca5c2437007b62d30a6235fcfc0c0203231378/CN/';
const [skins, words, names] = await Promise.all(
  [
    'ShareCfg/ship_skin_template.json',
    'sharecfgdata/ship_skin_words.json',
    'ShareCfg/name_code.json',
  ].map((p) => json(data + p)),
);
const jpWords = await json(data.replace('/CN/', '/JP/') + 'sharecfgdata/ship_skin_words.json');
const extraWords = await Promise.all(['CN', 'JP', 'EN'].map(lang =>
  json(data.replace('/CN/', '/' + lang + '/') + 'ShareCfg/ship_skin_words_extra.json')));
const [enSkins, enWords, enNames] = await Promise.all(
  [
    'ShareCfg/ship_skin_template.json',
    'sharecfgdata/ship_skin_words.json',
    'ShareCfg/name_code.json',
  ].map((p) => json(data.replace('/CN/', '/EN/') + p)),
);
const english = (s) =>
  s?.replace(/\{namecode:(\d+)\}/g, (v, i) => enNames[i]?.name || v);
const localize = (s) =>
  s.replace(/\{namecode:(\d+)\}/g, (v, i) => names[i]?.name || v);
const skinList = Object.values(skins)
  .filter((s) => s.painting)
  .sort((a, b) => a.id - b.id);
const portraits = new Map(
  [...files.keys()]
    .filter((f) => f.startsWith('shipmodels/'))
    .map((f) => [posix.basename(f, '.png').toLowerCase(), f]),
);
const voiceRepo = 'Fernando2603/AzurLane',
  voiceRev = '219db8feba07058dde232c461218bdacaaefdc17';
const voiceGit = join(cache, 'voices.git');
if (!existsSync(voiceGit))
  execFileSync('git', [
    'clone',
    '--bare',
    '--depth=1',
    '--filter=blob:none',
    'https://github.com/' + voiceRepo + '.git',
    voiceGit,
  ]);
const git = (...args) =>
  execFileSync('git', ['--git-dir=' + voiceGit, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
try {
  git('rev-parse', '--verify', voiceRev + '^{commit}');
} catch {
  git('fetch', '--depth=1', 'origin', voiceRev);
}
const sounds = new Set(
  git('ls-tree', '-r', '--name-only', voiceRev + ':audio/voiceline')
    .trim()
    .split(/\r?\n/),
);
const keys = {
  ...Object.fromEntries(['battle','detail','feeling1','feeling2','feeling3','feeling4','feeling5','hp_warning','lose','skill','unlock','upgrade','win_mvp'].map(key => [key,key])),
  touch_head: 'headtouch',
  touch_body: 'touch',
  touch_special: 'touch2',
  login: 'login',
  home: 'home',
  complete: 'expedition',
  mail: 'mail',
  wedding: 'propose',
  mission: 'mission',
  mission_complete: 'mission_complete',
};
const manifests = [...files.keys()].filter((f) =>
  /^live2d\/[^/]+\/[^/]+\.model3\.json$/.test(f),
);
const models = new Map();
await pool(manifests, async (f) => models.set(f, await json(base + f)));
for (const path of manifests) {
  const folder = posix.dirname(path),
    code = posix.basename(folder),
    painting = code.replace(/_hx$/i, '').toLowerCase();
  const skin = skinList.find((s) => s.painting.toLowerCase() === painting),
    ship = skin && skins[skin.ship_group * 10];
  const id = 'ship/' + (skin?.ship_group || code) + '/' + code,
    refs = models.get(path).FileReferences;
  const required = [
    refs.Moc,
    ...refs.Textures,
    refs.Physics,
    refs.Pose,
    refs.DisplayInfo,
    refs.UserData,
    ...(refs.Expressions || []).map((e) => e.File),
    ...Object.values(refs.Motions || {})
      .flat()
      .map((e) => e.File),
  ].filter(Boolean);
  const missing = required.filter((p) => !files.has(posix.join(folder, p)));
  if (missing.length) {
    unavailable.push({ id, missing });
    continue;
  }
  const cues = {},
    lines = words[skin?.id] || {};
  for (const group of Object.keys(refs.Motions || {})) {
    if (group.endsWith('_ex')) {
      const baseGroup = group.slice(0, -3);
      const mainIndex = /^main_(\d+)$/.exec(baseGroup)?.[1];
      const field = mainIndex ? 'main' : keys[baseGroup];
      const file = skin?.id + '/' + (mainIndex ? 'main' + mainIndex : field) + '_ex.ogg';
      if (!field || !sounds.has(file)) continue;
      const lines = extraWords.map(table => {
        const rows = table[skin.id]?.[field];
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0][0] !== 1100) return;
        const line = mainIndex ? rows[0][1].split('|')[Number(mainIndex) - 1] : rows[0][1];
        return line && line !== 'nil' ? line.trim() : undefined;
      });
      if (lines.every(Boolean)) cues[group] = { sound: raw + voiceRepo + '/' + voiceRev + '/audio/voiceline/' + file,
        caption: localize(lines[0]), captionEn: english(lines[2]) };
      continue;
    }
    const main = /^main_(\d+)$/.exec(group),
      key = keys[group] || (main && 'main' + main[1]);
    if (!key) continue;
    function line(row) {
      const value = main ? row?.main?.split('|')[+main[1] - 1] : row?.[key];
      if (typeof value !== 'string' || !value.trim() || value.trim() === 'nil') return;
      return value.trim();
    }
    let caption = line(lines);
    let file = skin?.id + '/' + key + '.ogg';
    let enLine = line(enWords[skin?.id]);
    const original = ship?.id;
    const jp = line(jpWords[skin?.id]);
    const baseZh = line(words[original]), baseJp = line(jpWords[original]), baseEn = line(enWords[original]);
    // ShipWordHelper resolves an empty/nil event through the default skin. A distinct
    // localized line or a disabled voice key must never borrow that recording.
    if (!sounds.has(file) && original && original !== skin?.id && lines.voice_key === 0 && baseZh && baseJp &&
        (!caption || caption === baseZh) && (!jp || jp === baseJp) && (!enLine || enLine === baseEn) &&
        sounds.has(original + '/' + key + '.ogg')) {
      file = original + '/' + key + '.ogg';
      caption ??= baseZh;
      enLine ??= baseEn;
    }
    const sound = sounds.has(file)
      ? raw + voiceRepo + '/' + voiceRev + '/audio/voiceline/' + file
      : undefined;
    if (sound || caption || enLine)
      cues[group] = {
        sound,
        captionEn:
          typeof enLine === 'string' ? english(enLine.trim()) : undefined,
        caption:
          typeof caption === 'string' ? localize(caption.trim()) : undefined,
      };
  }
  // These scene rigs include a full artboard and parked meshes beyond its edge.
  // Ratios use the canvas dimensions from each pinned moc3, including its HX edition.
  const scene = code.replace(/_hx$/, '');
  const sceneAspect = scene === 'aimudeng_2' ? 6000 / 6502 : scene === 'ankeleiqi_2' ? 9 / 7 : undefined;
  const portrait = portraits.get(code.toLowerCase()) || portraits.get(painting);
  const englishOutfit =
    skin && (skin.group_index ? english(enSkins[skin.id]?.name) : 'Original');
  const suffix = code.endsWith('_hx') ? ' · HX' : '';
  add(
    az,
    id,
    'archive',
    path,
    { cues, sceneAspect },
    {
      name: localize(ship?.name || skin?.name || code),
      en: english(enSkins[skin?.ship_group * 10]?.name) || undefined,
      outfitEn: englishOutfit ? englishOutfit + suffix : undefined,
      outfit: (skin?.group_index ? localize(skin.name) : '原版') + suffix,
      date: skin?.id,
      portrait: portrait ? base + portrait : undefined,
    },
  );
}
await extendAzurCatalog(az, keys, localize, english);
await save('azur-lane', az);
await save('audit', { repairs, unresolved, unavailable });
for (const [name, lib] of Object.entries({ bandLibrary, houkai, az }))
  console.log(name, Object.keys(lib.models).length);
console.log(
  'repaired',
  repairs.length,
  'unresolved',
  unresolved.length,
  'excluded',
  unavailable.length,
);
