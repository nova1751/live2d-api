import { preferences, session } from './storage';
import { setLanguage, translated } from './locale';
import { expandModel } from './expand';
import { icons, loadingIcon, retryIcon } from './icons';
import { attachCaption, bindMessages, escapeText, finishDialogue, pick, say, showDialogue, showModelPreset } from './messages';
import { getJson, isLoadCancelled } from './request';
import { cdnCandidates } from './cdn';
import { setModelLoading } from './loading';
import { sizeLegacyCanvas } from './legacy-canvas';
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

// Shown when hitokoto.cn is unreachable, slow or rate limited, so the button always answers.
const offlineQuotes = [
  '今天也辛苦了，记得抬头看看天空。',
  '再小的进步，也值得被记住。',
  '休息不是偷懒，是为了走更远的路。',
  '把手头这件事做好，就已经很了不起了。',
  '风会停，雨也会停，明天总会来。',
];
const englishQuotes = ['One step at a time, Commander.', 'Even on a quiet day, there is something worth noticing.'];
// A click is a request from the reader, so it outranks idle chatter and the welcome line.
const askedPriority = 11;
let quoteRequest: AbortController | undefined;

function cancelQuote() {
  quoteRequest?.abort();
  quoteRequest = undefined;
}

async function hitokoto(locale?: LegacyOptions['locale']) {
  cancelQuote();
  if (locale === 'en') {
    say(englishQuotes, 6000, askedPriority);
    return;
  }
  const request = quoteRequest = new AbortController();
  const timeout = setTimeout(() => request.abort(new Error('hitokoto.cn timed out')), 5000);
  say('让我想想…', 5000, askedPriority);
  try {
    const quote = await getJson<{ hitokoto: string; from?: string | null; from_who?: string | null }>('https://v1.hitokoto.cn', request.signal);
    if (quoteRequest !== request) return;
    const author = quote.from_who ? escapeText(String(quote.from_who)) : '';
    const work = quote.from ? `「${escapeText(String(quote.from))}」` : '';
    // The quote and its source share one caption, so the source can never appear alone.
    const source = author || work ? `<small class="waifu-tips-source">—— ${author}${work}</small>` : '';
    say(escapeText(String(quote.hitokoto)) + source, 6000, askedPriority);
  } catch (error) {
    // A newer click or hiding the widget aborted this request; that caller speaks instead.
    if (quoteRequest !== request) return;
    console.warn('[Live2D]', error);
    say(`${pick(offlineQuotes)}<small class="waifu-tips-source">（离线）</small>`, 6000, askedPriority);
  } finally {
    clearTimeout(timeout);
    if (quoteRequest === request) quoteRequest = undefined;
  }
}

let gameLoading = false;
function asteroids() {
  if (window.Asteroids) { window.Asteroids.start(); return; }
  // The script starts the game itself once it loads; a second click meanwhile waits for it.
  if (gameLoading) return;
  gameLoading = true;
  // Same file on the other GitHub CDNs, in case the visitor's network blocks this one.
  const urls = cdnCandidates(asteroidsUrl, { script: true });
  const load = (index: number) => {
    const script = document.createElement('script');
    script.src = urls[index];
    script.onload = () => { gameLoading = false; };
    script.onerror = () => {
      script.remove();
      if (index + 1 < urls.length) { load(index + 1); return; }
      gameLoading = false;
      say(translated('小游戏加载失败了，稍后再试试吧。', 'The game could not load. Try again in a moment.'), 5000, askedPriority);
    };
    document.head.appendChild(script);
  };
  load(0);
}

function gameOver(event: Event) {
  const score = Number((event as CustomEvent<{ score?: number }>).detail?.score) || 0;
  say(score
    ? translated(`打掉了 <span>${score}</span> 个元素，指挥官好身手！`, `You knocked out <span>${score}</span> elements. Nice flying, Commander!`)
    : translated('一个都没打中？下次一定行～', 'Not a single hit? Next time for sure.'), 5000, 10);
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
  const adaptive = Boolean(options.collection || options.modelUrl);
  const initialFraming = adaptive && (models instanceof CatalogModels || Boolean(options.modelUrl));
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
  attachCaption(byId('waifu-tips'));
  window.addEventListener('asteroids:end', gameOver);
  // The width and height above only seed the buffer until the canvas has a displayed size.
  sizeLegacyCanvas(byId('live2d') as HTMLCanvasElement);
  setModelLoading(true);
  show();
  window.addEventListener('live2d:dialogue', event => {
    const { detail, playback } = event as CustomEvent<unknown> & { playback?: object };
    if (typeof detail === 'string') showDialogue(detail, playback);
  });
  window.addEventListener('live2d:preset', event => {
    const { playback, voiced } = event as Event & { playback?: object; voiced?: boolean };
    if (playback) showModelPreset(playback, !!voiced);
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
    quit: () => { retryModel = undefined; cancelQuote(); models.cancel(); hide(); },
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
  if (adaptive) byId('waifu').style.setProperty('--waifu-tool-count', String(byId('waifu-tool').childElementCount));
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
