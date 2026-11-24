# NOTICE · 许可与素材边界

这个网站是「刻声 · 十秒声片柜」（北航《软件工程》课程项目，© 2026 naruto7）三维校园的**独立抽取版**：只保留校园模型，不含任何与声音有关的素材、数据或功能。

## 1. 许可

| 内容 | 位置 | 许可 |
|---|---|---|
| 本项目的代码（页面、三维场景、地面波纹、服务器、截图工具） | `index.html` `styles.css` `serve.mjs` `src/*.js` `tools/*.mjs` | MIT（见 [LICENSE](LICENSE)） |
| 从「刻声」搬来的代码 | `src/model.js` `src/light-rig.js` `src/campus-scene.js` 的校园部分 | MIT，© 2026 naruto7 |
| 预渲染总览图 | `src/assets/poster-wide.jpg` `src/assets/poster-portrait.jpg` | 本项目三维场景的渲染结果，随代码同许可 |
| 校园数据 `src/data/campus-xy.json` | 派生自 OpenStreetMap 数据 | **ODbL 1.0** |
| Three.js 及 addons | `src/vendor/three/` | MIT，© 2010-2025 three.js authors（见 `src/vendor/three/LICENSE.txt`） |
| 朱雀仿宋 Zhuque Fangsong v0.212 | `src/assets/ks-fangsong-plan.woff2` | SIL Open Font License 1.1（原项目按页面用字子集化） |

## 2. 数据出处

`src/data/campus-xy.json` 的校园轮廓、楼的位置与高度，来自原项目由 OpenStreetMap 数据（`tools/data-src/mrroam-campus.geojson`）整理的校园平面；楼体高度为作者估算，参考 [MrRoam/buaa-xueyuan-campus-3d](https://github.com/MrRoam/buaa-xueyuan-campus-3d)，**不是测绘结果**。项目自绘的部分（分区归属、示意化的道路/绿地/球场/树木/路灯/单车/长椅、体育馆与游泳馆的造型）同样属于示意。

- 地图数据 © OpenStreetMap contributors，ODbL 1.0：<https://www.openstreetmap.org/copyright>
- 使用这些数据时请保留上述署名；如再分发数据库或其衍生数据库，请以 ODbL 1.0 提供。

## 3. 本仓不含的东西

- 原项目的 41 段史料音频、成片视频、上台 PPTX 等，从未包含在这里（原项目公开版也不含）。
- 原项目的外圈学期刻纹、唱盘与唱臂几何、声片与馆藏条目、录音/播放/寻片功能——它们和声音绑定，没有搬过来。
- 地面波纹是本项目新加的（一块实时计算的二维波场，没有用别人的贴图或音频），不属于原项目素材。

## 4. 免责

楼与分区是示意，不按测绘比例，不用于导航。本作品按「现状」提供，不作任何明示或默示担保。

