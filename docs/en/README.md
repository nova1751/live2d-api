# Girls’ Frontline Live2D Widget

**English** · [简体中文](https://github.com/nova1751/live2d-api/blob/main/README.md) · [Live gallery](https://live2d-nova.vercel.app/catalog/?lang=en) · [npm](https://www.npmjs.com/package/live2dapi-noa)

Add an interactive Girls’ Frontline character to a website. Visitors can change outfits and click characters to play their authored motions, voice lines and subtitles. The widget loads the renderer required by the selected model and frames each outfit to its visible silhouette.

## Quick start

Place one module script before `</body>`. Choose the CDN closest to your audience. Both examples select English and pin the same runtime release.

**Global**

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@widget-2.4.1/girls-frontline.mjs?lang=en"></script>
```

**Mainland China**

```html
<script type="module" src="https://cdn.jsdmirror.com/gh/nova1751/live2d-api@widget-2.4.1/girls-frontline.mjs?lang=en"></script>
```

The shortcut displays the widget on viewports at least 768 CSS pixels wide. A first visit starts with the tier-one Airstrike Fairy. Subsequent visits restore the last outfit on that site. Use the module API to set your own display rules.

## Install with npm or pnpm

```sh
npm install live2dapi-noa
# or
pnpm add live2dapi-noa
```

Run this in the browser after mounting your page. In a server-rendered app, call it from a client-side lifecycle hook.

```ts
import { loadGirlsFrontline, selectWidgetModel } from 'live2dapi-noa';

await loadGirlsFrontline({ locale: 'en', position: 'right', modelId: 'doll/k2/3301/normal' });
// Call from your character picker:
await selectWidgetModel('doll/56-1type/7706/normal');
```

The package includes the JS runtime, styles, TypeScript declarations and both sets of UI messages. Models, textures, motions and recordings are hosted on GitHub. When a bundler relocates the entry, the runtime loads its matching GitHub CDN release. Set `baseUrl` to the mainland runtime directory or to your own deployed copy. For a CDN-only module integration, import the same functions from `widget.mjs` next to the shortcut.

## Languages and dialogue

| Setting | Simplified Chinese (default) | English |
| --- | --- | --- |
| Shortcut URL | Omit the query or use `?lang=zh-CN` | `?lang=en` |
| Module API | `locale: 'zh-CN'` | `locale: 'en'` |
| Gallery | [中文图鉴](https://live2d-nova.vercel.app/catalog/) | [English gallery](https://live2d-nova.vercel.app/catalog/?lang=en) |

The locale controls widget buttons, accessibility labels, greetings and fallback messages. The gallery language switch preserves the selected outfit. For game dialogue, English uses the subtitle attached to the original motion and voice event. Chinese uses the character and voice key to find the translated line. Older models also use matched voice keys or translations of embedded text. An interaction without a line uses a localized widget hint. Captions stay visible until the action and audio finish. Both languages play the original recording.

## API and compatibility

| Entry or option | Usage |
| --- | --- |
| `loadGirlsFrontline(options?)` | Mount the collection. Set `locale`, `modelId`, `position` (`left` or `right`) or `mode` (`sequential` or `random`). |
| `selectWidgetModel(id)` | Switch by stable ID after mounting. Copy an ID from the gallery. |
| `loadModelCatalog(url, 'girls-frontline', locale?)` | Read available IDs, localized labels and native manifest URLs. |
| `loadWidget({ modelUrl, coreUrl })` | Render an individual model. Cubism 2 uses the legacy renderer. Cubism 3–5 manifests (`.model3.json`) load the WebGL2 backend from `live2d-web` and Live2D Cubism Core on demand. |
| `baseUrl` / `catalogUrl` / `coreUrl` | Override the runtime directory, catalog JSON URL or Cubism Core URL independently. |
| Legacy integrations | Existing `initWidget(waifuPath, apiPath)`, numeric model IDs, `autoload.js`, random/sequential loaders and standalone CSS remain available. |

## Collection and offline use

The gallery lists 443 selectable forms across 129 entries from the audited public collections. It includes fairies, dolls, adjutants, squads and backgrounds. Standard and damaged variants have distinct IDs. Seven older IDs resolve to matching outfits. These counts describe the indexed sources. [Model catalog](https://github.com/nova1751/live2d-api/blob/main/catalog/library.json) · [Source audit](https://github.com/nova1751/live2d-api/blob/main/docs/model-library.zh-CN.md)

From a repository checkout with Node.js 24 and Git, run:

```sh
node scripts/download-models.mts ./models-offline
node scripts/check-model-library.mts ./models-offline
python -m http.server 8765 --bind 127.0.0.1 --directory ./models-offline
```

Open `http://127.0.0.1:8765/viewer/catalog/?lang=en`. Use `--list` to inspect sources, `--source dump` to download a single source, or `--core <file>` to supply your licensed Core for offline rendering.

## Original widget examples

<img src="https://raw.githubusercontent.com/nova1751/live2d-api/v2.4.1/img/01.png" height="200" alt="Original red-dress companion with a speech bubble"> <img src="https://raw.githubusercontent.com/nova1751/live2d-api/v2.4.1/img/02.png" height="200" alt="Original black-dress companion with interaction tips">

## Development and releases

Use Node.js 24 and the pnpm version pinned in `package.json`. Edit TypeScript under `src/` and commit the generated browser files.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm exec playwright-core install chromium-headless-shell
pnpm run test:browser .
```

`pnpm dev` serves the demo. Run `node test/library-browser.mts ./models-offline` to exercise the gallery against a local collection. For releases, a matching `vX.Y.Z` Git tag triggers CI to verify the tarball, publish fixed GitHub snapshots and publish the tested runtime to npm using OIDC. [Release workflow](https://github.com/nova1751/live2d-api/blob/main/.github/workflows/publish.yml)

## Credits and licensing

Maintained by nova1751. The historical API follows fghrsh’s protocol and the companion UI builds on stevenjoezhang’s widget. The package declares ISC for the project code. Models, audio, Cubism Core and bundled third-party code have their own terms. Check the source and redistribution rights for assets you deploy. [Model sources](https://github.com/nova1751/live2d-api/blob/main/docs/model-sources.json) · [Third-party notices](https://github.com/nova1751/live2d-api/blob/main/modern/THIRD_PARTY_NOTICES.md) · [Live2D Core](https://www.live2d.com/en/sdk/download/web/)
