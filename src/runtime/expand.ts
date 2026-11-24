import { translated } from './locale';
import { icons, retryIcon } from './icons';

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
  viewport.title = translated('放大后可滚动、拖动空白处或用方向键移动画面', 'Scroll, drag the background, or use arrow keys to move the zoomed view');
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
  function setZoom(value: number) {
    const before = widget!.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const centerX = view.left + viewport.clientWidth / 2;
    const centerY = view.top + viewport.clientHeight / 2;
    percent = Math.max(50, Math.min(300, Math.round(Number.isFinite(value) ? value : percent)));
    slider.value = number.value = String(percent);
    slider.setAttribute('aria-valuetext', percent + '%');
    viewport.toggleAttribute('data-pannable', percent > 100);
    content.style.setProperty('--view-scale', String(percent / 100));
    const after = widget!.getBoundingClientRect();
    if (before.width && before.height) {
      viewport.scrollLeft += after.left + (centerX - before.left) * after.width / before.width - centerX;
      viewport.scrollTop += after.top + (centerY - before.top) * after.height / before.height - centerY;
    }
  }
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
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
  viewport.addEventListener('pointerdown', event => {
    if (percent <= 100 || event.pointerType !== 'mouse' || drag) return;
    const background = event.target === viewport || event.target === content;
    if (event.button !== 1 && (event.button !== 0 || !(event.altKey || background))) return;
    event.preventDefault();
    event.stopPropagation();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.setAttribute('data-panning', '');
  }, true);
  viewport.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) viewport.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
  });
  viewport.addEventListener('lostpointercapture', () => {
    drag = undefined;
    viewport.removeAttribute('data-panning');
  });
  stage.append(controls, viewport);
  dialog.append(stage);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    marker.replaceWith(widget);
    dialog.remove();
    trigger?.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  content.append(widget);
  setZoom(initialZoom);
  close.focus({ preventScroll: true });
}
