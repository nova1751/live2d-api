const target = new URL('../live2d-api@widget-2.9.18/collections.mjs', import.meta.url);
target.search = new URL(import.meta.url).search;
await import(target.href);
