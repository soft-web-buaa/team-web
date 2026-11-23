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
```

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

## 目录

```
src/
  data/      声音、话题、校园分区、史料、学期（唯一数据源）
  lib/       store（数据层）audio（播放器）synth（示例声音合成）sky（天色）clock time toast
  components/ DayTrack CampusMap SoundCard PlayButton Wave
  views/     六个页面加 404
scripts/     check-sounds  check-contrast
public/audio/archive/  7 段校史史料（十秒片段）
```

## 接后端时改哪里

只改 `src/lib/store.js`。现在它读种子数据加这台设备的 localStorage；函数形状（`createSound`、`createReply`、`removeMine`、`allSounds`）按后端接口写，选定后端后把函数体换成 fetch，页面不用动。localStorage 只是占位，别人看不到你留的声音，所以不算"长期存储"，验收 A4 要等后端。

## 已知的缺口

- 8 段声音全是示例：浏览器合成，不是真实录音。真实录音到位后，在 `src/data/sounds.js` 给条目加 `src`、`demo` 改成 `false`。
- 校园图是分区示意，不是测绘。底图方案没定，换底图只改 `src/data/campus.js` 和 `CampusMap.vue`。
- 麦克风录音存成 data URL 放进 localStorage，限 700 KB；只在本机，换设备看不到。
- 没有在 iPhone Safari 上真机测过，示例声音的合成在 Safari 上的表现未验证。
- 没有读屏器实测，只做了语义和键盘走查。
- 校史史料的出处链接指向 B 站，链接没有逐条点开核对过。
