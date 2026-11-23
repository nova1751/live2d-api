# 分作品模型目录

`catalog/library.json` 是原少女前线目录。其余三部作品各有一个独立的静态 JSON 目录，随 Demo 一起部署。播放器按清单自动选择 Cubism 2 或现代 Cubism 后端。模型、动作、贴图和录音保留在对应仓库的固定提交中，目录内的路径相对于各自素材源解析。

| 作品 | 来源与匹配规则 |
| --- | --- |
| 少女前线 | 延用原目录及离线下载工具。刘氏步枪 563 标准款事件 56309 按清单内含空格的动作路径匹配。G11、G41、刘易斯、RFB、SAT8、Vector 的 8 个缺词键采用逐条核对过的社区转写或中译，仅用于中文模式。[台词资料示例](https://gf-ogas.wiki/wiki/少女前线:G11) |
| 碧蓝航线 | [模型与缩略图](https://github.com/Chaoray/AzurLane-Live2D-Viewer/tree/88cb6e56a0ad472fe7e546509f096545d2bbc5b9)、[中文装扮及台词](https://github.com/AzurLaneTools/AzurLaneData/tree/4cca5c2437007b62d30a6235fcfc0c0203231378)、[日文语音](https://github.com/Fernando2603/AzurLane/tree/219db8feba07058dde232c461218bdacaaefdc17/audio/voiceline)。录音必须存在于对应装扮目录，事件使用游戏语音键；模型的命中区域名称用于点击。 |
| BanG Dream! | 使用 [U1s1-king](https://github.com/U1s1-king) 的九个 dsh-live2d 乐队仓库。独立版人物编号按各仓库的角色表映射到游戏编号，服装名称及时间来自[游戏数据归档](https://github.com/haneoka-gakuen/bangdream-live2d/tree/2ed0434efb999b78bc282ad27b3964395a32340a)。松原花音与长崎爽世两套服装按原 buildData 的 bundleName 和 fileName 补回 15 个引用。 |
| 崩坏学园 2 | [原始 19 份模型](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac/崩坏学园2)。有模型清单引用了 WAV 路径或游戏语音标识，固定来源中无对应音频，播放时保留动作并跳过该音轨。 |

点击未映射部位时，旧模型按实际网格命中，新模型在没有命名命中区域时读取渲染帧的像素透明度。随机动作复用该动作已有的录音、字幕和播放时序，空白画布不触发随机动作。

运行 `pnpm demo` 可以在本机 8803 端口预览静态站。直接访问 [本地图鉴](http://127.0.0.1:8803/catalog/)。

## 更新目录

在仓库根目录运行以下命令。导入工具需要 Node、Git 和网络。已提交的目录可直接用于常规构建；重导时才会读取上游 Git 树和清单。第一次导入会下载元数据并缓存到 `node_modules/.cache/game-sources`。语音归档采用 Git 部分克隆，仅枚举路径。

```sh
node scripts/import-game-catalogs.mts
pnpm build
pnpm test
node scripts/vercel-static.mts
```

修改上游版本时，同时更新提交号和对应素材子树哈希。生成器逐项核对模型、贴图及动作等引用，把补回文件的来源和 SHA-256、缺失音轨以及不可用造型写入 [audit.json](../catalog/games/audit.json)。数量描述所选固定来源的收录范围。上游新增造型后需要重建索引和校验结果。
