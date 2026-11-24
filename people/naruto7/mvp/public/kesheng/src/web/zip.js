// 刻声 · ZIP 适配层（背后是 vendored fflate 0.8.2）
// 为什么不自己写：馆藏后期收的是**别人用别的工具打出来的 zip**（macOS 归档工具、Windows、
// 不同投稿人），自写解析只覆盖 store/deflate-raw，遇 ZIP64/加密/分卷就废；馆员侧要跑 Node，
// fflate 在浏览器与 Node 是同一套 API。代价是 vendor 一个文件（89KB，gzip 21.7KB），
// 因此这里用**动态 import**：不点导出/导入就不加载，不进首屏关键路径。
// 版本与哈希：fflate@0.8.2，src/web/vendor/fflate.js 的 sha256 = 8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7
// 升级时：npm i -D --save-exact fflate@x.y.z → cp node_modules/fflate/esm/browser.js src/web/vendor/fflate.js → 重算哈希。

let modPromise = null;
function lib() {
  if (!modPromise) modPromise = import('./vendor/fflate.js');
  return modPromise;
}

/**
 * files: [{ name: string, data: Uint8Array }] → Uint8Array
 * 只存不压（WAV 压不动，压了反而慢）；需要压缩时传 { level }。
 */
export async function makeZip(files, opts = { level: 0 }) {
  const { zipSync } = await lib();
  const input = {};
  for (const f of files) input[f.name] = f.data;
  return zipSync(input, opts);
}

/** Uint8Array → Map<name, Uint8Array>（支持 store 与 deflate，覆盖常见压缩工具） */
export async function readZip(bytes) {
  const { unzipSync } = await lib();
  let out;
  try {
    out = unzipSync(bytes);
  } catch (err) {
    throw new Error(`这个 zip 读不出来：${(err && err.message) || err}`);
  }
  return new Map(Object.entries(out));
}
