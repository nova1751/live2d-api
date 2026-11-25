# 视觉小说角色放映室

这是本地预览入口。运行 `node preview/visual-novels/serve.mts`，打开 <http://127.0.0.1:8796>。可通过 `VN_PREVIEW_PORT` 指定端口。首次安装本项目的依赖使用 `pnpm install --frozen-lockfile`。

模型图鉴从本机素材生成，按作品、角色或来源目录、造型列出。收录条件为模型二进制和至少一张贴图存在，所有声明的贴图都有内容。个别缺少动作或声音的条目在预览下方显示缺件数。计数按入口清单，同一造型可能有上游提供的不同配置。Cubism 3+ 可手选清单列出的动作和表情，音符表示该动作有配音引用；旧模型使用项目的 Cubism 2 播放器与原生交互。

## 本地素材

| 本地位置（相对本目录） | 来源 |
| --- | --- |
| `.local/source/galgame live2d/` | [Eikanya 的视觉小说目录](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac/galgame%20live2d)，完整保留该提交的子目录 |
| `.local/amakano.json` | [AmakanoPet 角色资料](https://github.com/Fiesty-Abyss/AmakanoPet/blob/b192dbd451e30f5c2fb626e723832b2a23921285/app/data/amakano.json) |
| `.local/shion.png` | [AmakanoPet 对 Jim_Milton 同人模型的运行截图](https://github.com/Fiesty-Abyss/AmakanoPet/blob/b192dbd451e30f5c2fb626e723832b2a23921285/docs/screenshots/pet-live2d-shion.png) |
| `.local/live2dcubismcore.min.js` | [Live2D Cubism Core for Web](https://cubism.live2d.com/sdk-web/core/06/live2dcubismcore.min.js) |

预览服务仅监听本机回环地址。`.local/` 中的素材、Git 检出、生成的索引和站点均为本机文件。作品和素材各自的权利、展示与再分发条件以对应权利人说明为准。
