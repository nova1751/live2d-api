# Live2D_API

> 个人自建的`live2d API`，用于网页端引入看板娘。

## 前言 To start with

- 本项目 API 搭建方式参考自 [fghrsh/live2d_api](https://github.com/fghrsh/live2d_api)。
- 本项目代码参考自 [stevenjoezhang/live2d-widget](https://github.com/stevenjoezhang/live2d-widget)。
- 本项目模型来自 [Eikanya/Live2d-model](https://github.com/Eikanya/Live2d-model)，仅供学习交流，请勿用于商业用途，如有侵权，请联系删除。

## 特性 Feature

1. 将 Live2D API 完全 cdn 化，目录结构简单，便于编辑、添加和删除模型。
2. 为以 CDN 方式加载的 Live2D 模型，添加模型皮肤顺序切换的功能。
3. 将项目配置文件拆分成`<script>`与`<link>`标签的形式便于网站引入。

   <img src="./img/01.png" height="300px" ><img src="./img/02.png" height="300px" >

## 使用 How to use

### 一行 CDN 接入

按访客所在地区选一段放到页面的 `<head>` 中。以下两种入口使用同一份模型和播放器。播放器版本和模型快照分别固定。更新播放器可以复用已发布的模型。

**中国大陆 · JSDMirror**

```html
<script defer src="https://cdn.jsdmirror.com/npm/live2dapi-noa@2.0.0/autoload.js"></script>
```

**海外 · jsDelivr**

```html
<script defer src="https://cdn.jsdelivr.net/npm/live2dapi-noa@2.0.0/autoload.js"></script>
```

入口按模型格式加载对应渲染器，使用同域名的固定 GitHub 快照加载默认模型。初次执行时视口小于 768px 会跳过加载。可在同一个脚本标签上设置显示位置和换装方式。

| 属性 | 可选值 | 默认值 |
| --- | --- | --- |
| `data-position` | `left`、`right` | `left` |
| `data-mode` | `sequential`（顺序换装）、`random`（随机换装） | `sequential` |

**UNPKG 接入**　同一运行时也可以从 UNPKG 加载，默认模型走国际 jsDelivr。仅在准备升级时修改版本号。[UNPKG 使用说明](https://unpkg.com/)

```html
<script defer src="https://unpkg.com/live2dapi-noa@2.0.0/autoload.js" data-position="right" data-mode="random"></script>
```

完整仓库超出 jsDelivr 每版本 50 MB 的限制，整库地址在镜像缓存未命中时可能返回 403。两个入口均从 npm 读取播放器，从同域名的 `/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/` 读取模型目录和皮肤配置。配置指向七个固定素材包，各包小于 38 MB。[jsDelivr 大小限制](https://github.com/jsdelivr/jsdelivr#restrictions) · [JSDMirror 说明](https://github.com/jsdmirror/JSDMirror)

[打开 Vercel 在线演示](https://live2d-nova.vercel.app/) · [GitHub Pages 镜像](https://nova1751.github.io/live2d-api/)

### 指定 Cubism 3、4、5 模型

给同一个入口指定完整的 `.model3.json` URL，即可固定显示该模型。相对 URL 按页面地址解析。模型、贴图、物理与动作文件须保留清单中的相对路径，并允许页面跨域读取。

```html
<script defer src="/live2d/autoload.js"
  data-model-url="/characters/Ren/Ren.model3.json"
  data-core-url="/live2d-core/06/live2dcubismcore.min.js"></script>
```

`data-core-url` 可省略，默认从 Live2D 官方的固定版 Core 地址加载。需要所有资源走自己的国内 CDN 时，请将合法部署的 Core 和模型一起指定到目标域名。框架按需加载，使用 WebGL 2 和 Cubism Web Framework 5-r.5。单模型模式提供待机、视线跟随，以及模型声明的命中区与对应 Tap 动作；ViewerEX 的自定义台词、事件与配音规则属于旧播放器。支持范围取决于导出的运行时模型及 Web SDK 功能。[Live2D 官方 Core 与许可](https://www.live2d.com/en/sdk/download/web/) · [Cubism 5.3 功能限制](https://docs.live2d.com/en/cubism-sdk-manual/compatibility-with-cubism-5-3/)

模块调用可传 `loadWidget({ modelUrl, coreUrl })`。直接控制画布可调用 `await loadlive2d('live2d', modelUrl, { coreUrl })`。使用老的 `index.json` 时走原先的 Cubism 2 播放器。可以运行 `node test/modern-browser.mjs` 在线验证三个官方模型；追加 `--girls-frontline` 会逐个检查仅有新版格式的少女前线形态是否实际出图。也可以在命令后传入组件 CDN 根地址和其他模型清单 URL。

### 自有 CDN 和模块调用

面向大陆长期运行的站点，可以把同一份发布包部署到自己的静态站点或国内 CDN。在仓库运行 `pnpm install --frozen-lockfile` 和 `npm pack`，将生成的 `.tgz` 解压，把其中 `package/` 下的文件原样上传到一个版本目录，例如 `/live2d/2.0.0/`。跨域部署时，静态服务器需要允许页面读取资源（CORS），并为 `.js` 和 `.mjs` 返回 JavaScript MIME 类型。版本目录可以设置长缓存，升级时切换入口 URL。

```html
<script defer src="/live2d/2.0.0/autoload.js" data-position="right"></script>
```

需要按页面或用户操作控制加载时，可以直接使用 ES 模块：

```html
<script type="module">
  import { loadWidget } from "/live2d/2.0.0/widget.mjs";
  await loadWidget({ position: "right", mode: "random" });
</script>
```

`loadWidget()` 在组件初始化后完成，模型和纹理随后异步加载。模块调用方自行决定是否在小屏幕加载。同一页面重复或并发调用只初始化一次，以第一次调用的配置为准。加载入口依赖失败时 Promise 会拒绝，可以再次调用。项目中可直接安装并调用：
```sh
pnpm add live2dapi-noa@2.0.0
```

```js
import { loadWidget } from 'live2dapi-noa';
await loadWidget();
```

打包到应用的 JS 后，默认从固定版本的 npm CDN 加载运行时文件。自托管传入 `baseUrl` 指向运行时目录。指定 `modelBaseUrl`（脚本标签使用 `data-model-base-url`）可选择另一套包含 `model_list.json` 与模型清单的目录；指定 `modelUrl` 则直接加载一个模型。需要离线运行时，可部署 npm 解包后的文件，并将仓库的 `model/` 和 `model_list.json` 部署到模型目录。新版模型另需可用的 Cubism Core。

**从 1.x 升级**　2.0 的 npm 压缩包仅分发运行时，之前直接在 npm 包中读取 `model/`、`model_list.json` 或 `catalog/` 的站点，需要把这些资源地址改到固定的 GitHub CDN 快照。继续使用 1.1.0 的完整包或已有 CDN 标签时，历史地址仍然有效。

### 兼容旧接入

已使用下面方式的网站可以继续使用原引用。每组示例中，脚本按切换方式二选一，样式按位置二选一。

1. 使用`jsdelivr`引入。

   ```html
   <!-- 顺序切换模型材质 -->
   <script src="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/jsdelivr/sequential/autoload.min.js"></script>
   <!-- 随机切换模型材质 -->
   <script src="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/jsdelivr/random/autoload.min.js"></script>

   <!-- 看板娘位置靠左 -->
   <link
     rel="stylesheet"
     href="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/css/left.min.css"
   />
   <!-- 看板娘位置靠右 -->
   <link
     rel="stylesheet"
     href="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/css/right.min.css"
   />
   ```

2. 使用 UNPKG 引入。

   ```html
   <!-- 顺序切换模型材质 -->
   <script src="https://unpkg.com/live2dapi-noa@latest/npm/sequential/autoload.js"></script>
   <!-- 随机切换模型材质 -->
   <script src="https://unpkg.com/live2dapi-noa@latest/npm/random/autoload.js"></script>

   <!-- 看板娘位置靠左 -->
   <link
     rel="stylesheet"
     href="https://unpkg.com/live2dapi-noa@latest/css/left.css"
   />
   <!-- 看板娘位置靠右 -->
   <link
     rel="stylesheet"
     href="https://unpkg.com/live2dapi-noa@latest/css/right.css"
   />
   ```

> 你可以下载下来`js`和`css`文件来进行自定义配置，详细请参考 [ live2d-widget 配置](https://github.com/stevenjoezhang/live2d-widget#%E9%85%8D%E7%BD%AE-configuration)。

## 本地开发

使用 Node.js 22 或 24，以及 `package.json` 固定的 pnpm 10.33.0。首次使用可执行 `npm install --global pnpm@10.33.0`。在仓库根目录执行 `pnpm install --frozen-lockfile`，再运行 `pnpm dev`。打开终端打印的地址即可预览示例页；修改 TypeScript 后会自动重新构建，刷新页面即可查看。

| 命令 | 用途 |
| --- | --- |
| `pnpm run typecheck` | 严格检查项目 TypeScript 类型 |
| `pnpm run build` | 检查类型，生成浏览器脚本和 npm 的类型声明 |
| `pnpm test` | 验证新旧入口、模型目录、资源路径大小写和 Cubism 2 物理配置 |
| `pnpm run test:browser` | 启动示例页，在 Chromium 中检查 WebGL 绘制和换装；首次运行先执行 `pnpm exec playwright-core install chromium-headless-shell` |

业务代码在 `src/`。`widget.mts` 导出 `loadWidget` 和 `WidgetOptions`；`runtime/` 管理模型、提示和工具栏；`legacy-autoload.ts` 生成四个历史加载入口。修改源码后提交构建产物，以便 jsDelivr 可以直接读取 Git 提交中的脚本。CSS、模型、Cubism 渲染器和小游戏仍在原来的资源路径。

### 维护模型

#### 少女前线分类

[分类浏览](catalog/girls-frontline/README.md)和[JSON 总目录](catalog/girls-frontline/index.json)按人形、妖精、副官、小队和背景编目。每个人物有独立目录，每套皮肤有独立 JSON，普通和破损形态在 `forms` 中各自指向独立的模型记录。比如 [K2](catalog/girls-frontline/doll/k2/index.json) 的 [3301 皮肤](catalog/girls-frontline/doll/k2/3301.json) 列出[普通](catalog/girls-frontline/doll/k2/3301/normal.json)和[破损](catalog/girls-frontline/doll/k2/3301/destroy.json)两种形态，它们在旧版看板娘中仍然使用原来的数字编号。

目录覆盖 [Eikanya](https://github.com/Eikanya/Live2d-model) 和 [jacksen168](https://github.com/jacksen168/Girls-Frontline-model) 两个固定提交中的少女前线模型。人物和皮肤沿用来源代号；旧收藏里无法确认编号的版本保留 `archive` 标记。同一形态可以收录多个格式及来源，每个二进制文件均记录仓库、路径和 Git blob。来源快照和去重口径决定这里的覆盖范围。

- 从 `catalog/girls-frontline/index.json` 开始。人物、版本和形态的 `path` 都相对于该分类根目录。形态记录中的 `widget[].index` 相对于组件资源根目录，可传给已有的 `loadlive2d('live2d', url)`，或用同条记录的 `modelId`、`modelTexturesId` 对接旧目录。
- `widget: []` 表示该形态仅编目。有 `.moc` 来源的形态可以进一步核验入口、贴图、物理、命中区域和动作；只有 `.moc3` 来源的形态在 `sources[].manifest` 提供固定上游提交中的新版模型入口路径。
- 两个收藏均包含从游戏提取的素材。查阅的公开说明未提供整套模型、贴图和录音经 npm 或公共 CDN 再分发的权利人授权。编目和现有 `widget` 入口均不表示素材已获授权。日本发行方对粉丝网站展示和直接复制素材有不同规定。[日服官方使用指南](https://gf-jp.sunborngame.com/guide.php)

要更新分类，在仓库根目录运行 `node scripts/girls-frontline-catalog.mjs <Eikanya 本地仓库> <jacksen168 本地仓库>`，再运行 `pnpm test`。生成器读取固定提交的 Git 文件树，支持稀疏检出。

#### 交互与资源

首次打开网页时，皮肤会播放自己的待机动作。即使上游给待机动作配置了录音，网页也保持静音。主动打开看板娘或切换模型、服装时，播放器只抽选一次该皮肤的 `start` 事件。有登场语音且浏览器允许播放时，语音随登场动作开始。当前目录中有 5 套皮肤配置了 `start`。这是网页的播放策略，ViewerEX 原生的 `start` 在模型载入时触发。[ViewerEX 事件定义](https://live2d.pavostudio.com/doc/zh-cn/live2d/model-config/)

点击按皮肤自己的命中区域选取动作。三套战舰少女模型还使用各自的点击、抚摸或上划规则。仅提供无名动作组的皮肤在网页上以点击触发该组。如果无名组只是重复唯一的待机动作（例如 AK-12 和 AN-94 的默认皮肤），点击时会接着原来的进度播放。只配置了语音的事件可以单独播放。配有录音和动作的事件等两项资源均就绪后在同一渲染帧启动，并按音频时钟推进动作。缺少任一已配置资源时跳过该次互动，再次点击可以重试。

鼠标在可点击部位停留 150 毫秒后，组件会提前准备该部位的一组互动资源。触屏从按下时开始准备。模型自带的台词在对应动作和语音都结束后保留 1.2 秒再淡出；播放期间，默认提示不会覆盖台词。

`model_list.json` 中的分组和皮肤顺序对应浏览器保存的数字 ID。新增皮肤时追加到对应组末尾。每套皮肤的入口为 `model/<皮肤目录>/index.json`。来源清单记录了每套皮肤对应的上游配置和缺失文件。提交前运行 `pnpm test` 检查模型引用的资源路径。需要对照上游时，在仓库根目录执行 `node scripts/check-model-sources.mjs <本地上游仓库路径>`，上游应检出清单中记录的提交。[来源与缺失文件](docs/model-sources.json)

- 辛西娅的上游配置使用 A1–A4，实际模型的区域名是 A、B、C1、C2。尚未找到能证实这四组对应关系的配置。该皮肤保留原有网页行为，点击身体会从五个原动作中抽选。
- 玛蒂尔达恢复了 10 个按同角色动作编号对应的录音文件。斯洛卡伊默认配置引用的 11 个录音文件在该套上游资源中缺失，保留原动作和文字。索米和 DSR-50 的三套破损皮肤合计缺少 4 个动作引用。战舰少女配置中的占位音效 `test` 已忽略。
- 斯洛卡伊的日语配置位于 `model/siluokayi/model.model-Japanese.json`。其中 10 段录音按台词从仓库历史恢复，保留原始 MP3 文件名。[原始语音目录](https://github.com/nova1751/live2d-api/tree/349289f4896fd6df725b757b2b2749684ac56fe1/model/siluokayi/voice)
- `model/kp31/kp31_/destroy/替换配置/model.json` 是 ViewerEX 的替换配置。使用时将其复制到上一级皮肤目录，与 `model.moc` 放在一起，以便解析动作和共用语音路径。

### 发布国内 CDN 资源

在仓库根目录执行 `node scripts/cdn-snapshot.mjs <提交>`，可核对每份静态资源的体积和入口。确认后运行 `node scripts/cdn-snapshot.mjs <提交> --publish`。脚本从指定 Git 提交读取文件，把同一模型家族放在一起，并通过一次原子推送发布所有 CDN 标签。标签使用源提交标识，重复运行会产生相同内容。站点只需引用输出的入口地址。代码单独更新时复用现有素材标签。变更模型后发布新快照，并更新 `src/distribution.ts` 中的素材版本。标签给快照提交提供稳定的名字，分包依据是每个快照实际包含的文件。

## 发布到 npm

1. 在 npm 的 `live2dapi-noa` 包设置中添加 GitHub Actions Trusted Publisher，用户填 `nova1751`，仓库填 `live2d-api`，工作流文件填 `publish.yml`，环境名留空。允许该工作流执行 `npm publish`。发布使用 OIDC，并生成来源证明。[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
2. 在 `package.json` 更新待发版本，并将源码、构建产物和工作流合入 `main`。变更依赖时，运行 `pnpm install` 并一同提交 `pnpm-lock.yaml`。
3. 在待发布的提交上创建并推送同版本标签，例如 `git tag v2.0.0` 和 `git push origin v2.0.0`。PR 和普通的 `main` 推送只运行验证。标签必须与包版本一致。
4. Actions 使用 `pnpm install --frozen-lockfile` 安装依赖，通过 `npm pack` 构建 npm 包，检查生成文件和兼容性测试，并从解包后的目录验证 WebGL 渲染和换装。发布任务上传验证过的同一个 tarball。正式版使用 `latest`，预发布版（例如 `1.2.0-beta.1`）使用 `next`。发布后可用 `npm view live2dapi-noa@2.0.0 dist.integrity --registry=https://registry.npmjs.org` 核对注册表中的版本。

## 成果 Achievement

1. 修正了少女前线(Girls Frontline)等 live2d 模型的文件路径错误以及文件名称错误，对模型的展示视口进行了相关的适配并修复了切换模型报错的问题。

> ~~这环节究极折磨，打死不做第二遍。~~

2. 修正了部分模型语音与互动动作配置错误。
3. 将左右的`css`文件分别配置，添加顺序切换模型材质的`js`文件，并将随机切换与顺序切换的`js`文件分别配置。
