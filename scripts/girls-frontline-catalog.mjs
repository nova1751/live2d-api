import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';

// Only Git tree metadata is needed. Sparse and blobless clones both work.
const [primary, secondary] = process.argv.slice(2);
assert.ok(primary && secondary, 'Pass local Eikanya and jacksen168 checkouts, in that order');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const upstream = read('docs/model-sources.json');
const legacy = read('model_list.json').models;
const game = '少女前线 girls Frontline';
const sources = {
  eikanya: { repository: upstream.repository, commit: upstream.commit, assetRedistributionPermission: 'unverified' },
  jacksen168: { repository: 'https://github.com/jacksen168/Girls-Frontline-model', commit: '42b54cff59b1e1f20b352c019115f7b744a78bd2', assetRedistributionPermission: 'unverified' },
};
const out = 'catalog/girls-frontline';
const models = new Map();
const widgetByPath = new Map();
for (const [modelId, entry] of legacy.entries()) {
  for (const [modelTexturesId, skin] of [entry].flat().entries()) {
    const source = upstream.skins[skin];
    if (!source.startsWith(game + '/')) continue;
    const index = 'model/' + skin + '/index.json';
    // Fairy variants share a source manifest but point at different binaries.
    const binary = posix.join(posix.dirname(source), posix.basename(read(index).model));
    const widgets = widgetByPath.get(binary) ?? [];
    widgets.push({ index, modelId, modelTexturesId });
    widgetByPath.set(binary, widgets);
  }
}

function doll(folder, form) {
  const name = folder.toLowerCase();
  // Keep differently configured archive editions separate when no skin ID is known.
  const aliases = {
    'an-94': ['an94', 'archive'], 'ak12': ['ak12', 'archive'],
    'kp31': ['kp31', 'archive'], 'kp31_': ['kp31', 'archive-alt'],
    'rfb christmas': ['rfb', 'archive-christmas'], '汤姆森 m1928a1': ['m1928a1', 'archive'],
  };
  const match = /^(.+)_(\d+)$/.exec(name);
  const [character, version] = aliases[name] ?? (match ? match.slice(1) :
    name.endsWith('mod') ? [name.slice(0, -3), 'mod'] : [name, 'base']);
  return [character === 'gelina' ? 'adjutant' : 'doll', character.replaceAll(' ', '-'), version,
    ({ destory: 'destroy', noraml: 'normal' })[form] ?? form];
}

function classify(source, path) {
  const parts = path.split('/');
  const stem = posix.parse(path).name;
  if (source === 'jacksen168') {
    const [type, folder, form] = parts;
    if (type === '精灵') return ['fairy', folder, form, 'default'];
    if (type === '小队') return ['squad', folder, 'base', 'default'];
    if (type === '辅助') return ['background', folder, 'base', 'default'];
    assert.ok(type === '人形' || type === '人型2', path);
    return doll(folder, form);
  }
  const [, generation, type, folder, form] = parts;
  if (type === 'bg') return ['background', folder, 'base', 'default'];
  if (type === 'squads') return ['squad', folder, 'base', 'default'];
  if (type === 'fairy') return ['fairy', folder, /^model([123]?)$/.exec(stem)[1] || '1', 'default'];
  if (generation === 'live2dnew' && /^[123]$/.test(folder)) return ['fairy', type, folder, 'default'];
  if (generation === 'live2dnew') return doll(type, folder);
  assert.ok(type === 'gun' || type === 'old', path);
  return doll(folder, form);
}

for (const [source, checkout] of [['eikanya', primary], ['jacksen168', secondary]]) {
  const args = ['ls-tree', '-rz', sources[source].commit];
  if (source === 'eikanya') args.push('--', game);
  const tree = execFileSync('git', ['-C', resolve(checkout), ...args], { encoding: 'utf8', maxBuffer: 16_000_000 });
  for (const record of tree.split('\0')) {
    const [header, path] = record.split('\t');
    if (!path || !/\.moc3?$/i.test(path)) continue;
    const [category, id, version, form] = classify(source, path);
    for (const segment of [category, id, version, form]) assert.match(segment, /^[a-z0-9_-]+$/, path);
    const key = category + '/' + id;
    if (!models.has(key)) models.set(key, new Map());
    const versions = models.get(key);
    if (!versions.has(version)) versions.set(version, new Map());
    const forms = versions.get(version);
    if (!forms.has(form)) forms.set(form, { id: form, sources: [], widget: [] });
    const item = forms.get(form);
    item.sources.push({ repository: source, path, blob: header.split(' ')[2], format: path.endsWith('.moc3') ? 'moc3' : 'moc' });
    if (source === 'eikanya' && widgetByPath.has(path)) {
      item.widget.push(...widgetByPath.get(path));
      widgetByPath.delete(path);
    }
  }
}
assert.equal(widgetByPath.size, 0, 'Unmatched widget entries: ' + [...widgetByPath.keys()].join(', '));

function write(path, data) {
  mkdirSync(posix.dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
const characters = [];
const categories = { doll: '人形', adjutant: '副官', fairy: '妖精', squad: '小队', background: '背景' };
const rows = new Map(Object.keys(categories).map(id => [id, []]));
for (const key of [...models.keys()].sort()) {
  const [category, id] = key.split('/');
  const versions = models.get(key);
  const entries = [];
  const available = { widget: 0, moc: 0, moc3: 0 };
  for (const version of [...versions.keys()].sort()) {
    const forms = versions.get(version);
    const path = key + '/' + version + '.json';
    const formEntries = [];
    for (const form of [...forms.keys()].sort()) {
      const formPath = key + '/' + version + '/' + form + '.json';
      const model = forms.get(form);
      if (model.widget.length) available.widget++;
      else if (model.sources.some(file => file.format === 'moc')) available.moc++;
      else available.moc3++;
      write(out + '/' + formPath, { category, character: id, version, ...model });
      formEntries.push({ id: form, path: formPath });
    }
    write(out + '/' + path, { category, character: id, version, forms: formEntries });
    entries.push({ id: version, path });
  }
  const path = key + '/index.json';
  write(out + '/' + path, { category, id, versions: entries });
  characters.push({ category, id, path });
  const links = entries.map(v => '[' + v.id + '](' + v.path + ')').join('、');
  rows.get(category).push('| [' + id + '](' + path + ') | ' + links + ' | ' +
    [available.widget, available.moc, available.moc3].join(' | ') + ' |');
}
write(out + '/index.json', { schemaVersion: 1, sources, characters });
const guide = ['# 少女前线模型目录', '',
  '点人物代号查看其版本列表，点版本查看普通、破损等形态。表内数量按形态统计。', '',
  '“已接入”可用现有看板娘加载。“待接入 moc”有旧格式来源，仍需核验素材完整性与再分发授权。“仅 moc3”需要支持新格式的渲染器。', '',
  '[机器可读总目录](index.json) · [来源与授权说明](../../readme.md#少女前线分类)', ''];
for (const [category, label] of Object.entries(categories)) {
  guide.push('## ' + label, '', '| 对象 | 版本 | 已接入 | 待接入 moc | 仅 moc3 |', '| --- | --- | ---: | ---: | ---: |',
    ...rows.get(category), '');
}
writeFileSync(out + '/README.md', guide.join('\n'));
