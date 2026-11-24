// 刻声 · 馆藏分区图的演示声：每张演示声片按 (变体, 种子) 在页面里现场合成，确定性可复现。
// 这些是合成声，页面上明示「演示用」，不冒充北航现场录音。
import { rng, gaussian } from '../../dsp/synth.js';
import { biquad } from '../../dsp/biquad.js';

const TAU = Math.PI * 2;

/** 二阶共振器（带宽 bw Hz），逐样本，系数可随时间换。 */
function resonator(fs) {
  let y1 = 0, y2 = 0, a1 = 0, a2 = 0, g = 0;
  return {
    set(f, bw) {
      const r = Math.exp((-Math.PI * bw) / fs);
      a1 = -2 * r * Math.cos((TAU * f) / fs);
      a2 = r * r;
      g = 1 - r;
    },
    step(x) {
      const y = g * x - a1 * y1 - a2 * y2;
      y2 = y1; y1 = y;
      return y;
    },
  };
}

/** 一阶低通，返回新数组。 */
function onePole(x, fc, fs) {
  const a = 1 - Math.exp((-TAU * fc) / fs);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) { s += a * (x[i] - s); y[i] = s; }
  return y;
}

function noise(n, r, amp = 1) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * gaussian(r);
  return x;
}

function add(dst, src, gain = 1, at = 0) {
  for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += gain * src[i];
}

/** 房间底噪：低通粉噪，所有变体都垫一层，免得刻纹里出现完全空白的圈。 */
function roomTone(n, fs, r, amp) {
  return onePole(onePole(noise(n, r, amp), 900, fs), 2400, fs);
}

// —— 各变体 ——

function voice(n, fs, r, crowd) {
  const x = new Float32Array(n);
  const VOWELS = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840], [440, 1020], [390, 1990]];
  const speakers = crowd ? 5 + Math.floor(r() * 3) : 2 + Math.floor(r() * 2);
  for (let s = 0; s < speakers; s++) {
    const f0Base = 95 + r() * 150;
    const amp = (crowd ? 0.35 : 0.6) * (0.6 + r() * 0.6);
    const R1 = resonator(fs), R2 = resonator(fs), R3 = resonator(fs);
    let t = r() * 0.8, phase = 0;
    while (t < n / fs) {
      if (r() < 0.18) { t += 0.3 + r() * 0.9; continue; }        // 停顿
      const dur = 0.11 + r() * 0.2;
      const [F1, F2] = VOWELS[Math.floor(r() * VOWELS.length)];
      R1.set(F1 * (0.92 + r() * 0.16), 90); R2.set(F2 * (0.92 + r() * 0.16), 120); R3.set(2600 + r() * 600, 200);
      const i0 = Math.round(t * fs), len = Math.round(dur * fs);
      const rise = (r() - 0.5) * 0.4;
      for (let i = 0; i < len && i0 + i < n; i++) {
        const u = i / len;
        const f0 = f0Base * (1 + rise * u + 0.02 * Math.sin(TAU * 5 * i / fs));
        phase += f0 / fs;
        let e = 0;
        if (phase >= 1) { phase -= 1; e = 1; }                     // 声门脉冲
        e += 0.02 * gaussian(r);
        const env = Math.sin(Math.PI * u) ** 0.6;
        x[i0 + i] += amp * env * (R1.step(e) * 1.0 + R2.step(e) * 0.6 + R3.step(e) * 0.2);
      }
      t += dur + 0.02 + r() * 0.06;
    }
  }
  if (crowd) add(x, biquad(noise(n, r, 0.05), 'bandpass', 900, fs, 0.6));
  return x;
}

function steps(n, fs, r) {
  const x = new Float32Array(n);
  let t = 0.2 + r() * 0.3;
  const period = 0.46 + r() * 0.14;
  const thumpF = 70 + r() * 50;
  while (t < n / fs - 0.2) {
    for (const [dt, g] of [[0, 1], [0.06, 0.45]]) {
      const i0 = Math.round((t + dt) * fs);
      const len = Math.round(0.09 * fs);
      const b = onePole(noise(len, r, 1), 2200 + r() * 1500, fs);
      for (let i = 0; i < len && i0 + i < n; i++) {
        const k = i / fs;
        x[i0 + i] += g * (0.5 * b[i] * Math.exp(-k / 0.012) + 0.5 * Math.sin(TAU * thumpF * k) * Math.exp(-k / 0.03));
      }
    }
    t += period * (0.9 + r() * 0.2);
    if (r() < 0.06) t += 0.6;                                         // 停一下
  }
  return x;
}

function machine(n, fs, r) {
  const x = new Float32Array(n);
  const f = r() < 0.5 ? 50 : 60 + r() * 40;
  const H = [[2, 0.5], [3, 0.25], [4, 0.18], [6, 0.08], [8, 0.05]];
  const fan = biquad(noise(n, r, 0.5), 'bandpass', 300 + r() * 500, fs, 0.8);
  const wob = 0.15 + r() * 0.3;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let s = 0;
    for (const [h, a] of H) s += a * Math.sin(TAU * f * h * t);
    x[i] = 0.35 * s + fan[i] * (0.75 + 0.25 * Math.sin(TAU * wob * t));
  }
  // 偶发的咔哒（继电器、门）
  for (let t = 1 + r() * 2; t < n / fs; t += 2.5 + r() * 3) {
    const i0 = Math.round(t * fs);
    for (let i = 0; i < fs * 0.03 && i0 + i < n; i++) x[i0 + i] += 0.8 * Math.exp(-i / (fs * 0.004)) * (r() * 2 - 1);
  }
  return x;
}

function beeps(n, fs, r) {
  const x = voice(n, fs, r, true);
  for (let i = 0; i < n; i++) x[i] *= 0.25;
  const f = [880, 1046, 1318, 1568][Math.floor(r() * 4)];
  for (let t = 0.4 + r(); t < n / fs - 0.5; t += 1.6 + r() * 1.6) {
    const k = 1 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const i0 = Math.round((t + j * 0.2) * fs), len = Math.round(0.12 * fs);
      for (let i = 0; i < len && i0 + i < n; i++) {
        const env = Math.min(1, i / (fs * 0.004), (len - i) / (fs * 0.004));
        x[i0 + i] += 0.45 * env * (Math.sin(TAU * f * i / fs) + 0.2 * Math.sin(TAU * 2 * f * i / fs));
      }
    }
  }
  return x;
}

function chime(n, fs, r) {
  const x = new Float32Array(n);
  const tune = [659.3, 830.6, 740, 493.9, 659.3, 740, 830.6, 659.3];
  const beat = 0.62 + r() * 0.1;
  for (let k = 0; k * beat < n / fs - 1; k++) {
    const f = tune[k % tune.length] * (r() < 0.5 ? 1 : 0.5);
    const i0 = Math.round((0.2 + k * beat) * fs);
    for (let i = 0; i < fs * 2.6 && i0 + i < n; i++) {
      const t = i / fs;
      x[i0 + i] += 0.4 * (Math.sin(TAU * f * t) * Math.exp(-t / 1.1) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / 0.4)
        + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t / 0.15));
    }
  }
  return x;
}

function whistle(n, fs, r) {
  const x = voice(n, fs, r, true);
  for (let i = 0; i < n; i++) x[i] *= 0.3;
  for (let t = 0.5 + r(); t < n / fs - 1; t += 1.8 + r() * 2.2) {
    const len = Math.round((0.35 + r() * 0.8) * fs), i0 = Math.round(t * fs);
    const f = 2900 + r() * 500;
    let ph = 0;
    for (let i = 0; i < len && i0 + i < n; i++) {
      const tt = i / fs;
      ph += (f * (1 + 0.03 * Math.sin(TAU * 28 * tt))) / fs;
      const env = Math.min(1, i / (fs * 0.01), (len - i) / (fs * 0.02));
      x[i0 + i] += 0.5 * env * (Math.sin(TAU * ph) * (0.7 + 0.3 * Math.sin(TAU * 28 * tt)) + 0.05 * gaussian(r));
    }
  }
  return x;
}

function wind(n, fs, r) {
  const src = noise(n, r, 1);
  const x = new Float32Array(n);
  let s = 0, g = 0.4, gT = 0.4, fc = 400;
  for (let i = 0; i < n; i++) {
    if (i % 512 === 0) { gT = Math.max(0.1, Math.min(1, gT + (r() - 0.5) * 0.25)); fc = 250 + 700 * gT; }
    g += (gT - g) * 0.0005;
    const a = 1 - Math.exp((-TAU * fc) / fs);
    s += a * (src[i] - s);
    x[i] = s * g;
  }
  return x;
}

function rain(n, fs, r) {
  const x = biquad(noise(n, r, 0.08), 'highpass', 1500, fs);
  const rate = 260 + r() * 300;
  for (let k = 0; k < (n / fs) * rate; k++) {
    const i0 = Math.floor(r() * n), a = 0.05 + 0.4 * r() ** 3, tau = fs * (0.0008 + r() * 0.002);
    for (let i = 0; i < tau * 5 && i0 + i < n; i++) x[i0 + i] += a * Math.exp(-i / tau) * (r() * 2 - 1);
  }
  return x;
}

function birds(n, fs, r) {
  const x = wind(n, fs, r);
  for (let i = 0; i < n; i++) x[i] *= 0.25;
  for (let t = 0.3 + r(); t < n / fs - 1; t += 1.2 + r() * 2) {
    const k = 4 + Math.floor(r() * 6);
    for (let j = 0; j < k; j++) {                                    // 喜鹊的「嚓嚓」
      const len = Math.round(0.045 * fs), i0 = Math.round((t + j * 0.12) * fs);
      const b = biquad(noise(len, r, 1), 'bandpass', 2400 + r() * 900, fs, 2.5);
      for (let i = 0; i < len && i0 + i < n; i++) x[i0 + i] += 0.9 * b[i] * Math.sin(Math.PI * i / len);
    }
    if (r() < 0.5) {                                                 // 一声上扬的啾
      const len = Math.round(0.12 * fs), i0 = Math.round((t + k * 0.12 + 0.2) * fs);
      let ph = 0;
      for (let i = 0; i < len && i0 + i < n; i++) {
        ph += (3200 + 1800 * (i / len)) / fs;
        x[i0 + i] += 0.3 * Math.sin(TAU * ph) * Math.sin(Math.PI * i / len);
      }
    }
  }
  return x;
}

function crickets(n, fs, r) {
  const x = roomTone(n, fs, r, 0.02);
  for (const [f, off] of [[4400 + r() * 400, 0], [4900 + r() * 400, 0.23]]) {
    for (let t = off + 0.1; t < n / fs; t += 0.5 + r() * 0.08) {
      for (let p = 0; p < 4; p++) {
        const i0 = Math.round((t + p * 0.033) * fs), len = Math.round(0.02 * fs);
        for (let i = 0; i < len && i0 + i < n; i++) x[i0 + i] += 0.3 * Math.sin(TAU * f * i / fs) * Math.sin(Math.PI * i / len);
      }
    }
  }
  return x;
}

function space(n, fs, r) {
  const x = new Float32Array(n);
  const rt = 1.3 + r() * 1.4;
  const kd = (3 * Math.LN10) / rt;
  for (let t = 0.3 + r() * 0.4; t < n / fs - 0.4; t += 1.3 + r() * 1.1) {
    const i0 = Math.round(t * fs);
    const burst = Math.round(0.004 * fs);
    for (let i = 0; i < burst; i++) x[i0 + i] += 0.9 * (1 - i / burst) * (r() * 2 - 1);
    let lp = 0;
    for (let i = Math.round(0.01 * fs); i < rt * 1.2 * fs && i0 + i < n; i++) {
      const tt = i / fs;
      const fc = 7000 * Math.exp(-tt / (rt * 0.5)) + 500;
      lp += (1 - Math.exp((-TAU * fc) / fs)) * (gaussian(r) - lp);
      x[i0 + i] += 0.3 * Math.exp(-kd * tt) * lp;
    }
  }
  add(x, steps(n, fs, r), 0.25);
  return x;
}

const V = { voice: (n, fs, r) => voice(n, fs, r, true), move: steps, machine, beep: beeps, chime, whistle, wind, rain, birds, crickets, space };

/** 合成一张演示声片。v = 变体名，seed = 种子。返回 Float32Array（单声道，峰值 0.7）。 */
export function synthClip(v, seed, seconds, fs) {
  const r = rng(seed);
  const n = Math.round(seconds * fs);
  const x = (V[v] || V.voice)(n, fs, r);
  add(x, roomTone(n, fs, r, 0.006));
  // 首尾 20 ms 渐入渐出，循环时没有咔哒
  const f = Math.round(0.02 * fs);
  for (let i = 0; i < f; i++) { x[i] *= i / f; x[n - 1 - i] *= i / f; }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  const g = peak > 0 ? 0.7 / peak : 1;
  for (let i = 0; i < n; i++) x[i] *= g;
  return x;
}
