// 刻声 · 示例柜的声纹库（构建期预计算，页面懒加载）。
// 为什么预计算：231 张概念盘现场合成 + 提峰要 55 秒（云端 Node 实测），页面上等不起；存峰值星座（不存哈希）约 1 MB，
// 加载后用 fingerprint.js 的 hashes() 重建索引（约 0.8 秒），结果与「现场合成 → constellation → hashes」逐位相同（单测 test/unit/shelf.test.js）。
// 只收概念盘（tier synthetic）：SPEC-DIGEST-1 §2 允许它进演示检索；史料与真实盘都不进这个库。
// 文件：derived/shelf-v1.json（盘号、每张峰数、FP 参数、demo-catalog.json 的 sha256）+ derived/shelf-v1.bin（先全部 t、再全部 f，Int16 小端）。
import { FP, hashes, FingerprintIndex } from '../../dsp/fingerprint.js';

export const SHELF_V = 1;

/** [{id, peaks:[[t,f]...]}] → { meta, bin }。t / f 必须在 Int16 范围内，否则抛错（不静默截断）。 */
export function encodeShelf(list, extra = {}) {
  const n = list.reduce((s, d) => s + d.peaks.length, 0);
  const t = new Int16Array(n), f = new Int16Array(n);
  let k = 0;
  for (const d of list) for (const [a, b] of d.peaks) {
    if (a < -32768 || a > 32767 || b < -32768 || b > 32767) throw new Error(`${d.id}: 峰值 (${a}, ${b}) 超出 Int16`);
    t[k] = a; f[k] = b; k++;
  }
  const bin = new Uint8Array(n * 4);
  bin.set(new Uint8Array(t.buffer), 0);
  bin.set(new Uint8Array(f.buffer), n * 2);
  return { meta: { v: SHELF_V, fp: { ...FP }, ids: list.map((d) => d.id), counts: list.map((d) => d.peaks.length), ...extra }, bin };
}

/** { meta, bin } → [{id, peaks}]。FP 参数对不上就拒绝（换了参数的旧库算出来的哈希是另一套）。 */
export function decodeShelf(meta, bin) {
  if (!meta || meta.v !== SHELF_V) throw new Error('声纹库版本不对');
  for (const [k, v] of Object.entries(FP)) if (meta.fp[k] !== v) throw new Error(`声纹库的指纹参数 ${k} = ${meta.fp[k]}，页面是 ${v}：重新跑 node tools/derive-shelf.mjs`);
  const u8 = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
  const n = meta.counts.reduce((s, c) => s + c, 0);
  if (u8.byteLength !== n * 4) throw new Error(`声纹库长度 ${u8.byteLength} B，应为 ${n * 4} B`);
  const al = new Uint8Array(u8); // 拷一份保证 2 字节对齐
  const t = new Int16Array(al.buffer, 0, n), f = new Int16Array(al.buffer, n * 2, n);
  const out = [];
  let k = 0;
  meta.ids.forEach((id, i) => {
    const peaks = new Array(meta.counts[i]);
    for (let j = 0; j < peaks.length; j++, k++) peaks[j] = [t[k], f[k]];
    out.push({ id, peaks });
  });
  return out;
}

/** 解码后的库 → FingerprintIndex（与逐张 add(hashes(constellation(...))) 等价）。 */
export function indexShelf(list) {
  const idx = new FingerprintIndex();
  for (const d of list) idx.add(d.id, hashes(d.peaks));
  return idx;
}

/**
 * 一张盘的「错开多少帧 → 对上几处」曲线，计分口径与 FingerprintIndex.query 逐项相同（同一偏移上不同哈希数，并上 ±1 帧）。
 * 曲线最高点 = query 给这张盘的 score，位置 = offsetFrames（单测核对）。只给页面画图用，不参与判定。
 * 返回按 step 帧分桶后每桶的最大值：{ from, step, bins: number[] }。
 */
export function offsetCurve(index, prints, id, { step = 10 } = {}) {
  const m = new Map();
  for (const [h, tq] of prints) {
    const arr = index.map.get(h);
    if (!arr) continue;
    for (let i = 0; i < arr.length; i += 2) {
      if (arr[i] !== id) continue;
      const off = arr[i + 1] - tq;
      let set = m.get(off);
      if (!set) m.set(off, (set = new Set()));
      set.add(h);
    }
  }
  if (!m.size) return { from: 0, step, bins: [], best: 0, bestOff: 0 };
  let lo = Infinity, hi = -Infinity, best = 0, bestOff = 0;
  const score = new Map();
  for (const [off, set] of m) {
    let s = set.size;
    for (const nb of [off - 1, off + 1]) { const o = m.get(nb); if (o) for (const h of o) if (!set.has(h)) s++; }
    score.set(off, s);
    if (s > best) { best = s; bestOff = off; }
    lo = Math.min(lo, off); hi = Math.max(hi, off);
  }
  const from = Math.floor(lo / step) * step;
  const bins = new Array(Math.floor((hi - from) / step) + 1).fill(0);
  for (const [off, s] of score) { const b = Math.floor((off - from) / step); if (s > bins[b]) bins[b] = s; }
  return { from, step, bins, best, bestOff };
}
