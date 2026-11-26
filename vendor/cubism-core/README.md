# Live2D Cubism Core fallback copy

`live2dcubismcore.min.js` is an unmodified copy of
https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js, the Cubism Core that
`live2d-web` loads by default. Its header marks it as Redistributable Code under the
[Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).

The widget loads the official file first. Only when that host fails or stalls does it fetch this
copy, from a separate immutable tag on the GitHub CDNs. The copy is not part of the npm package or
the `widget-*` runtime tags.

To update it, replace the file with the Core version that `live2d-web` targets, then:

1. Run `node scripts/publish-cubism-core.mts` to print the new tag, `cubism-core-<sha256 prefix>`.
2. Put that tag in `PINNED_CORE_PATH` in `src/modern/core.ts`. `npm test` checks that they match.
3. Run `node scripts/publish-cubism-core.mts --publish` to push the tag before releasing.
