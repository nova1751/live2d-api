# 少女前线 Live2D 网页组件

nova1751 维护的网页看板娘、模型目录和 OpenList 接入。项目实现模型选择、旧协议适配、动作与语音配对、台词显示和 CDN 发布。角色素材来自各自的上游收藏，Cubism 运行时和第三方组件的权利归各自作者。[在线演示](https://live2d-nova.vercel.app/) · [少女前线模型目录](https://nova1751.github.io/live2d-api/catalog/)

## OpenList 和普通网页

在 OpenList「管理 → 设置 → 全局 → 自定义内容」加入一行。普通页面可直接放到 HTML。默认左侧显示 K2 的 3301 普通形态，切换人物、换装和恢复上次选择都在 443 个可选少女前线形态内。快捷入口在初始视口宽度至少 768 像素时加载，CSS 随模块自动引入。

**中国大陆**

```html
<script type="module" src="https://cdn.jsdmirror.com/gh/nova1751/live2d-api@widget-2.3.0/girls-frontline.mjs"></script>
```

**海外**

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@widget-2.3.0/girls-frontline.mjs"></script>
```

这两个地址通过 CDN 读取 GitHub 的固定运行时快照。目录和历史内置模型采用相应 CDN 的 GitHub 地址，扩展模型使用目录所列 GitHub 上游的固定提交。Cubism 3–5 使用独立按需加载的渲染器和 Live2D 官方 Core。要自托管合法部署的 Core，可传入 `coreUrl`。

## 模块 API

需要指定位置、模型或控制加载时机时，可直接导入 ES 模块。显式调用 API 时由调用方决定是否在小屏幕显示。

```html
<script type="module">
  import { loadGirlsFrontline, selectWidgetModel } from
    "https://cdn.jsdmirror.com/gh/nova1751/live2d-api@widget-2.3.0/widget.mjs";
  await loadGirlsFrontline({ position: "right", modelId: "doll/k2/3301/normal" });
  // 可在自己的角色选择器中调用
  // await selectWidgetModel("doll/56-1type/7706/normal");
</script>
```

`loadGirlsFrontline({ catalogUrl })` 可接本地下载目录。`loadModelCatalog(url, "girls-frontline")` 提供可用 ID 和原生清单地址。`loadWidget({ modelUrl, coreUrl })` 支持直接打开一个 Cubism 2 清单或新版 `.model3.json`。组件根据清单选择渲染器；新旧模型不会在首次加载时同时下载两套引擎。

## 历史兼容

| 已有调用 | 兼容方式 |
| --- | --- |
| `initWidget(waifuPath, apiPath)` 与数字模型 ID | 保留旧 API 请求、皮肤序号和随机或顺序切换语义。 |
| 旧 `jsdelivr/{mode}/autoload.js`、`npm/{mode}/autoload.js` 和独立 CSS | 已发布的固定链接继续可用。 |
| `autoload.js` 的 `data-model-url`、`data-model-base-url` 和 `data-catalog-url` | 可继续加载原生模型、自有旧目录或完整自定义目录。 |
| npm、UNPKG 和 `/npm/live2dapi-noa@` | 作为历史入口保留。新站使用上面的 GitHub 快照。2.2.0 起的发布流程仅更新 GitHub，npm 的历史版本独立保留。 |

模型的在线来源均为 GitHub。播放器快照只含代码、样式、类型和许可。内置素材按角色家族分到七个固定快照，各小于 38 MB。该值是项目的分包预算。Vercel 提供演示、目录及运行时，旧模型路径重定向到 GitHub。[jsDelivr 限制](https://github.com/jsdelivr/jsdelivr#restrictions)

## 模型目录与离线下载

[打开模型浏览器](https://live2d-nova.vercel.app/catalog/)后可依次选择分类、人物、版本、普通或破损形态。复制当前 URL 即可分享这个形态。新集成使用[统一目录](catalog/library.json)里的稳定 ID，例如 `doll/56-1type/7706/normal`。每个形态保存可用来源、原生模型入口和可用的对话配置。同一形态的多个来源保留在同一条记录中。

| 已核对的公开收藏 | 覆盖情况 |
| --- | --- |
| [Eikanya](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac) 和 [jacksen168](https://github.com/jacksen168/Girls-Frontline-model/tree/42b54cff59b1e1f20b352c019115f7b744a78bd2) | 此前的目录共有 108 个对象、195 个版本、352 个形态。 |
| [GFL-Live2D/dump](https://github.com/GFL-Live2D/dump/tree/527aac9245c06444d5d0259be843740915b715fd) | 203 个模型目录，401 个目录与形态组合，402 份新版入口，另有 6,394 个 OGG。其[展示器的 238 条记录](https://github.com/GFL-Live2D/viewer/blob/f3d994ff67815139b2d4797b4dd2cd6c89fc7121/src/lib/data/live2d.json)均能找到素材目录。 |
| 合并去重后的目录 | 少女前线共 129 个对象、246 个版本、450 个形态。选择器将 7 个经模型二进制和贴图核对的旧档入口归到对应皮肤，展示 443 个形态。上述旧 ID 和其他作品的 7 个历史入口均可通过原协议访问。 |

普通和破损分别计数；同一皮肤的格式或来源副本不重复计数。旧收藏中无法确认皮肤编号的记录保留 `archive`。游戏各区服、联动和下架装扮没有可供逐条核验的官方完整目录。上述统计只描述已核对的公开来源。

对四份下载来源逐一检查后，457 个首选模型清单引用的文件均存在。在全部 1,317 个不同来源清单中，有 32 个备用入口引用了缺失文件（Eikanya 31 个、dump 1 个），另有 99 条 Eikanya 来源记录只有模型二进制。目录保留这些记录供溯源，默认选择可加载的入口。

在本仓库根目录执行以下命令。下载器使用 Node.js 24 和 Git，按固定提交下载原始模型、贴图、动作、录音及对话配置，并生成指向本地文件的预览页。

```sh
node scripts/download-models.mts D:/Models/GFL
node scripts/check-model-library.mts D:/Models/GFL
python -m http.server 8765 --bind 127.0.0.1 --directory D:/Models/GFL
```

打开 `http://127.0.0.1:8765/viewer/catalog/`。下载器支持 `--list`、按来源选择的 `--source dump`，以及为完全离线预览提供合法部署的 Core 文件的 `--core <文件>`。预览页采用本地目录，在线默认使用 GitHub 中的固定素材。素材的公开可用性与再分发授权应分别核对。[Live2D Core](https://www.live2d.com/en/sdk/download/web/)

当模型带游戏对话配置时，播放器按命中部位、普通或破损形态、动作名和 ID 匹配台词与日语录音，保留游戏配置的播放延迟。复核 dump 中的 2,840 份动作文件，2,839 份的曲线计数与导出内容不符。加载器按实际曲线重算新版动作的段数和控制点数，修正部分导出文件会被 Cubism 拒绝播放的问题；原始下载文件按固定提交保存。带游戏事件配置的点击动作播放一遍，待机动画继续循环。模型台词会持续到动作与声音都结束，再保留 1.2 秒淡出。没有对应台词或录音时仅使用所提供的内容。少女前线入口默认显示简体中文，语音保持日语。字幕按角色代号和语音编号复用，原始模型仍保留上游台词。1,340 个中文字幕键覆盖当前对话数据中全部有英文原文的条目，其中 11 条为项目翻译。缺少文字的语气声保留原录音。中文角色名、装扮名和绝大多数字幕取自[固定版本的国服数据表](https://github.com/gf-data-tools/gf-data-ch/tree/c6c763ca71e6f8450232fbd30e26900c51d2c09b)。

少女前线人物按初始可见轮廓居中，长边目标为画布的 86%，为待机、动作和配件预留空间。动作期间镜头固定。切换时保留上个角色的一帧，直到新角色完成取景并画好才替换。背景沿用原构图。

## 开发与发布

使用 Node.js 24、Git 和 `package.json` 固定的 pnpm。运行 `pnpm install --frozen-lockfile` 后，`pnpm dev` 启动开发站点，`pnpm build` 检查并生成浏览器 JS、样式和声明文件，`pnpm test` 运行兼容性检查。`pnpm test:browser` 验证旧播放器；`node test/library-browser.mts <本地素材目录>` 验证少女前线的实际渲染和对话。首次浏览器测试前执行 `pnpm exec playwright-core install chromium-headless-shell`。

| 位置 | 职责 |
| --- | --- |
| `src/widget.mts`、`src/girls-frontline.mts` | 模块 API 与单标签入口 |
| `src/library/`、`src/pages/` | 目录解析、角色选择和浏览页 |
| `src/modern/`、`src/modern.ts` | 新版渲染、游戏动作与对话 |
| `src/legacy/`、`src/runtime/`、`src/vendor/` | 原协议、工具栏、旧引擎与小游戏 |
| `src/styles/`、`scripts/`、`test/` | 样式源文件、TypeScript 构建维护工具与测试 |

前端源码在 `src/`，开发工具和测试由 Node 直接执行 TypeScript。修改源码后提交构建产物，GitHub CDN 可直接读取 JS。`catalog/library.json` 保存所有来源及历史映射。更新时用 `node scripts/model-library.mts <Eikanya checkout> <jacksen168 checkout>` 按固定提交重建，再运行 `node scripts/localize-library.mts <已下载的完整素材目录>` 加入中文元数据和旧档映射。旧版详细分类的生成器是 `scripts/girls-frontline-catalog.mts`。

发布时更新 `package.json` 版本并合并到 `main`，推送同版本 `vX.Y.Z` 标签。Actions 验证构建、打包文件与兼容测试，再发布 `widget-X.Y.Z` 运行时和按内容标记的 `catalog-…` 目录快照。素材更新仍使用 `node scripts/cdn-snapshot.mts <提交> --publish`。发布固定标签后更新新站的入口版本。[发布工作流](.github/workflows/publish.yml)

## 素材与致谢

本项目沿用了 fghrsh 的 API 协议和 stevenjoezhang 的组件设计，现代渲染使用 live2d-web 与 Cubism。历史素材修复、缺失资源及可核对的录音记录见来源清单。模型与录音沿用原作者授权条件。[历史 API](https://github.com/fghrsh/live2d_api) · [原看板娘组件](https://github.com/stevenjoezhang/live2d-widget) · [素材来源](docs/model-sources.json) · [渲染器许可](modern/THIRD_PARTY_NOTICES.md)
