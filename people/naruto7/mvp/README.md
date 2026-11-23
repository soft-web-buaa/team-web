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
npm run e2e              # 构建、起预览服务、跑 54 项浏览器走查，退出码 0 才算过
npm run e2e:kesheng      # 刻声副本冒烟（刻声副本合并进来之后才有东西可测，没有就打印"跳过"）
```

`e2e` 用本机的 Chrome 或 Edge（`puppeteer-core` 不自带浏览器）。找不到时用环境变量 `CHROME_PATH` 指定可执行文件。截图在 `.e2e-shots/`，已被 `.gitignore` 忽略。2026-11-24 的结果：54 项通过，控制台与网络问题 0。

本机 Node 26 上验证过。仓库规定的是 Node 24 LTS，没有在 24 上跑过。

演示时想把天色固定在某个钟点：网址后面加 `?h=7.5`（清晨 7:30）、`?h=18.3`（傍晚）、`?h=22`（夜里）。

## 它是什么

整站的颜色跟着"一天中的时刻"走。首页是大号的此刻，下面是一条"一天轨道"，拖一下，天色在清晨、白天、傍晚、夜里之间连续变化，地图上此刻前后能听到的声音点跟着亮起来。六个板块：

| 板块 | 路径 | 里面有什么 |
|---|---|---|
| 首页 | `/` | 此刻、一句话立意、一天轨道、此刻最近的一段声音、三个入口 |
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
  views/     六个页面加 404
scripts/     check-sounds  check-contrast  e2e/（走查）
public/audio/archive/  7 段校史史料（十秒片段）
```

## 接后端时改哪里

只改 `src/lib/store.js`。现在它读种子数据加这台设备的 localStorage；函数形状（`createSound`、`createReply`、`removeMine`、`allSounds`）按后端接口写，选定后端后把函数体换成 fetch，页面不用动。localStorage 只是占位，别人看不到你留的声音，所以不算"长期存储"，验收 A4 要等后端。

## 已知的缺口

- 社区层目前只在这一台设备上成立：别人留的回声你看不到，"N 人听过"里的真实增量只有你自己那 1 个。要变成真正的社区，必须接后端。
- 落款是自己填的，没有任何验证（组长 2026-11-23 定先不验证）。前端的链接和号码拦截可以被绕过，后端接上后要在服务端再校验一遍，并建审核队列。
- 8 段声音全是示例：浏览器合成，不是真实录音。真实录音到位后，在 `src/data/sounds.js` 给条目加 `src`、`demo` 改成 `false`。
- 校园图是分区示意，不是测绘。底图方案没定，换底图只改 `src/data/campus.js` 和 `CampusMap.vue`。
- 麦克风录音存成 data URL 放进 localStorage，限 700 KB；只在本机，换设备看不到。
- 没有在 iPhone Safari 上真机测过，示例声音的合成在 Safari 上的表现未验证。
- 没有读屏器实测，只做了语义和键盘走查。
- 校史史料的出处链接指向 B 站，链接没有逐条点开核对过。
