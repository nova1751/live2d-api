import { icons } from './icons';
import { bindMessages, escapeText, say } from './messages';
import { getJson, Models } from './models';

const script = document.currentScript as HTMLScriptElement | null;
const asteroidsUrl = script?.dataset.asteroidsUrl ?? (PROVIDER === 'npm'
  ? 'https://unpkg.com/live2dapi-noa@latest/asteroids.js'
  : 'https://fastly.jsdelivr.net/gh/nova1751/live2d-api@latest/asteroids.js');
const byId = (id: string) => document.getElementById(id)!;
const reportError = (error: unknown) => console.error('[Live2D]', error);

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

function show() {
  localStorage.removeItem('waifu-display');
  byId('waifu').style.display = '';
  setTimeout(() => { byId('waifu').style.bottom = '0'; }, 0);
}

function hide() {
  localStorage.setItem('waifu-display', String(Date.now()));
  say('愿你有一天能与重要的人重逢。', 2000, 11);
  byId('waifu').style.bottom = '-500px';
  setTimeout(() => {
    byId('waifu').style.display = 'none';
    byId('waifu-toggle').classList.add('waifu-toggle-active');
  }, 3000);
}

function mount(options: LegacyOptions) {
  const models = new Models(options);
  sessionStorage.removeItem('waifu-text');
  document.body.insertAdjacentHTML('beforeend', `<div id="waifu">
    <div id="waifu-tips"></div>
    <canvas id="live2d" width="800" height="800"></canvas>
    <div id="waifu-tool"></div>
  </div>`);
  show();
  const actions = {
    hitokoto: () => hitokoto().catch(reportError),
    asteroids,
    'switch-model': () => models.nextModel().catch(reportError),
    'switch-texture': () => models.nextTexture().catch(reportError),
    photo: () => {
      say('照好了嘛，是不是很可爱呢？', 6000, 9);
      window.Live2D.captureName = 'photo.png';
      window.Live2D.captureFrame = true;
    },
    info: () => window.open('https://github.com/nova1751/live2d-api'),
    quit: hide,
  };
  for (const name of Array.isArray(options.tools) ? options.tools : Object.keys(actions)) {
    if (!Object.prototype.hasOwnProperty.call(actions, name)) continue;
    const tool = name as keyof typeof actions;
    byId('waifu-tool').insertAdjacentHTML('beforeend', `<span id="waifu-tool-${tool}">${icons[tool]}</span>`);
    byId('waifu-tool-' + tool).addEventListener('click', actions[tool]);
  }
  models.load().catch(reportError);
  getJson<Parameters<typeof bindMessages>[0]>(options.waifuPath).then(bindMessages).catch(reportError);
}

window.initWidget = (input: LegacyOptions | string, apiPath?: string) => {
  const options = typeof input === 'string' ? { waifuPath: input, apiPath } : input;
  if (document.getElementById('waifu-toggle')) return;
  document.body.insertAdjacentHTML('beforeend', '<div id="waifu-toggle"><span>看板娘</span></div>');
  const toggle = byId('waifu-toggle');
  toggle.addEventListener('click', () => {
    toggle.classList.remove('waifu-toggle-active');
    if (toggle.hasAttribute('first-time')) {
      mount(options);
      toggle.removeAttribute('first-time');
    } else {
      show();
    }
  });
  const hiddenSince = Number(localStorage.getItem('waifu-display'));
  if (hiddenSince && Date.now() - hiddenSince <= 86400000) {
    toggle.setAttribute('first-time', 'true');
    setTimeout(() => toggle.classList.add('waifu-toggle-active'), 0);
  } else {
    mount(options);
  }
};
