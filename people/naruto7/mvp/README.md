# 听见校园 · 声景地图（MVP 雏形 v0.1）

组长的雏形，用来让全组看到"板块怎么排、板块里放什么、点起来是什么感觉"。它是素材，不是定稿：谁都可以否掉其中任何一条，各板块由对应的人在 `src/features/<自己>/` 里重做。整理：ClawsGO Science Agent，2026-11-23。

## 跑起来

```bash
cd people/naruto7/mvp
npm install
npm run dev          # 开发，默认 http://localhost:5173
npm run build        # 构建到 dist/
npm run check:sounds     # 声音和话题数据自检
npm run check:contrast   # 全天颜色对比度自检
npm run check:echoes     # 示例回声自检：数据合规、两份文字规则一致、钉的秒数落在声片长度内
npm run check:cloud      # 云契约自检 44 项：A 留 B 看得到、服务端重做校验、限频、照片去定位、先审后显、举报收起
npm run dev:cloud        # 单独起开发用云模拟器（默认 8787 端口）
npm run e2e              # 构建、起预览服务、跑 58 项浏览器走查，退出码 0 才算过
npm run e2e:kesheng      # 留声机（刻声分区图）冒烟 28 项：回声带、盘面回声针、唱片套子、A 留话 B 看得到、照片去定位、嵌入模式、手机宽度
```

`e2e` 用本机的 Chrome 或 Edge（`puppeteer-core` 不自带浏览器）。找不到时用环境变量 `CHROME_PATH` 指定可执行文件。截图在 `.e2e-shots/`，已被 `.gitignore` 忽略。2026-11-24 的结果：`e2e` 58 项、`e2e:kesheng` 28 项、`check:cloud` 44 项，全部通过，控制台与网络问题 0。

本机 Node 26 上验证过。仓库规定的是 Node 24 LTS，没有在 24 上跑过。

演示时想把天色固定在某个钟点：网址后面加 `?h=7.5`（清晨 7:30）、`?h=18.3`（傍晚）、`?h=22`（夜里）。

## 首页是留声机（v0.3）

首页 `/` 整屏嵌入刻声的三维分区图（`public/kesheng/`，`src/views/StageView.vue` 用 iframe 加 `?embed=1`）。原来的首页挪到 `/now`，导航里叫"此刻"；地图页 `/map` 还在，声音卡和话题里的链接都指向它，暂时不放进导航。

这一版在刻声上加了三样东西，都在 `public/kesheng/src/web/` 里，刻声自己的文件只改了 `plan3d/` 下的 html、css、js：

| 新增 | 是什么 | 在哪里 |
|---|---|---|
| 回声带 | 播放器里这张声片的包络线，钉在某一秒的话竖在线上；针走到那一秒，那句话浮上来；点一根钉或一行字，声音从那一秒前面一点接着放。留一句话要先过链接和号码拦截 | `plan3d.js` 的"回声带"一段，`community.js`（数据与规则），`plan3d/echo-seed.json`（34 条示例回声） |
| 盘面回声针 | 同一句话也立在盘面刻纹上那一秒的位置，跟着盘转；针走到那里它亮起来。声音、波形、盘面三处指同一个瞬间 | `plan3d.js` 的 `buildEchoMarks`、`stepEchoMarks` |
| 唱片套子 | 地点卡的正面是一张照片，右边露出半张盘。照片是辅：只在套子上，声音才是里面的唱片。现在 16 个地点都是"模型照"（拍的是留声机上的纸模型），角标如实写出来；团队拍到实拍后换同名文件、把 `sleeves.json` 里的 `kind` 改成 `photo` | `plan3d/sleeves/`、`plan3d/sleeves.json`、`scripts/make-sleeve-photos.mjs` |

示例回声里的话是写出来的示例，不是哪位同学说的：只写年级，不写学院和名字，页面上每一条都标"示例"，不会发到云上。你自己留的话走云（见下一节）。

页面新增的字（回声带、套子的文案）由 `scripts/subset-plan-font.py` 补进仿宋子集，只增不减。字体是朱雀仿宋 v0.212，SIL OFL 1.1。需要原字体文件时从 [TrionesType/zhuque 的发布页](https://github.com/TrionesType/zhuque/releases)取。

## 数据放哪：云优先（v0.4，决策 0006）

页面按云优先写：云上放声片、回声、照片、落款、举报与审核；本机只放发件箱和"对我隐藏"。云不通时话先显示"待发出"，连上自动发；被服务端拒绝的显示"被退回"并写明原因。接口契约在 `public/kesheng/src/web/contract.js`，客户端是 `cloud.js`、`community.js`，发件箱是 `outbox.js`。

**现在没有真后端。** `scripts/dev-cloud.mjs` 是开发用云模拟器，实现同一份契约，数据在内存里，`npm run dev` 与 `npm run preview`（也包括 `npm run e2e`）自带 `/api`；`KS_REVIEW=1 npm run dev` 让照片先审后显。它能验证"A 留的话，B 看得到"（冒烟里用两个独立的浏览器环境），不能验证 CloudBase。构建出来的静态文件里没有它：部署到哪里，`/api` 就要指到哪里的云；指不到时页面不报错，话留在发件箱里。

| 做了什么 | 在哪里 |
|---|---|
| 回声可以配一张照片：设备上缩小并重新编码（去掉定位信息），勾选同意才能发，先审后显 | `photo.js`、`plan3d.js` 的回声表单 |
| 针走到那一秒，照片像相纸一样显影；地点页一条"这里的照片"印样；有审核通过的社区照片时，套子换成最新一张 | `plan3d.js` 的 `paintNow`、`stripInner`、`coverHTML` |
| 服务端重做文字校验、限频、JPEG 检查与去 EXIF；举报满三个不同的人先收起 | `scripts/dev-cloud.mjs`、`jpeg-clean.js`，`npm run check:cloud` 44 项 |

## 原来的六个板块

整站的颜色跟着"一天中的时刻"走。此刻页是大号的此刻，下面是一条"一天轨道"，拖一下，天色在清晨、白天、傍晚、夜里之间连续变化，地图上此刻前后能听到的声音点跟着亮起来。六个板块：

| 板块 | 路径 | 里面有什么 |
|---|---|---|
| 此刻 | `/now` | 此刻、一句话立意、一天轨道、此刻最近的一段声音、三个入口（原来的首页） |
| 地图 | `/map` | 校园示意图、声音点、轨道、按心情筛选、声片卡 |
| 留声 | `/record` | 四步：地点、声音（麦克风或示例）、心情和一句话、留下 |
| 回应 | `/topics` | 预置话题、原声、回应、写回应 |
| 时间 | `/time` | 一天里的声音分布、各分区的声音、校史史料、按学期对比（即将开放） |
| 关于 | `/about` | 数据口径、隐私、素材来源、清除自己留下的内容、仓库入口 |

## 社区层（v0.2）

声音仍是线索，社区做在声片卡下面。定位和取舍的依据见 [社区定位与取舍.md](社区定位与取舍.md)。

| 做了什么 | 在哪里 |
|---|---|
| 落款：年级（含更早、校友、教职工）、学院、名字（昵称或真名），三项都可以不填。别人看到的是"2024 级，计算机学院，阿川" | `components/SignGate.vue`，说话之前才会问，也可以选"不落款，直接说" |
| 同听：声片卡上显示"N 人听过"和"2022 级到 2025 级的人都听过"，点"我也听过"加入 | `components/CardSocial.vue`，`lib/store.js` 的 `heardInfo`、`toggleHeard` |
| 回声：把一句话钉在声音的某一秒，波形上有标记，播放到那一秒时它亮起来 | `CardSocial.vue`、`Wave.vue` 的 `marks` |
| 一句话规则：最多 40 或 60 字，拦截链接、连续 7 位以上数字、"加我""私信我"之类 | `lib/rules.js` |
| 举报：点一下先对自己隐藏，后端接上后应进审核队列 | `store.js` 的 `reportItem` |

"N 人听过"的数字和现有的回声都是示例（带"示例"标记），不是真实的人说的。

## 目录

```
src/
  data/      声音、话题、校园分区、史料、学期、社区（落款、示例回声）、学院名单（唯一数据源）
  lib/       store（数据层）audio（播放器）synth（示例声音合成）sky（天色）rules（一句话规则）clock time toast
  components/ DayTrack CampusMap SoundCard PlayButton Wave CardSocial SignGate
  views/     StageView（首页，嵌入留声机）加原来的六个页面和 404
scripts/     check-sounds  check-contrast  check-echoes  e2e/（走查）
             make-echo-seed（生成示例回声）make-sleeve-photos（给 16 个地点拍模型照）subset-plan-font.py（补字）
public/kesheng/  刻声的副本加上面三样新增，见"首页是留声机"
public/audio/archive/  7 段校史史料（十秒片段）
```

## 接后端时改哪里

只改 `src/lib/store.js`。现在它读种子数据加这台设备的 localStorage；函数形状（`createSound`、`createReply`、`removeMine`、`allSounds`）按后端接口写，选定后端后把函数体换成 fetch，页面不用动。localStorage 只是占位，别人看不到你留的声音，所以不算"长期存储"，验收 A4 要等后端。

## 已知的缺口

- 社区层目前只在这一台设备上成立：别人留的回声你看不到，"N 人听过"里的真实增量只有你自己那 1 个。要变成真正的社区，必须接后端。
- 落款是自己填的，没有任何验证（组长 2026-11-23 定先不验证）。前端的链接和号码拦截可以被绕过，后端接上后要在服务端再校验一遍，并建审核队列。
- 留声机里的 231 张概念盘和首页之外的 8 段声音全是示例：浏览器合成，不是真实录音。两份声音数据（刻声的概念盘、Vue 外壳的 `SEED_SOUNDS`）还没有合并，回声层目前只接在留声机这一份上。真实录音到位后，在 `src/data/sounds.js` 给条目加 `src`、`demo` 改成 `false`。
- 校园图是分区示意，不是测绘。底图方案没定，换底图只改 `src/data/campus.js` 和 `CampusMap.vue`。
- 麦克风录音存成 data URL 放进 localStorage，限 700 KB；只在本机，换设备看不到。
- 没有在 iPhone Safari 上真机测过，示例声音的合成在 Safari 上的表现未验证。
- 没有读屏器实测，只做了语义和键盘走查。
- 校史史料的出处链接指向 B 站，链接没有逐条点开核对过。
- 唱片套子的照片是纸模型照，不是实景。团队实拍到位前，每张套子的角标都写"模型照"。
- 盘面回声针和回声带的画面只在无头 Chrome（软件渲染）里看过，手机真机上的帧率没测。
- 留声机在 iframe 里：同源，落款和回声共用同一个 `localStorage`；iframe 的无障碍标题写了，读屏器没实测。
