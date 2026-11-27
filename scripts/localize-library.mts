import { recoverNativeEvents } from './recover-native-events.mts';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, repository, type Library } from './library-files.mts';

const root = process.argv[2];
if (!root) throw new Error('Pass the downloaded model library directory');
async function loadTables(region: string, revision: string, cache?: string) {
  async function table(path: string) {
    if (cache) return readFile(join(cache, path.replaceAll('/', '_')), 'utf8');
    const response = await fetch('https://raw.githubusercontent.com/gf-data-tools/gf-data-' + region + '/' + revision + '/' + path);
    if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
    return response.text();
  }
  const [oldVoice, newVoice, gunTable, gunNames, skinTable, skinNames] = await Promise.all([
    'asset/profilesconfig/charactervoice.txt', 'asset/profilesconfig/newcharactervoice.txt',
    'stc/gun.json', 'asset/table/gun.txt', 'stc/skin.json', 'asset/table/skin.txt',
  ].map(table));
  const voice = new Map<string, string>();
  for (const line of (oldVoice + '\n' + newVoice).split(/\r?\n/)) {
    const match = /^([^|]+)\|([^|]+)\|(.+)$/.exec(line);
    if (match) voice.set((match[1] + '|' + match[2]).toUpperCase(), match[3].replace(/<>|\\n/g, '\n').trim());
  }
  const names = new Map((gunNames + '\n' + skinNames).split(/\r?\n/).map(line => {
    const cut = line.indexOf(',');
    return [line.slice(0, cut), line.slice(cut + 1)] as const;
  }));
  const guns = new Map<string, string>();
  const gunIds = new Map<number, string>();
  for (const row of JSON.parse(gunTable) as { id: number; code: string; name: string }[]) {
    const code = row.code.toLowerCase().replaceAll(' ', '-');
    gunIds.set(row.id, code);
    const name = names.get(row.name);
    if (name) guns.set(code, name);
  }
  const costumes = new Map<string, { title: string; order: number }>();
  for (const row of JSON.parse(skinTable) as { id: number; fit_gun: number; name: string; order: number }[]) {
    const code = gunIds.get(row.fit_gun);
    const title = names.get(row.name);
    if (code && title) costumes.set(code + '/' + row.id, { title, order: row.order });
  }
  return { voice, guns, costumes, table };
}
const file = join(repository, 'catalog/library.json');
const catalog = readJson<Library>(file);
const [{ voice, guns, costumes, table }, us] = await Promise.all([
  loadTables('ch', 'c6c763ca71e6f8450232fbd30e26900c51d2c09b', process.argv[3]),
  loadTables('us', '5be9af6692083246bd288b9326d0e576dbecb4f0', process.argv[4]),
]);
const motionTable = await table('stc/live2d_motions.json');
// The game can explicitly select a different subtitle key for a recording.
const eventLines = (JSON.parse(motionTable) as {id:number;voice:string;text:string;motion_name:string;is_hurt:number}[])
  .filter(row => row.text.startsWith('GUN|') && row.text !== row.voice);
const enLabels: Record<string,string> = {};
const enCaptions: Record<string,string> = {};
const labels: Record<string, string> = {};
const outfitOrder: Record<string, number> = {};
const captions: Record<string, string> = {};
const english = new Map<string, string>();
const legacyKeys = new Set<string>();
for (const [id, variants] of Object.entries(catalog.models)) {
  if (id.startsWith('other/')) continue;
  const [kind, who, skin] = id.split('/');
  if (kind === 'doll') {
    const name = us.guns.get(who);
    if (name) enLabels[kind + '/' + who] = name;
    const costume = us.costumes.get(who + '/' + skin);
    if (costume) enLabels[[kind, who, skin].join('/')] = costume.title.replaceAll('//c', ',') + ' (' + skin + ')';
  }
  const name = guns.get(who);
  if (kind === 'doll' && name) labels[kind + '/' + who] = name;
  const costume = kind === 'doll' && costumes.get(who + '/' + skin);
  if (costume) {
    const version = [kind, who, skin].join('/');
    labels[version] = costume.title + '（' + skin + '）';
    outfitOrder[version] = costume.order;
  }
  for (const item of variants) {
    const base = join(root, 'sources', item.source);
    if (item.dialogue) {
      const data = readJson<{variant:string;motionData:Record<string,{motion_name:string;voice:string}>;voiceData: Record<string,{char_code:string;voice_key:string;caption:string}>}>(join(base,item.dialogue));
      for (const row of eventLines) {
        const event = data.motionData[row.id];
        if (!event || event.voice !== row.voice || event.motion_name !== row.motion_name ||
            Boolean(row.is_hurt) !== (data.variant === 'destroy')) continue;
        const recording = data.voiceData[row.id];
        const voiceKey = (recording?.char_code + '|' + recording?.voice_key).toUpperCase();
        if (recording?.caption || voice.has(voiceKey) || item.cues?.[row.id]?.caption) continue;
        const key = row.text.slice(4).toUpperCase();
        const caption = voice.get(key), captionEn = us.voice.get(key);
        if (caption && captionEn) (item.cues ??= {})[row.id] = { caption, captionEn };
      }
      for (const line of Object.values(data.voiceData)) {
        if (line.voice_key) {
          const key = (line.char_code + '|' + line.voice_key).toUpperCase();
          if (line.caption || !english.has(key)) english.set(key, line.caption || '');
        }
      }
    }
    if (item === variants[0] && item.manifest && !item.manifest.endsWith('.model3.json')) {
      const model = readJson<{motions?: Record<string,{sound?:string}[]>}>(join(base,item.manifest));
      for (const entry of Object.values(model.motions ?? {}).flat()) {
        const match = /(?:^|\/)([^/]+)_([^_/]+)_JP\.[^.]+$/i.exec(entry.sound ?? '');
        if (match) legacyKeys.add((match[1] + '|' + match[2]).toUpperCase());
      }
    }
  }
}
// These Live2D-specific clips have English subtitles but no exact CN voice-table key.
// Use the base CN line only when the two English source captions also match.
const translations: Record<string,string> = {
  'AR15MOD_LIVE2D|ATTACK': '尽快把这些家伙解决掉！',
  'G36C_LIVE2D|LOADING': '指挥官，我们很快就能见面了。',
  'GENERALLIU_LIVE2D|MEET': '敌人来了，现在开火吗？',
  'HK416MOD_LIVE2D|DIALOGUE2': '我不介意帮助弱小的人形，这是强者的责任。但要是她们一直妨碍我的工作……我就得给她们一点教训了。',
  'HK416MOD_LIVE2D|DIALOGUE3': '放心吧，指挥官。有我在，再大的问题也能解决。',
  'HK416MOD_LIVE2D|GAIN': '我和以前有什么不同？没什么不同。毕竟，超过满分也还是满分。',
  'HK416MOD_LIVE2D|BUILDOVER': '新人，你跟得上我吗？',
  'HK416MOD_LIVE2D|HELLO': '请下达下一步指示，指挥官。',
  'HK416MOD_LIVE2D|SKILL3': '我不会手下留情。',
  'R93_LIVE2D|FEED': '这样我的运气也变好了吧？',
  'UMP9MOD_LIVE2D|FIX': '指挥官……能让我靠一下你的肩膀吗？',
};
for (const key of [...new Set([...english.keys(), ...legacyKeys])].sort()) {
  const base = key.replace('_LIVE2D|', '|');
  const text = voice.get(key) || (english.get(key) && english.get(key) === english.get(base) && voice.get(base)) || translations[key];
  if (text) captions[key] = text;
  else if (english.get(key)) throw new Error('Missing Chinese subtitle for ' + key);
}
// Archive IDs sharing both a compiled model and its ordered texture hashes with a numbered skin.
const aliases: Record<string,string> = {};
for (const [who, archive, skin, forms] of [
  ['ak12','archive','3302',['normal','destroy']], ['an94','archive','3303',['normal','destroy']],
  ['kp31','archive','310',['normal']], ['kp31','archive-alt','3101',['normal','destroy']],
] as const) for (const form of forms) {
  const old = ['doll',who,archive,form].join('/');
  const target = ['doll',who,skin,form].join('/');
  if (!catalog.models[old] || !catalog.models[target]) throw new Error('Missing archive pair ' + old);
  aliases[old] = target;
}
// CN maintenance announcements, archived at https://gf-ogas.wiki/wiki/少女前线/历届版本更新及登录图
// Position upgrades among this character's numbered outfits using the surrounding CN theme batches.
for (const [batch, characters] of [
  [19.5, ['m4a1', 'ar15']],                 // 2018-02-08
  [27.5, ['m4-sopmod-ii', 'ump45']],         // 2018-08-16
  [42.5, ['hk416', 'ump9', '88type']],       // 2019-08-08
  [55.5, ['g11', 'ro635']],                  // 2020-08-20
] as const) for (const character of characters) {
  const version = 'doll/' + character + '/mod';
  if (catalog.models[version + '/normal']) outfitOrder[version] = batch;
}
// Older manifests can use numbered clips without a game voice key.
const legacyLines = readJson<Record<string,string>>(join(repository, 'scripts/legacy-lines.en.json'));
for (const key of [...legacyKeys].sort()) {
  const text = english.get(key) || us.voice.get(key);
  if (text) enCaptions[key] = text.replaceAll('//c', ',');
}
catalog.presentation = { labels, captions, aliases, outfitOrder, en: { labels: enLabels, captions: { ...enCaptions, ...legacyLines } } };
recoverNativeEvents(catalog, root);
await writeFile(file, JSON.stringify(catalog) + '\n');
console.log(Object.keys(labels).length, 'labels;', Object.keys(captions).length, 'subtitles;', Object.keys(aliases).length, 'archive aliases');
