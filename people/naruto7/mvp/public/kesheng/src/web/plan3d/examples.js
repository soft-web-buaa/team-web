// 刻声 · 「听一段示例」的三段声音：页面按配方现场做，交给听声寻片去认（不开麦克风）。
// 口径（SPEC-DIGEST-1 §2「模拟查询样本」）：它们只能叫「一段示例」，demo:true，不计数、不进 eval、没有落款。
//   wall  隔墙：柜里一张概念盘的一段 → 合成混响（synthIR）→ 两节低通 → 底噪
//   mix   叠放：柜里两张概念盘按 RMS 对齐、等比例相加
//   fresh 柜外：同一套合成配方、换一个种子新做一段——柜里没有这一张
// 配方（哪张盘、从第几秒、哪个种子）由 tools/derive-shelf.mjs 在构建期选定并实跑一遍判定，写进 derived/shelf-v1.json；
// 判定门槛一个没动（src/dsp/fingerprint.js），挑的是样本，不是门槛。单测 test/unit/shelf.test.js 复跑三档。
import { synthClip } from './sounds.js';
import { synthIR, rng, gaussian } from '../../dsp/synth.js';
import { biquad } from '../../dsp/biquad.js';
import { fft } from '../../dsp/fft.js';

export const EX_FS = 48000;

/** FFT 卷积，输出截成 x 的长度（尾巴不要：示例只放 len 秒）。 */
function fconv(x, h) {
  const n = x.length + h.length - 1;
  let N = 1;
  while (N < n) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(x); br.set(h);
  fft(ar, ai); fft(br, bi);
  // 频域相乘后取共轭再正变换 = 逆变换（只差 1/N 和一次共轭，实信号不影响实部）
  for (let i = 0; i < N; i++) { const r = ar[i] * br[i] - ai[i] * bi[i], m = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; ai[i] = -m; }
  fft(ar, ai);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = ar[i] / N;
  return y;
}

const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };
function peakTo(x, p) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); const g = m > 0 ? p / m : 1; for (let i = 0; i < x.length; i++) x[i] *= g; return x; }
function fades(x, fs) { const f = Math.round(0.03 * fs); for (let i = 0; i < f && i < x.length; i++) { x[i] *= i / f; x[x.length - 1 - i] *= i / f; } return x; }

/**
 * 按配方做一段示例。byId：概念盘 id → 条目（要 synth 与 seconds）。返回 Float32Array（单声道，EX_FS）。
 * 同一配方在 Node 与浏览器里逐位相同（都是 V8 的双精度；单测按这一点比对三档）。
 */
export function makeExample(recipe, byId, fs = EX_FS) {
  const clip = (id) => { const e = byId(id); if (!e || !e.synth) throw new Error(`示例配方里的盘 ${id} 不在示例柜里`); return synthClip(e.synth.v, e.synth.seed, e.seconds, fs); };
  const n = Math.round(recipe.len * fs);
  if (recipe.kind === 'wall') {
    const x = clip(recipe.disc), s0 = Math.round(recipe.start * fs);
    let y = fconv(x.subarray(s0, s0 + n), synthIR({ fs, rt60: recipe.rt60, seed: recipe.seed }));
    y = biquad(biquad(y, 'lowpass', recipe.cutoff, fs), 'lowpass', recipe.cutoff, fs);
    peakTo(y, 0.5);
    const r = rng(recipe.seed + 1), a = Math.pow(10, recipe.noiseDb / 20);
    for (let i = 0; i < y.length; i++) y[i] += a * gaussian(r);
    return fades(peakTo(y, 0.6), fs);
  }
  if (recipe.kind === 'mix') {
    const a = clip(recipe.a), b = clip(recipe.b), ga = 0.1 / (rms(a) || 1), gb = 0.1 / (rms(b) || 1);
    const y = new Float32Array(Math.min(n, a.length, b.length));
    for (let i = 0; i < y.length; i++) y[i] = 0.5 * (ga * a[i] + gb * b[i]);
    return fades(peakTo(y, 0.6), fs);
  }
  if (recipe.kind === 'fresh') return fades(peakTo(synthClip(recipe.v, recipe.seed, recipe.len, fs), 0.6), fs);
  throw new Error(`不认识的示例配方：${recipe.kind}`);
}
