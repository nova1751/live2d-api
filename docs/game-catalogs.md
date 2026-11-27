# 分作品模型目录

`catalog/library.json` 保留原少女前线目录。其他作品各有独立 JSON，打开对应图鉴时才下载。模型、贴图、动作和录音从目录指定的固定素材快照加载。

| 作品 | 来源与匹配规则 |
| --- | --- |
| 少女前线 | 延用原目录及离线下载工具。刘氏步枪 563 标准款事件 56309 按清单内含空格的动作路径匹配。G11、G41、刘易斯、RFB、SAT8、Vector 的 8 个缺词键采用逐条核对过的社区转写或中译，仅用于中文模式。[台词资料示例](https://gf-ogas.wiki/wiki/少女前线:G11) |
| 碧蓝航线 | [模型与缩略图](https://github.com/Chaoray/AzurLane-Live2D-Viewer/tree/88cb6e56a0ad472fe7e546509f096545d2bbc5b9)、[中文装扮及台词](https://github.com/AzurLaneTools/AzurLaneData/tree/4cca5c2437007b62d30a6235fcfc0c0203231378)、[日文语音](https://github.com/Fernando2603/AzurLane/tree/219db8feba07058dde232c461218bdacaaefdc17/audio/voiceline)。优先使用对应装扮的录音。允许继承的语音键按游戏规则核对默认装扮以及中、日、英文本，再绑定同一事件的录音。模型的命中区域名称用于点击。 |
| BanG Dream! | 使用 [U1s1-king](https://github.com/U1s1-king) 的九个 dsh-live2d 乐队仓库。独立版人物编号按各仓库的角色表映射到游戏编号，服装名称及时间来自[游戏数据归档](https://github.com/haneoka-gakuen/bangdream-live2d/tree/2ed0434efb999b78bc282ad27b3964395a32340a)。松原花音与长崎爽世两套服装按原 buildData 的 bundleName 和 fileName 补回 15 个引用。 |
| 崩坏学园 2 | 19 个造型。希儿与德丽莎有经动作核对的录音和字幕，芽衣有 7 段原始录音。17 个造型补回官方中文字幕，其中 6 个造型从原语音包补回 41 段录音。仍缺录音的动作保留字幕并照常播放。[原始模型](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac/崩坏学园2) |

点击未映射部位时，旧模型按实际网格命中，新模型在没有命名命中区域时读取渲染帧的像素透明度。随机动作复用该动作已有的录音、字幕和播放时序，空白画布不触发随机动作。

运行 `pnpm demo` 可以在本机 8803 端口预览静态站。直接访问 [本地图鉴](http://127.0.0.1:8803/catalog/)。

## 兼容收藏与缺件记录

| 作品 | 纳入的造型 | 核对结果 |
| --- | ---: | --- |
| 机动战队 | 4 | 蕾拉、玛蒂尔达、斯洛卡伊、辛西娅。玛蒂尔达的原清单和斯洛卡伊的日语清单各有 10 条动作绑定了录音。其余两位按清单播放动作。 |
| 战舰少女 R | 3 | 按换装编号区分密苏里 209_2、大淀 248_1、列克星敦（CV-16）325_1，共 28 条动作。核对的导出目录缺少动作指定的录音。 |
| 宝石研物语 | 15 | 14 套在动作中指定了音频。伊丽莎白造型 8 保留了原始模型、贴图、可用动作和录音，缺失的引导动作 `motions/guide.mtn` 已从播放列表中跳过。 |

机动战队与战舰少女 R 复用仓库已有的 CDN 素材快照，旧入口和数字 ID 继续可用。机动战队的四个人物目录在两份上游收藏里具有相同的 Git 树哈希。战舰少女 R 的两份收藏都有相同的三个换装编号，换装名按图鉴编号核对。[上游收藏](https://github.com/Eikanya/Live2d-model/tree/7e446cbd95ec352cdb0f73c079e4d075d7d528ac) · [对照收藏](https://github.com/L01den/live2d-models/tree/486d18466be50f646035f0d82c97e9b017b1cce4) · [战舰少女 R 换装表](https://www.zjsnrwiki.com/wiki/换装)

宝石研物语使用同一上游固定提交中的原始素材。部分模型清单在数组或对象的最后一项保留了逗号，Cubism 2 播放器兼容这种导出格式。仓库中的缩略图由图鉴实机渲染生成。上述数量以核对过的公开文件为范围。

B 站 1.1.4 安装包的文件索引也只在 `elizabeth_2` 目录列出 `motions/guide.mtn`。`elizabeth_8` 目录内有模型、贴图、四段动作和四段录音，图鉴使用该造型现有的原动作。[安装包](https://pkg.biligame.com/games/bsywy_1.1.4_bilibili_20210927_276373.apk)

## 本轮补全与已核对的缺音事件

少女前线 369 个新版造型共有 1,991 条触摸事件。按原录音转写 10 个语音键，为 14 条事件补回中英文字幕。目前 47 条事件有录音、缺可核对字幕，40 条有字幕、缺原录音。五区资源清单中的 400 个枪娘模型造型均可映射到当前收录的同源模型。Px4 Storm 2801 战损的五条触摸动画只出现在普通造型目录，战损版保留该事件的原声和字幕。[转写记录](../catalog/games/voices/gfl-transcripts.json) · [五区资源清单](https://github.com/gf-data-tools/gf-resource-downloader/releases/tag/ResData)

98K 的 4301 和 8301 普通造型现在播放日服 `98K.acb` 中的 `98K_DIALOGUEWEDDING_JP`。原声的意思与最新中、日文台词表一致，英文字幕据此校正。录音随图鉴快照发布，使用当前图鉴所在的 CDN。[录音来源记录](../catalog/games/voices/gfl-98k-dialoguewedding.json)

97 式霰弹枪 `doll/97types/5805/normal` 的事件 `580509` 使用 `97TYPES|DIALOGUEWEDDING`。模型事件表和角色页均将水果台词列为誓约后的副官互动。公开日语语音库缺这一键，角色页的誓约仪式和心智升级录音各对应其他台词。图鉴保留此事件的原动作和字幕。[事件表](https://github.com/GFL-Live2D/dump/blob/527aac9245c06444d5d0259be843740915b715fd/models/97types_5805/normal/97types_5805.data.json) · [角色台词](https://iopwiki.com/wiki/Type_97_Shotgun/Quotes) · [日语语音库](https://huggingface.co/datasets/deepghs/girlsfrontline_voices_jp)

## 2.8.5 互动素材核对

| 图鉴 | 本次核对 |
| --- | --- |
| 少女前线 | 51 个造型优先使用含游戏触摸事件的同造型导出，另 4 个保留旧版独有动作，并按原动作文件接入 17 条提示，其中 16 条有对应录音。新增的动作文件名包括 Saiga-12 5402 标准款的 `flowers` 和扎斯塔瓦 M21 2104 标准款的 `wait_1`。G36C 1202 战损的两份导出使用不同动作名，仍保留旧入口。[核对方法](model-library.zh-CN.md) |
| 碧蓝航线 | 171 个造型新增 789 个有声动作组，涉及 565 段不同的录音，均已下载并核对 OGG 文件头和固定提交的 Git blob。2,252 个已绑定台词的动作组中有 2,251 个带录音。雪风 `xuefeng_3` 的特殊触摸有中文台词，日服该装扮此行为空，默认装扮台词也不同，因此保留纯字幕。计数按造型和动作组，未绑定台词的其他动作仍可播放。[游戏台词选择逻辑](https://github.com/AzurLaneTools/AzurLaneLuaScripts/blob/69edd04e6dda5d8286c6c61d819e52770eee0469/CN/view/helper/shipwordhelper.lua) |
| 崩坏学园 2 | 希儿 9 段、德丽莎 5 段 WAV 分别对应 21 条动作记录。两份导出的模型二进制哈希一致，匹配的动作曲线在统一换行后逐字相同。原看板娘按动作的数字索引查中文文本，本项目沿用此映射并提供英文翻译。[模型与录音](https://github.com/RedBeanN/HSoD2/tree/33fa38f05743ecf15ae970372b4177c6f229bc7c/up-list/public/live2d/model) · [原字幕表](https://github.com/RedBeanN/HSoD2/blob/33fa38f05743ecf15ae970372b4177c6f229bc7c/up-list/public/live2d/message.json) · [其余逐文件记录](../catalog/games/audit.json) |
| BanG Dream! | 2,769 个造型的 98,927 条动作记录均未内嵌台词或音轨。剧情播放器按场景指定说话人、语音包和动作，同一通用动作可用于多句对白。当前图鉴的点击动作沿用服装清单。[模型与服装归档](https://github.com/haneoka-gakuen/bangdream-live2d/tree/2ed0434efb999b78bc282ad27b3964395a32340a) · [Bestdori 剧情格式说明](https://bestdori.com/community/posts/1786/Burrito-A-Tutorial-on-Community-Stories) |
| 机动战队、战舰少女 R、宝石研物语 | 三库当前引用的 85、38、155 个依赖可下载。有动作绑定录音的造型分别为 2/4、0/3、13/14。宝石研物语的伊丽莎白 8 在对照收藏中也缺少同造型的 `guide.mtn`，找到的是造型 2 的同名动作。 |

崩坏学园 2 另比对了 Eikanya、L01den 和 lzy4ever 的专属子树，三者是同一棵 Git 树，共 241 个文件，独立音频数为零。战舰少女 R 在这三份导出中均未找到独立录音。KISGP 也收录了部分同名游戏模型。[L01den](https://github.com/L01den/live2d-models/tree/486d18466be50f646035f0d82c97e9b017b1cce4) · [lzy4ever](https://github.com/lzy4ever/Live2d-model-se) · [KISGP](https://github.com/KISGP/model/tree/8caffe3e36a176b00cca5dda4e438e4d70e1f073)

## 2.9.5 互动媒体复核

2.9.5 补回可畏「值日时的春心萌动」的三个特殊互动。返港、第三句主界面台词和特殊触摸分别使用同装扮 207053 的 `home_ex`、`main3_ex` 和 `touch2_ex` 日语录音，字幕来自中服及美服的额外台词表。当前目录共 2,255 个带台词的动作组，其中 2,254 个带录音。[额外台词表](https://github.com/AzurLaneTools/AzurLaneData/blob/4cca5c2437007b62d30a6235fcfc0c0203231378/CN/ShareCfg/ship_skin_words_extra.json) · [对应装扮录音](https://github.com/Fernando2603/AzurLane/tree/219db8feba07058dde232c461218bdacaaefdc17/audio/voiceline/207053)

芽衣沿用 `mie/model.json` 的原动作、录音文件名和时序。另一导出的 `mei` 目录收录了同名 WAV，对应的七个动作文件与当前造型逐字节相同。[补录来源](https://github.com/AzharRizkiZ/Live2D-Model/tree/fab804971d22fcbcefbc6e4277d1e09424e9143c/assets/models/Honkai-Impact/mei)

## 崩坏学园 2 原版录音与字幕

国服 11.7 资源清单中的 Wwise 搭档语音包收录了丽塔、时雨绮罗、妮娜、宁蒂、西琳和琪卡的 41 个缺失事件。按模型的原事件名匹配 Wwise 事件 ID，再通过同一声库的播放动作解析到单一音轨。图鉴将原音轨转为 Ogg Vorbis，并随图鉴快照发布约 2.7 MB 的录音。17 个造型的 124 条中文字幕按模型中的数字编号与官方 `TextMap` 精确对应，包括芽衣的 7 条字幕。其余 76 处旧 WAV 引用暂缺可核实的原录音。[语音来源记录](../catalog/games/voices/houkai2-partner-11.7.json) · [中文字幕来源记录](../catalog/games/voices/houkai2-textmap-11.7.json)

## 碧蓝航线的场景取景

埃姆登「黑白的夜之主」与安克雷奇「海豚、海洋、游泳课」的普通版和 HX 版包含整幅场景，并把部分活动布景停在原画框外。图鉴按这四份模型的 Cubism 画布比例显示，分别为 6000∶6502 和 9∶7。动作将布景移入画框时即可看到。其他造型继续按可见轮廓取景。

## 更新目录

BanG Dream! 的 `hhw/013/013_live_event_93_sr`、`roselia/047/047_live_event_139_r` 和 `morfonica/019/019_casual` 由独立素材包提供。素材包保留上游固定提交的造型目录和相对引用，国内入口通过镜像加载。Morfonica 日常服曾在上游镜像地址遇到 403。项目素材包的 51 个文件与该造型的上游 Git 树一致。

对照 Bestdori 的服装索引和国服模型档案后，补入 9 套小豆泥联动造型与 2 套奥泽美咲造型。原模型保留独立待机和点击动作，共用的表情、物理和动作文件只存一份。两套联动造型从卡片原剧情补回 66 条点击互动。每条按剧情当时使用的服装、说话人、原动作和语音 ID 匹配。素材随图鉴快照发布，截图和原始尺寸由原模型决定。[服装索引](https://bestdori.com/api/costumes/all.5.json) · [原版剧情示例](https://bestdori.com/tool/storyviewer/card/cn/10048/1) · [文件与录音来源](../catalog/games/band-dream-cn/sources.json)

三个手工核对的作品目录位于 `catalog/games/{iron-saga,warship-girls,baoshi-yanwuyu}.json`。用 `node scripts/check-curated-catalogs.mts` 检查所有清单和引用文件的可达性，加 `--mainland` 可按播放器的国内地址解析规则复核三个系列。

在仓库根目录运行以下命令。导入工具需要 Node、Git 和网络。已提交的目录可直接用于常规构建；重导时才会读取上游 Git 树和清单。第一次导入会下载元数据并缓存到 `node_modules/.cache/game-sources`。语音归档采用 Git 部分克隆，仅枚举路径。

```sh
node scripts/import-game-catalogs.mts
pnpm build
pnpm test
node scripts/vercel-static.mts
```

修改上游版本时，同时更新提交号和对应素材子树哈希。生成器逐项核对模型、贴图及动作等引用，把补回文件的来源和 SHA-256、缺失音轨以及不可用造型写入 [audit.json](../catalog/games/audit.json)。数量描述所选固定来源的收录范围。上游新增造型后需要重建索引和校验结果。
