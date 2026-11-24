# 听见校园（重做版）

组长 naruto7 的重做。以刻声为资产，从头搭：屏风 → 留声机，四个板块（留声机 · 社区 · 年轮 · 我的），全站颜色跟着钟点走。设计规则在 [DESIGN.md](DESIGN.md)，先读它。整理：ClawsGO Science Agent，2026-11-24。

## 跑起来

最省事：双击 `启动.cmd`（或仓库外面的 `E:\走软小组\听见校园-双击启动.cmd`），浏览器会自己打开 http://127.0.0.1:8790/?screen=1 。黑窗口别关，关了网页就停。

```bash
cd people/naruto7/tingjian
npm install
npm run dev              # http://127.0.0.1:5273 ，自带 /api（本机文件存储，数据在 .data/）
npm run build
npm run serve            # 构建好的页面 + /api，http://127.0.0.1:8790 ；加 --host 0.0.0.0 给局域网里的手机扫
```

演示时固定钟点：网址加 `?h=18.5`；强制出现屏风：加 `?screen=1`；画质：`?q=lite` 省电档、`?q=full` 全开。

## 检查

| 命令 | 查什么 | 2026-11-24 的结果 |
|---|---|---|
| `npm run check:api` | 接口的规矩：校验、限频、心事盘与时间胶囊的过滤、照片先审后显与去 EXIF、举报收起、真删、云函数的请求转换 | 73 项通过（含社区 30 项） |
| `npm run check:contrast` | 全天按 0.05 小时一步扫：正文 ≥ 7:1、次级 ≥ 4.5:1、细线 ≥ 3:1 | 最低 7.01 / 4.60 / 3.00 |
| `npm run e2e` | 浏览器主路径：屏风、进楼、社区光柱、拖时针变色、假麦克风刻一张、钉一句、另一个浏览器环境看得到、真删、手机宽度 | 44 项通过（含社区 10 项），控制台与网络问题 0 |
| `node scripts/shots.mjs` | 11 张截图（5 个钟点、5 个板块、手机），在 `.e2e/shots/` | 控制台与网络问题 0 |

都只在这台 Windows 的无头 Chrome（软件渲染，一秒两三帧）和 Node 26 上跑过。真机帧率、iPhone Safari、读屏器没测。

## 目录

| 路径 | 是什么 |
|---|---|
| `src/stage/scene.js` | 三维唱机的「搭」：唱片、刻纹、唱臂、卡纸校园（移植自刻声 plan3d.js），加上可提起的地点楼和社区光柱 |
| `src/stage/stage.js` | 三维唱机的「演」：钟点光照、机位与过场预算、楼的提起落回、光柱、搓盘、刻 |
| `src/lib/clock.js` | 钟点：全站唯一的颜色来源 |
| `src/lib/library.js` | 馆藏：三层素材、云上的盘与回声、发件箱、校史时间线（每条带出处） |
| `src/components/Screen.vue` | 屏风 |
| `src/views/` | 四个板块 + 地点 + 关于 |
| `server/api.mjs` | 接口：一份代码，两种存储（`store-file.mjs` 本机、`store-cloudbase.mjs` 云） |
| `cloudfunctions/api/` | CloudBase HTTP 云函数的入口 |
| `src/kesheng/` | 从刻声原样拷来的纯函数（刻纹、素材分层、学期、灯光、季节、身份、契约） |

## 上云（CloudBase）

1. 在 `.env` 填 `TCB_ENV_ID`、`TCB_SECRET_ID`、`TCB_SECRET_KEY`（照 `.env.example`；`.env` 不进仓库）。
2. 控制台开通「文档型数据库」；集合由部署脚本建（discs、echoes、photos、heard、favs、reports、posts、replies、reacts、topics、relays）。子用户要有云开发、云函数、对象存储三项权限。
3. `npm run build && npm run deploy:cloudbase`：页面进静态托管，接口进云函数 `api`，挂在同域 `/api`。
4. 云函数的环境变量设 `KS_ADMIN_TOKEN`（审核口令），照片才有人放行。

**状态（2026-11-24 晚）：** 云函数 `api` 已部署，`/api/health` 从外网返回 `store: cloudbase`。数据库未开通，所以读写还没在云上验证过；页面没传上去（子用户缺对象存储权限）。

## 已知缺口

- 限频记在云函数实例的内存里：多实例时各算各的。课程规模够用。
- 页面每 30 秒取一次 `/discs`、`/feed`、`/me`，每次在服务端是十来次数据库读。答辩现场人多时要算资源点，可以把间隔调长。
- 真实录音 0 段。231 张示意盘和 41 段史料撑着画面；人数只数真实的。
- 照片审核没有界面，只有接口（`/api/admin/...`）。
- 手机上的三维走的是同一套场景，省电档；没有在真机上量过帧率。
