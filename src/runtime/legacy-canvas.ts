import { desktopPixelBudget, maxPaintBuffer, paintResolution, targetPixelRatio } from './paint-buffer';

const settleMs = 160;
const minBuffer = 256;

/**
 * Keep the Cubism 2 drawing buffer at the canvas's displayed size and pixel ratio.
 *
 * A fixed buffer is either stretched and blurry when the canvas is enlarged, or several times
 * larger than needed in the small widget, where the browser then downsamples it with visible
 * aliasing. Cubism 3+ sizes its own canvas. Resizing reallocates GPU buffers, so wait until the
 * layout settles, for example after a zoom gesture.
 */
export function sizeLegacyCanvas(canvas: HTMLCanvasElement) {
  // Without these the initial buffer simply stays as it is.
  if (typeof ResizeObserver !== 'function' || typeof matchMedia !== 'function') return;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const minSide = coarse ? minBuffer : 1200;
  const maxBuffer = maxPaintBuffer();
  let timer = 0;
  const apply = () => {
    timer = 0;
    // Hidden while a Cubism 3+ model owns the stage. Both backends project onto a square.
    if (!canvas.isConnected || canvas.style.visibility === 'hidden' || canvas.width !== canvas.height) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    if (!width) return;
    const dpr = targetPixelRatio(canvas, width, width, coarse);
    // Desktops get the same visible-pixel budget as Cubism 3+; phones keep their own pixel ratio.
    const scale = coarse ? dpr : paintResolution(rect, { width: innerWidth, height: innerHeight }, dpr,
      { maxResolution: 3, pixelBudget: desktopPixelBudget, maxSide: maxBuffer });
    const target = Math.round(Math.min(maxBuffer, Math.max(minSide, width * scale)));
    if (Math.abs(target - canvas.width) > 16) canvas.width = canvas.height = target;
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(apply, settleMs);
  };
  new ResizeObserver(schedule).observe(canvas);
  // The pixel ratio changes when the window moves to another screen or the page is zoomed.
  let ratio: MediaQueryList | undefined;
  const watchRatio = () => {
    ratio?.removeEventListener('change', onRatio);
    ratio = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    ratio.addEventListener('change', onRatio);
  };
  function onRatio() { watchRatio(); schedule(); }
  watchRatio();
}
