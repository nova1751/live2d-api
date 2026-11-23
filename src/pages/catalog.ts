import { loadModelCatalog, loadWidget, selectWidgetModel } from '../widget.mjs';

const gameNames = {
  'girls-frontline': ['少女前线','Girls’ Frontline'], 'azur-lane': ['碧蓝航线','Azur Lane'],
  'bang-dream': ['BanG Dream!','BanG Dream!'], houkai2: ['崩坏学园 2','Guns GirlZ'],
  'iron-saga': ['机动战队','Iron Saga'], 'warship-girls': ['战舰少女 R','Warship Girls R'],
  'baoshi-yanwuyu': ['宝石研物语','Baoshi Yanwuyu'],
};
const requestedGame = new URL(location.href).searchParams.get('collection') ?? '';
const game = Object.prototype.hasOwnProperty.call(gameNames, requestedGame) ? requestedGame as keyof typeof gameNames : 'girls-frontline';
const catalogUrl = new URL(game === 'girls-frontline' ? './library.json' : './games/' + game + '.json', import.meta.url);
const find = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const locale = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'zh-CN';
const english = locale === 'en';
const t = (zh: string, en: string) => english ? en : zh;
const language = find<HTMLAnchorElement>('language');
if (english) {
  document.documentElement.lang = locale;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-en]'))) el.textContent = el.dataset.en!;
  for (const name of ['aria-label', 'placeholder', 'alt']) {
    for (const el of Array.from(document.querySelectorAll('[data-en-' + name + ']'))) el.setAttribute(name, el.getAttribute('data-en-' + name)!);
  }
  const guide = find<HTMLAnchorElement>('embed-guide');
  guide.href = 'https://github.com/nova1751/live2d-api/blob/main/docs/en/README.md#quick-start';
  language.textContent = '简体中文';
  language.lang = language.hreflang = 'zh-CN';
}
function updateLanguageLink() {
  const target = new URL(location.href);
  target.searchParams.set('lang', english ? 'zh-CN' : 'en');
  language.href = target.href;
}
updateLanguageLink();
document.querySelector('.intro h1 b')!.textContent = gameNames[game][english ? 1 : 0];
document.title = gameNames[game][english ? 1 : 0] + t('模型图鉴 · Live2D', ' model gallery · Live2D');
for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-game]'))) {
  if (link.dataset.game === game) link.setAttribute('aria-current','page');
  if (english) link.search += '&lang=en';
}
const search = find<HTMLInputElement>('search');
const category = find<HTMLSelectElement>('category');
const variant = find<HTMLSelectElement>('variant');
const cards = find('cards');
const result = find('result');
const notice = find('notice');
const poster = find<HTMLImageElement>('poster');
const more = find<HTMLButtonElement>('more');
const host = find('model-host');
const categories: Record<string, string> = english ? { fairy: 'Fairy', doll: 'T-Doll', adjutant: 'Adjutant', npc: 'NPC', squad: 'Squad', background: 'Background' } : { fairy: '妖精', doll: '人形', adjutant: '副官', npc: '其他人物', squad: '小队', background: '背景' };
const names: Record<string, string> = english ? {
  air_attack: 'Airstrike Fairy', airborne: 'Parachute Fairy', armor: 'Armor Fairy', command: 'Command Fairy',
  fighting: 'Warrior Fairy', fortress: 'Fortress Fairy', golden: 'Golden Fairy', shield: 'Shield Fairy', target: 'Taunt Fairy',
  npc_kalina: 'Kalina', gelina: 'Kalina', william: 'William', 'm4-sopmod-ii': 'M4 SOPMOD II',
} : {
  air_attack: '空袭妖精', airborne: '空降妖精', armor: '装甲妖精', command: '指挥妖精',
  fighting: '勇士妖精', fortress: '工事妖精', golden: '黄金妖精', shield: '护盾妖精', target: '嘲讽妖精',
  'm4-sopmod-ii': 'M4 SOPMOD II', npc_kalina: '格琳娜', gelina: '格琳娜', william: '威廉',
};
const versions: Record<string, string> = english ? { base: 'Original', mod: 'Neural upgrade', archive: 'Archive', 'archive-alt': 'Archive (alternate)', 'archive-christmas': 'Christmas archive' } : { base: '原版', mod: '心智升级', archive: '旧档', 'archive-alt': '旧档·另一造型', 'archive-christmas': '圣诞旧档' };
const tiers: Record<string,string> = english
  ? { '1': 'Tier 1', '2': 'Tier 2', '3': 'Tier 3' }
  : { '1': '一阶', '2': '二阶', '3': '三阶' };
const states: Record<string, string> = english ? { normal: 'Standard', destroy: 'Damaged' } : { normal: '标准', destroy: '战损' };
Object.assign(categories, {ship:t('舰船','Ships'),character:t('角色','Characters'),hhw:'Hello, Happy World!',afterglow:'Afterglow',avemujica:'Ave Mujica',morfonica:'Morfonica',mygo:'MyGO!!!!!',pastelpalettes:'Pastel＊Palettes',poppinparty:'Poppin’Party',ras:'RAISE A SUILEN',roselia:'Roselia'});
const gflPortrait = (id: string) => './portraits/' + encodeURIComponent(id.split('/').join('--')) + '.webp';

// Host the standard widget in the preview panel, including a later reopen after it was hidden.
const attachWidget = () => {
  for (const child of Array.from(document.body.querySelectorAll(':scope > #waifu, :scope > #waifu-toggle'))) {
    (child.id === 'waifu-toggle' ? find('stage') : host).append(child);
  }
};
new MutationObserver(attachWidget).observe(document.body, { childList: true });
const firstPaint = new MutationObserver(() => {
  if (host.querySelector('#waifu:not([data-model-loading]) canvas') && result.dataset.model) {
    poster.hidden = true;
    firstPaint.disconnect();
  }
});
firstPaint.observe(host, { attributes: true, childList: true, subtree: true });

try {
  const library = await loadModelCatalog(catalogUrl, game, locale);
  const portrait = (id: string) => library.gallery ? library.gallery[id]?.portrait : gflPortrait(id);
  const models = library.ids.map(id => {
    const [kind, code, version, state] = id.split('/');
    const character = kind + '/' + code;
    const entry = library.gallery?.[id];
    if (entry) {
      const name = english && entry.en || entry.name;
      const form = english && entry.outfitEn || entry.outfit;
      return {id,kind,character,name,form,terms:[id,name,entry.name,form,entry.outfit,categories[kind]].join(' ').toLowerCase()};
    }
    const name = library.labels[character] || names[code] || code.toUpperCase();
    const outfit = library.labels[character + '/' + version]?.replace(name + '-', '') ||
      (kind === 'fairy' ? tiers : versions)[version] || version;
    const form = [outfit, states[state]].filter(Boolean).join(' · ');
    return { id, kind, character, name, form, terms: [id, name, form, categories[kind]].join(' ').toLowerCase() };
  });
  if (library.gallery) models.sort((a,b)=>a.name.localeCompare(b.name,locale) ||
    (library.gallery![a.id].date ?? Infinity) - (library.gallery![b.id].date ?? Infinity) || a.id.localeCompare(b.id,'en',{numeric:true}));
  type Model = typeof models[number];
  const byId = new Map(models.map(model => [model.id, model]));
  const groups = new Map<string, Model[]>();
  for (const model of models) {
    if (!groups.has(model.character)) groups.set(model.character, []);
    groups.get(model.character)!.push(model);
  }
  if (!models.length) throw new Error(t('目录中没有可预览的模型', 'The catalog has no models to preview.'));
  for (const kind of new Set(models.map(model => model.kind))) category.add(new Option(categories[kind] ?? kind, kind));
  find('totals').textContent = groups.size + t(' 个图鉴条目　/　', ' entries / ') + models.length + t(' 个造型', ' forms');
  const requested = new URL(location.href).searchParams.get('model');
  const initial = byId.get(library.visibleId(requested ?? '')) ?? models[0];
  const batchTarget = 24;
  const gridColumns = () => getComputedStyle(cards).gridTemplateColumns.trim().split(/\s+/).length;
  let columns = gridColumns(), limit = batchTarget;
  let active = initial, groupCards = true, revision = 0;
  let ready = false;
  function highlight() {
    for (const button of Array.from(cards.querySelectorAll<HTMLButtonElement>('button[data-id]'))) {
      const row = byId.get(button.dataset.id!)!;
      button.setAttribute('aria-pressed', String(groupCards ? row.character === active.character : row.id === active.id));
    }
  }
  function drawCards(reset = true) {
    if (reset) {
      limit = batchTarget;
      cards.replaceChildren();
    }
    const term = search.value.trim().toLowerCase();
    let items = models.filter(row => (!category.value || row.kind === category.value) && row.terms.includes(term));
    if (groupCards) {
      const seen = new Set<string>();
      items = items.filter(row => {
        if (seen.has(row.character)) return false;
        seen.add(row.character);
        return true;
      });
    }
    const rowLimit = Math.ceil(limit / columns) * columns;
    // Include a short final row rather than making it a separate page.
    const count = items.length - rowLimit < columns ? items.length : rowLimit;
    while (cards.childElementCount > count) cards.lastElementChild!.remove();
    const fragment = document.createDocumentFragment();
    for (const row of items.slice(cards.childElementCount, count)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card';
      button.dataset.id = row.id;
      button.disabled = !ready;
      const art = document.createElement('span');
      art.className = 'art' + (['background', 'squad'].includes(row.kind) ? ' wide' : '');
      const image = document.createElement('img');
      image.alt = '';
      image.width = image.height = 240;
      image.loading = 'lazy';
      image.decoding = 'async';
      const thumbnail = portrait(row.id);
      if (thumbnail) { image.src = thumbnail; art.append(image); }
      else art.textContent = row.name.slice(0,2);
      const caption = document.createElement('span');
      caption.className = 'caption';
      const name = document.createElement('strong');
      name.textContent = row.name;
      const sub = document.createElement('small');
      sub.textContent = groupCards ? categories[row.kind] + ' · ' + groups.get(row.character)!.length + t(' 个造型', groups.get(row.character)!.length === 1 ? ' form' : ' forms') : row.form;
      caption.append(name, sub);
      button.append(art, caption);
      fragment.append(button);
    }
    cards.append(fragment);
    highlight();
    find('matches').textContent = items.length ? t('显示 ', 'Showing ') + count + ' / ' + items.length + t(' 项', ' results') : t('没有匹配的模型，请更换关键词或分类。', 'No matches. Try another name or category.');
    more.hidden = count >= items.length;
  }
  function describe(row: Model) {
    active = row;
    find('model-category').textContent = categories[row.kind];
    find('model-name').textContent = row.name;
    result.textContent = row.id;
    variant.replaceChildren(...groups.get(row.character)!.map(item => new Option(item.form, item.id)));
    variant.value = row.id;
    const manifest = find<HTMLAnchorElement>('manifest');
    manifest.href = library.resolve(row.id).modelUrl;
    manifest.hidden = false;
    highlight();
  }
  const motion = find<HTMLSelectElement>('motion');
  window.addEventListener('live2d:motions', event => {
    if (game === 'girls-frontline') return;
    const clips = (event as CustomEvent<Array<{group:string,index:number,voiced:boolean}>>).detail;
    motion.replaceChildren(...clips.map(({group,index,voiced})=>new Option(
      group + ' · ' + (index+1) + (voiced ? t(' · 原声',' · voiced') : ''), JSON.stringify([group,index]))));
    find('audition').hidden = !clips.length;
  });
  find('play-motion').addEventListener('click', () => {
    if (motion.value) { const [group,index]=JSON.parse(motion.value); window.loadlive2d.playMotion?.(group,index); }
  });
  async function select(id: string) {
    find('audition').hidden = true;
    const ticket = ++revision;
    notice.textContent = t('正在载入…', 'Loading…');
    try {
      await selectWidgetModel(id);
      if (ticket === revision) notice.textContent = '';
    } catch (error) {
      if (ticket === revision) {
        variant.value = active.id;
        notice.textContent = t('模型载入失败，可重新选择。', 'Could not load this model. Try selecting it again. ') + (error instanceof Error ? error.message : '');
      }
    }
  }
  cards.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-id]');
    if (!button) return;
    void select(button.dataset.id!);
    const preview = find('stage');
    if (preview.getBoundingClientRect().bottom < 0) preview.scrollIntoView({ block: 'start' });
  });
  variant.addEventListener('change', () => void select(variant.value));
  for (const [id, grouped] of [['by-character', true], ['by-form', false]] as const) {
    find(id).addEventListener('click', () => {
      groupCards = grouped;
      find('by-character').setAttribute('aria-pressed', String(grouped));
      find('by-form').setAttribute('aria-pressed', String(!grouped));
      drawCards();
    });
  }
  search.addEventListener('input', () => drawCards());
  category.addEventListener('change', () => drawCards());
  more.addEventListener('click', () => {
    const previous = cards.childElementCount;
    limit = previous + batchTarget;
    drawCards(false);
    cards.querySelectorAll<HTMLButtonElement>('button')[previous]?.focus({ preventScroll: true });
  });
  find('share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); notice.textContent = t('预览链接已复制', 'Preview link copied.'); }
    catch { notice.textContent = location.href; }
  });
  window.addEventListener('live2d:model', event => {
    const id = (event as CustomEvent<string>).detail;
    const row = byId.get(library.visibleId(id));
    if (!row) return;
    describe(row);
    result.dataset.model = id;
    const url = new URL(location.href);
    url.searchParams.set('model', id);
    history.replaceState(null, '', url);
    updateLanguageLink();
  });
  new ResizeObserver(() => {
    const next = gridColumns();
    if (next === columns) return;
    columns = next;
    drawCards(false);
  }).observe(cards);
  describe(initial);
  const initialPortrait = portrait(initial.id);
  if (initialPortrait) { poster.src = initialPortrait; poster.hidden = false; }
  drawCards();
  await loadWidget({ catalog: library, modelId: initial.id, coreUrl: document.documentElement.dataset.coreUrl });
  attachWidget();
  ready = true;
  variant.disabled = false;
  drawCards();
} catch (error) {
  notice.textContent = t('图鉴载入失败。', 'Could not load the gallery. ') + (error instanceof Error ? error.message : String(error));
}
