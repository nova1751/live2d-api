import { loadModelCatalog, loadWidget, selectWidgetModel } from '../widget.mjs';

const catalogUrl = new URL('./library.json', import.meta.url);
const selects = ['category', 'character', 'version', 'form'].map(id => document.getElementById(id));
const labels = { doll: '少女前线 · 人形', fairy: '妖精', adjutant: '副官', npc: '其他人物', background: '背景', squad: '小队',
  other: '其他作品', normal: '普通', destroy: '破损', default: '默认' };
const result = document.getElementById('result');
try {
  const library = await loadModelCatalog(catalogUrl);
  const ids = library.ids.map(id => id.split('/'));
  const initial = new URL(location.href).searchParams.get('model');
  const first = [initial, library.legacyIds?.[0]?.[0], library.ids[0]].find(id => library.ids.includes(id));
  if (!first) throw new Error('此目录中没有可预览的模型');
  function update(start, preset = []) {
    let pool = ids;
    selects.forEach((select, i) => {
      if (i >= start) {
        const choices = [...new Set(pool.map(id => id[i]))];
        select.replaceChildren(...choices.map(key => new Option(labels[key] || key, key)));
        if (choices.includes(preset[i])) select.value = preset[i];
      }
      pool = pool.filter(id => id[i] === select.value);
    });
    const link = document.getElementById('manifest');
    link.href = library.resolve(selects.map(s => s.value).join('/')).modelUrl;
    link.hidden = false;
  }
  update(0, first.split('/'));
  selects.forEach((select, i) => select.addEventListener('change', () => update(i + 1)));
  window.addEventListener('live2d:model', event => {
    update(0, event.detail.split('/'));
    const url = new URL(location.href);
    url.searchParams.set('model', event.detail);
    history.replaceState(null, '', url);
    result.textContent = event.detail;
  });
  await loadWidget({ catalogUrl, modelId: first, coreUrl: document.documentElement.dataset.coreUrl });
  const button = document.getElementById('preview');
  button.disabled = false;
  document.getElementById('picker').addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    result.textContent = '正在载入…';
    try { await selectWidgetModel(selects.map(s => s.value).join('/')); }
    catch (error) { result.textContent = '载入失败：' + error.message; }
    finally { button.disabled = false; }
  });
} catch (error) { result.textContent = '目录加载失败：' + error.message; }
