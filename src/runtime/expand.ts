import { translated } from './locale';
import { icons, retryIcon } from './icons';
import { overridePaintSurface } from '../library/paint';

/** Enlarge the mounted canvas so the current model and its playback stay alive. */
export function expandModel(initialZoom = 100) {
  const widget = document.getElementById('waifu');
  if (!widget || document.getElementById('waifu-expanded')) return;
  const trigger = document.getElementById('waifu-tool-expand');
  const marker = document.createComment('Live2D widget position');
  widget.before(marker);

  const dialog = document.createElement('dialog');
  dialog.id = 'waifu-expanded';
  dialog.lang = widget.lang;
  dialog.setAttribute('aria-label', translated('模型大图', 'Expanded model'));
  const stage = document.createElement('div');
  stage.className = 'waifu-expanded-stage';
  const controls = document.createElement('div');
  controls.className = 'waifu-view-controls';
  const viewport = document.createElement('div');
  viewport.className = 'waifu-view-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', translated('模型预览区', 'Model preview'));
  viewport.title = translated('Ctrl/⌘ + 滚轮、双指捏合或 +/− 键缩放，双击空白处切换放大；放大后按住任意位置拖动画面，单击人物仍可互动',
    'Zoom with Ctrl/⌘ + wheel, a pinch, or the +/− keys; double-click the background to toggle zoom. When zoomed, drag anywhere to move the view; a click on the character still interacts');
  const content = document.createElement('div');
  content.className = 'waifu-view-content';
  viewport.append(content);

  const zoom = document.createElement('div');
  zoom.className = 'waifu-view-zoom';
  const label = document.createElement('label');
  label.className = 'waifu-sr-only';
  label.textContent = translated('缩放', 'Zoom');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'waifu-view-slider';
  label.htmlFor = slider.id;
  const number = document.createElement('input');
  number.type = 'number';
  number.setAttribute('aria-label', translated('缩放百分比', 'Zoom percentage'));
  number.inputMode = 'numeric';
  for (const input of [slider, number]) {
    input.min = '50';
    input.max = '300';
    input.step = '1';
  }
  const percentage = document.createElement('div');
  percentage.className = 'waifu-view-percent';
  percentage.append(number, '%');
  function control(name: string, icon: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', name);
    button.title = name;
    button.innerHTML = icon;
    return button;
  }
  const fit = control(translated('适应窗口', 'Fit to view'), retryIcon);
  let percent = 100;
  let exact = percent;
  /** Zoom to `value` percent, keeping the point under `anchor` (client coordinates) in place. */
  function setZoom(value: number, anchor?: { x: number; y: number }) {
    const before = widget!.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const centerX = anchor?.x ?? view.left + viewport.clientWidth / 2;
    const centerY = anchor?.y ?? view.top + viewport.clientHeight / 2;
    // Keep the unrounded value so many tiny trackpad steps still add up.
    exact = Math.max(50, Math.min(300, Number.isFinite(value) ? value : exact));
    percent = Math.round(exact);
    slider.value = number.value = String(percent);
    slider.setAttribute('aria-valuetext', percent + '%');
    viewport.toggleAttribute('data-pannable', percent > 100);
    content.style.setProperty('--view-scale', String(percent / 100));
    const after = widget!.getBoundingClientRect();
    if (before.width && before.height) {
      viewport.scrollLeft += after.left + (centerX - before.left) * after.width / before.width - centerX;
      viewport.scrollTop += after.top + (centerY - before.top) * after.height / before.height - centerY;
    }
    cover();
  }

  // The expanded view owns the screen: draw a framed character on a surface reaching every edge of
  // the scrollable view, so motions that zoom in are cut only by the screen. The floating widget
  // keeps its compact margin. The character keeps its size and place either way. The surface
  // is centered on the reference square; resizing it reallocates GPU buffers, so wait until zooming
  // settles. The Cubism 2 drawing buffer follows the canvas on its own (runtime/legacy-canvas.ts).
  const maxBuffer = matchMedia('(pointer: coarse)').matches ? 2048 : 4096;
  let coverTimer = 0;
  function cover(now = false) {
    clearTimeout(coverTimer);
    const measure = () => {
      const box = widget!.querySelector('.waifu-viewport')?.getBoundingClientRect();
      if (!box?.width || !box.height || !dialog.open) return;
      const view = content.getBoundingClientRect();
      const square = Math.max(box.width, box.height);
      const x = box.left + box.width / 2, y = box.bottom - square / 2;
      const reach = Math.max(x - view.left, view.right - x, y - view.top, view.bottom - y);
      const limit = Math.max(1.5, maxBuffer / (square * devicePixelRatio));
      overridePaintSurface({ scale: Math.min(limit, Math.max(1.5, 2 * reach / square)), below: 0.5 });
    };
    if (now) measure();
    else coverTimer = window.setTimeout(measure, 160);
  }
  const resized = new ResizeObserver(() => cover());
  slider.addEventListener('input', () => setZoom(slider.valueAsNumber));
  number.addEventListener('change', () => setZoom(number.valueAsNumber));
  number.addEventListener('blur', () => { number.value = String(percent); });
  number.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); setZoom(number.valueAsNumber); }
  });
  fit.addEventListener('click', () => setZoom(100));
  zoom.append(label, slider, percentage, fit);
  controls.append(zoom);
  const close = control(translated('还原', 'Restore'), icons.quit);
  close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  if (document.fullscreenEnabled && typeof stage.requestFullscreen === 'function') {
    const toggle = control(translated('全屏', 'Fullscreen'), icons.expand);
    const update = () => {
      const active = document.fullscreenElement === stage;
      const name = active ? translated('退出全屏', 'Exit fullscreen') : translated('全屏', 'Fullscreen');
      toggle.setAttribute('aria-label', name);
      toggle.title = name;
    };
    stage.addEventListener('fullscreenchange', update);
    update();
    toggle.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === stage) await document.exitFullscreen();
        else await stage.requestFullscreen();
      } catch {
        toggle.hidden = true;
        close.focus();
      }
    });
    zoom.append(toggle);
  }
  zoom.append(close);
  // When zoomed in, dragging anywhere pans the view, the character included. A press that stays
  // within a few pixels is still a click, so tapping the character keeps triggering its reactions.
  const panSlop = 6;
  let drag: { id: number; x: number; y: number; left: number; top: number; active: boolean } | undefined;
  let swallowClick = false;
  function startPan(event: PointerEvent) {
    drag!.active = true;
    swallowClick = true;
    viewport.setPointerCapture(event.pointerId);
    viewport.setAttribute('data-panning', '');
    getSelection()?.removeAllRanges();
  }
  function endPan() {
    drag = undefined;
    viewport.removeAttribute('data-panning');
  }
  viewport.addEventListener('pointerdown', event => {
    swallowClick = false;
    if (percent <= 100 || drag || touches.size > 0 || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, active: false };
    // The background has nothing to click, and the middle button never clicks: pan right away.
    if (event.button === 1 || event.target === viewport || event.target === content) {
      event.preventDefault();
      startPan(event);
    }
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    // A second finger turns the gesture into a pinch.
    if (touches.size > 1) { endPan(); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < panSlop) return;
      startPan(event);
    }
    // Keep the character from treating the drag as a stroke or a gaze target.
    event.stopPropagation();
    viewport.scrollTo(drag.left - dx, drag.top - dy);
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    viewport.addEventListener(type, event => { if (drag?.id === event.pointerId) endPan(); });
  }
  // The click that ends a drag must not reach the character.
  viewport.addEventListener('click', event => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  // Ctrl/⌘ + wheel. Trackpad pinches arrive as ctrl + wheel too. A plain wheel keeps scrolling.
  viewport.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
    setZoom(exact * Math.exp(-delta * 0.0025), { x: event.clientX, y: event.clientY });
  }, { passive: false });

  // Two-finger pinch on touch screens, anchored between the fingers. The viewport keeps native
  // one-finger panning (touch-action: pan-x pan-y in widget.css) but leaves pinching to us.
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; percent: number } | undefined;
  const spread = () => {
    const [a, b] = Array.from(touches.values());
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      pinch = { distance: spread().distance, percent };
      // The second finger starts a zoom gesture, not a tap on the character.
      event.stopPropagation();
    }
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch || touches.size !== 2) return;
    const { distance, x, y } = spread();
    if (pinch.distance > 0) setZoom(pinch.percent * distance / pinch.distance, { x, y });
  });
  const lift = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = undefined;
  };
  viewport.addEventListener('pointerup', lift);
  viewport.addEventListener('pointercancel', lift);

  // Double-click the background toggles between the fitted view and 2x at that point.
  viewport.addEventListener('dblclick', event => {
    if (event.target !== viewport && event.target !== content) return;
    setZoom(percent > 100 ? 100 : 200, { x: event.clientX, y: event.clientY });
  });

  // + / − / 0 like image viewers, unless the user is typing in the zoom inputs.
  dialog.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) return;
    if (event.key === '+' || event.key === '=') setZoom(percent * 1.25);
    else if (event.key === '-' || event.key === '_') setZoom(percent / 1.25);
    else if (event.key === '0') setZoom(100);
    else return;
    event.preventDefault();
  });
  stage.append(controls, viewport);
  dialog.append(stage);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    resized.disconnect();
    clearTimeout(coverTimer);
    marker.replaceWith(widget);
    // Back in the small widget, with its own margin.
    overridePaintSurface(undefined);
    dialog.remove();
    trigger?.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  content.append(widget);
  setZoom(initialZoom);
  // Size the surface before the first expanded frame instead of reallocating it a moment later.
  cover(true);
  resized.observe(viewport);
  const box = widget.querySelector('.waifu-viewport');
  if (box) resized.observe(box);
  close.focus({ preventScroll: true });
}
