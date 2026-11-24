// 刻声 · 听声寻片：Wang (2003) 式地标哈希。
// 峰值星座 → 锚点与目标区里的峰配对 → hash(f1, f2, Δt) → 查询时按“时间偏移差”直方图投票。
// 频率按 Hz 量化（不按 bin），所以 44.1k 录的盘能被 48k 的麦克风认出来；时间单位是 STFT 帧（10 ms）。

export const FP = Object.freeze({
  fMin: 250,        // Hz：低于此的多是风噪和电源嗡声
  fMax: 5000,       // Hz：笔记本麦克风与手机外放的可靠上限
  fQuantHz: 23.4375, // 频率量化步长（= 48k/2048 的 bin 宽）
  bandsPerFrame: 18, // 每帧在对数频带里各取一个候选峰（v2：6 → 18，TAU 真机开发集扫参选定，见 docs/FIND-v2.md）
  peakTimeRadius: 3, // 帧：峰值需在 ±3 帧内是该频带的最大
  peakMinDb: 10,     // 相对该帧中位数至少高 10 dB
  fanOut: 10,        // 每个锚点配对的目标峰数
  dtMin: 2, dtMax: 63, // 帧
  dfMax: 64,         // 量化频率单位
});

// —— v2 判定口径（docs/FIND-v2.md §2）——
// 零分布：TAU Urban Acoustic Scenes 2020 Mobile 开发城市（6 城），154 张 A 设备盘 × 1281 条 B/C/A 查询，
// 只取「查询与盘不同地点」的 196377 个盘-查询对的分数，按判读时长分开，尾部拟合 log10 P(S ≥ x) = a + b·x。
// 拟合：eval/e1_null.py → eval/out/fp_null_fit.json（sha256 00c830e7…）；超范围加分：eval/e1_cov.py → fp_null_cov.json。
// 这些常数只在开发城市上定过，测试城市（4 城）只跑了一次，结果见 docs/FIND-v2.md §2.3。北航 S1+S2 到手后复标。
export const NULL_FIT = Object.freeze({
  looks: [3, 4.5, 6, 8],                       // 秒：边听边判的四个判读点
  a: [4.5009, 5.1774, 5.4441, 5.3783],
  b: [-0.22938, -0.20763, -0.18602, -0.15908],
  // 「查询哈希数 × 盘哈希数」超出开发集最大值时（log2(乘积/中位) > zMax），每超一倍门槛加 beta 分。
  // 开发集范围内不加分，所以和评测时的规则完全一致；范围外是外推，防的是满是宽带噪声、哈希特别多的「吸铁石盘」。
  medProduct: [8.441e7, 1.2707e8, 1.6978e8, 2.2608e8],
  zMax: [0.4316, 0.4007, 0.3878, 0.3969],
  beta: [9.35, 11.49, 14.93, 16.29],
});

function lookIndex(seconds) {
  const L = NULL_FIT.looks;
  for (let i = 0; i < L.length; i++) if (seconds <= L[i] + 0.05) return i;
  return L.length - 1; // 超过 8 s 没有标定；页面最多听 8 s
}

/**
 * 回放层门槛 t(L, N)：柜里 N 张盘、查询长 seconds 秒、一共判读 nLooks 次时，
 * 使「随便一段不相干的声音被认成某张盘」的概率 ≤ alpha（按盘数和判读次数做 Bonferroni）。
 */
export function replayThreshold(seconds, N, { alpha = 0.01, nLooks = 1 } = {}) {
  const i = lookIndex(seconds);
  return Math.ceil((Math.log10(alpha / nLooks / Math.max(1, N)) - NULL_FIT.a[i]) / NULL_FIT.b[i]);
}

/** 超出开发集范围的加分（开发集范围内为 0）。nq = 查询哈希数，nd = 盘的哈希数。 */
export function productPenalty(seconds, nq, nd) {
  const i = lookIndex(seconds);
  const z = Math.log2(Math.max(1, nq * nd) / NULL_FIT.medProduct[i]);
  return z > NULL_FIT.zMax[i] ? Math.ceil(NULL_FIT.beta[i] * (z - NULL_FIT.zMax[i])) : 0;
}

/** 从功率谱帧序列提取峰值星座：[[frame, fq], ...]，fq 为量化频率。 */
export function constellation(frames, sampleRate, fftSize, p = FP) {
  const binHz = sampleRate / fftSize;
  const nb = p.bandsPerFrame;
  const edges = [];
  for (let b = 0; b <= nb; b++) edges.push(p.fMin * Math.pow(p.fMax / p.fMin, b / nb));
  const binRanges = [];
  for (let b = 0; b < nb; b++) binRanges.push([Math.max(1, Math.floor(edges[b] / binHz)), Math.min(fftSize / 2, Math.ceil(edges[b + 1] / binHz))]);

  // 每帧每个频带的最大值（dB）与位置
  const T = frames.length;
  const bandMax = new Float32Array(T * nb);
  const bandArg = new Int32Array(T * nb);
  const frameMed = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    const f = frames[t];
    const lo = binRanges[0][0], hi = binRanges[nb - 1][1];
    const vals = [];
    for (let k = lo; k < hi; k += 4) vals.push(f[k]);
    vals.sort((a, b) => a - b);
    frameMed[t] = 10 * Math.log10((vals[vals.length >> 1] || 0) + 1e-20);
    for (let b = 0; b < nb; b++) {
      const [l, h] = binRanges[b];
      let m = -1, a = l;
      for (let k = l; k < h; k++) if (f[k] > m) { m = f[k]; a = k; }
      bandMax[t * nb + b] = 10 * Math.log10(m + 1e-20);
      bandArg[t * nb + b] = a;
    }
  }
  const peaks = [];
  const R = p.peakTimeRadius;
  for (let t = 0; t < T; t++) {
    for (let b = 0; b < nb; b++) {
      const v = bandMax[t * nb + b];
      if (v - frameMed[t] < p.peakMinDb) continue;
      let isMax = true;
      for (let u = Math.max(0, t - R); u <= Math.min(T - 1, t + R) && isMax; u++) {
        if (u !== t && bandMax[u * nb + b] > v) isMax = false;
      }
      if (!isMax) continue;
      // 抛物线插值求更准的频率，再量化
      const k = bandArg[t * nb + b];
      const f = frames[t];
      let kk = k;
      if (k > 0 && k < f.length - 1) {
        const a = Math.log(f[k - 1] + 1e-20), c = Math.log(f[k] + 1e-20), d = Math.log(f[k + 1] + 1e-20);
        const den = a - 2 * c + d;
        if (den < 0) kk = k + (0.5 * (a - d)) / den;
      }
      peaks.push([t, Math.round((kk * binHz) / p.fQuantHz)]);
    }
  }
  return peaks;
}

/** 峰对 → 哈希。返回 [[hash, t1], ...]。hash = f1(9 bit) | f2(9 bit) | Δt(6 bit)。 */
export function hashes(peaks, p = FP) {
  const out = [];
  for (let i = 0; i < peaks.length; i++) {
    const [t1, f1] = peaks[i];
    let n = 0;
    for (let j = i + 1; j < peaks.length && n < p.fanOut; j++) {
      const [t2, f2] = peaks[j];
      const dt = t2 - t1;
      if (dt < p.dtMin) continue;
      if (dt > p.dtMax) break;
      if (Math.abs(f2 - f1) > p.dfMax) continue;
      out.push([((f1 & 511) << 15) | ((f2 & 511) << 6) | (dt & 63), t1]);
      n++;
    }
  }
  return out;
}

/** 从功率谱帧直接生成指纹（刻盘时与刻纹共用同一份 STFT）。 */
export function fingerprintFrames(frames, sampleRate, fftSize, p = FP) {
  return hashes(constellation(frames, sampleRate, fftSize, p), p);
}

/** 内存索引：hash → [[discId, t]...]。可从 IndexedDB 里每张盘的指纹重建。 */
export class FingerprintIndex {
  constructor() { this.map = new Map(); this.sizes = new Map(); }
  add(discId, prints) {
    for (const [h, t] of prints) {
      let arr = this.map.get(h);
      if (!arr) this.map.set(h, (arr = []));
      arr.push(discId, t);
    }
    this.sizes.set(discId, prints.length);
  }
  remove(discId) {
    for (const [h, arr] of this.map) {
      const keep = [];
      for (let i = 0; i < arr.length; i += 2) if (arr[i] !== discId) keep.push(arr[i], arr[i + 1]);
      if (keep.length) this.map.set(h, keep); else this.map.delete(h);
    }
    this.sizes.delete(discId);
  }
  /**
   * 查询：对每张盘做偏移直方图，分数 = 最高偏移格（并上 ±1 帧）里对齐的不同哈希数。
   * 判定命中（v2，docs/FIND-v2.md §2）：top ≥ t(seconds, N) + 超范围加分，且 top ≥ ratio × 第二名（不同盘），ratio = 1.5。
   * seconds 是这段查询的时长；边听边判时传 nLooks = 4，总误认预算 alpha 在 4 次判读之间平分。
   * 传 minScore 就退回固定门槛（只给离线评测脚本用，例如 minScore: 1e9 表示只要分数）。
   */
  query(prints, { seconds, nLooks = 1, alpha = 0.01, ratio = 1.5, minScore } = {}) {
    // 计分口径：同一 (盘, 偏移) 上“对齐的不同哈希值”个数。重复的同一哈希（风机、电流声这类稳态声）只算一次，
    // 否则稳态音会在很多偏移上同时堆分，造成误命中。相邻偏移（±1 帧）合并。
    const hist = new Map(); // discId → Map(offset → Set(hash))
    for (const [h, tq] of prints) {
      const arr = this.map.get(h);
      if (!arr) continue;
      for (let i = 0; i < arr.length; i += 2) {
        const id = arr[i], off = arr[i + 1] - tq;
        let m = hist.get(id);
        if (!m) hist.set(id, (m = new Map()));
        let set = m.get(off);
        if (!set) m.set(off, (set = new Set()));
        set.add(h);
      }
    }
    const ranked = [];
    for (const [id, m] of hist) {
      let best = 0, bestOff = 0;
      for (const [off, set] of m) {
        let s = set.size;
        for (const nb of [off - 1, off + 1]) {
          const o = m.get(nb);
          if (o) for (const h of o) if (!set.has(h)) s++;
        }
        if (s > best) { best = s; bestOff = off; }
      }
      ranked.push({ id, score: best, offsetFrames: bestOff });
    }
    ranked.sort((a, b) => b.score - a.score);
    const secs = seconds ?? estimateSeconds(prints);
    const top = ranked[0];
    const second = ranked[1] ? ranked[1].score : 0;
    const threshold = minScore ?? (replayThreshold(secs, this.sizes.size, { alpha, nLooks }) + (top ? productPenalty(secs, prints.length, this.sizes.get(top.id) || 0) : 0));
    const match = top && top.score >= threshold && top.score >= ratio * Math.max(second, 1) ? top : null;
    return { match, ranked: ranked.slice(0, 5), queryHashes: prints.length, threshold, seconds: secs, N: this.sizes.size };
  }
}

/** 没传时长时，用最后一个锚点的帧号估计（10 ms 一帧）。 */
function estimateSeconds(prints) {
  let m = 0;
  for (const [, t] of prints) if (t > m) m = t;
  return (m + 1) / 100;
}
