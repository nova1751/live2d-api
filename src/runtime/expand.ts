import { translated } from './locale';
import { icons, retryIcon } from './icons';
import { isFramed, overridePaintSurface } from '../library/paint';
import { anchoredPan, clampPan, glide, releaseVelocity, type Point } from './view-camera';

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
  viewport.title = translated('拖动或方向键移动画面；Ctrl/⌘ + 滚轮、双指捏合或 +/− 键缩放，双击空白处切换放大；单击人物仍可互动',
    'Drag or use the arrow keys to move the view; zoom with Ctrl/⌘ + wheel, a pinch, or the +/− keys, and double-click the background to toggle zoom. A click on the character still interacts');
  const content = document.createElement('div');
  content.className = 'waifu-view-content';
  // The view takes focus on opening, so the zoom and arrow keys work at once and no control shows
  // a focus ring from a keypress. Tab moves on to the controls.
  viewport.autofocus = true;
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

  // The view moves the character instead of scrolling a larger page: the content is offset by
  // `pan`, and a framed model draws on a square surface fixed to the screen. Zooming and dragging
  // then only move the camera, so the drawing buffer keeps one size and the screen's resolution
  // at every zoom, and the DOM and the canvas update in the same frame.
  let percent = 100;
  let exact = percent;
  let pan: Point = { x: 0, y: 0 };
  const subject = () => widget!.querySelector<HTMLElement>('.waifu-viewport') ?? widget!;

  function writePan() {
    content.style.setProperty('--view-pan-x', pan.x + 'px');
    content.style.setProperty('--view-pan-y', pan.y + 'px');
  }
  /** Apply `next`, kept within reach, then place the drawn surface and the caption. */
  function moveTo(next: Point) {
    pan = next;
    writePan();
    const limited = clampPan(pan, subject().getBoundingClientRect(), viewport.getBoundingClientRect());
    if (limited.x !== pan.x || limited.y !== pan.y) {
      pan = limited;
      writePan();
    }
    place();
    return limited;
  }

  // The surface is the square around the view, so its buffer never depends on the zoom. Only its
  // on-screen part counts against the pixel budget (runtime/paint-buffer.ts).
  let placed = '';
  function place() {
    if (!dialog.open) return;
    const view = viewport.getBoundingClientRect();
    const box = subject().getBoundingClientRect();
    pinCaption(box, view);
    if (!isFramed() || !box.width || !box.height || !view.width || !view.height) return;
    const side = Math.max(view.width, view.height);
    const left = view.left + (view.width - side) / 2, top = view.top + (view.height - side) / 2;
    const square = Math.max(box.width, box.height);
    const squareLeft = box.left + box.width / 2 - square / 2, squareTop = box.bottom - square;
    const key = [side, left - box.left, top - box.top, square].map(n => n.toFixed(2)).join();
    if (key === placed) return;
    placed = key;
    widget!.style.setProperty('--view-surface-left', left - box.left + 'px');
    widget!.style.setProperty('--view-surface-top', top - box.top + 'px');
    widget!.style.setProperty('--view-surface-size', side + 'px');
    widget!.style.setProperty('--view-hit-left', box.left - left + 'px');
    widget!.style.setProperty('--view-hit-bottom', top + side - box.bottom + 'px');
    overridePaintSurface({ left: (squareLeft - left) / side, top: (squareTop - top) / side, size: square / side });
  }

  // The caption follows the character, stays within the view horizontally, and pins under the
  // controls once moving with the character would hide it behind them. The side tool rail stays
  // beside the character when it fits, and hugs the viewport edges when zoomed or dragged away.
  const caption = widget.querySelector<HTMLElement>('#waifu-tips');
  const tool = widget.querySelector<HTMLElement>('#waifu-tool');
  function pinCaption(box: DOMRect, view: DOMRect) {
    const controlsBottom = controls.getBoundingClientRect().bottom;
    const room = box.top - controlsBottom - (caption?.offsetHeight ?? 0) - 12;
    const pinned = room < 0;
    viewport.toggleAttribute('data-caption-pinned', pinned);
    let shift = 0;
    if (!pinned && caption) {
      const half = caption.offsetWidth / 2;
      const center = box.left + box.width / 2;
      const margin = 12;
      if (center - half < view.left + margin) shift = view.left + margin - (center - half);
      else if (center + half > view.right - margin) shift = view.right - margin - (center + half);
    }
    widget!.style.setProperty('--view-caption-shift', shift + 'px');
    let toolX = 0, toolY = 0;
    if (tool && view.width > 540 && view.height > 360) {
      const margin = 8;
      const naturalRight = box.right + 6 + tool.offsetWidth;
      if (naturalRight > view.right - margin) toolX = view.right - margin - naturalRight;
      const halfH = tool.offsetHeight / 2;
      const centerY = box.top + box.height / 2;
      const minCenterY = controlsBottom + margin + halfH;
      const maxCenterY = view.bottom - margin - halfH;
      if (minCenterY <= maxCenterY) {
        if (centerY < minCenterY) toolY = minCenterY - centerY;
        else if (centerY > maxCenterY) toolY = maxCenterY - centerY;
      }
    }
    widget!.style.setProperty('--view-tool-x', toolX + 'px');
    widget!.style.setProperty('--view-tool-y', toolY + 'px');
  }

  /** Zoom to `value` percent, keeping the point under `anchor` (client coordinates) in place. */
  function setZoom(value: number, anchor?: Point) {
    stopGlide();
    const before = subject().getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const point = anchor ?? { x: view.left + view.width / 2, y: view.top + view.height / 2 };
    // Keep the unrounded value so many tiny trackpad steps still add up.
    exact = Math.max(50, Math.min(300, Number.isFinite(value) ? value : exact));
    percent = Math.round(exact);
    slider.value = number.value = String(percent);
    slider.setAttribute('aria-valuetext', percent + '%');
    viewport.toggleAttribute('data-zoomed', percent > 100);
    content.style.setProperty('--view-scale', String(exact / 100));
    moveTo(anchoredPan(pan, before, subject().getBoundingClientRect(), point));
  }
  /** Back to the fitted, centered view. */
  function reset() {
    pan = { x: 0, y: 0 };
    writePan();
    setZoom(100);
  }

  slider.addEventListener('input', () => setZoom(slider.valueAsNumber));
  // Mouse clicks on the controls keep focus on the view, so no focus ring lingers there and the
  // zoom and arrow keys keep working. Tab still reaches every control.
  controls.addEventListener('mousedown', event => {
    if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
  });
  slider.addEventListener('pointerup', () => viewport.focus({ preventScroll: true }));
  number.addEventListener('change', () => setZoom(number.valueAsNumber));
  number.addEventListener('blur', () => { number.value = String(percent); });
  number.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); setZoom(number.valueAsNumber); }
  });
  fit.addEventListener('click', reset);
  zoom.append(label, slider, percentage, fit);
  controls.append(zoom);
  const close = control(translated('还原', 'Restore'), icons.quit);
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

  // Dragging anywhere moves the view at any zoom, the character included. A press that stays
  // within a few pixels is still a click, so tapping the character keeps triggering its reactions.
  // Where the model itself reacts to a drag (a stroke or an upward swipe on a Cubism 2 part, a part
  // an outfit's game rules move), the drag stays with the model; the background, other parts, two
  // fingers and the wheel still pan.
  // A quick release keeps gliding and slows down.
  const panSlop = 6;
  let drag: { id: number; x: number; y: number; from: Point; active: boolean; down: PointerEvent; samples: (Point & { t: number })[] } | undefined;
  let swallowClick = false;
  let gliding = 0;
  function stopGlide() {
    cancelAnimationFrame(gliding);
    gliding = 0;
  }
  function startGlide(velocity: Point) {
    if (Math.hypot(velocity.x, velocity.y) < 0.3) return;
    let last = performance.now();
    const step = (now: number) => {
      const { move, velocity: next } = glide(velocity, Math.min(64, now - last));
      last = now;
      const wanted = { x: pan.x + move.x, y: pan.y + move.y };
      const reached = moveTo(wanted);
      // Stop along an axis that ran into its limit.
      velocity = { x: reached.x === wanted.x ? next.x : 0, y: reached.y === wanted.y ? next.y : 0 };
      gliding = Math.hypot(velocity.x, velocity.y) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    gliding = requestAnimationFrame(step);
  }
  function startPan(event: PointerEvent) {
    drag!.active = true;
    swallowClick = true;
    viewport.setPointerCapture(event.pointerId);
    viewport.setAttribute('data-panning', '');
    getSelection()?.removeAllRanges();
  }
  function endPan(event?: PointerEvent) {
    const released = drag?.active && event?.type === 'pointerup' ? releaseVelocity(drag.samples) : undefined;
    drag = undefined;
    viewport.removeAttribute('data-panning');
    if (released) startGlide(released);
  }
  viewport.addEventListener('pointerdown', event => {
    swallowClick = false;
    stopGlide();
    if (drag || touches.size > 1 || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: pan, active: false, down: event,
      samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }] };
    // The background has nothing to click, and the middle button never clicks: pan right away.
    // A model can still own a press there, on a touch area off its canvas (modern/gesture-input.ts).
    if (event.button === 1 || (!event.live2dDrag && (event.target === viewport || event.target === content))) {
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
      // The renderer marked the press (after this capture listener saw it) as a gesture of its own:
      // let the moves and the release reach the model instead of moving the view.
      if (drag.down.live2dDrag) { drag = undefined; return; }
      startPan(event);
    }
    // Keep the character from treating the drag as a stroke or a gaze target.
    event.stopPropagation();
    drag.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (drag.samples.length > 8) drag.samples.shift();
    moveTo({ x: drag.from.x + dx, y: drag.from.y + dy });
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    viewport.addEventListener(type, event => { if (drag?.id === event.pointerId) endPan(event); });
  }
  // The click that ends a drag must not reach the character.
  viewport.addEventListener('click', event => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  // A plain wheel or a two-finger trackpad swipe moves the view; Ctrl/⌘ + wheel zooms at the
  // pointer. Trackpad pinches arrive as ctrl + wheel too.
  viewport.addEventListener('wheel', event => {
    event.preventDefault();
    stopGlide();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientHeight : 1;
    if (event.ctrlKey || event.metaKey) {
      setZoom(exact * Math.exp(-event.deltaY * unit * 0.0025), { x: event.clientX, y: event.clientY });
      return;
    }
    // A mouse wheel with Shift scrolls sideways.
    const [dx, dy] = event.shiftKey && !event.deltaX ? [event.deltaY, 0] : [event.deltaX, event.deltaY];
    moveTo({ x: pan.x - dx * unit, y: pan.y - dy * unit });
  }, { passive: false });

  // Two-finger pinch on touch screens, anchored between the fingers, which also moves the view
  // with them. One finger drags like the mouse (touch-action: none in widget.css).
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; percent: number; x: number; y: number } | undefined;
  const spread = () => {
    const [a, b] = Array.from(touches.values());
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) {
      pinch = { ...spread(), percent: exact };
      // The second finger starts a zoom gesture, not a tap on the character.
      event.stopPropagation();
    }
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch || touches.size !== 2) return;
    const { distance, x, y } = spread();
    moveTo({ x: pan.x + x - pinch.x, y: pan.y + y - pinch.y });
    pinch.x = x;
    pinch.y = y;
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
    if (percent > 100) reset();
    else setZoom(200, { x: event.clientX, y: event.clientY });
  });

  // + / − / 0 and the arrow keys like image viewers, unless the user is typing in the zoom inputs.
  dialog.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) return;
    const step = event.shiftKey ? 240 : 60;
    const arrows: Record<string, Point> = { ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step },
      ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 } };
    if (event.key === '+' || event.key === '=') setZoom(percent * 1.25);
    else if (event.key === '-' || event.key === '_') setZoom(percent / 1.25);
    else if (event.key === '0') reset();
    else if (arrows[event.key] && !(event.target instanceof HTMLButtonElement && event.target.closest('#waifu-tool'))) {
      stopGlide();
      moveTo({ x: pan.x + arrows[event.key].x, y: pan.y + arrows[event.key].y });
    } else return;
    event.preventDefault();
  });

  // A resized view keeps the character at the same relative place; the surface follows the view.
  let size = { width: 0, height: 0 };
  const resized = new ResizeObserver(() => {
    const view = viewport.getBoundingClientRect();
    if (size.width && size.height && view.width && view.height)
      pan = { x: pan.x * view.width / size.width, y: pan.y * view.height / size.height };
    size = { width: view.width, height: view.height };
    moveTo(pan);
  });
  // A model switched in the view may be framed differently.
  const reframed = () => { placed = ''; place(); };
  window.addEventListener('live2d:framed', reframed);

  stage.append(controls, viewport);
  dialog.append(stage);
  document.body.append(dialog);
  // Closed with the keyboard, focus returns to the expand button with its ring; closed with the
  // mouse, it returns without one.
  let keyboardClose = false;
  dialog.addEventListener('cancel', () => { keyboardClose = true; });
  close.addEventListener('click', event => { keyboardClose = event.detail === 0; }, true);
  dialog.addEventListener('close', () => {
    stopGlide();
    resized.disconnect();
    window.removeEventListener('live2d:framed', reframed);
    marker.replaceWith(widget);
    // Back in the small widget, with its own margin.
    overridePaintSurface(undefined);
    dialog.remove();
    if (trigger && !keyboardClose) {
      // Browsers may still draw a keyboard ring here after earlier keypresses; hide it until the
      // focus moves on or a key is pressed.
      trigger.setAttribute('data-quiet-focus', '');
      const loud = () => trigger.removeAttribute('data-quiet-focus');
      trigger.addEventListener('blur', loud, { once: true });
      trigger.addEventListener('keydown', loud, { once: true });
    }
    trigger?.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  content.append(widget);
  writePan();
  // Place the surface before the first expanded frame instead of moving it a moment later.
  setZoom(initialZoom);
  resized.observe(viewport);
  const box = widget.querySelector('.waifu-viewport');
  if (box) resized.observe(box);
  // A longer line may no longer fit above the character.
  if (caption) resized.observe(caption);
  viewport.focus({ preventScroll: true });
}
