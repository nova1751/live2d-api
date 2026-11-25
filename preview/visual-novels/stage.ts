import { createLive2D } from 'live2d-web';
import { loadModernAssets } from '../../src/modern/interactions';

const host = document.querySelector<HTMLElement>('#host')!;
const status = document.querySelector<HTMLElement>('#status')!;
const select = document.querySelector<HTMLSelectElement>('#clip')!;
const button = document.querySelector<HTMLButtonElement>('#play')!;
const stop = new AbortController();
let sound: HTMLAudioElement | undefined;
window.addEventListener(
  'pagehide',
  () => {
    stop.abort();
    sound?.pause();
  },
  { once: true },
);
const fail = (e: unknown) => {
  status.textContent =
    '载入失败 · ' + (e instanceof Error ? e.message : String(e));
};
async function start() {
  const path = new URLSearchParams(location.search).get('model');
  if (!path || path.split(/[\\/]/).some((p) => !p || p === '..' || p === '.'))
    throw Error('模型路径无效');
  const url = new URL(
    './models/' + path.split('/').map(encodeURIComponent).join('/'),
    location.href,
  );
  const response = await fetch(url);
  if (!response.ok) throw Error('模型清单 HTTP ' + response.status);
  const data = JSON.parse(
    (await response.text())
      .replace(/^\uFEFF/, '')
      .replace(/\/\*[\s\S]*?\*\//g, ''),
  );
  if (!data.FileReferences) {
    const canvas = document.createElement('canvas');
    canvas.id = 'live2d';
    canvas.width = canvas.height = 800;
    host.append(canvas);
    const script = document.createElement('script');
    script.src = 'legacy.js';
    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(Error('Cubism 2 加载失败'));
      document.head.append(script);
    });
    await window.loadlive2d('live2d', url.href, { start: false });
    status.textContent = '';
    return;
  }
  const { src, resolveAsset } = loadModernAssets(
    url.href,
    undefined,
    stop.signal,
  );
  const stage = await createLive2D({
    container: host,
    src,
    resolveAsset,
    coreUrl: new URL('core.js', location.href).href,
    fit: 'full',
    followPointer: true,
    signal: stop.signal,
    onError: fail,
  });
  window.addEventListener('pagehide', () => stage.dispose(), { once: true });
  const actions: { label: string; run: () => Promise<unknown> }[] = [];
  for (const [group, entries] of Object.entries(
    data.FileReferences.Motions ?? {},
  ) as [string, { File: string; Sound?: string }[]][]) {
    entries.forEach((entry, index) => {
      if (!entry.File) return;
      const label = entry.File.split('/')
        .at(-1)!
        .replace(/\.motion3\.json$/i, '');
      actions.push({
        label: (group ? group + ' · ' : '') + label + (entry.Sound ? ' ♪' : ''),
        run: async () => {
          const motion = stage.playMotion(group, index);
          if (entry.Sound) {
            sound = new Audio(new URL(entry.Sound, url).href);
            await Promise.all([motion, sound.play()]);
          } else await motion;
        },
      });
    });
  }
  for (const expression of data.FileReferences.Expressions ?? []) {
    actions.push({
      label: '表情 · ' + expression.Name,
      run: () => stage.expression(expression.Name),
    });
  }
  actions.forEach((a, i) => select.add(new Option(a.label, String(i))));
  button.hidden = actions.length === 0;
  button.onclick = () => {
    sound?.pause();
    status.textContent = '';
    actions[Number(select.value)].run().catch(fail);
  };
  status.textContent = '';
  host.dataset.ready = 'true';
}
start().catch(fail);
