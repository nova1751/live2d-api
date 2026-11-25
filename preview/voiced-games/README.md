# 原声互动图鉴 · 本地预览

打开 [本地图鉴](http://127.0.0.1:8798/)。点人物卡片切换角色，直接点舞台或选择「试听事件」播放。有些原生触点也会抽到无声动作。网址的 `?model=lafei` 可以直接定位角色。

| 作品 | 角色 | 试听事件 |
| --- | --- | --- |
| 碧蓝航线 | 拉菲、标枪、绫波，各自的基础造型 | 每位 13 个 |
| 机动战队 | 玛蒂尔达、斯洛卡伊 | 每位 10 个，分别含 4 条和 3 条可手动试听的待机台词 |

碧蓝航线以造型 ID、动作组、语音键匹配中文游戏台词和日语录音。例如拉菲基础造型 101170 的摸头使用 `touch_head`、`headtouch.ogg` 和该造型的 `headtouch` 台词。页面按游戏事件配对播放，未复刻原客户端的所有调度时序。机动战队直接使用原清单的动作、录音和字幕。斯洛卡伊使用带日语声音映射的清单。机动战队可点击人物的可见部位；未命名的命中区域从本角色原有的触摸事件中抽选。待机和切换角色均静音。

素材分别来自 [碧蓝航线模型](https://github.com/Chaoray/AzurLane-Live2D-Viewer)、[角色语音](https://github.com/Fernando2603/AzurLane)、[中文游戏数据](https://github.com/AzurLaneTools/AzurLaneData) 和[机动战队素材](https://github.com/Eikanya/Live2d-model)。碧蓝航线下载时使用的提交固定在 `prepare.mts` 中。模型、录音及 Cubism Core 保存在 `.local/`，素材权利归原权利人。

碧蓝航线的「委托完成」使用 `complete` 动作和 `expedition` 语音。「完成任务」使用另一组独立的动作和台词。两者的对应关系见[游戏事件表](https://github.com/AzurLaneTools/AzurLaneLuaScripts/blob/b075e3a29663046a68507f93467e69d69268d491/CN/gamecfg/assistantinfo.lua)。

## 在仓库根目录运行

首次准备需要本仓库的依赖和可用的 Cubism Web Core。本机默认沿用已有本地 Core，也可通过 `CUBISM_CORE_PATH` 指定文件。

```sh
node preview/voiced-games/prepare.mts
node preview/voiced-games/serve.mts
```

素材就绪后只需运行第二条命令。服务仅监听本机回环地址。需要重新生成角色缩略图时，在服务运行期间执行：

```sh
node preview/voiced-games/portraits.mts
```
