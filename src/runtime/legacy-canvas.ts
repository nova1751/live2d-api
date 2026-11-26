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
  const maxBuffer = coarse ? 2048 : 4096;
  let timer = 0;
  const apply = () => {
    timer = 0;
    // Hidden while a Cubism 3+ model owns the stage. Both backends project onto a square.
    if (!canvas.isConnected || canvas.style.visibility === 'hidden' || canvas.width !== canvas.height) return;
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const dpr = !coarse && width <= 720 ? Math.max(devicePixelRatio, 1.5) : devicePixelRatio;
    const target = Math.round(Math.min(maxBuffer, Math.max(minBuffer, width * dpr)));
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
