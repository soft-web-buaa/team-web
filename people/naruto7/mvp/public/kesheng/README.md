# 刻声（嵌入的副本）

这个目录是组长的个人作品「刻声：北航的十秒声片柜」的一份副本，随听见校园一起部署。

- 来源：私有仓库 naruto7/kesheng，提交 `94665936dec584183a60b08c29a9f341e6a29cdd`（2026-10-28）。
- 拷贝范围：`app/kesheng/src/` 下的 `web/`、`dsp/`、`worklets/`，共 120 个文件，约 9.8 MB。其中 `web/archive/audio/` 是 41 段史料音频。
- 第一次提交是原样导入，没有改动任何一个字节。之后的适配改动是单独的提交，用 `git log -- people/naruto7/mvp/public/kesheng` 可以逐条看到改了什么。
- 刻声原仓库没有被改动，只读取过。

## 怎么核对"原样"

```bash
gh repo clone naruto7/kesheng <某个目录> -- --depth 1
node scripts/verify-kesheng-import.mjs <某个目录>
```

脚本按 git 对象（blob）哈希逐文件比较导入提交与刻声源码。2026-11-24 的结果：120 个文件，哈希全部一致。

导入时踩过一个坑：在 Windows 上克隆刻声会因为 `core.autocrlf=true` 把换行转成 CRLF，直接复制工作区文件会得到 73 个哈希不同的文件。去掉回车符后内容一致，所以只是换行差异。现在的副本按 git 对象的原始字节写入，所以比较对象是 blob，不是工作区。

## 入口

- `kesheng/src/web/plan3d/index.html`：学院路馆藏分区图，三维留声机。
- `kesheng/src/web/index.html`：单张声片的刻盘、搓盘、测房间、寻片。

两处数据目前和听见校园自己的声音、社区数据是分开的。统一数据层是后续工作，见 `docs/decisions/`。

第三方代码的许可证在 `src/web/vendor/` 里：three.js 的 `LICENSE.txt`，fflate 的 `fflate.LICENSE.txt`。
