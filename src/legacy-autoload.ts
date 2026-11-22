// Classic script globals used by sites that customize the historical snippet.
const live2d_path = (() => {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) {
    const url = new URL(script.src);
    // A published package URL identifies a complete distribution. A copied loader may stand alone.
    if (/\/(?:live2dapi-noa|gh\/nova1751\/live2d-api)(?:@[^/]+)?\/(?:npm|jsdelivr)\/(?:random|sequential)\/autoload(?:\.min)?\.js$/.test(url.pathname)) {
      return new URL('../../', url).href;
    }
  }
  return PROVIDER === 'npm'
    ? 'https://unpkg.com/live2dapi-noa@latest/'
    : 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/';
})();

function loadExternalResource(url: string, type: 'css' | 'js'): Promise<string> {
  let tag: HTMLLinkElement | HTMLScriptElement;
  if (type === 'css') {
    const link = document.createElement('link');
    link.href = url;
    link.rel = 'stylesheet';
    tag = link;
  } else {
    const script = document.createElement('script');
    script.src = url;
    if (url === live2d_path + PROVIDER + '/' + MODE + '/waifu-tips.js') {
      script.dataset.asteroidsUrl = live2d_path + 'asteroids.js';
    }
    tag = script;
  }
  return new Promise((resolve, reject) => {
    tag.onload = () => resolve(url);
    tag.onerror = () => reject(url);
    document.head.appendChild(tag);
  });
}

if (screen.width >= 768) {
  Promise.all([
    loadExternalResource(live2d_path + 'live2d.min.js', 'js'),
    loadExternalResource(live2d_path + PROVIDER + '/' + MODE + '/waifu-tips.js', 'js'),
  ]).then(async () => {
    if (!document.body) {
      await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
    }
    window.initWidget({
      tools: ['hitokoto', 'asteroids', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'],
      cdnPath: live2d_path,
      waifuPath: live2d_path + 'waifu-tips.json',
    });
  }).catch(error => console.error('[Live2D]', error));
}
