import { icons } from './icons';
import { bindMessages, escapeText, finishDialogue, say, showDialogue } from './messages';
import { getJson } from './request';
import { LegacyModels } from '../legacy/models';
import { CatalogModels } from '../library/selection';

const script = document.currentScript as HTMLScriptElement | null;
const asteroidsUrl = script?.dataset.asteroidsUrl ?? GLOBAL_RUNTIME + 'asteroids.js';
const byId = (id: string) => document.getElementById(id)!;
function reportError(error: unknown) {
  console.error('[Live2D]', error);
  const status = document.getElementById('waifu-status');
  if (status) { status.textContent = '加载失败，请检查网络或切换模型后重试。'; say(status.textContent, 5000, 10); }
}

async function hitokoto() {
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

let hideTimer: number | undefined;

function show() {
  clearTimeout(hideTimer);
  localStorage.removeItem('waifu-display');
  byId('waifu-toggle').setAttribute('tabindex', '-1');
  byId('waifu-toggle').setAttribute('aria-expanded', 'true');
  byId('waifu').style.display = '';
  setTimeout(() => { byId('waifu').style.bottom = '0'; }, 0);
}

function prepareStart(event: Event) {
  return event.isTrusted && !!window.loadlive2d.prepareInteraction?.();
}

function hide() {
  const restoreFocus = byId('waifu').contains(document.activeElement);
  window.loadlive2d.hide?.();
  localStorage.setItem('waifu-display', String(Date.now()));
  say('愿你有一天能与重要的人重逢。', 2000, 11);
  byId('waifu').style.bottom = '-500px';
  hideTimer = setTimeout(() => {
    byId('waifu').style.display = 'none';
    const toggle = byId('waifu-toggle');
    toggle.removeAttribute('tabindex');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.add('waifu-toggle-active');
    if (restoreFocus) toggle.focus();
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 3000);
}

function mount(options: LegacyOptions, models: LegacyModels | CatalogModels, start = false) {
  sessionStorage.removeItem('waifu-text');
  document.body.insertAdjacentHTML('beforeend', `<div id="waifu">
    <div id="waifu-status" role="status" class="waifu-sr-only"></div>
    <div id="waifu-tips"></div>
    <canvas id="live2d" width="800" height="800"></canvas>
    <div id="waifu-tool"></div>
  </div>`);
  show();
  window.addEventListener('live2d:dialogue', event => {
    const { detail, playback } = event as CustomEvent<unknown> & { playback?: object };
    if (typeof detail === 'string') showDialogue(detail, playback);
  });
  window.addEventListener('live2d:dialogue-end', event => {
    const detail = (event as CustomEvent).detail;
    if (detail?.playback) finishDialogue(detail.playback, detail.interrupted);
  });
  window.addEventListener('live2d:costume', event => {
    const url = (event as CustomEvent<unknown>).detail;
    if (typeof url === 'string') models.costume(url).catch(reportError);
  });
  const labels = { hitokoto: '听一句话', asteroids: '启动小游戏', 'switch-model': '切换人物',
    'switch-texture': '切换造型', photo: '保存照片', info: '项目信息', quit: '收起看板娘' };
  const actions = {
    hitokoto: () => hitokoto().catch(reportError),
    asteroids,
    'switch-model': (event: Event) => models.nextModel(prepareStart(event)).catch(reportError),
    'switch-texture': (event: Event) => models.nextTexture(prepareStart(event)).catch(reportError),
    photo: () => {
      say('照好了嘛，是不是很可爱呢？', 6000, 9);
      if (window.loadlive2d.capture?.() || !window.Live2D) return;
      window.Live2D.captureName = 'photo.png';
      window.Live2D.captureFrame = true;
    },
    info: () => window.open('https://github.com/nova1751/live2d-api'),
    quit: () => { models.cancel(); hide(); },
  };
  for (const name of Array.isArray(options.tools) ? options.tools : Object.keys(actions)) {
    if (options.modelUrl && (name === 'switch-model' || name === 'switch-texture')) continue;
    if (!Object.prototype.hasOwnProperty.call(actions, name)) continue;
    const tool = name as keyof typeof actions;
    byId('waifu-tool').insertAdjacentHTML('beforeend', `<button type="button" id="waifu-tool-${tool}" aria-label="${labels[tool]}" title="${labels[tool]}">${icons[tool]}</button>`);
    byId('waifu-tool-' + tool).addEventListener('click', actions[tool]);
  }
  models.load(undefined, undefined, undefined, start).catch(reportError);
  getJson<Parameters<typeof bindMessages>[0]>(options.waifuPath).then(bindMessages).catch(reportError);
}

window.initWidget = (input: LegacyOptions | string, apiPath?: string) => {
  const options = typeof input === 'string' ? { waifuPath: input, apiPath } : input;
  if (document.getElementById('waifu-toggle')) return;
  document.body.insertAdjacentHTML('beforeend', '<button type="button" id="waifu-toggle" aria-label="打开看板娘" aria-controls="waifu"><span>看板娘</span></button>');
  const toggle = byId('waifu-toggle');
  toggle.setAttribute('aria-expanded', 'false');
  const models = options.catalogUrl ? new CatalogModels(options.catalogUrl, options) : new LegacyModels(options);
  if (models instanceof CatalogModels) {
    Object.defineProperty(window, Symbol.for('live2dapi-noa.selectModel'), { configurable: true,
      value: async (id: string) => {
        if (toggle.getAttribute('aria-expanded') === 'false' || localStorage.getItem('waifu-display')) toggle.click();
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
      models.reopen(start)?.catch(reportError);
    }
    document.querySelector<HTMLElement>('#waifu-tool button')?.focus();
  });
  const hiddenSince = Number(localStorage.getItem('waifu-display'));
  if (hiddenSince && Date.now() - hiddenSince <= 86400000) {
    toggle.setAttribute('first-time', 'true');
    setTimeout(() => toggle.classList.add('waifu-toggle-active'), 0);
  } else {
    mount(options, models);
  }
};
