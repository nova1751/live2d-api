import { preferences, session } from './storage';
import { setLanguage, translated } from './locale';
import { expandModel } from './expand';
import { icons, loadingIcon, retryIcon } from './icons';
import { bindMessages, escapeText, finishDialogue, say, showDialogue, showModelPreset } from './messages';
import { getJson, isLoadCancelled } from './request';
import { setModelLoading } from './loading';
import { LegacyModels } from '../legacy/models';
import { CatalogModels } from '../library/selection';

const script = document.currentScript as HTMLScriptElement | null;
const asteroidsUrl = script?.dataset.asteroidsUrl ?? GLOBAL_RUNTIME + 'asteroids.js';
const byId = (id: string) => document.getElementById(id)!;
function reportError(error: unknown) {
  console.error('[Live2D]', error);
  const status = document.getElementById('waifu-status-text');
  const message = translated('加载失败，请检查网络或切换模型后重试。', 'Could not load the model. Check your connection or try another character.');
  if (status) status.textContent = message;
  document.getElementById('waifu')?.setAttribute('data-model-error', '');
  say(message, 5000, 10);
}

let retryModel: (() => void | Promise<void>) | undefined;
async function runModel(action: () => void | Promise<void>) {
  retryModel = action;
  try { await action(); }
  catch (error) { if (retryModel === action && !isLoadCancelled(error)) reportError(error); }
}

async function hitokoto(locale?: LegacyOptions['locale']) {
  if (locale === 'en') {
    say(['One step at a time, Commander.', 'Even on a quiet day, there is something worth noticing.'], 6000, 9);
    return;
  }
  const quote = await getJson<{ from: string; creator: string; hitokoto: string }>('https://v1.hitokoto.cn');
  say(escapeText(quote.hitokoto), 6000, 9);
  setTimeout(() => {
    say(`这句一言来自 <span>「${escapeText(String(quote.from))}」</span>，是 <span>${escapeText(String(quote.creator))}</span> 在 hitokoto.cn 投稿的。`, 4000, 9);
  }, 6000);
}

function asteroids() {
  if (window.Asteroids) {
    (window.ASTEROIDSPLAYERS ??= []).push(new window.Asteroids());
  } else {
    const script = document.createElement('script');
    script.src = asteroidsUrl;
    document.head.appendChild(script);
  }
}

let visibilityRevision = 0;

function show() {
  visibilityRevision++;
  preferences.removeItem('waifu-display');
  byId('waifu-toggle').setAttribute('tabindex', '-1');
  byId('waifu-toggle').setAttribute('aria-expanded', 'true');
  const widget = byId('waifu');
  widget.style.display = '';
  widget.inert = false;
  // Commit the offscreen position after mounting or restoring display.
  void widget.offsetHeight;
  widget.style.bottom = '0';
}

function prepareStart(event: Event) {
  return event.isTrusted && !!window.loadlive2d.prepareInteraction?.();
}

function hide() {
  const widget = byId('waifu');
  const restoreFocus = widget.contains(document.activeElement);
  const revision = ++visibilityRevision;
  window.loadlive2d.hide?.();
  preferences.setItem('waifu-display', String(Date.now()));
  say(translated('愿你有一天能与重要的人重逢。', 'I hope you meet the people you miss again.'), 2000, 11);
  widget.inert = true;
  widget.style.bottom = '-500px';
  const toggle = byId('waifu-toggle');
  toggle.setAttribute('aria-expanded', 'false');
  const finish = () => {
    if (revision !== visibilityRevision) return;
    widget.style.display = 'none';
    toggle.removeAttribute('tabindex');
    toggle.classList.add('waifu-toggle-active');
    if (restoreFocus && (document.activeElement === document.body || widget.contains(document.activeElement))) {
      toggle.focus({ preventScroll: true });
    }
  };
  const slide = widget.getAnimations().find(animation =>
    'transitionProperty' in animation && animation.transitionProperty === 'bottom');
  if (slide) slide.finished.then(finish, finish);
  else finish();
}

function mount(options: LegacyOptions, models: LegacyModels | CatalogModels, start = false) {
  session.removeItem('waifu-text');
  const adaptive = Boolean(options.collection);
  const initialFraming = adaptive && models instanceof CatalogModels;
  const size = adaptive ? 1200 : 800;
  const canvas = `<canvas id="live2d" width="${size}" height="${size}"></canvas>`;
  const retry = translated('重试加载模型', 'Retry loading the model');
  document.body.insertAdjacentHTML('beforeend', `<div id="waifu" lang="${options.locale === 'en' ? 'en' : 'zh-CN'}"${adaptive ? ' class="waifu-adaptive"' : ''}${initialFraming ? ' data-initial-framing' : ''}>
    <div id="waifu-status"><span class="waifu-loading-icon" aria-hidden="true">${loadingIcon}</span><button type="button" id="waifu-retry" aria-label="${retry}" title="${retry}">${retryIcon}</button><span id="waifu-status-text" class="waifu-sr-only" role="status"></span></div>
    <div id="waifu-tips"></div>
    ${adaptive ? `<div class="waifu-viewport"><div class="waifu-hit" aria-hidden="true"></div><div class="waifu-surface">${canvas}</div></div>` : canvas}
    <div id="waifu-tool"></div>
  </div>`);
  byId('waifu-retry').addEventListener('click', () => { if (retryModel) void runModel(retryModel); });
  setModelLoading(true);
  show();
  window.addEventListener('live2d:dialogue', event => {
    const { detail, playback } = event as CustomEvent<unknown> & { playback?: object };
    if (typeof detail === 'string') showDialogue(detail, playback);
  });
  window.addEventListener('live2d:preset', event => {
    const { playback } = event as Event & { playback?: object };
    if (playback) showModelPreset(playback);
  });
  window.addEventListener('live2d:dialogue-end', event => {
    const detail = (event as CustomEvent).detail;
    if (detail?.playback) finishDialogue(detail.playback, detail.interrupted);
  });
  window.addEventListener('live2d:costume', event => {
    const url = (event as CustomEvent<unknown>).detail;
    if (typeof url === 'string') void runModel(() => models.costume(url));
  });
  const entryOrder = models instanceof CatalogModels && options.switchBy === 'outfit';
  const labels = { hitokoto: translated('听一句话', 'Hear a quote'), asteroids: translated('启动小游戏', 'Play Asteroids'), 'switch-model': entryOrder ? translated('下一个模型条目', 'Next catalog entry') : translated('切换人物', 'Next character'),
    'switch-texture': translated('切换造型', 'Next outfit'), expand: translated('放大查看', 'Expand model'), photo: translated('保存照片', 'Save a picture'), info: translated('项目信息', 'Project information'), quit: translated('收起看板娘', 'Hide companion') };
  const actions = {
    hitokoto: () => hitokoto(options.locale).catch(error => console.warn('[Live2D]', error)),
    asteroids,
    'switch-model': (event: Event) => { const start = prepareStart(event); return runModel(() => models.nextModel(start)); },
    'switch-texture': (event: Event) => { const start = prepareStart(event); return runModel(() => models.nextTexture(start)); },
    expand: () => expandModel(options.expandedZoom),
    photo: () => {
      say(translated('照好了嘛，是不是很可爱呢？', 'Did you get my good side?'), 6000, 9);
      if (window.loadlive2d.capture?.() || !window.Live2D) return;
      window.Live2D.captureName = 'photo.png';
      window.Live2D.captureFrame = true;
    },
    info: () => window.open('https://github.com/nova1751/live2d-api'),
    quit: () => { retryModel = undefined; models.cancel(); hide(); },
  };
  for (const name of Array.isArray(options.tools) ? options.tools : Object.keys(actions)) {
    if (options.modelUrl && (name === 'switch-model' || name === 'switch-texture')) continue;
    if (!Object.prototype.hasOwnProperty.call(actions, name)) continue;
    if (name === 'expand' && typeof document.createElement('dialog').showModal !== 'function') continue;
    const tool = name as keyof typeof actions;
    byId('waifu-tool').insertAdjacentHTML('beforeend', `<button type="button" id="waifu-tool-${tool}" aria-label="${labels[tool]}" title="${labels[tool]}">${icons[tool]}</button>`);
    const button = byId('waifu-tool-' + tool);
    if (tool === 'expand') button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', actions[tool]);
  }
  void runModel(() => models.load(undefined, undefined, undefined, start));
  getJson<Parameters<typeof bindMessages>[0]>(options.waifuPath).then(bindMessages).catch(error => console.warn('[Live2D]', error));
}

window.initWidget = (input: LegacyOptions | string, apiPath?: string) => {
  const options = typeof input === 'string' ? { waifuPath: input, apiPath } : input;
  if (document.getElementById('waifu-toggle')) return;
  setLanguage(options.locale);
  document.body.insertAdjacentHTML('beforeend', `<button type="button" id="waifu-toggle" aria-label="${translated('打开看板娘', 'Show companion')}" aria-controls="waifu"><span>${translated('看板娘', 'Companion')}</span></button>`);
  const toggle = byId('waifu-toggle');
  toggle.setAttribute('aria-expanded', 'false');
  const models = options.catalogUrl ? new CatalogModels(options.catalogUrl, options) : new LegacyModels(options);
  if (models instanceof CatalogModels) {
    Object.defineProperty(window, Symbol.for('live2dapi-noa.selectModel'), { configurable: true,
      value: async (id: string) => {
        if (toggle.getAttribute('aria-expanded') === 'false' || preferences.getItem('waifu-display')) toggle.click();
        return models.choose(id);
      } });
  }
  toggle.addEventListener('click', event => {
    const start = prepareStart(event);
    toggle.classList.remove('waifu-toggle-active');
    if (toggle.hasAttribute('first-time')) {
      mount(options, models, start);
      toggle.removeAttribute('first-time');
    } else {
      show();
      void runModel(() => models.reopen(start));
    }
    if (event.detail === 0) document.querySelector<HTMLElement>('#waifu-tool button')?.focus();
  });
  const hiddenSince = Number(preferences.getItem('waifu-display'));
  if (hiddenSince && Date.now() - hiddenSince <= 86400000) {
    toggle.setAttribute('first-time', 'true');
    void toggle.offsetWidth;
    toggle.classList.add('waifu-toggle-active');
  } else {
    mount(options, models);
  }
};
