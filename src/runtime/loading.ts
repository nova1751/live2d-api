import { translated } from './locale';

export function setModelLoading(loading: boolean) {
  document.getElementById('waifu')?.toggleAttribute('data-model-pending', loading);
  const status = document.getElementById('waifu-status-text');
  const text = loading ? translated('模型加载中…', 'Loading model…') : '';
  if (status && status.textContent !== text) status.textContent = text;
}
