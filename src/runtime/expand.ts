import { translated } from './locale';

/** Enlarge the mounted canvas so the current model and its playback stay alive. */
export function expandModel() {
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
  stage.append(controls);
  dialog.append(stage);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    marker.replaceWith(widget);
    dialog.remove();
    trigger?.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
  stage.append(widget);
  close.focus({ preventScroll: true });
}
