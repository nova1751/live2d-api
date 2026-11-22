import { prepareMotion } from './motion';
import type { Live2DInstance } from 'live2d-web';
import type { DialogueSource } from '../library/catalog';

interface MotionFile { File: string; Sound?: string }
interface Metadata {
  variant: string;
  motionData: Record<string, { motion_name: string; touch_area: string; probability: number; delay: number; is_hurt: number }>;
  voiceData: Record<string, { char_code: string; voice_key: string; caption: string }>;
}
interface Action { file: string; group: string; index: number; area: string; weight: number; delay: number; sound?: string; caption?: string }

async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + url);
  return response.json();
}

export async function readActions(url: string, source: DialogueSource | undefined, signal: AbortSignal) {
  const [manifest, data] = await Promise.all([
    json<{FileReferences: {Motions?: Record<string, MotionFile[]>}}>(url, signal),
    source && json<Metadata>(source.url, signal).catch(error => {
      if (signal.aborted) throw error;
      console.warn('[Live2D] Dialogue data unavailable', error);
      return undefined;
    }),
  ]);
  const actions: Action[] = [];
  for (const [group, files] of Object.entries(manifest.FileReferences.Motions ?? {})) {
    files.forEach((file, index) => {
      if (data && source) {
        for (const [id, motion] of Object.entries(data.motionData)) {
          if (motion.motion_name.replace(/\.mtn$/i, '.motion3.json') !== file.File ||
              Boolean(motion.is_hurt) !== (data.variant === 'destroy') || !motion.touch_area || motion.touch_area === '0') continue;
          const line = data.voiceData[id];
          const code = line?.char_code?.toUpperCase();
          const key = line?.voice_key?.toUpperCase();
          actions.push({ file: file.File, group, index, area: motion.touch_area.toLowerCase(), weight: motion.probability,
            delay: Math.max(0, motion.delay || 0), caption: line?.caption,
            sound: code && key ? source.audio.get('AUDIO/' + code + '/' + code + '_' + key + '_JP.OGG') : undefined });
        }
      } else if (/^tap_?/i.test(group)) {
        actions.push({ file: file.File, group, index, area: group.replace(/^tap_?/i, '').toLowerCase(), weight: 1, delay: 0,
          sound: file.Sound ? new URL(file.Sound, url).href : undefined });
      }
    });
  }
  const filename = decodeURIComponent(new URL(url).pathname.slice(1));
  const oneShot = new Set(source ? actions.map(action => new URL(action.file, url).href) : []);
  async function resolveAsset(path: string, requestSignal?: AbortSignal) {
    if (path === filename) return new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const asset = new URL('/' + path.split('/').map(encodeURIComponent).join('/'), url);
    const response = await fetch(asset, { signal: requestSignal ?? signal });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + asset);
    if (!asset.pathname.toLowerCase().endsWith('.motion3.json')) return response.blob();
    const clip = prepareMotion(await response.json(), oneShot.has(asset.href));
    return new Blob([JSON.stringify(clip)], { type: 'application/json' });
  }
  return { actions, src: filename, resolveAsset };
}

export function bindInteractions(host: HTMLElement, stage: Live2DInstance, actions: Action[], signal: AbortSignal) {
  let current: AbortController | undefined;
  function stop() { current?.abort(); current = undefined; }
  signal.addEventListener('abort', stop, { once: true });
  async function play(action: Action) {
    stop();
    const controller = current = new AbortController();
    const audio = action.sound ? new Audio(action.sound) : undefined;
    const playback = {};
    let speaking = false;
    function end(interrupted: boolean) {
      if (!speaking) return;
      speaking = false;
      window.dispatchEvent(new CustomEvent('live2d:dialogue-end', { detail: { playback, interrupted } }));
    }
    controller.signal.addEventListener('abort', () => { audio?.pause(); end(true); }, { once: true });
    const motion = stage.playMotion(action.group, action.index).then(result => {
      if (result.status !== 'completed') controller.abort();
    });
    const line = async () => {
      if (action.delay) await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, action.delay);
        controller.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      if (controller.signal.aborted) return;
      if (action.caption) {
        speaking = true;
        window.dispatchEvent(Object.assign(new CustomEvent('live2d:dialogue', { detail: action.caption }), { playback }));
      }
      if (audio) {
        const finished = new Promise<void>(resolve => {
          audio.addEventListener('ended', () => resolve(), { once: true });
          audio.addEventListener('error', () => resolve(), { once: true });
          controller.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        try { await audio.play(); await finished; } catch { /* Caption and motion remain available. */ }
      }
    };
    try { await Promise.all([motion, line()]); end(false); }
    finally { controller.abort(); if (current === controller) current = undefined; }
  }
  host.addEventListener('click', event => {
    const hits = stage.hitTest(event.clientX, event.clientY);
    for (const area of hits) {
      const candidates = actions.filter(a => a.area === area.toLowerCase() && a.weight > 0);
      if (candidates.length) {
        let roll = Math.random() * candidates.reduce((sum, a) => sum + a.weight, 0);
        const action = candidates.find(a => (roll -= a.weight) < 0) ?? candidates[candidates.length - 1];
        play(action).catch(error => { if (!signal.aborted) console.error('[Live2D]', error); });
        break;
      }
      if (area.toLowerCase() === 'head' && stage.getModelInfo().expressions.length) {
        stage.expression().catch(error => { if (!signal.aborted) console.error('[Live2D]', error); });
        break;
      }
    }
  }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
  return stop;
}
