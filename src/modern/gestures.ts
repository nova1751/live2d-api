/**
 * Azur Lane's touch and drag rules (the game table ship_l2d), played the way the game plays them:
 * AzurLaneLuaScripts CN/view/ship/live2ddrag.lua for a rule, CN/view/ship/live2d.lua for the model.
 * Rules keep the game's field names (scripts/import-azur-gestures.mts). Pure logic: the renderer
 * reports presses and frame times, plays the actions it asks for and applies the parameter values.
 *
 * Coordinates are the game's screen pixels, y up. Times are seconds.
 */

export interface GestureStep { action?: string | string[]; time?: number; num?: number; target?: number; focus?: number; target_focus?: number }
export interface GestureTrigger {
  type?: number;
  action?: string | string[];
  action_list?: GestureStep[];
  time?: number;
  /** A value to reach, or a range [from, to) or an x/y pair, depending on the type. */
  num?: number | number[];
  target?: number;
  focus?: number;
  target_focus?: number;
  circle?: unknown;
  down?: unknown;
  last?: unknown;
  delta?: number;
  parameter?: string;
  reset_index_action?: string[];
  const_fit?: { idle: number; target: number }[];
}
export interface GestureActive {
  idle?: number | number[];
  enable?: string[];
  ignore?: string[];
  idle_enable?: [number, string[]][];
  idle_ignore?: [number, string[]][];
  repeat_flag?: unknown;
  idle_focus?: number;
  active_list?: GestureActive[];
}
export interface GestureRelation { name: string; type: number; range?: [number, number]; drag_direct?: number; mode?: number; start?: number; smooth?: number; relation_value?: number[]; target?: number }
export interface GestureRule {
  id: number;
  draw_able_name?: string;
  parameter?: string;
  /** 1 override, 2 add to the motion, 3 multiply it. */
  mode?: number;
  start_value?: number;
  range?: [number, number];
  range_abs?: number;
  drag_direct?: number;
  /** Screen pixels per parameter unit while dragging. */
  offset_x?: number;
  offset_y?: number;
  /** Milliseconds. */
  smooth?: number;
  /** Milliseconds after release before going back to the start value; 0 and -1 stay. */
  revert?: number;
  revert_smooth?: number;
  limit_time?: number;
  ignore_action?: number;
  parts_data?: { parts: number[]; type?: number };
  action_trigger?: GestureTrigger;
  action_trigger_active?: GestureActive;
  relation_parameter?: { list?: GestureRelation[] };
  revert_idle_index?: string | number[];
  revert_action_index?: number;
}
export interface GestureFile { schemaVersion: 1; skin: number; rules: GestureRule[] }

export interface GestureHost {
  /** Whether the model has a motion for this action. */
  has(action: string): boolean;
  /** Starts the action's motion. */
  play(action: string): boolean;
  /** Ends the action playing now. */
  stop(): void;
  /** The action playing now, if any. */
  playing(): string | undefined;
  /** Switches the idle loop: 0 is "idle", others "idle<n>". */
  idle(index: number): void;
  /** The model's current value of a parameter. */
  parameter(id: string): number;
}
export interface Point { x: number; y: number }

export const DRAG_TIME_ACTION = 1;
export const DRAG_CLICK_ACTION = 2;
export const DRAG_DOWN_ACTION = 3;
export const DRAG_RELATION_XY = 4;
export const DRAG_RELATION_IDLE = 5;
export const DRAG_CLICK_MANY = 6;
export const DRAG_DOWN_TOUCH = 8;
export const DRAG_CLICK_PARAMETER = 9;
export const DRAG_CLICK_RANGE = 11;
const clickTypes = new Set([DRAG_CLICK_ACTION, DRAG_CLICK_MANY, DRAG_CLICK_PARAMETER, DRAG_CLICK_RANGE]);
const pressTypes = new Set([DRAG_TIME_ACTION, DRAG_DOWN_ACTION, DRAG_RELATION_XY, DRAG_DOWN_TOUCH]);

/** A press that moves less than this and lifts sooner is a tap (live2ddrag.lua checkClickAction). */
export const TAP_DISTANCE = 30;
export const TAP_SECONDS = 0.5;

// Lua treats 0 and "" as true; only a missing field is false.
const has = (value: unknown) => value !== undefined && value !== null && value !== false;

function fix(value: number, range: readonly number[], abs: boolean, direct: number | undefined) {
  if (value < 0 && direct === 1) value = 0;
  else if (value > 0 && direct === 2) value = 0;
  if (abs) value = Math.abs(value);
  if (value < range[0]) value = range[0];
  else if (range[1] < value) value = range[1];
  return value;
}

/** Unity's Mathf.SmoothDamp without a speed limit. */
export function smoothDamp(current: number, target: number, velocity: number, time: number, dt: number) {
  time = Math.max(0.0001, time);
  const omega = 2 / time;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  velocity = (velocity - omega * temp) * exp;
  let output = target + (change + temp) * exp;
  if (target - current > 0 === output > target) {
    output = target;
    velocity = dt > 0 ? (output - target) / dt : 0;
  }
  return [output, velocity] as const;
}

interface Relation { data: GestureRelation; value?: number; velocity: number; enabled: boolean }
interface Plan { action?: string; active: GestureActive; focus: boolean; target?: number; targetFocus: boolean }
export interface Contribution { parameter: string; mode: number; value: number }

class Rule {
  readonly data: GestureRule;
  readonly drawable: string;
  readonly trigger: GestureTrigger;
  readonly active: GestureActive;
  readonly mode: number;
  readonly start: number;
  readonly range: readonly number[];
  readonly abs: boolean;
  readonly smooth: number;
  readonly limit: number;
  readonly relations: Relation[];
  readonly drags: boolean;
  pressed = false;
  value: number;
  from: number;
  target: number;
  smoothTime: number;
  smoothElapsed = 0;
  down: Point = { x: 0, y: 0 };
  held = 0;
  triggerTime = 0;
  cooldown = 0;
  triggered = false;
  index = 1;
  dragX: number;
  dragY: number;
  baseX: number;
  baseY: number;
  toStart?: number;
  revertReset = false;
  idle = 0;
  constructor(data: GestureRule) {
    this.data = data;
    this.drawable = data.draw_able_name ?? '';
    this.trigger = typeof data.action_trigger === 'object' && data.action_trigger ? data.action_trigger : {};
    this.active = typeof data.action_trigger_active === 'object' && data.action_trigger_active ? data.action_trigger_active : {};
    this.mode = data.mode || 1;
    this.start = data.start_value ?? 0;
    this.range = Array.isArray(data.range) ? data.range : [0, 0];
    this.abs = data.range_abs === 1;
    this.smooth = (data.smooth ?? 0) / 1000;
    this.limit = data.limit_time && data.limit_time > 0 ? data.limit_time : 1;
    this.relations = (data.relation_parameter?.list ?? []).map(relation => ({ data: relation, velocity: 0, enabled: false }));
    this.drags = !!(data.offset_x || data.offset_y);
    this.value = this.from = this.target = this.start;
    this.smoothTime = this.smooth;
    this.dragX = this.dragY = this.baseX = this.baseY = this.start;
  }
  get type() { return this.trigger.type; }
  /** Whether pressing this rule's part is a gesture of its own rather than a tap. */
  get holds() { return this.drags || pressTypes.has(this.type ?? 0); }
  fix(value: number) { return fix(value, this.range, this.abs, this.data.drag_direct); }
  setTarget(value: number) {
    this.smoothElapsed = 0;
    this.from = this.target;
    this.target = value;
  }
  resetToStart() {
    this.setTarget(this.start);
    this.dragX = this.dragY = this.baseX = this.baseY = this.start;
  }
  /** The trigger may fire now (isActionTriggerAble, without counting down). */
  get ready() { return this.type !== undefined && this.cooldown <= 0 && !this.triggered; }
  triggerAction() {
    this.cooldown = this.limit;
    this.triggered = true;
  }
}

export class Gestures {
  readonly drawables: readonly string[];
  idleIndex = 0;
  private enable: readonly string[] = [];
  private ignore: readonly string[] = [];
  private readonly rules: Rule[];
  private readonly host: GestureHost;
  private readonly random: () => number;
  private pointer?: Point;
  private pressedAt?: Point;
  private pressTime = 0;
  private pressHits: readonly string[] = [];
  private lastPlaying?: string;
  private started?: string;
  constructor(rules: readonly GestureRule[], host: GestureHost, random = Math.random) {
    this.rules = rules.map(rule => new Rule(rule));
    this.host = host;
    this.random = random;
    this.drawables = [...new Set(this.rules.map(rule => rule.drawable).filter(Boolean))];
  }

  /** Whether the rules let the model play this action now (live2d.lua, enable and ignore lists). */
  allows(action: string) {
    if (!action) return false;
    if (action === 'idle') return true;
    if (this.enable.length && !this.enable.includes(action)) return false;
    return !this.ignore.includes(action);
  }
  /** An action a rule started is still playing; other taps wait for it like they do in the game. */
  busy() {
    const playing = this.host.playing();
    return playing !== undefined && playing === this.started;
  }

  /**
   * A press over the given parts, front to back. Returns whether the press belongs to the model:
   * a part it drags or holds, which a surrounding view must not pan.
   */
  press(hits: readonly string[], point: Point, time: number) {
    this.pointer = this.pressedAt = point;
    this.pressTime = time;
    this.pressHits = hits;
    // The game hands a press to one part (Live2dChar.GetDragPart): the front one that takes presses.
    const part = hits.find(name => this.rules.some(rule => rule.drawable === name && rule.holds));
    const playing = this.host.playing() !== undefined;
    for (const rule of this.rules) {
      if (rule.drawable !== part || rule.pressed) continue;
      if (rule.data.ignore_action === 1 && playing) continue;
      rule.pressed = true;
      rule.down = point;
      rule.held = 0;
      rule.triggerTime = 0;
      if (rule.type === DRAG_DOWN_ACTION) rule.index = 1;
      rule.smoothTime = rule.smooth;
    }
    this.tap(hits, true);
    // Most parts stay put while an action plays (ignore_action, live2ddrag.lua startDrag), often the
    // one their own drag started. The game then ignores the press; it stays the model's here too, so
    // the full-screen view does not pan the canvas instead.
    return part !== undefined;
  }
  move(point: Point) {
    this.pointer = point;
  }
  /** Ends the press. Returns whether a rule took it as a tap. */
  release(point: Point, time: number) {
    this.pointer = point;
    for (const rule of this.rules) if (rule.pressed) this.stopDrag(rule);
    const start = this.pressedAt;
    this.pressedAt = undefined;
    if (!start || Math.abs(point.x - start.x) >= TAP_DISTANCE || Math.abs(point.y - start.y) >= TAP_DISTANCE ||
      time - this.pressTime >= TAP_SECONDS) return false;
    return this.tap(this.pressHits, false);
  }
  /** The press moved further than a tap. */
  moved() {
    const start = this.pressedAt, point = this.pointer;
    return !!start && !!point && (Math.abs(point.x - start.x) >= TAP_DISTANCE || Math.abs(point.y - start.y) >= TAP_DISTANCE);
  }
  cancel() {
    for (const rule of this.rules) if (rule.pressed) this.stopDrag(rule);
    this.pressedAt = undefined;
  }

  /** Values to write this frame, in rule order. */
  *contributions(): Generator<Contribution> {
    for (const rule of this.rules) {
      if (rule.data.parameter) yield { parameter: rule.data.parameter, mode: rule.mode, value: rule.value };
      for (const relation of rule.relations) {
        if (relation.enabled && relation.value !== undefined)
          yield { parameter: relation.data.name, mode: relation.data.mode || rule.mode, value: relation.value };
      }
    }
  }

  step(dt: number) {
    const playing = this.host.playing();
    if (playing && playing !== this.lastPlaying) this.noticePlay();
    this.lastPlaying = playing;
    if (!playing) this.started = undefined;
    for (const rule of this.rules) {
      this.updateState(rule, playing);
      this.updateTrigger(rule, dt, playing !== undefined);
      this.updateDrag(rule);
      this.updateValue(rule, dt);
      this.updateRelations(rule, dt);
      this.checkReset(rule, dt);
    }
  }

  // Taps choose among the parts under the press, ignoring rules that would change nothing.
  // Games stack several switches on one spot (Albion's five poses on her hat) and tell them
  // apart by the pose they lead to.
  private tap(hits: readonly string[], down: boolean) {
    const playing = this.host.playing();
    const parts = new Map<string, Rule[]>();
    for (const rule of this.rules) {
      if (!hits.includes(rule.drawable) || has(rule.trigger.down) !== down || !this.clickable(rule, playing)) continue;
      const plan = this.plan(rule, true);
      if (!plan || !this.changes(rule, plan, playing)) continue;
      parts.set(rule.drawable, [...parts.get(rule.drawable) ?? [], rule]);
    }
    if (!parts.size) return false;
    const choices = [...parts.values()];
    for (const rule of choices[Math.floor(this.random() * choices.length)]) this.apply(rule);
    return true;
  }
  private clickable(rule: Rule, playing: string | undefined) {
    if (!clickTypes.has(rule.type ?? 0) || !rule.ready) return false;
    if (rule.data.ignore_action === 1 && playing) return false;
    const t = rule.trigger;
    if (playing && !(t.focus === 1 && playing === t.action)) return false;
    if (rule.type === DRAG_CLICK_PARAMETER) return typeof t.num === 'number' && t.parameter !== undefined &&
      Math.abs(t.num - this.host.parameter(t.parameter)) <= 0.05;
    if (rule.type === DRAG_CLICK_RANGE) {
      const range = t.num, value = this.host.parameter(t.parameter ?? rule.data.parameter ?? '');
      return Array.isArray(range) && range[0] <= value && value < range[1];
    }
    return true;
  }
  /** Whether applying the plan does anything at all. */
  private changes(rule: Rule, plan: Plan, playing: string | undefined) {
    if (this.sameIdle(plan.active)) return false;
    if (plan.target !== undefined && plan.target !== rule.target) return true;
    if (plan.action) return this.allows(plan.action) && (plan.action === 'idle' || this.host.has(plan.action)) && (!playing || plan.focus);
    return plan.active.idle !== undefined || plan.active.enable !== undefined || plan.active.ignore !== undefined;
  }
  private sameIdle(active: GestureActive) {
    if (has(active.repeat_flag)) return false;
    const idle = active.idle;
    return typeof idle === 'number' ? idle === this.idleIndex : Array.isArray(idle) && idle.length === 1 && idle[0] === this.idleIndex;
  }
  /** What a trigger leads to (onEventCallback, EVENT_ACTION_APPLY), without side effects unless asked. */
  private plan(rule: Rule, dry = false): Plan | undefined {
    const t = rule.trigger;
    const pick = (action: string | string[] | undefined) =>
      Array.isArray(action) ? dry ? action[0] : action[Math.floor(this.random() * action.length)] : action;
    if (has(t.action) || !t.action_list) {
      let target = t.target;
      if (has(t.circle) && target !== undefined && target === rule.target) target = rule.start;
      return { action: pick(t.action), active: rule.active, focus: t.focus === 1, target, targetFocus: t.target_focus === 1 };
    }
    const list = t.action_list;
    const step = list[rule.index - 1] ?? list[0];
    if (!step) return undefined;
    return { action: pick(step.action), active: rule.active.active_list?.[rule.index - 1] ?? rule.active,
      focus: step.focus === 1 || t.focus === 1, target: step.target, targetFocus: step.target_focus === 1 };
  }
  private apply(rule: Rule) {
    const t = rule.trigger;
    const plan = this.plan(rule);
    if (!plan) return;
    rule.triggerAction();
    if (t.action_list && !has(t.action)) {
      if (rule.index >= t.action_list.length) {
        rule.index = 1;
        this.stopDrag(rule);
      } else rule.index++;
      if (!plan.action) rule.triggered = false;
    } else {
      if (!has(t.action)) rule.triggered = false;
      this.stopDrag(rule);
    }
    if (this.sameIdle(plan.active)) return;
    if (plan.target !== undefined) {
      rule.setTarget(plan.target);
      if (plan.targetFocus) rule.value = plan.target;
      if (!plan.action) rule.revertReset = true;
    }
    if (plan.focus) rule.triggered = false;
    // live2d.lua, EVENT_ACTION_APPLY.
    let action = plan.action;
    const empty = !action;
    if (plan.active.idle_focus === 1 && empty) {
      action = 'idle';
      this.changeIdle(typeof plan.active.idle === 'number' ? plan.active.idle : 0);
    }
    if (action && this.play(action, plan.focus)) this.applyActive(plan.active);
    else if (empty) this.applyActive(plan.active);
  }
  private play(action: string, focus: boolean) {
    if (!this.allows(action)) return false;
    if (action === 'idle') {
      this.host.stop();
      return true;
    }
    if (this.host.playing() !== undefined && !focus) return false;
    if (!this.host.has(action) || !this.host.play(action)) return false;
    this.started = action;
    return true;
  }
  private applyActive(active: GestureActive) {
    const idle = active.idle;
    if (active.enable) this.enable = active.enable;
    else for (const [index, list] of active.idle_enable ?? []) if (index === idle) this.enable = list;
    if (active.ignore) this.ignore = active.ignore;
    else for (const [index, list] of active.idle_ignore ?? []) if (index === idle) this.ignore = list;
    if (typeof idle === 'number' && idle >= 0) this.changeIdle(idle);
    else if (Array.isArray(idle)) {
      const others = idle.filter(index => index !== this.idleIndex);
      if (others.length) this.changeIdle(others[Math.floor(this.random() * others.length)]);
    }
  }
  private changeIdle(index: number) {
    if (index === this.idleIndex) return;
    this.idleIndex = index;
    this.host.idle(index);
  }
  /** Any action starting makes every rule wait a moment (onListenerTrigger, ON_ACTION_PLAY). */
  private noticePlay() {
    for (const rule of this.rules) rule.cooldown = Math.min(rule.limit, 0.2);
  }

  private stopDrag(rule: Rule) {
    if (!rule.pressed) return;
    rule.pressed = false;
    if ((rule.data.revert ?? 0) > 0) {
      rule.toStart = rule.data.revert! / 1000;
      rule.smoothTime = (rule.data.revert_smooth ?? 0) / 1000;
    }
    rule.baseX = rule.fix(rule.dragX);
    rule.baseY = rule.fix(rule.dragY);
    if (rule.type === DRAG_DOWN_ACTION && has(rule.trigger.last)) rule.cooldown = 0;
    // Snap to the nearest notch.
    const parts = rule.data.parts_data;
    if (parts && Array.isArray(parts.parts) && (rule.drags || rule.type === DRAG_DOWN_TOUCH)) {
      let best: number | undefined, distance = Infinity;
      for (const part of parts.parts) {
        const gap = Math.abs(rule.target - part);
        const side = parts.type === 2 ? part <= rule.target : parts.type === 3 ? rule.target <= part : true;
        if (side && gap < distance) { distance = gap; best = part; }
      }
      if (best !== undefined) {
        rule.baseX = rule.baseY = best;
        rule.setTarget(best);
      }
    }
  }
  private updateState(rule: Rule, playing: string | undefined) {
    if (rule.idle !== this.idleIndex) {
      const revert = rule.data.revert_idle_index;
      if (Array.isArray(revert) ? revert.includes(this.idleIndex) : Number(revert) === 1) rule.resetToStart();
      rule.idle = this.idleIndex;
    }
    const last = rule.index;
    if (playing && rule.trigger.reset_index_action?.includes(playing)) rule.index = 1;
    if (rule.data.revert_action_index === 1 && last !== rule.index) rule.setTarget(rule.start);
    if (!playing && rule.triggered) rule.triggered = false;
  }
  private updateTrigger(rule: Rule, dt: number, playing: boolean) {
    if (rule.type === undefined) return;
    if (rule.cooldown - dt >= 0) {
      rule.cooldown -= dt;
      return;
    }
    rule.cooldown = 0;
    if (rule.triggered) return;
    const t = rule.trigger;
    const step = t.action_list?.[rule.index - 1];
    const time = t.time ?? step?.time ?? 0;
    const num = t.num ?? step?.num;
    switch (rule.type) {
      case DRAG_TIME_ACTION:
        if (rule.pressed && typeof num === 'number' && Math.abs(rule.value - num) < Math.abs(num) * 0.25) {
          rule.triggerTime += dt;
          if (time < rule.triggerTime && !playing) this.apply(rule);
        }
        break;
      case DRAG_DOWN_ACTION:
        if (rule.pressed) {
          rule.held += dt;
          if (time <= rule.held && !playing) {
            const first = rule.index === 1;
            this.apply(rule);
            if (!first) rule.triggered = false;
            rule.held = 0;
          }
        } else if (has(t.last) && t.action_list && rule.index !== 1) {
          rule.index = t.action_list.length;
          this.apply(rule);
          rule.cooldown = 0;
          rule.triggered = false;
        }
        break;
      case DRAG_RELATION_XY: {
        const [x, y] = Array.isArray(num) ? num : [];
        if (rule.pressed && x !== undefined && y !== undefined && Math.abs(rule.fix(rule.dragX) - x) <= Math.abs(x) * 0.25 &&
          Math.abs(rule.fix(rule.dragY) - y) <= Math.abs(y) * 0.25) {
          rule.triggerTime += dt;
          if (time < rule.triggerTime && !playing) this.apply(rule);
        }
        break;
      }
      case DRAG_RELATION_IDLE:
        for (const fit of t.const_fit ?? []) if (this.idleIndex === fit.idle && !playing) rule.setTarget(fit.target);
        break;
      case DRAG_DOWN_TOUCH:
        if (rule.pressed && t.delta) rule.setTarget(rule.fix(rule.target + dt / t.delta));
        break;
    }
  }
  private updateDrag(rule: Rule) {
    if (!rule.drags || !rule.pressed || !this.pointer) return;
    const { offset_x: ox, offset_y: oy } = rule.data;
    if (ox) rule.dragX = rule.baseX + (this.pointer.x - rule.down.x) / ox;
    if (oy) rule.dragY = rule.baseY + (this.pointer.y - rule.down.y) / oy;
    rule.setTarget(rule.fix(ox ? rule.dragX : rule.dragY));
  }
  private updateValue(rule: Rule, dt: number) {
    if (rule.value === rule.target) return;
    if (Math.abs(rule.value - rule.target) < 0.05) rule.value = rule.target;
    else if (rule.smoothTime > 0) {
      rule.smoothElapsed = Math.min(Math.max(rule.smoothElapsed + dt, 0), rule.smoothTime);
      rule.value = rule.from + (rule.target - rule.from) * rule.smoothElapsed / rule.smoothTime;
    } else rule.value = rule.target;
  }
  private updateRelations(rule: Rule, dt: number) {
    for (const relation of rule.relations) {
      const data = relation.data;
      let goal: number;
      if (data.type === 101) goal = rule.dragX;
      else if (data.type === 102) goal = rule.dragY;
      else if (data.type === 103) goal = data.relation_value?.[rule.index - 1] ?? 0;
      else { relation.enabled = false; continue; }
      relation.enabled = true;
      const fixed = fix(goal, data.range ?? rule.range, rule.abs, data.drag_direct ?? rule.data.drag_direct);
      const current = relation.value ?? data.start ?? rule.start;
      if (data.target !== undefined) relation.value = data.target;
      else if (Math.abs(fixed - current) <= 0.01) relation.value = fixed;
      else [relation.value, relation.velocity] = smoothDamp(current, fixed, relation.velocity, data.smooth ? data.smooth / 1000 : rule.smooth, dt);
    }
  }
  private checkReset(rule: Rule, dt: number) {
    if (rule.pressed || rule.toStart === undefined) return;
    if (rule.toStart > 0) rule.toStart -= dt;
    if (rule.toStart > 0) return;
    rule.toStart = undefined;
    rule.resetToStart();
    if (rule.revertReset) {
      rule.triggered = false;
      rule.revertReset = false;
    }
  }
}

/** Writes one frame's value of a parameter over what the motion left there. */
export function blend(base: number, contributions: readonly Contribution[]) {
  let value = base;
  for (const { mode, value: own } of contributions) value = mode === 2 ? value + own : mode === 3 ? value * own : own;
  return value;
}
