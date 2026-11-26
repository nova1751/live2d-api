import { applyPaintSurface } from './paint';

export class ModelTransition {
  private still?: HTMLCanvasElement;
  private pending?: Promise<void>;
  private cancelCapture?: () => void;
  private holding = false;
  private revision = 0;

  freeze() {
    if (this.pending) return this.pending;
    const container = document.getElementById('waifu');
    const surface = container?.querySelector<HTMLElement>('.waifu-surface');
    if (!container || !surface || this.still || document.hidden || container.hasAttribute('data-model-loading')) return;
    // WebGL can discard a presented frame. Copy once, inside the outgoing renderer's
    // next draw, while it still owns the visible canvas and its original framing.
    this.pending = new Promise<void>(resolve => {
      let finished = false;
      let unsubscribe: (() => void) | undefined;
      const finish = () => {
        finished = true;
        clearTimeout(timeout);
        unsubscribe?.();
        this.cancelCapture = undefined;
        resolve();
      };
      // A paused, lost or throttled context must not block a model change.
      const timeout = setTimeout(finish, 1000);
      this.cancelCapture = finish;
      unsubscribe = window.loadlive2d.onNextPaint?.(canvas => {
        if (finished) return;
        try {
          const still = document.createElement('canvas');
          still.className = 'waifu-model-still';
          still.setAttribute('aria-hidden', 'true');
          still.width = canvas.width;
          still.height = canvas.height;
          const context = still.getContext('2d');
          if (context) {
            context.drawImage(canvas, 0, 0);
            surface.prepend(still);
            this.still = still;
            this.holding = true;
            container.setAttribute('data-model-loading', '');
            window.loadlive2d.hide?.();
          }
        } catch (error) {
          console.warn('[Live2D] Could not capture the outgoing frame', error);
        } finally { finish(); }
      });
      if (!unsubscribe) finish();
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  cancelFreeze() {
    this.revision++;
    this.cancelCapture?.();
    if (this.holding) {
      this.still?.remove();
      this.still = undefined;
      this.holding = false;
      window.loadlive2d.show?.(false);
    }
    document.getElementById('waifu')?.removeAttribute('data-model-loading');
  }

  /** `framed` models are drawn on the current paint surface, others fill the reference square. */
  begin(getAspect: () => number, framed: boolean) {
    const container = document.getElementById('waifu');
    const revision = ++this.revision;
    this.holding = false;
    container?.setAttribute('data-model-loading', '');
    return () => {
      if (this.revision !== revision || !container) return;
      this.still?.remove();
      this.still = undefined;
      const aspect = getAspect();
      container.style.setProperty('--waifu-aspect', String(aspect));
      container.toggleAttribute('data-wide-model', aspect >= 1.35);
      applyPaintSurface(framed);
      container.removeAttribute('data-model-loading');
      if (container.hasAttribute('data-initial-framing')) {
        container.removeAttribute('data-initial-framing');
        if (document.activeElement?.matches('#waifu-toggle:focus-visible')) {
          container.querySelector<HTMLButtonElement>('#waifu-tool button')?.focus({ preventScroll: true });
        }
      }
    };
  }
}
