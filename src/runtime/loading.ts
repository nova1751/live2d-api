import { translated } from './locale';

export function setModelLoading(loading: boolean) {
  const widget = document.getElementById('waifu');
  widget?.toggleAttribute('data-model-pending', loading);
  widget?.removeAttribute('data-model-error');
  const status = document.getElementById('waifu-status-text');
  const text = loading ? translated('模型加载中…', 'Loading model…') : '';
  if (status && status.textContent !== text) status.textContent = text;
}
