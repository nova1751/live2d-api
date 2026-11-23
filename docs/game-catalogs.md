# 分作品模型目录

`catalog/library.json` 保留原少女前线目录。其他作品各有独立 JSON，打开对应图鉴时才下载。模型、贴图、动作和录音从目录指定的固定素材快照加载。

| 作品 | 来源与匹配规则 |
| --- | --- |
| 少女前线 | 延用原目录及离线下载工具。刘氏步枪 563 标准款事件 56309 按清单内含空格的动作路径匹配。G11、G41、刘易斯、RFB、SAT8、Vector 的 8 个缺词键采用逐条核对过的社区转写或中译，仅用于中文模式。[台词资料示例](https://gf-ogas.wiki/wiki/少女前线:G11) |
| 碧蓝航线 | [模型与缩略图](https://github.com/Chaoray/AzurLane-Live2D-Viewer/tree/88cb6e56a0ad472fe7e546509f096545d2bbc5b9)、[中文装扮及台词](https://github.com/AzurLaneTools/AzurLaneData/tree/4cca5c2437007b62d30a6235fcfc0c0203231378)、[日文语音](https://github.com/Fernando2603/AzurLane/tree/219db8feba07058dde232c461218bdacaaefdc17/audio/voiceline)。优先使用对应装扮的录音。允许继承的语音键按游戏规则核对默认装扮以及中、日、英文本，再绑定同一事件的录音。模型的命中区域名称用于点击。 |
| BanG Dream! | 使用 [U1s1-king](https://github.com/U1s1-king) 的九个 dsh-live2d 乐队仓库。独立版人物编号按各仓库的角色表映射到游戏编号，服装名称及时间来自[游戏数据归档](https://github.com/haneoka-gakuen/bangdream-live2d/tree/2ed0434efb999b78bc282ad27b3964395a32340a)。松原花音与长崎爽世两套服装按原 buildData 的 bundleName 和 fileName 补回 15 个引用。 |
| 崩坏学园 2 | [原始 19 份模型](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac/崩坏学园2)。希儿与德丽莎使用第二份导出核对动作、录音及字幕。其他 17 个造型仍有 124 个缺音频的引用，播放时保留原动作。 |

点击未映射部位时，旧模型按实际网格命中，新模型在没有命名命中区域时读取渲染帧的像素透明度。随机动作复用该动作已有的录音、字幕和播放时序，空白画布不触发随机动作。

运行 `pnpm demo` 可以在本机 8803 端口预览静态站。直接访问 [本地图鉴](http://127.0.0.1:8803/catalog/)。

## 兼容收藏与缺件记录

| 作品 | 纳入的造型 | 核对结果 |
| --- | ---: | --- |
| 机动战队 | 4 | 蕾拉、玛蒂尔达、斯洛卡伊、辛西娅。玛蒂尔达的原清单和斯洛卡伊的日语清单各有 10 条动作绑定了录音。其余两位按清单播放动作。 |
| 战舰少女 R | 3 | 按换装编号区分密苏里 209_2、大淀 248_1、列克星敦（CV-16）325_1，共 28 条动作。核对的导出目录缺少动作指定的录音。 |
| 宝石研物语 | 14 | 两作共找到 15 份模型本体，14 套引用完整。13 套在动作中指定了音频。伊丽莎白造型 8 缺少 `motions/guide.mtn`，未列入图鉴。 |

机动战队与战舰少女 R 复用仓库已有的 CDN 素材快照，旧入口和数字 ID 继续可用。机动战队的四个人物目录在两份上游收藏里具有相同的 Git 树哈希。战舰少女 R 的两份收藏都有相同的三个换装编号，换装名按图鉴编号核对。[上游收藏](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac) · [对照收藏](https://github.com/L01den/live2d-models/tree/486d18466be50f646035f0d82c97e9b017b1cce4) · [战舰少女 R 换装表](https://www.zjsnrwiki.com/wiki/换装)

宝石研物语使用同一上游固定提交中的原始素材。部分模型清单在数组或对象的最后一项保留了逗号，Cubism 2 播放器兼容这种导出格式。仓库中的缩略图由图鉴实机渲染生成。上述数量以核对过的公开文件为范围。

## 2.8.5 互动素材核对

| 图鉴 | 本次核对 |
| --- | --- |
| 少女前线 | 51 个造型优先使用含游戏触摸事件的同造型导出，另 4 个保留旧版独有动作，并按原动作文件接入 17 条提示，其中 16 条有对应录音。新增的动作文件名包括 Saiga-12 5402 标准款的 `flowers` 和扎斯塔瓦 M21 2104 标准款的 `wait_1`。G36C 1202 战损的两份导出使用不同动作名，仍保留旧入口。[核对方法](model-library.zh-CN.md) |
| 碧蓝航线 | 171 个造型新增 789 个有声动作组，涉及 565 段不同的录音，均已下载并核对 OGG 文件头和固定提交的 Git blob。2,252 个已绑定台词的动作组中有 2,251 个带录音。雪风 `xuefeng_3` 的特殊触摸有中文台词，日服该装扮此行为空，默认装扮台词也不同，因此保留纯字幕。计数按造型和动作组，未绑定台词的其他动作仍可播放。[游戏台词选择逻辑](https://github.com/AzurLaneTools/AzurLaneLuaScripts/blob/69edd04e6dda5d8286c6c61d819e52770eee0469/CN/view/helper/shipwordhelper.lua) |
| 崩坏学园 2 | 希儿 9 段、德丽莎 5 段 WAV 分别对应 21 条动作记录。两份导出的模型二进制哈希一致，匹配的动作曲线在统一换行后逐字相同。原看板娘按动作的数字索引查中文文本，本项目沿用此映射并提供英文翻译。[模型与录音](https://github.com/RedBeanN/HSoD2/tree/33fa38f05743ecf15ae970372b4177c6f229bc7c/up-list/public/live2d/model) · [原字幕表](https://github.com/RedBeanN/HSoD2/blob/33fa38f05743ecf15ae970372b4177c6f229bc7c/up-list/public/live2d/message.json) · [其余逐文件记录](../catalog/games/audit.json) |
| BanG Dream! | 2,769 个造型的 98,927 条动作记录均未内嵌台词或音轨。剧情播放器按场景指定说话人、语音包和动作，同一通用动作可用于多句对白。当前图鉴的点击动作沿用服装清单。[模型与服装归档](https://github.com/haneoka-gakuen/bangdream-live2d/tree/2ed0434efb999b78bc282ad27b3964395a32340a) · [Bestdori 剧情格式说明](https://bestdori.com/community/posts/1786/Burrito-A-Tutorial-on-Community-Stories) |
| 机动战队、战舰少女 R、宝石研物语 | 三库当前引用的 85、38、155 个依赖可下载。有动作绑定录音的造型分别为 2/4、0/3、13/14。宝石研物语的伊丽莎白 8 在对照收藏中也缺少同造型的 `guide.mtn`，找到的是造型 2 的同名动作。 |

崩坏学园 2 另比对了 Eikanya、L01den 和 lzy4ever 的专属子树，三者是同一棵 Git 树，共 241 个文件，独立音频数为零。战舰少女 R 在这三份导出中均未找到独立录音。KISGP 也收录了部分同名游戏模型。[L01den](https://github.com/L01den/live2d-models/tree/486d18466be50f646035f0d82c97e9b017b1cce4) · [lzy4ever](https://github.com/lzy4ever/Live2d-model-se) · [KISGP](https://github.com/KISGP/model/tree/8caffe3e36a176b00cca5dda4e438e4d70e1f073)

## 更新目录

三个手工核对的作品目录位于 `catalog/games/{iron-saga,warship-girls,baoshi-yanwuyu}.json`。用 `node scripts/check-curated-catalogs.mts` 检查所有清单和引用文件的可达性，加 `--mainland` 可复核项目 CDN 素材在国内镜像上的路径。宝石研物语始终从目录中固定的 GitHub 原始文件地址读取。

在仓库根目录运行以下命令。导入工具需要 Node、Git 和网络。已提交的目录可直接用于常规构建；重导时才会读取上游 Git 树和清单。第一次导入会下载元数据并缓存到 `node_modules/.cache/game-sources`。语音归档采用 Git 部分克隆，仅枚举路径。

```sh
node scripts/import-game-catalogs.mts
pnpm build
pnpm test
node scripts/vercel-static.mts
```

修改上游版本时，同时更新提交号和对应素材子树哈希。生成器逐项核对模型、贴图及动作等引用，把补回文件的来源和 SHA-256、缺失音轨以及不可用造型写入 [audit.json](../catalog/games/audit.json)。数量描述所选固定来源的收录范围。上游新增造型后需要重建索引和校验结果。
