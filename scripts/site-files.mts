// Static sites also serve the demo, model collection and browsable catalog.
export function siteFiles(runtimeFiles) {
  return [...new Set([...runtimeFiles, 'model/', 'model_list.json', 'catalog/', 'index.html'])];
}
