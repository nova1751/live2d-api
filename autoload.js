(() => {
  const source = document.currentScript;
  if (!source?.src) return;
  const target = new URL('../live2d-api@widget-2.9.28/autoload.js', source.src);
  target.search = new URL(source.src).search;
  const script = document.createElement('script');
  Object.assign(script.dataset, source.dataset);
  script.nonce = source.nonce;
  script.src = target.href;
  source.after(script);
})();
