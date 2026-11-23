import { loadModelCatalog, loadGirlsFrontline, selectWidgetModel } from '../widget.mjs';

const catalogUrl = new URL('./library.json', import.meta.url);
const find = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const search = find<HTMLInputElement>('search');
const category = find<HTMLSelectElement>('category');
const variant = find<HTMLSelectElement>('variant');
const cards = find('cards');
const result = find('result');
const notice = find('notice');
const poster = find<HTMLImageElement>('poster');
const more = find<HTMLButtonElement>('more');
const host = find('model-host');
const categories: Record<string, string> = { fairy: '妖精', doll: '人形', adjutant: '副官', npc: '其他人物', squad: '小队', background: '背景' };
const names: Record<string, string> = {
  air_attack: '空袭妖精', airborne: '空降妖精', armor: '装甲妖精', command: '指挥妖精',
  fighting: '勇士妖精', fortress: '工事妖精', golden: '黄金妖精', shield: '护盾妖精', target: '嘲讽妖精',
  'm4-sopmod-ii': 'M4 SOPMOD II', npc_kalina: '格琳娜', gelina: '格琳娜', william: '威廉',
};
const versions: Record<string, string> = { base: '原版', mod: '心智升级', archive: '旧档', 'archive-alt': '旧档·另一造型', 'archive-christmas': '圣诞旧档' };
const states: Record<string, string> = { normal: '标准', destroy: '战损' };
const portrait = (id: string) => './portraits/' + encodeURIComponent(id.split('/').join('--')) + '.webp';

// Host the standard widget in the preview panel, including a later reopen after it was hidden.
const attachWidget = () => {
  for (const child of Array.from(document.body.querySelectorAll(':scope > #waifu, :scope > #waifu-toggle'))) host.append(child);
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
  const library = await loadModelCatalog(catalogUrl, 'girls-frontline');
  const models = library.ids.map(id => {
    const [kind, code, version, state] = id.split('/');
    const character = kind + '/' + code;
    const name = library.labels[character] || names[code] || code.toUpperCase();
    const outfit = library.labels[character + '/' + version]?.replace(name + '-', '') ||
      (kind === 'fairy' ? ({ '1': '一阶', '2': '二阶', '3': '三阶' }[version] ?? version) : versions[version] ?? version);
    const form = [outfit, states[state]].filter(Boolean).join(' · ');
    return { id, kind, character, name, form, terms: [id, name, form, categories[kind]].join(' ').toLowerCase() };
  });
  type Model = typeof models[number];
  const byId = new Map(models.map(model => [model.id, model]));
  const groups = new Map<string, Model[]>();
  for (const model of models) {
    if (!groups.has(model.character)) groups.set(model.character, []);
    groups.get(model.character)!.push(model);
  }
  if (!models.length) throw new Error('目录中没有可预览的模型');
  for (const kind of new Set(models.map(model => model.kind))) category.add(new Option(categories[kind] ?? kind, kind));
  find('totals').textContent = groups.size + ' 个图鉴条目　/　' + models.length + ' 个造型';
  const requested = new URL(location.href).searchParams.get('model');
  const initial = byId.get(library.visibleId(requested ?? '')) ?? models[0];
  let active = initial, groupCards = true, limit = 24, revision = 0;
  let ready = false;
  function highlight() {
    for (const button of Array.from(cards.querySelectorAll<HTMLButtonElement>('button[data-id]'))) {
      const row = byId.get(button.dataset.id!)!;
      button.setAttribute('aria-pressed', String(groupCards ? row.character === active.character : row.id === active.id));
    }
  }
  function drawCards() {
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
    const fragment = document.createDocumentFragment();
    for (const row of items.slice(0, limit)) {
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
      image.src = portrait(row.id);
      art.append(image);
      const caption = document.createElement('span');
      caption.className = 'caption';
      const name = document.createElement('strong');
      name.textContent = row.name;
      const sub = document.createElement('small');
      sub.textContent = groupCards ? categories[row.kind] + ' · ' + groups.get(row.character)!.length + ' 个造型' : row.form;
      caption.append(name, sub);
      button.append(art, caption);
      fragment.append(button);
    }
    cards.replaceChildren(fragment);
    highlight();
    find('matches').textContent = items.length ? '显示 ' + Math.min(limit, items.length) + ' / ' + items.length + ' 项' : '没有匹配的模型，请更换关键词或分类。';
    more.hidden = limit >= items.length;
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
  async function select(id: string) {
    const ticket = ++revision;
    notice.textContent = '正在载入…';
    try {
      await selectWidgetModel(id);
      if (ticket === revision) notice.textContent = '';
    } catch (error) {
      if (ticket === revision) {
        variant.value = active.id;
        notice.textContent = '模型载入失败，可重新选择。' + (error instanceof Error ? error.message : '');
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
      limit = 24;
      drawCards();
    });
  }
  search.addEventListener('input', () => { limit = 24; drawCards(); });
  category.addEventListener('change', () => { limit = 24; drawCards(); });
  more.addEventListener('click', () => {
    const previous = cards.childElementCount;
    limit += 24;
    drawCards();
    cards.querySelectorAll<HTMLButtonElement>('button')[previous]?.focus({ preventScroll: true });
  });
  find('share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); notice.textContent = '预览链接已复制'; }
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
  });
  describe(initial);
  poster.src = portrait(initial.id);
  poster.hidden = false;
  drawCards();
  await loadGirlsFrontline({ catalogUrl, modelId: initial.id, coreUrl: document.documentElement.dataset.coreUrl });
  attachWidget();
  ready = true;
  variant.disabled = false;
  drawCards();
} catch (error) {
  notice.textContent = '图鉴载入失败。' + (error instanceof Error ? error.message : String(error));
}
