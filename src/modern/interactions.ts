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
  const groups = manifest.FileReferences.Motions ?? {};
  const paths = new Set(Object.values(groups).flat().map(motion => motion.File));
  const byFilename = new Map<string, string | undefined>();
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    byFilename.set(name, byFilename.has(name) ? undefined : path);
  }
  for (const [group, files] of Object.entries(groups)) {
    files.forEach((file, index) => {
      if (data && source) {
        for (const [id, motion] of Object.entries(data.motionData)) {
          const name = motion.motion_name.replace(/\.mtn$/i, '.motion3.json');
          const path = paths.has(name) ? name : byFilename.get(name);
          if (path !== file.File ||
              Boolean(motion.is_hurt) !== (data.variant === 'destroy') || !motion.touch_area || motion.touch_area === '0') continue;
          const line = data.voiceData[id];
          const code = line?.char_code?.toUpperCase();
          const key = line?.voice_key?.toUpperCase();
          actions.push({ file: file.File, group, index, area: motion.touch_area.toLowerCase(), weight: motion.probability,
            delay: Math.max(0, motion.delay || 0), caption: source.captions?.[code + '|' + key] || line?.caption,
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
  let context: AudioContext | undefined;
  function stop() { current?.abort(); current = undefined; }
  signal.addEventListener('abort', () => { stop(); void context?.close(); }, { once: true });

  async function prepareVoice(url: string, signal: AbortSignal) {
    try {
      context ??= new AudioContext();
      // Unlock on the click itself; a document without audio permission can still animate.
      if (context.state !== 'running') void context.resume().catch(() => {});
      const response = await fetch(url, { signal });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!signal.aborted && context.state === 'running') {
        const voice = context.createBufferSource();
        voice.buffer = buffer;
        return voice;
      }
    } catch (error) {
      if (!signal.aborted) console.warn('[Live2D] Voice unavailable', url, error);
    }
  }

  async function play(action: Action) {
    stop();
    const controller = current = new AbortController();
    const signal = controller.signal;
    const playback = {};
    let voice: AudioBufferSourceNode | undefined;
    let speaking = false;
    let pendingCaption = 0;
    let finishLine!: () => void;
    const line = new Promise<void>(resolve => { finishLine = resolve; });
    const ready = action.sound
      ? prepareVoice(action.sound, signal).then(source => { voice = source; })
      : Promise.resolve();
    function end(interrupted: boolean) {
      if (!speaking) return;
      speaking = false;
      window.dispatchEvent(new CustomEvent('live2d:dialogue-end', { detail: { playback, interrupted } }));
    }
    signal.addEventListener('abort', () => {
      cancelAnimationFrame(pendingCaption);
      if (voice) {
        if (voice.onended) voice.stop();
        voice.onended = null;
        voice.disconnect();
      }
      end(true);
      finishLine();
    }, { once: true });
    const now = () => voice ? voice.context.currentTime : performance.now() / 1000;
    let lastTick: number | undefined;
    let cue = 0;
    function showCaption() {
      if (signal.aborted || speaking) return;
      if (now() < cue) { pendingCaption = requestAnimationFrame(showCaption); return; }
      const caption = action.caption?.trim();
      speaking = true;
      const event = caption ? new CustomEvent('live2d:dialogue', { detail: caption }) : new CustomEvent('live2d:preset');
      window.dispatchEvent(Object.assign(event, { playback }));
      if (!voice) finishLine();
    }
    // The backend calls update only once this specific motion owns the queue.
    // The first model frame and the scheduled voice share a single time origin.
    function update(frameSeconds: number) {
      const currentTime = now();
      if (lastTick === undefined) {
        cue = currentTime + action.delay / 1000;
        if (voice) {
          voice.connect(voice.context.destination);
          voice.onended = finishLine;
          voice.start(cue);
        }
        showCaption();
      }
      const delta = lastTick === undefined ? 0 : Math.max(0, currentTime - lastTick);
      lastTick = currentTime;
      return voice ? delta : frameSeconds;
    }
    try {
      const result = await stage.playMotion(action.group, action.index, { sync: { ready, signal, update } });
      if (result.status === 'completed') { await line; end(false); }
    } catch (error) {
      if (!signal.aborted) throw error;
    } finally {
      controller.abort();
      if (current === controller) current = undefined;
    }
  }
  host.addEventListener('click', event => {
    if (current) event.live2dHandlesCaption = true;
    const hits = stage.hitTest(event.clientX, event.clientY);
    for (const area of hits) {
      const candidates = actions.filter(a => a.area === area.toLowerCase() && a.weight > 0);
      if (candidates.length) {
        let roll = Math.random() * candidates.reduce((sum, a) => sum + a.weight, 0);
        const action = candidates.find(a => (roll -= a.weight) < 0) ?? candidates[candidates.length - 1];
        event.live2dHandlesCaption = true;
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
