import type { Controls } from './sim';

// Physical key positions, so CapsLock, Shift and non-QWERTY layouts all fly the same way.
const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyB', 'Escape']);

export class Input {
  private keys = new Set<string>();
  private pointer: { id: number; x: number; y: number } | undefined;
  private controller = new AbortController();
  readonly controls: Controls = { thrust: false, turn: 0, fire: false };

  constructor(surface: HTMLElement, private exit: () => void) {
    const options = { signal: this.controller.signal, capture: true };
    window.addEventListener('keydown', event => {
      if (!this.claims(event)) return;
      if (event.code === 'Escape') { this.exit(); return; }
      this.keys.add(event.code);
    }, options);
    window.addEventListener('keyup', event => {
      if (this.claims(event)) this.keys.delete(event.code);
    }, options);
    // A key released while the window was not focused would otherwise stay held.
    window.addEventListener('blur', () => this.release(), options);
    document.addEventListener('visibilitychange', () => this.release(), options);

    const signal = this.controller.signal;
    surface.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointer) return;
      event.preventDefault();
      surface.setPointerCapture?.(event.pointerId);
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }, { signal });
    surface.addEventListener('pointermove', event => {
      if (event.pointerId !== this.pointer?.id) return;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    }, { signal });
    const lift = (event: PointerEvent) => { if (event.pointerId === this.pointer?.id) this.pointer = undefined; };
    surface.addEventListener('pointerup', lift, { signal });
    surface.addEventListener('pointercancel', lift, { signal });
    surface.addEventListener('lostpointercapture', lift, { signal });
    // A long press would otherwise open the context menu on touch screens.
    surface.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  }

  /** Take only the game's own keys, and leave shortcuts such as Ctrl+R to the browser. */
  private claims(event: KeyboardEvent) {
    if (!KEYS.has(event.code) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  private release() {
    this.keys.clear();
    this.pointer = undefined;
  }

  get highlighting() { return this.keys.has('KeyB'); }

  /** The current state of every input, updated in place. */
  read(): Controls {
    const keys = this.keys;
    const controls = this.controls;
    controls.thrust = keys.has('ArrowUp') || keys.has('KeyW');
    controls.turn = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    controls.fire = keys.has('Space');
    controls.aim = this.pointer;
    return controls;
  }

  dispose() {
    this.controller.abort();
    this.release();
  }
}
