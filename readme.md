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

### 新接入（1.1.0 起）

把完整项目部署到网站的 `/live2d/` 目录，然后在页面的 `<head>` 中加入一行：

```html
<script defer src="/live2d/autoload.js" data-position="right" data-mode="sequential"></script>
```

| 属性 | 可选值 | 默认值 |
| --- | --- | --- |
| `data-position` | `left`、`right` | `left` |
| `data-mode` | `sequential`（顺序换装）、`random`（随机换装） | `sequential` |

入口自动加载对应 CSS。页面初次执行脚本时，视口宽度小于 768px 会跳过加载。使用 CDN 时，将 `src` 换成同版本的完整地址，例如 jsDelivr 的 `https://cdn.jsdelivr.net/gh/nova1751/live2d-api@<commit>/autoload.js`（替换为包含新入口的提交 SHA），或 npm 1.1.0 发布后的 `https://unpkg.com/live2dapi-noa@1.1.0/autoload.js`。入口会从同一目录读取项目资源。

需要按页面或用户操作控制加载时，可以直接使用 ES 模块：

```html
<script type="module">
  import { loadWidget } from "/live2d/widget.mjs";
  await loadWidget({ position: "right", mode: "random" });
</script>
```

`loadWidget()` 在组件初始化后完成，模型和纹理随后异步加载。模块调用方自行决定是否在小屏幕加载。同一页面重复或并发调用只初始化一次，以第一次调用的配置为准。加载入口依赖失败时 Promise 会拒绝，可以再次调用。打包工具中可从 `live2dapi-noa` 导入 `loadWidget`，并传入 `baseUrl: "/live2d/"` 指向已部署的完整静态资源目录。

### 兼容旧接入

已使用下面方式的网站可以继续使用原引用。每组示例中，脚本按切换方式二选一，样式按位置二选一。

1. 使用`jsdelivr`引入。

   ```html
   <!-- 顺序切换模型材质 -->
   <script src="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/jsdelivr/sequential/autoload.min.js"></script>
   <!-- 随机切换模型材质 -->
   <script src="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/jsdelivr/random/autoload.min.js"></script>

   <!-- 看板娘位置靠左 -->
   <link
     rel="stylesheet"
     href="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/css/left.min.css"
   />
   <!-- 看板娘位置靠右 -->
   <link
     rel="stylesheet"
     href="https://cdn.jsdelivr.net/gh/nova1751/live2d-api@latest/css/right.min.css"
   />
   ```

2. 使用国内`npm`镜像节点引入。

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

## 成果 Achievement

1. 修正了少女前线(Girls Frontline)等 live2d 模型的文件路径错误以及文件名称错误，对模型的展示视口进行了相关的适配并修复了切换模型报错的问题。

> ~~这环节究极折磨，打死不做第二遍。~~

2. 修正了部分模型语音与互动动作配置错误。
3. 将左右的`css`文件分别配置，添加顺序切换模型材质的`js`文件，并将随机切换与顺序切换的`js`文件分别配置。
