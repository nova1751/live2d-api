import { nativeMotionLookup, nativeTouchArea } from './native-events';
import { prepareMotion } from './motion';
import { createVolumeLipSync, type Live2DInstance } from 'live2d-web';
import type { DialogueSource, GameCue } from '../library/catalog';
import { fetchCdnAsset } from '../runtime/cdn';

interface MotionFile { File: string; Sound?: string }
interface Manifest { HitAreas?: { Name: string }[]; FileReferences: { Motions?: Record<string, MotionFile[]> } }
interface Metadata {
  variant: string;
  motionData: Record<string, { motion_name: string; touch_area: string; probability: number; delay: number; is_hurt: number }>;
  voiceData: Record<string, { char_code: string; voice_key: string; caption: string }>;
}
interface Action { file: string; group: string; index: number; area: string; weight: number; delay: number; sound?: string; caption?: string }

/** A one-second looping motion with no curves: the model keeps breathing and physics but holds its pose. */
const stillMotion = { Version: 3, Meta: { Duration: 1, Fps: 30, Loop: true, AreBeziersRestricted: true, CurveCount: 0,
  TotalSegmentCount: 0, TotalPointCount: 0, UserDataCount: 0, TotalUserDataSize: 0 }, Curves: [] };

async function json<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetchCdnAsset(url, signal);
  if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + url);
  return response.json();
}

export function loadModernAssets(url: string, source: DialogueSource | undefined, signal: AbortSignal, cues?: Record<string,GameCue>, randomTap = false) {
  const model = json<Manifest>(url, signal).then(manifest => {
    const groups = manifest.FileReferences.Motions ?? {};
    const idleFiles = new Set(Object.entries(groups).filter(([name]) => /^idle/i.test(name)).flatMap(([, clips]) => clips.map(clip => clip.File)));
    return { manifest, groups, idleFiles };
  });
  const interactions = Promise.all([
    model,
    source && json<Metadata>(source.url, signal).catch(error => {
      if (signal.aborted) throw error;
      console.warn('[Live2D] Dialogue data unavailable', error);
      return undefined;
    }),
  ]).then(([{ manifest, groups, idleFiles }, data]) => {
    const actions = readActions(url, manifest, groups, idleFiles, data, source, cues, randomTap);
    const oneShot = new Set(source || randomTap ? actions.filter(a => a.file && !idleFiles.has(a.file)).map(a => new URL(a.file, url).href) : []);
    return { actions, idleFiles, oneShot };
  });
  // The renderer can finish or abort before the optional interaction data arrives.
  void interactions.catch(() => {});
  const src = decodeURIComponent(new URL(url).pathname.slice(1));
  async function resolveAsset(path: string, requestSignal?: AbortSignal) {
    if (path === src) return new Blob([JSON.stringify((await model).manifest)], { type: 'application/json' });
    // jsDelivr parses repo@version before decoding path segments.
    const asset = new URL('/' + path.split('/').map(part => encodeURIComponent(part).replace(/%40/g, '@')).join('/'), url);
    const isMotion = asset.pathname.toLowerCase().endsWith('.motion3.json');
    const idle = isMotion && Array.from((await model).idleFiles).some(file => new URL(file, url).href === asset.href);
    const active = requestSignal ?? signal;
    const response = await fetchCdnAsset(asset.href, active).catch(error => {
      if (!idle || active.aborted) throw error;
    });
    if (!response?.ok) {
      // live2d-web stops rendering when an idle clip fails, which freezes the model for good.
      // A missing idle clip is cosmetic: hold the pose instead.
      if (idle && !active.aborted) {
        console.warn('[Live2D] Idle motion unavailable, holding pose', asset.href, response?.status);
        return new Blob([JSON.stringify(stillMotion)], { type: 'application/json' });
      }
      throw new Error('HTTP ' + response?.status + ' loading ' + asset);
    }
    if (!isMotion) return response.blob();
    const raw = await response.json();
    const clip = prepareMotion(raw, !idle && (await interactions).oneShot.has(asset.href));
    return new Blob([JSON.stringify(clip)], { type: 'application/json' });
  }
  return { src, interactions, resolveAsset };
}

function readActions(url: string, manifest: Manifest, groups: Record<string, MotionFile[]>, idleFiles: ReadonlySet<string>, data: Metadata | undefined, source: DialogueSource | undefined, cues: Record<string, GameCue> | undefined, randomTap: boolean) {
  const actions: Action[] = [];
  const hitNames = new Set(manifest.HitAreas?.map(hit => hit.Name.toLowerCase()));
  const paths = new Set(Object.values(groups).flat().map(motion => motion.File));
  const matchMotion = nativeMotionLookup(paths, source?.url);
  function voiceFor(id: string) {
    const line = data?.voiceData[id];
    const code = line?.char_code?.toUpperCase(), key = line?.voice_key?.toUpperCase();
    return { caption: cues?.[id]?.caption || source?.captions?.[code + '|' + key] || line?.caption,
      sound: code && key ? source?.audio.get('AUDIO/' + code + '/' + code + '_' + key + '_JP.OGG') : undefined };
  }
  for (const [group, files] of Object.entries(groups)) {
    files.forEach((file, index) => {
      let hasEvent = false;
      if (data && source) {
        for (const [id, motion] of Object.entries(data.motionData)) {
          if (matchMotion(id, motion.motion_name) !== file.File) continue;
          hasEvent = true;
          if (Boolean(motion.is_hurt) !== (data.variant === 'destroy')) continue;
          const area = motion.touch_area && motion.touch_area !== '0' ? motion.touch_area.toLowerCase() : '';
          if (!area && !randomTap) continue;
          actions.push({ file: file.File, group, index, area: nativeTouchArea(area, hitNames), weight: motion.probability,
            delay: Math.max(0, motion.delay || 0), ...voiceFor(id) });
        }
      } else if (cues && !/^idle$/i.test(group)) {
        actions.push({file:file.File, group, index, area:group.toLowerCase(), weight:1, delay:0,
          sound:cues[group]?.sound ?? (file.Sound ? new URL(file.Sound,url).href : undefined), caption:cues[group]?.caption});
      } else if (/^tap_?/i.test(group)) {
        actions.push({ file: file.File, group, index, area: group.replace(/^tap_?/i, '').toLowerCase(), weight: 1, delay: 0,
          sound: file.Sound ? new URL(file.Sound, url).href : undefined });
      }
      if (randomTap && !hasEvent && (data || (!cues && !/^tap_?/i.test(group))) && !/^idle/i.test(group) && !idleFiles.has(file.File)) {
        actions.push({file:file.File, group, index, area:'', weight:1, delay:0,
          sound:file.Sound ? new URL(file.Sound,url).href : undefined});
      }
    });
  }
  // Some native touch events have a recording and intentionally leave the motion empty.
  if (data && source) {
    let index = 0;
    for (const [id, motion] of Object.entries(data.motionData)) {
      if (motion.motion_name || !motion.touch_area || motion.touch_area === '0' ||
          Boolean(motion.is_hurt) !== (data.variant === 'destroy') || !(motion.probability > 0)) continue;
      const voice = voiceFor(id);
      if (voice.sound || voice.caption?.trim()) actions.push({ file: '', group: 'voice', index: index++, area: nativeTouchArea(motion.touch_area.toLowerCase(), hitNames),
        weight: motion.probability, delay: Math.max(0, motion.delay || 0), ...voice });
    }
  }
  return actions;
}

export function bindInteractions(host: HTMLElement, stage: Live2DInstance, actions: Action[], signal: AbortSignal, idleFiles: ReadonlySet<string>, hitVisible?: (event: MouseEvent, onHit: () => void) => void) {
  let current: AbortController | undefined;
  let context: AudioContext | undefined;
  let intent = 0;
  function stop() { intent++; current?.abort(); current = undefined; }
  // Move the mouth with the voice volume. Motions without mouth curves would otherwise stay silent-faced.
  const mouth = createVolumeLipSync();
  let analyser: AnalyserNode | undefined;
  let removeLipSync: (() => void) | undefined;
  try { removeLipSync = stage.addLipSync({ driver: mouth, onError: () => removeLipSync?.() }); }
  catch (error) { console.warn('[Live2D] Lip sync unavailable', error); }
  function followVoice(voice: AudioBufferSourceNode, playback: AbortSignal) {
    if (!removeLipSync) return;
    analyser ??= voice.context.createAnalyser();
    analyser.fftSize = 1024;
    voice.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let last = performance.now();
    let frame = requestAnimationFrame(function sample(now) {
      analyser!.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      mouth.sample(Math.sqrt(sum / samples.length), now - last);
      last = now;
      frame = requestAnimationFrame(sample);
    });
    const finish = () => { cancelAnimationFrame(frame); mouth.sample(0, 16); };
    voice.addEventListener('ended', finish, { once: true });
    playback.addEventListener('abort', finish, { once: true });
  }
  signal.addEventListener('abort', () => { stop(); removeLipSync?.(); void context?.close(); }, { once: true });

  async function prepareVoice(url: string, signal: AbortSignal) {
    try {
      context ??= new AudioContext();
      // Unlock on the click itself; a document without audio permission can still animate.
      if (context.state !== 'running') void context.resume().catch(() => {});
      const response = await fetchCdnAsset(url, signal);
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
      // With no motion or audio clock, use the widget's normal reading time after the native delay.
      if (!action.file && !voice && caption) window.dispatchEvent(event);
      else window.dispatchEvent(Object.assign(event, { playback }));
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
          followVoice(voice, signal);
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
      if (!action.file) {
        await ready;
        if (!signal.aborted) { update(0); await line; end(false); }
        return;
      }
      const result = await stage.playMotion(action.group, action.index, { sync: { ready, signal, update } });
      if (result.status === 'completed') { await line; end(false); }
    } catch (error) {
      if (!signal.aborted) throw error;
    } finally {
      controller.abort();
      if (current === controller) current = undefined;
    }
  }
  const idleOrSystem = /^(idle|wait|standby|start|login|tick|shake|mail|mission|complete|home|wedding)/i;
  const fallback = hitVisible ? actions.filter(action => action.file && action.weight > 0 && !idleFiles.has(action.file) && !idleOrSystem.test(action.group) &&
    !/(?:^|[/_])(?:idle|wait|standby|login|wedding)/i.test(action.file)) : [];
  let lastFile: string | undefined;
  function playFallback() {
    if (signal.aborted || !fallback.length) return;
    const other = fallback.filter(a => a.file !== lastFile);
    const pool = other.length ? other : fallback;
    const action = pool[Math.floor(Math.random()*pool.length)];
    lastFile = action.file;
    play(action).catch(error => { if (!signal.aborted) console.error('[Live2D]', error); });
  }
  host.addEventListener('click', event => {
    const click = ++intent;
    if (current) event.live2dHandlesCaption = true;
    const hits = stage.hitTest(event.clientX, event.clientY);
    for (const area of hits) {
      const candidates = actions.filter(a => a.area === area.toLowerCase() && a.weight > 0);
      if (candidates.length) {
        let roll = Math.random() * candidates.reduce((sum, a) => sum + a.weight, 0);
        const action = candidates.find(a => (roll -= a.weight) < 0) ?? candidates[candidates.length - 1];
        event.live2dHandlesCaption = true;
        play(action).catch(error => { if (!signal.aborted) console.error('[Live2D]', error); });
        return;
      }
    }
    if (fallback.length && hitVisible) {
      event.live2dHandlesCaption = true;
      if (hits.length) playFallback();
      else hitVisible(event, () => { if (click === intent) playFallback(); });
    } else if (hits.some(area => area.toLowerCase() === 'head') && stage.getModelInfo().expressions.length) {
      stage.expression().catch(error => { if (!signal.aborted) console.error('[Live2D]', error); });
    }
  }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal });
  return { stop, playMotion(group: string, index: number) {
    const action = actions.find(item => item.group === group && item.index === index);
    if (!action || signal.aborted) return false;
    play(action).catch(error => { if (!signal.aborted) console.error('[Live2D]', error); });
    return true;
  } };
}
