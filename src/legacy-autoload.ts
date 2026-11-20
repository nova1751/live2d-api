// Classic script globals used by sites that customize the historical snippet.
const live2d_path = PROVIDER === 'npm'
  ? 'https://unpkg.com/live2dapi-noa@latest/'
  : 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/';

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
  ]).then(() => window.initWidget({
    tools: ['hitokoto', 'asteroids', 'switch-model', 'switch-texture', 'photo', 'info', 'quit'],
    cdnPath: live2d_path,
    waifuPath: live2d_path + 'waifu-tips.json',
  }));
}
