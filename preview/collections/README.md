# Live2D 作品图鉴 · 本地预览

[打开本地图鉴](http://127.0.0.1:8801/)。左侧是实时舞台和造型选择，右侧可以按作品、人物、造型和资源代号搜索。选择带「原声」的事件可以试听。复制预览链接会保留当前造型。

| 作品 | 收录范围 | 播放依据 |
| --- | --- | --- |
| 碧蓝航线 | 所选模型仓库的 178 个 Cubism 入口，含 HX 版本 | 使用模型自带动作。摸头、触摸、回港、委托、任务、誓约等按游戏事件关联同造型的台词和日语录音。其余动作也可单独预览 |
| BanG Dream! | Hello, Happy World! 五位成员的 429 套造型 | 使用模型清单定义的动作，待机使用原待机组或 idle01。造型名称优先显示中文。这份收藏没有角色录音 |
| 崩坏学园 2 | KISGP 作品索引中的 9 位角色 | 使用原动作及可用触摸区域。导出清单里的声音路径缺少实际录音，部分文本字段只有数字 ID |
| 机动战队 | 玛蒂尔达、斯洛卡伊，共 20 条可试听事件 | 沿用本地原声图鉴已核对的动作、日语录音和中文字幕 |

筛选和手动播放用于查看资产。待机静音，登录、任务、时段、好感度等游戏条件由用户通过事件选择器预览。网页负责取景、跟随指针、动作切换和音画调度。机动战队在未标名的触摸区域可从该角色现有触摸动作中抽选。

## 启动

在仓库根目录安装项目依赖。按[原声图鉴说明](../voiced-games/README.md)准备已有的机动战队素材、头像和 Cubism Core，然后运行：

```sh
node preview/collections/serve.mts
```

服务监听本机 8801 端口。首次打开一个造型需要联网读取固定版本的公开资源，成功的请求缓存在 `.local/`。重新生成崩坏学园 2 的九张人物预览图时，保持服务运行并执行 `node preview/collections/portraits.mts`。

## 素材来源

- 碧蓝航线使用[模型与头像](https://github.com/Chaoray/AzurLane-Live2D-Viewer)、[角色语音](https://github.com/Fernando2603/AzurLane)、[国服台词与造型](https://github.com/AzurLaneTools/AzurLaneData)和[游戏事件表](https://github.com/AzurLaneTools/AzurLaneLuaScripts/blob/b075e3a29663046a68507f93467e69d69268d491/CN/gamecfg/assistantinfo.lua)。
- BanG Dream! 使用[HHW 模型收藏](https://github.com/U1s1-king/dsh-live2d-hhw)和[造型名称数据](https://github.com/haneoka-gakuen/bangdream-live2d)。
- 崩坏学园 2 的选集来自 [KISGP/model](https://github.com/KISGP/model)。机动战队的原素材来自 [Eikanya/Live2d-model](https://github.com/Eikanya/Live2d-model)。
