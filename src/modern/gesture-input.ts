import type { Live2DInstance, ModelHandle, StageHandle } from 'live2d-web';
import { blend, Gestures, type Contribution, type GestureRule, type Point } from './gestures.ts';

/** The game lays its characters out on a screen about this many pixels tall; rules count drags in them. */
const SCREEN_HEIGHT = 1080;

export interface GestureActions {
  play(group: string): boolean;
  stop(): void;
  playing(): string | undefined;
}
/** What the ordinary tap handling asks the rules (modern/interactions.ts). */
export interface GestureGate {
  /** The click ends a press the rules handled: a drag, a tap a rule took, or a tap during a rule's action. */
  claims(event: MouseEvent): boolean;
  allows(group: string): boolean;
  /** Hit area names that are the rules' parts, and no longer plain tap areas. */
  parts: ReadonlySet<string>;
}

/**
 * Plays an outfit's game rules on a Cubism 3+ model: presses and drags on its touch meshes, the
 * parameters they move, the actions and idle poses they switch to.
 */
export function bindGestures(element: HTMLElement, stage: Live2DInstance, model: ModelHandle, graphics: StageHandle, rules: readonly GestureRule[],
  actions: GestureActions, hitAreas: readonly { Id?: string; Name: string }[], signal: AbortSignal): GestureGate | undefined {
  const { drawablesAt, setIdleMotion } = model;
  if (!drawablesAt || !setIdleMotion) return;
  const info = stage.getModelInfo();
  const groups = info.motions;
  const engine = new Gestures(rules, {
    has: action => (groups[action] ?? 0) > 0,
    play: action => actions.play(action),
    stop: () => actions.stop(),
    playing: () => actions.playing(),
    idle(index) {
      const group = index ? 'idle' + index : groups.Idle ? 'Idle' : 'idle';
      if (groups[group]) setIdleMotion(group);
    },
    parameter: id => stage.getParameter(id),
  });
  if (!engine.drawables.length) return;

  // Every frame: advance the rules, then hand each parameter its values for the next model update.
  const known = info.parameters ? new Set(info.parameters.map(parameter => parameter.id)) : undefined;
  const frame = new Map<string, Contribution[]>();
  const collect = () => {
    for (const list of frame.values()) list.length = 0;
    for (const item of engine.contributions()) frame.get(item.parameter)?.push(item);
  };
  for (const item of engine.contributions()) {
    if (frame.has(item.parameter) || (known && !known.has(item.parameter))) continue;
    frame.set(item.parameter, []);
    const id = item.parameter;
    // Before physics, so hair and cloth follow a dragged part.
    stage.addParameterDriver(id, { phase: 'before-physics', getValue: () => blend(stage.getParameter(id), frame.get(id)!) });
  }
  collect();
  const stopFrames = graphics.onFrame(delta => {
    if (signal.aborted) return;
    engine.step(Math.min(0.1, Math.max(0, delta / 1000)));
    collect();
  });
  signal.addEventListener('abort', stopFrames, { once: true });

  const toGame = (event: PointerEvent): Point => {
    const rect = element.getBoundingClientRect();
    const scale = SCREEN_HEIGHT / Math.max(1, rect.height);
    return { x: (event.clientX - rect.left) * scale, y: (rect.top - event.clientY) * scale };
  };
  const partsAt = (event: PointerEvent) => {
    const point = graphics.toWorld(event.clientX, event.clientY);
    return drawablesAt(point.x, point.y, engine.drawables).map(hit => hit.id);
  };
  let pointer: number | undefined;
  let owned = false;
  let claim = false;
  // Some outfits keep touch areas off the character's canvas, where the game's wider screen still
  // has them (Albion's pose switches sit below her scene). The full-screen view fills the screen,
  // so a press anywhere in it can reach them; elsewhere only presses on the model count.
  // Capturing at the window runs before the full-screen view decides to pan (runtime/expand.ts).
  addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // A new primary press means the last one ended where its release never reached the page.
    if (pointer !== undefined) {
      engine.cancel();
      pointer = undefined;
      owned = false;
    }
    const target = event.target instanceof Node ? event.target : undefined;
    const onModel = !!target && element.contains(target);
    if (!onModel && !(target && element.closest('.waifu-view-viewport')?.contains(target))) return;
    const hits = partsAt(event);
    if (!onModel && !hits.length) return;
    pointer = event.pointerId;
    claim = false;
    owned = engine.press(hits, toGame(event), event.timeStamp / 1000);
    if (!owned) return;
    // The full-screen view leaves this drag to the model.
    event.live2dDrag = true;
    if (onModel) element.setPointerCapture?.(event.pointerId);
  }, { capture: true, signal });
  // A finger on a part the model drags must not scroll the page. Elsewhere the page scrolls as usual.
  element.addEventListener('touchstart', event => { if (owned && event.cancelable) event.preventDefault(); }, { signal, passive: false });
  // The release can land off the model when the press was not captured.
  addEventListener('pointermove', event => {
    if (event.pointerId === pointer) engine.move(toGame(event));
  }, { signal });
  const end = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = undefined;
    if (event.type === 'pointerup') {
      const moved = owned && engine.moved();
      const tapped = engine.release(toGame(event), event.timeStamp / 1000);
      claim = tapped || moved;
    } else engine.cancel();
    owned = false;
  };
  for (const type of ['pointerup', 'pointercancel'] as const) addEventListener(type, end, { signal });

  const names = new Set(engine.drawables);
  const parts = new Set(hitAreas.filter(area => area.Id && names.has(area.Id)).map(area => area.Name.toLowerCase()));
  return {
    claims() {
      const claimed = claim || engine.busy();
      claim = false;
      return claimed;
    },
    allows: group => engine.allows(group),
    parts,
  };
}
