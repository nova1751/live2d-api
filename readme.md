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

你可以使用`jsdelivr`与`npm`镜像节点来为你的网站引入相关文件，根据引入文件的不同决定你的看板娘的位置与模型材质切换方式。

1. 使用`jsdelivr`引入。

   ```html
   <!-- 顺序切换模型材质 -->
   <script src="https://cdn.jsdmirror.com/gh/nova1751/live2d-api@latest/jsdelivr/sequential/autoload.min.js"></script>
   <!-- 随机切换模型材质 -->
   <script src="https://cdn.jsdmirror.com/gh/nova1751/live2d-api@latest/jsdelivr/random/autoload.min.js"></script>

   <!-- 看板娘位置靠左 -->
   <link
     rel="stylesheet"
     href="https://cdn.jsdmirror.com/gh/nova1751/live2d-api@latest/css/left.min.css"
   />
   <!-- 看板娘位置靠右 -->
   <link
     rel="stylesheet"
     href="https://cdn.jsdmirror.com/gh/nova1751/live2d-api@latest/css/right.min.css"
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
