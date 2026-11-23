import { translated } from './locale';

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
  const content = document.createElement('div');
  content.className = 'waifu-view-content';
  viewport.append(content);

  const zoom = document.createElement('div');
  zoom.className = 'waifu-view-zoom';
  const label = document.createElement('label');
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
  const fit = document.createElement('button');
  fit.type = 'button';
  fit.textContent = translated('适应窗口', 'Fit to view');
  let percent = 100;
  function setZoom(value: number) {
    const before = widget!.getBoundingClientRect();
    const view = viewport.getBoundingClientRect();
    const centerX = view.left + viewport.clientWidth / 2;
    const centerY = view.top + viewport.clientHeight / 2;
    percent = Math.max(50, Math.min(300, Math.round(Number.isFinite(value) ? value : percent)));
    slider.value = number.value = String(percent);
    slider.setAttribute('aria-valuetext', percent + '%');
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
  zoom.append(label, slider, number, '%', fit);
  controls.append(zoom);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = translated('还原', 'Restore');
  close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  if (document.fullscreenEnabled && typeof stage.requestFullscreen === 'function') {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    const update = () => {
      const active = document.fullscreenElement === stage;
      toggle.textContent = active ? translated('退出全屏', 'Exit fullscreen') : translated('全屏', 'Fullscreen');
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
    controls.append(toggle);
  }
  controls.append(close);
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
