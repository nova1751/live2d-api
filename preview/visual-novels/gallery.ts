export {};
interface Model {
  work: string;
  person: string;
  name: string;
  path: string;
  entry?: string;
  modern: boolean;
  motions: number;
  voices: number;
  missing: string[];
}
interface Title {
  name_zh: string;
  heroines: string[];
  links: { url: string }[];
}
interface Profile {
  id: string;
  name_zh: string;
  name_ja: string;
  cv: string;
  sources: string[];
}
interface Catalog {
  models: Model[];
  titles: Title[];
  heroines: Profile[];
  issues: { path: string; reason: string }[];
}
const catalog: Catalog = await (await fetch('./index.json')).json();
const checkResponse = await fetch('./paint.json', { cache: 'no-store' });
const painted: Record<string, boolean> = checkResponse.ok
  ? await checkResponse.json()
  : {};
const unconfirmed = catalog.models.filter((m) => painted[m.path] === false);
const available = catalog.models.filter((m) => painted[m.path] !== false);
const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const el = (tag: string, text: string) =>
  Object.assign(document.createElement(tag), { textContent: text });
function link(text: string, href: string) {
  return Object.assign(el('a', text), {
    href,
    target: '_blank',
    rel: 'noreferrer',
  });
}
const featured = [
  'Fox Hime Zero',
  '三色绘恋S',
  'LOVE³-LOVE CUBE-',
  'メイドさんのいる暮らしS',
];
const source =
  'https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac/galgame%20live2d/';
const works = byId('works'),
  people = byId<HTMLSelectElement>('person'),
  variants = byId<HTMLSelectElement>('variant');
const search = byId<HTMLInputElement>('search');
function firstForm(rows: Model[]) {
  return rows.find((m) => /^(mori_miko|chiguo_A|akira_st01_w|ele_a0)$/.test(m.name)) ?? rows[0];
}
const query = new URLSearchParams(location.search);
const requestedWork = query.get('work') ?? featured[0];
let selected = available.find((m) => m.path === query.get('model')) ??
  firstForm(available.filter((m) => m.work === requestedWork)) ?? available[0];
let matching = available;
function choose(model: Model) {
  selected = model;
  const url = new URL(location.href);
  url.searchParams.set('work', model.work);
  url.searchParams.set('model', model.path);
  history.replaceState(history.state, '', url);
  render();
}
function options(select: HTMLSelectElement, values: string[], value: string) {
  select.replaceChildren(...values.map((v) => new Option(v, v)));
  select.value = value;
}
function render() {
  const empty = matching.length === 0;
  byId('library').querySelector('article')!.hidden = empty;
  if (empty) {
    works.replaceChildren(el('p', '没有匹配的作品或角色'));
    byId('screen').replaceChildren();
    return;
  }
  if (!matching.includes(selected)) selected = matching[0];
  const names = [...new Set(matching.map((m) => m.work))].sort(
    (a, b) =>
      (featured.includes(a) ? featured.indexOf(a) : 99) -
        (featured.includes(b) ? featured.indexOf(b) : 99) || a.localeCompare(b),
  );
  works.replaceChildren(
    ...names.map((work) => {
      const rows = matching.filter((m) => m.work === work);
      const button = el('button', work);
      button.className = 'item' + (work === selected.work ? ' current' : '');
      button.append(el('span', String(rows.length)));
      button.onclick = () => {
        choose(firstForm(rows));
      };
      return button;
    }),
  );
  const rows = matching.filter((m) => m.work === selected.work);
  options(people, [...new Set(rows.map((m) => m.person))], selected.person);
  const forms = rows.filter((m) => m.person === selected.person);
  variants.replaceChildren(...forms.map((m) => new Option(m.name, m.path)));
  variants.value = selected.path;
  byId('work').textContent = byId('work').title = selected.work;
  byId('name').textContent = byId('name').title = selected.person;
  byId<HTMLAnchorElement>('source').href =
    source +
    selected.path.split('/').slice(0, -1).map(encodeURIComponent).join('/');
  byId('facts').textContent = [
    selected.modern ? 'Cubism 3+' : 'Cubism 2',
    painted[selected.path] ? '已验证出画' : '',
    selected.motions + ' 条动作引用',
    selected.voices + ' 条配音引用',
    selected.missing.length
      ? '上游缺少 ' + selected.missing.length + ' 项动作或音频'
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const screen = byId('screen');
  const url = new URL('stage.html', location.href);
  url.searchParams.set('model', selected.entry ?? selected.path);
  if (screen.querySelector('iframe')?.src !== url.href)
    screen.replaceChildren(
      Object.assign(document.createElement('iframe'), {
        src: url.href,
        title: selected.person + ' 模型预览',
      }),
    );
}
people.onchange = () => {
  choose(matching.find(
    (m) => m.work === selected.work && m.person === people.value,
  )!);
};
variants.onchange = () => {
  choose(matching.find((m) => m.path === variants.value)!);
};
search.oninput = () => {
  const q = search.value.trim().toLowerCase();
  matching = available.filter((m) =>
    (m.work + ' ' + m.person + ' ' + m.name).toLowerCase().includes(q),
  );
  render();
};
const title = byId<HTMLSelectElement>('am-title');
options(
  title,
  catalog.titles.map((t) => t.name_zh),
  catalog.titles.find((t) => t.heroines.includes('amakano3.shion'))?.name_zh ??
    catalog.titles[0].name_zh,
);
function profiles() {
  const work = catalog.titles.find((t) => t.name_zh === title.value)!;
  byId('profiles').replaceChildren(
    ...work.heroines.map((id) => {
      const p = catalog.heroines.find((h) => h.id === id)!;
      const row = el('div', '');
      row.className = 'entry';
      row.append(
        el('h3', p.name_zh),
        el('p', p.name_ja + ' · CV ' + p.cv),
        link('角色资料 ↗', p.sources[0] ?? work.links[0].url),
      );
      return row;
    }),
  );
}
title.onchange = profiles;
profiles();
const references = [
  [
    '甜蜜女友',
    '7 部作品的角色资料。初代 PE 与二代 PE 的原作立绘采用 E-mote。柳木诗梦有社区制作的 Cubism 5 版本。',
    'https://github.com/Fiesty-Abyss/AmakanoPet',
  ],
  [
    'Fox Hime Zero',
    '本地可试播。茉莉与琉璃的多套立绘，模型自带耳朵、头发或身体等动作。',
    'https://store.steampowered.com/app/844930/Fox_Hime_Zero/',
  ],
  [
    '三色绘恋S',
    '本地可试播。迟菓和叶心按造型归档，部分动作的配置包含配音。',
    source + encodeURIComponent('三色绘恋S'),
  ],
  [
    'LOVE³ -Love Cube-',
    '本地可试播。角色有多套造型，部分清单只有模型、贴图与物理配置。',
    source + encodeURIComponent('LOVE³-LOVE CUBE-'),
  ],
  [
    '幸运草的约定 · Clover Day’s Plus',
    'Plus 版使用 E-mote 制作动态立绘。可在 Steam 查看官方演示，目前未找到可在本图鉴播放的公开 Cubism 角色包。',
    'https://store.steampowered.com/app/2430690/?l=schinese',
  ],
  [
    '猫娘乐园 · NEKOPARA Vol. 1（巧克力与香子兰）',
    '原作动态立绘使用 E-mote。Steam 创意工坊另有巧克力的 Live2DViewerEX 条目，目前本地尚无可试播的角色包。',
    'https://store.steampowered.com/app/333600/NEKOPARA_Vol_1/',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=2616868992',
  ],
  [
    '爱上火车 -pure station-',
    '官网提供 E-mote 动画展示。本地收藏未取得可播放的该作角色包。',
    'https://maitetsupurestation.com/gallery/',
  ],
];
byId('references').replaceChildren(
  ...references.map(([name, desc, url, workshopUrl]) => {
    const row = el('div', '');
    row.className = 'entry';
    row.append(el('h3', name), el('p', desc), link('来源 ↗', url));
    if (workshopUrl) row.append(' · ', link('巧克力的创意工坊页面 ↗', workshopUrl));
    return row;
  }),
);
byId('issue-title').textContent =
  '未收录为可选模型的清单（' +
  (catalog.issues.length + unconfirmed.length) +
  '）';
byId('issues').replaceChildren(
  ...catalog.issues.map((i) => el('li', i.path + ' · ' + i.reason)),
  ...unconfirmed.map((m) => el('li', m.path + ' · 本机浏览器未检测到可见画面')),
);
function tab(name: string) {
  const active = ['library', 'amakano', 'links'].includes(name)
    ? name
    : 'library';
  for (const b of document.querySelectorAll<HTMLButtonElement>('nav button')) {
    const on = b.dataset.tab === active;
    b.setAttribute('aria-pressed', String(on));
    byId(b.dataset.tab!).hidden = !on;
  }
  if (active === 'library') render();
  else byId('screen').replaceChildren();
}
for (const b of document.querySelectorAll<HTMLButtonElement>('nav button'))
  b.onclick = () => {
    location.hash = b.dataset.tab!;
  };
window.addEventListener('hashchange', () => tab(location.hash.slice(1)));
tab(location.hash.slice(1));
