// Keep one composited frame. WebGL may discard its pixels as soon as the browser
// presents them, so copy inside the renderer's completed-draw callback.
export class ModelTransition {
  private still?: HTMLCanvasElement;
  private revision = 0;

  begin(getAspect: () => number, paintScale: number) {
    const container = document.getElementById('waifu');
    const surface = container?.querySelector<HTMLElement>('.waifu-surface');
    const revision = ++this.revision;
    if (container) {
      if (this.still && !this.still.isConnected) (surface ?? container).prepend(this.still);
      container.setAttribute('data-model-loading', '');
    }
    return (canvas: HTMLCanvasElement) => {
      if (this.revision !== revision || !container) return;
      const next = document.createElement('canvas');
      next.className = 'waifu-model-still';
      next.setAttribute('aria-hidden', 'true');
      next.width = canvas.width;
      next.height = canvas.height;
      try {
        const context = next.getContext('2d');
        if (context) context.drawImage(canvas, 0, 0);
        this.still?.remove();
        this.still = context ? next : undefined;
      } finally {
        if (surface) {
          const aspect = getAspect();
          container.style.setProperty('--waifu-paint-scale', String(paintScale));
          container.style.setProperty('--waifu-aspect', String(aspect));
          container.toggleAttribute('data-wide-model', aspect >= 1.35);
        }
        container.removeAttribute('data-model-loading');
        if (container.hasAttribute('data-initial-framing')) {
          container.removeAttribute('data-initial-framing');
          if (document.activeElement?.matches('#waifu-toggle:focus-visible')) {
            container.querySelector<HTMLButtonElement>('#waifu-tool button')?.focus({ preventScroll: true });
          }
        }
      }
    };
  }
}
