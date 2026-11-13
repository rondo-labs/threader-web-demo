# Threader Web Demo

给俱乐部教练组和分析师看的演示站：用 2026 赛季中超、中甲、中乙的 Opta 事件数据，加上焦点球队的全场比赛视频，展示 Threader 的比赛与战术分析。部署在 `threader.matchmate.chat`，只对受邀的人开放。

术语见 [GLOSSARY.md](GLOSSARY.md)，难以回头的决定见 [docs/adr/](docs/adr/)。

## 范围

| 项         | 决定                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 受众       | 俱乐部教练组与分析师（销售演示）                                               |
| 数据       | 2026 赛季中超 240 场、中甲 240 场、中乙 359 场，来自 `opta-scraper` 的数据湖 |
| 焦点球队   | 宁波队（中甲）、厦门飞鹭（中乙），各 30 场，都有整季全场视频可用               |
| 视频       | 先上一支焦点球队的整季全场；视频与数据合计不超过 60 GB                         |
| 访问       | 受邀访问，只读                                                                 |
| 设备与语言 | 电脑浏览器；界面、队名、人名全部中文                                           |
| 问答       | DeepSeek，与 threader-desktop 用同一个 API                                     |

## 不做

- 手机布局、多语言（[ADR 0005](docs/adr/0005-desktop-browser-chinese-only.md)）
- 账号、收藏、批注等由访问者写入的内容（[ADR 0002](docs/adr/0002-invite-only-read-only.md)）
- 原始数据下载或批量查询接口（同上）
- 2024、2025 赛季
- xG 等自建模型指标（暂不做）
- 复用 threader-desktop 的 `@threader/core` 或 CDF（[ADR 0001](docs/adr/0001-opta-native-data-layer.md)）

## 数据

- 读 `opta-scraper` 数据湖里的 parquet（事件）和 `squads/*.json`（名单、球衣颜色、简称）。原始 feed JSON 只在 parquet 缺字段时回查，例如补时公告、当地开球时间。
- 覆盖级别：中超 15，中甲、中乙 13（各有 2 场为 12）。两支焦点球队的 60 场全是 13。
- 跨联赛对比只用三个联赛都有的字段。中超独有的细节（过人类型、传中类型、抢断与拦截的触球方式、身体姿态）不进跨联赛排名；抢断尝试、过人、争顶这类计数，中超的记录口径也明显更细。
- Opta 只有英文和拼音名，中文名要另找来源。实际出场的球员：中超 438 人、中甲 474 人、中乙 725 人。来源是网易彩票（已确认）：`pipeline/threader_demo/names.py` 逐场按「主客 + 球衣号」把网易的首发和替补对到 Opta 的出场名单，多场投票；网易只保留 9 月以后比赛的出场名单，之前就离队或没再出场的球员改用球队阵容页（同号码 + 拼音核对）。结果在 `data/names/`：2026-11-12 跑完，上过场的 1,562 人里 1,511 人有中文名（96.7%），厦门飞鹭 32/32、宁波队 32/33；`review.csv` 列出没对上（51 人上过场）、只靠号码对上（22 人）和名字不一致（3 人）的球员，等人核对。队名取自网易赛程里的简称（如「宁波队」「辽宁铁人」），不带赞助商。
- 已知缺口：中乙保级组缺 1 场（赣州瑞狮 vs 泰安天况）。
- 数据湖的合规约定照样适用：只发布分析结果和图，不发布原始数据；标注数据来源；不暗示与 Opta / Stats Perform 有合作。

## 视频

- 源文件是直播吧的直播录像（左上角有水印，画面里没有比赛计时）：1080p H.264 + AAC 立体声，文件头已在前面。有两种来源，30 fps 的关键帧间隔最长 8.3 秒，25 fps 的固定 2 秒。
- 去掉赛前、中场休息和赛后之后约 95–100 分钟，源文件约 2.5 GB/场，一队 30 场约 75 GB，必须转码后再上。
- 2026-11-12 拿一段 20 秒试转（与源文件的 SSIM）：1080p 2 Mbps 为 0.981，720p 2 Mbps 为 0.981，720p 1.5 Mbps 为 0.977。源文件码率低，1080p 并不比 720p 多保留细节。
- 规格（已确认）：720p、视频约 2 Mbps、关键帧固定 2 秒、AAC 96 kbps，约 1.6 GB/场、30 场约 48 GB；空间紧时用 1.5 Mbps，30 场约 37 GB。在这台 Mac 上用 x264 slow 约 5 倍速，一场约 20 分钟。
- 每场四个对时点：上下半场各自开始和结束在视频里的位置，记在 `data/video-sync.json`。事件按所在半场的两个对时点线性换算到画面上，因为直播录像每个半场会丢几秒（9/19 那场上半场约 4 秒、下半场约 6 秒），画面上的计时也不可靠。
- 剪辑按对时点用脚本做（已确认），不再手工剪。

## 服务器

`threader.matchmate.chat` 和主站是同一台腾讯云机器（Ubuntu 24.04、nginx 1.24，`ssh tencent-dev`）。出口带宽约 12–20 Mbps，同时观看的只有 1–2 人。

| 服务器上的位置                      | 放什么                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `~/threader-web-demo`             | 项目 clone；`web/dist` 由 Mac 传上来，`site-data/` 在服务器上生成                                                                 |
| `~/data/opta`                     | 数据湖，结构同 opta-scraper；只放 2026 中超、中甲、中乙（约 720 MB）                                                                  |
| `~/videos`                        | 发布用的比赛视频，目录和文件名跟数据湖的 events 一样，如 `chinese-football-league-2-2026/20260919_Xiamen_Feilu_3_0_Beijing_BIT.mp4` |
| `/etc/nginx/threader/invites.map` | 邀请名单（token 在这里，不进项目）                                                                                                    |

第一次部署：

1. 服务器上 `git clone` 到 `~/threader-web-demo`。
2. Mac 上 `deploy/push-from-mac.sh`：构建网页并传上去，同时传视频和数据湖。服务器没有 npm，从服务器访问 GitHub 和 pypi.org 也很慢，所以网页在 Mac 上构建；站点数据在服务器上用腾讯云 PyPI 镜像生成。
3. 服务器上 `~/threader-web-demo/deploy/setup-server.sh`：一步步改目录权限、生成站点数据、装 nginx 配置（替换域名的占位配置；证书用服务器上已有的 *.matchmate.chat 通配证书，自动续期）、发第一个邀请链接，最后自检。需要 sudo 密码。

以后更新：代码 `git pull` 后 `sudo nginx -s reload`；网页、视频或数据湖变了，Mac 上再跑 `deploy/push-from-mac.sh`，服务器上跑 `deploy/build-data.sh`。只传视频用 `--videos-only`，只传数据湖用 `--data-only`；传到一半断了，再跑一次会接着传。

## 视觉

配色、字体和球场图的画法按 Threader 设计系统：[https://claude.ai/artifact/4p5idvHEVoDDwvCmDWL2VL](https://claude.ai/artifact/4p5idvHEVoDDwvCmDWL2VL)

## 运行

正式站点目前只有厦门飞鹭的 30 场（2026 中乙）。每场都有完整的比赛分析；只有 9/19 对北京理工有视频，其余各场数字和图照常可看，点开不播放。

```bash
cd web && pnpm install
pnpm data          # 从数据湖生成 site-data/：每场一个 JSON 和比赛列表，30 场约 5 秒
pnpm dev           # http://127.0.0.1:5180/ ，/data/ 和 /media/ 由 Vite 直接读 site-data/、media/
cd ../pipeline && uv run pytest   # 9/19 的全部读数必须和原型定下的一致
```

- 数据：`pipeline/threader_demo/match_analysis/`，每章一个模块，口径见 [docs/match-analysis.md](docs/match-analysis.md)；`site.py` 决定上哪些球队的比赛（现在只有厦门飞鹭）。跑完会写 `data/names/missing-on-site.csv`，列出站上显示、但还没有中文名的球员（页面上先用 Opta 的名字）。
- 视频：`uv run python -m threader_demo.video_publish <match_id>` 按 `data/video-sync.json` 的四个对时点剪掉赛前、中场和赛后，转成 720p、约 2 Mbps、2 秒关键帧，写到 `media/<match_id>.mp4`。发布文件里的对时点由剪辑位置算出，不另存。只有这个文件存在，那场比赛才算有视频。
- 访问：每家受邀俱乐部一个链接 `https://threader.matchmate.chat/?k=<token>`，nginx 对照 `invites.map` 设 cookie；没有有效 cookie 的页面、数据和视频一律 403。加俱乐部用 `deploy/invite.sh "俱乐部名"`，撤销就删掉那一行再 reload nginx。访问日志记着每个请求来自哪家俱乐部。
- 本机按正式方式试：`deploy/local-test.sh`（要 Docker），用和服务器一样的 nginx 1.24 配置、一样的目录在 http://localhost:8088 起站，并打印一个测试邀请链接。
- 字体：拉丁字体随站点发布（`@fontsource`），中文用系统字体；Google Fonts 在大陆打不开。

### 原型

`web/src/prototype/`、`web/prototype/` 和 `pipeline/prototype/` 是定版面时的原型（A–G），正式代码不依赖它们，`pnpm prototype` 仍可运行；确认不再需要后可以删掉。

## 待定

- 正式站点（本地）已完成：飞鹭 30 场、六章、按俱乐部的邀请链接；部署脚本已备好（deploy/），还没在服务器上跑
- 比赛分析的版面已定为 F：长页面，每个小节左图右表；右边的数据表就是筛选器，点一行，图只画这一行；点数字，图跟着切换并播放视频。前场推进默认显示左中右三路汇总，点某一路可以下钻；可以切换全场、上半场、下半场。
- 播放器已定为 G：视频插在点击的那个小节的表格上方，片段列表默认收起，图、表、视频都不被遮挡。原型 `?variant=G`
- 六章的小节清单已定，见 [docs/match-analysis.md](docs/match-analysis.md)。原型六章都做了：概览、进攻（含后场出球）、防守、进攻转换、防守转换、定位球，所有小节可按「全场/上下半场 × 全部/领先/打平/落后」筛选。两个转换章的漏斗，每一条播放从抢回或丢球到它打成那一步的整个回合
- 复盘：形式定为「阅读 + 全屏讲解」两种看法共用一份内容，具体内容还没定
