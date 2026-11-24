// 刻声 · 声场剖面（scene profile）——**候选生成器，不是定位器**。
//
// 它回答的问题只有一个：这段十秒"像柜里哪几处"，给出 2–3 个候选，**交给用户确认或填**。
// 它不回答：这是哪一处、坐标是多少、像不像某个具体建筑。
//
// 为什么用这套特征而不是 CLAP：CLAP 34.3 MB、要 onnxruntime、离线装不下（FIND-v2 §4.1 已写）。
// 手工 log-mel 统计在城市级 top-3 上是 0.769（CLAP 0.872），而这里要的正好是"候选"，不是"认出"。
//
// 口径（不许改，改了要重新标定）：
//   · 只用 24 条对数频带（80–8000 Hz）的**帧均值与帧标准差** + 谱质心 + 谱平坦度 + 过零率 + 电平；
//   · 静音帧（10 ms 块 RMS 低于阈值）不参与统计；
//   · 库内做 z-score（均值/方差来自底库本身，不跨库借用）；
//   · 输出一律是 `score`（余弦），不是概率，不是置信度。
//
// 与 tier.js 的关系：本模块**不判断来源**。调用方必须自己保证只拿 `real` 条目建库；
// 候选结果必须带 `placeFrom:'guess'`，用户确认后才可写 `'user'`。

import { stft, makeBandMapper } from './stft.js';

export const SCENE_DEFAULTS = Object.freeze({
  nBands: 24,
  fMin: 80,
  fMax: 8000,
  silenceDb: -60,   // 10 ms 帧低于这个就当静音，不参与统计
  minFrames: 40,    // 少于 0.4 秒的有效帧就拒绝出候选
});

/** 过零率（每秒），归一化到 1 kHz 尺度，避免不同采样率下数值漂移。 */
function zeroCrossRate(x, fs) {
  let n = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] >= 0) !== (x[i] >= 0)) n++;
  return (n / Math.max(1, x.length)) * fs / 1000;
}

/**
 * 一段声音（Float32Array，单声道）→ 剖面向量。
 * @returns {{v: Float32Array, frames: number, ok: boolean, reason?: string}}
 */
export function sceneProfile(x, fs, opts = {}) {
  const o = { ...SCENE_DEFAULTS, ...opts };
  if (!x || !x.length || !fs) return { v: null, frames: 0, ok: false, reason: '没有样本' };

  const { frames, fftSize } = stft(x, fs);
  const toBands = makeBandMapper(fs, fftSize, o.nBands, o.fMin, o.fMax);
  const band = new Float32Array(o.nBands);

  // 10 ms 一块的 RMS 门限：与 quality.js 的 gate 同一口径（−60 dB 近似）
  const hop = Math.max(1, Math.round(fs * 0.01));
  const keep = [];
  for (let i = 0; i < frames.length; i++) {
    const s0 = i * hop;
    const s1 = Math.min(x.length, s0 + hop);
    if (s1 <= s0) continue;
    let e = 0;
    for (let j = s0; j < s1; j++) e += x[j] * x[j];
    const rmsDb = 10 * Math.log10(e / (s1 - s0) + 1e-12);
    if (rmsDb > o.silenceDb) keep.push(frames[i]);
  }
  if (keep.length < o.minFrames) return { v: null, frames: keep.length, ok: false, reason: `有效帧只有 ${keep.length}（<${o.minFrames}），太短或太静` };

  // 均值、标准差（dB 域）；同时累计线性功率做质心与平坦度
  const mean = new Float64Array(o.nBands);
  const sq = new Float64Array(o.nBands);
  let centroidNum = 0, centroidDen = 0, logSum = 0, linSum = 0;
  const edges = [];
  for (let b = 0; b <= o.nBands; b++) edges.push(o.fMin * Math.pow(o.fMax / o.fMin, b / o.nBands));
  const center = [];
  for (let b = 0; b < o.nBands; b++) center.push(Math.sqrt(edges[b] * edges[b + 1]));

  for (const f of keep) {
    toBands(f, band);
    for (let b = 0; b < o.nBands; b++) {
      mean[b] += band[b];
      sq[b] += band[b] * band[b];
      const lin = Math.pow(10, band[b] / 10);   // dB → 线性功率
      centroidNum += lin * center[b];
      centroidDen += lin;
      logSum += Math.log(lin + 1e-12);
      linSum += lin;
    }
  }
  const n = keep.length;
  const std = new Float64Array(o.nBands);
  for (let b = 0; b < o.nBands; b++) {
    mean[b] /= n;
    std[b] = Math.sqrt(Math.max(0, sq[b] / n - mean[b] * mean[b]));
  }

  const centroidHz = centroidDen > 0 ? centroidNum / centroidDen : 0;
  const flatness = linSum > 0 ? Math.exp(logSum / (n * o.nBands)) / (linSum / (n * o.nBands)) : 0;

  let rms = 0;
  for (let i = 0; i < x.length; i++) rms += x[i] * x[i];
  rms = Math.sqrt(rms / x.length);

  const v = new Float32Array(o.nBands * 2 + 4);
  for (let b = 0; b < o.nBands; b++) { v[b] = mean[b]; v[o.nBands + b] = std[b]; }
  v[o.nBands * 2] = Math.log10(Math.max(20, centroidHz)) * 3;     // 质心：对数尺度、量级对齐
  v[o.nBands * 2 + 1] = flatness * 10;
  v[o.nBands * 2 + 2] = zeroCrossRate(x, fs);
  v[o.nBands * 2 + 3] = 10 * Math.log10(rms + 1e-12) / 6;          // 电平：压缩量级

  return { v, frames: n, ok: true };
}

/**
 * 用底库估计 z-score 参数并建索引。**底库只能是 real**（调用方负责）。
 * @param {Array<{key: string, v: Float32Array}>} items
 */
export function buildSceneIndex(items) {
  const list = (items || []).filter((it) => it && it.v && it.v.length);
  if (!list.length) return { mean: null, std: null, items: [] };
  const d = list[0].v.length;
  const mean = new Float64Array(d);
  const std = new Float64Array(d);
  for (const it of list) for (let i = 0; i < d; i++) mean[i] += it.v[i];
  for (let i = 0; i < d; i++) mean[i] /= list.length;
  for (const it of list) for (let i = 0; i < d; i++) { const t = it.v[i] - mean[i]; std[i] += t * t; }
  for (let i = 0; i < d; i++) std[i] = Math.sqrt(std[i] / Math.max(1, list.length)) || 1;
  const norm = (v) => {
    const out = new Float32Array(d);
    let s = 0;
    for (let i = 0; i < d; i++) { out[i] = (v[i] - mean[i]) / (std[i] || 1); s += out[i] * out[i]; }
    s = Math.sqrt(s) || 1;
    for (let i = 0; i < d; i++) out[i] /= s;
    return out;
  };
  return { mean, std, items: list.map((it) => ({ key: it.key, unit: norm(it.v) })) };
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * 出候选。**返回的不是"认出了"，是"像这几处"**——调用方必须标 `placeFrom:'guess'`。
 * @returns {Array<{key: string, score: number}>} 按分数降序，最多 k 条
 */
export function sceneTopK(index, profile, { k = 3, minScore = 0.25, keyOf = (it) => it.key } = {}) {
  if (!index || !index.items || !index.items.length || !profile || !profile.ok) return [];
  const d = index.items[0].unit.length;
  const q = new Float32Array(d);
  let s = 0;
  for (let i = 0; i < d; i++) { q[i] = (profile.v[i] - index.mean[i]) / (index.std[i] || 1); s += q[i] * q[i]; }
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < d; i++) q[i] /= s;
  const scored = index.items.map((it) => ({ key: keyOf(it), score: cosine(q, it.unit) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((r) => r.score >= minScore).slice(0, k);
}
