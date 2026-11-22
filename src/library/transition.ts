// Keep one composited frame. WebGL may discard its pixels as soon as the browser
// presents them, so copy inside the renderer's completed-draw callback.
export class ModelTransition {
  private still?: HTMLCanvasElement;
  private revision = 0;

  begin() {
    const container = document.getElementById('waifu');
    const revision = ++this.revision;
    if (container) {
      if (this.still && !this.still.isConnected) container.prepend(this.still);
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
        container.removeAttribute('data-model-loading');
      }
    };
  }
}
