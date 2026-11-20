# 混搭实验脚本

这些脚本支撑《混搭创意补充》里的数字。所有实验都是玩具模型,参数由 ClawsGO Science Agent 设定,没有使用真实数据。编号 E1 至 E21 对应文档附录 A。

## 环境

- Python 3.13:numpy、scipy、networkx(`pip install numpy scipy networkx`)
- Node 26:E15 到 E18 需要 `npm i pinyin-pro to-jyutping tlock-js`
- E17(`tl/t.mjs`)要访问 drand 公共网络,国内网络可能超时
- E18(`rh/corpus.mjs`)要先下载 `chinese-poetry` 的 `poet.tang.1000.json` 并命名为 `tang.json`,放在 `rh/` 里

## 运行

每个脚本单独运行,直接打印结果,例如 `python herd_robust.py`。

- `swap_small.py` 会读取同目录的 `swap_caps.py` 里的函数,两个文件要放在一起
- `evac.py` 单种设置约 4 分钟,全部跑完约 20 分钟
- `cite_eval.js` 依赖 `cite_match.js`,会向 Crossref 发请求,请把里面的 `MAIL` 改成你自己的邮箱
- `cite_check.py` 是引用核验的第一版,结果已被 `cite_eval.js` 取代,保留是为了留痕

## 已知局限

- 引用核验的匹配规则看过第一轮结果后改过,没有留出独立测试集
- 选课抽签沙盘的规则(100 分权重、加权无放回抽签)是按二手说法设的假设
- 部分脚本的随机种子固定,换种子数字会略有浮动
- `herd_sim.py` 用 300 个种子,`herd_robust.py` 用 200 个,两者数字略有差别(朴素推荐、滞后 5 分钟、人人采用:平均等待 7.58 与 7.62)。文档卡片和图 1 引用的是 `herd_robust.py`
- 联网类脚本(`cite_*`、`doi_swap.py`、`pkg_eval.js`、`tl/`、`rh/`)的结果取决于当天的接口响应,不保证复现

## 复核记录

2026-11-21 把脚本复制到干净的临时目录,重跑了 26 个纯本地 Python 脚本(全部 29 个 Python 脚本里除 `evac.py`、`cite_check.py`、`doi_swap.py` 以外的),输出与文档引用的主要数字一致。没有重跑的是 `evac.py`(单次约 4 分钟,全部约 20 分钟)和需要联网或 npm 包的脚本。
