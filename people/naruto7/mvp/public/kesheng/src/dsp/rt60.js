// 刻声 · 拍手测混响：起点检测 → 分倍频程 → 噪声底与截断点 → Schroeder 反向积分 → T20/T30。
// 口径：RT60 由 T20（EDC −5…−25 dB 线性拟合）外推；动态范围不足时标 quality='low'，不硬给数。
import { biquad, octaveBandReversed } from './biquad.js';

export const BANDS = Object.freeze([500, 1000, 2000]);

function dB(x) { return 10 * Math.log10(x + 1e-30); }

/** 短时能量包络（每 win 样本一个点，均方）。 */
function envelope(x, win) {
  const n = Math.floor(x.length / win);
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * win, end = j + win; j < end; j++) s += x[j] * x[j];
    e[i] = s / win;
  }
  return e;
}

function median(arr) {
  const a = Array.from(arr).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

/**
 * 找拍手：1 ms 能量包络里最大的突跳。
 * 返回 {index, snrDb, ok}；ok=false 表示“没听到清楚的拍手”（峰值没有高出底噪 25 dB，或者不是突发）。
 */
export function detectOnset(x, fs) {
  const hp = biquad(x, 'highpass', 150, fs);
  const win = Math.max(1, Math.round(fs * 0.001));
  const e = envelope(hp, win);
  if (e.length < 20) return { index: 0, snrDb: 0, ok: false, reason: 'too-short' };
  let peak = 0;
  for (let i = 1; i < e.length; i++) if (e[i] > e[peak]) peak = i;
  const floor = median(e) || 1e-12;
  const snrDb = dB(e[peak]) - dB(floor);
  // 起点：峰值往前找第一个低于峰值 −20 dB 的点
  let start = peak;
  while (start > 0 && dB(e[start - 1]) > dB(e[peak]) - 20) start--;
  // 突发性：起点前 3–23 ms 的能量要比峰值低 ≥ 15 dB（排除持续的大声）。窗口以起点为界，长混响的尾巴不会混进来
  let pre = 0, preN = 0;
  for (let i = Math.max(0, start - 23); i < start - 3; i++) { pre += e[i]; preN++; }
  const rise = preN ? dB(e[peak]) - dB(pre / preN) : snrDb;
  const index = Math.max(0, start * win - win);
  const ok = snrDb >= 25 && rise >= 15;
  return { index, peakIndex: peak * win, snrDb, riseDb: rise, ok, reason: ok ? null : snrDb < 25 ? 'quiet' : 'not-impulsive' };
}

/** 最小二乘直线拟合：返回 {slope, intercept, r2}。 */
function linfit(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
  const den = n * sxx - sx * sx;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  let ssRes = 0;
  for (let i = 0; i < n; i++) { const r = ys[i] - (slope * xs[i] + intercept); ssRes += r * r; }
  return { slope, intercept, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0 };
}

/**
 * 单个频带的衰减分析。x 已从起点截取；noiseEnergy 是该频带每样本均方噪声。
 * 截断点 = 10 ms 包络首次落到噪声底 +3 dB 以内；Schroeder 积分扣除噪声并补偿截断后的尾巴（Lundeby 式补偿，简化为一次迭代）。
 */
export function analyzeDecay(x, fs, noiseEnergy) {
  const win = Math.max(1, Math.round(fs * 0.01));
  const env = envelope(x, win);
  const envDb = Array.from(env, dB);
  const noiseDb = dB(noiseEnergy);
  let peak = 0;
  for (let i = 0; i < Math.min(env.length, 10); i++) if (env[i] > env[peak]) peak = i;
  const dynRange = envDb[peak] - noiseDb;

  let cross = env.length - 1;
  for (let i = peak + 1; i < env.length; i++) if (envDb[i] <= noiseDb + 3) { cross = i; break; }

  // 初步斜率（包络 dB 对时间），用于截断补偿
  const fitEnd = envDb.findIndex((v, i) => i > peak && v <= noiseDb + 10);
  const lastIdx = fitEnd > peak + 2 ? fitEnd : cross;
  const xs = [], ys = [];
  for (let i = peak; i <= lastIdx; i++) { if (envDb[i] <= envDb[peak] - 5) { xs.push(i * win / fs); ys.push(envDb[i]); } }
  let prelimSlope = xs.length >= 3 ? linfit(xs, ys).slope : -60; // dB/s

  const crossSample = Math.min(x.length, (cross + 1) * win);
  // 截断后尾巴能量：e(tc)·fs·10/(|s|·ln10)
  const eAtCross = Math.max(0, env[cross] - noiseEnergy);
  const tail = prelimSlope < 0 ? (eAtCross * fs * 10) / (Math.abs(prelimSlope) * Math.LN10) : 0;

  // Schroeder 反向积分
  const edc = new Float64Array(crossSample);
  let acc = tail;
  for (let i = crossSample - 1; i >= 0; i--) {
    acc += Math.max(0, x[i] * x[i] - noiseEnergy);
    edc[i] = acc;
  }
  const e0 = edc[0] || 1e-30;
  const step = Math.max(1, Math.round(fs * 0.002)); // 2 ms 一点，用于画图与拟合
  const curve = [];
  for (let i = 0; i < crossSample; i += step) curve.push([i / fs, dB(edc[i]) - dB(e0)]);

  const fitRange = (hi, lo) => {
    const fx = [], fy = [];
    for (const [t, v] of curve) if (v <= hi && v >= lo) { fx.push(t); fy.push(v); }
    if (fx.length < 5) return null;
    const f = linfit(fx, fy);
    return f.slope < 0 ? { rt60: -60 / f.slope, r2: f.r2, slope: f.slope, intercept: f.intercept, from: fx[0], to: fx[fx.length - 1] } : null;
  };
  const minDb = curve.length ? curve[curve.length - 1][1] : 0;
  const t20 = minDb <= -25 ? fitRange(-5, -25) : null;
  const t30 = minDb <= -35 ? fitRange(-5, -35) : null;
  // ISO 3382 要求 T20 需要噪声底比峰值低至少 35 dB；这里放宽到 30 dB 记为 ok，25–30 dB 为 low
  const quality = !t20 ? 'none' : dynRange >= 35 && t20.r2 >= 0.98 ? 'ok' : dynRange >= 25 && t20.r2 >= 0.95 ? 'low' : 'none';
  return { t20, t30, rt60: t20 ? t20.rt60 : null, dynRangeDb: dynRange, noiseDb, crossTime: crossSample / fs, curve, quality };
}

/**
 * 整次拍手录音的分析。
 * @param {Float32Array} x  单声道录音（包含拍手前的一小段底噪更好）
 * @returns {{onset, bands: Object<number, ReturnType<analyzeDecay>>, ir: Float32Array, irDuration:number, ok:boolean, reason:string|null}}
 */
export function analyzeClap(x, fs, { bands = BANDS } = {}) {
  const onset = detectOnset(x, fs);
  if (!onset.ok) return { onset, bands: {}, ir: null, ok: false, reason: onset.reason };

  const preLen = onset.index;
  const useLead = preLen >= fs * 0.08;
  const noiseSeg = (y) => {
    if (useLead) return y.subarray(Math.round(fs * 0.01), Math.max(Math.round(fs * 0.02), preLen - Math.round(fs * 0.01)));
    return y.subarray(Math.floor(y.length * 0.85)); // 没有前导段时用录音末尾
  };
  const meanSq = (s) => { let a = 0; for (let i = 0; i < s.length; i++) a += s[i] * s[i]; return a / Math.max(1, s.length); };

  const out = {};
  for (const fc of bands) {
    const y = octaveBandReversed(x, fc, fs);
    out[fc] = analyzeDecay(y.subarray(onset.index), fs, meanSq(noiseSeg(y)));
  }

  // 宽带 IR：起点前 1 ms 到宽带截断点，尾部 30 ms 余弦淡出
  const broad = biquad(x, 'highpass', 60, fs);
  const bAna = analyzeDecay(broad.subarray(onset.index), fs, meanSq(noiseSeg(broad)));
  const start = Math.max(0, onset.index - Math.round(fs * 0.001));
  const end = Math.min(x.length, onset.index + Math.round(bAna.crossTime * fs));
  const ir = broad.slice(start, end);
  const fade = Math.min(ir.length, Math.round(fs * 0.03));
  for (let i = 0; i < fade; i++) ir[ir.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
  let pk = 0;
  for (let i = 0; i < ir.length; i++) pk = Math.max(pk, Math.abs(ir[i]));
  if (pk > 0) for (let i = 0; i < ir.length; i++) ir[i] /= pk;

  return { onset, bands: out, broadband: bAna, ir, irDuration: ir.length / fs, ok: true, reason: null };
}

/** 把 RT60 落到三档描述（实验失败时的降级口径，见 docs/EXP-01-rt60.md）。 */
export function describeRT60(rt60) {
  if (rt60 == null) return null;
  if (rt60 < 0.6) return '偏干';
  if (rt60 < 1.5) return '适中';
  return '偏湿';
}
