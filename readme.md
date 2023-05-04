# Live2D_API

>

## 前言

- 本项目 API 搭建方式参考自[fghrsh/live2d_api](https://github.com/fghrsh/live2d_api)。
- 本项目部分代码参考自 [stevenjoezhang/live2d-widget](https://github.com/stevenjoezhang/live2d-widget)。
- 本项目模型来自[Eikanya/Live2d-model](https://github.com/Eikanya/Live2d-model)，仅供学习交流，请勿用于商业用途，如有侵权，请联系删除。

## 特性 Feature

1. 将 Live2D API 完全 cdn 化，目录结构简单，加载迅速。
2. 为以 cdn 方式加载模型的 live2d-widget 加载模式添加按照顺序切换模型材质与随机切换模型材质的功能。
3. 添加左右`css`代码的适配。

## What I've done

1. 修正了少女前线(Girls Frontline)等 live2d 模型的文件路径错误以及文件名称错误，对模型的展示文件进行了编辑修正，并对模型展示大小位置进行了窗口适配。
   > PS:这环节究极折磨，打死不做第二遍。
2. 将加载 js 文件与 css 文件分别配置，便于网站引入。
   - `src/random/autoload.js`:随机加载任务模型皮肤。
   - `src/sequential/autoload.js`:按照顺序加载任务模型皮肤。
   - `src/css/left.css/`:看板娘位置靠左。
   - `src/css/right.css/`:看板娘位置靠右。
