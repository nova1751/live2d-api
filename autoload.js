(() => {
  const script = document.currentScript;
  if (window.innerWidth < 768) return;

  const { mode, position } = script.dataset;
  import(new URL('widget.mjs', script.src).href)
    .then(({ loadWidget }) => loadWidget({ mode, position }))
    .catch(error => console.error('[Live2D]', error));
})();
