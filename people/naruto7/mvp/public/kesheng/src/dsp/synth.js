// 刻声 · 合成信号：单测的阳性/阴性对照，也用来生成 e2e 的假麦克风 WAV。可复现（带种子）。

/** mulberry32：确定性伪随机。 */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 近似高斯白噪声（12 个均匀和）。 */
export function gaussian(r) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += r();
  return s - 6;
}

export function sine(freq, seconds, fs, amp = 0.5) {
  const n = Math.round(seconds * fs);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs);
  return x;
}

export function whiteNoise(seconds, fs, amp, seed = 1) {
  const r = rng(seed);
  const n = Math.round(seconds * fs);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * gaussian(r);
  return x;
}

/** dBFS（相对满幅 1.0 的 RMS）→ 线性 RMS。 */
export const dbToAmp = (db) => Math.pow(10, db / 20);

/**
 * 合成拍手 + 房间：指数衰减的高斯噪声尾巴，能量衰减 60 dB 用时 rt60 秒；可按频带给不同 RT60。
 * lead 秒底噪 → 一个 3 ms 的宽带爆发 → 衰减尾 → 底噪；noiseDb 是相对尾巴起始 RMS 的底噪（负数）。
 */
export function synthClap({ fs = 48000, rt60 = 0.8, lead = 0.3, total = 2.5, noiseDb = -55, peak = 0.8, seed = 7 } = {}) {
  const r = rng(seed);
  const n = Math.round(total * fs);
  const x = new Float32Array(n);
  const start = Math.round(lead * fs);
  const k = (3 * Math.LN10) / rt60; // 振幅衰减常数：exp(-k t) 的能量 = exp(-2kt)，60 dB 用时 rt60
  const tailAmp = peak * 0.35;
  for (let i = start; i < n; i++) {
    const t = (i - start) / fs;
    x[i] = tailAmp * Math.exp(-k * t) * gaussian(r);
  }
  // 拍手本体：3 ms 宽带爆发
  const burst = Math.round(0.003 * fs);
  for (let i = 0; i < burst; i++) x[start + i] += peak * (1 - i / burst) * (r() * 2 - 1);
  const noise = tailAmp * dbToAmp(noiseDb);
  for (let i = 0; i < n; i++) x[i] += noise * gaussian(r);
  return { x, fs, onset: start };
}

/** 合成一个“地点声”：几条随机滑动的谐波 + 偶发敲击 + 粉噪。用于指纹的阳性对照。 */
export function synthScene({ fs = 48000, seconds = 10, seed = 11 } = {}) {
  const r = rng(seed);
  const n = Math.round(seconds * fs);
  const x = new Float32Array(n);
  const voices = Array.from({ length: 4 }, () => ({ f: 300 + r() * 2500, rate: (r() - 0.5) * 0.6, ph: 0, amp: 0.05 + r() * 0.08, on: r() }));
  let seg = 0;
  for (let i = 0; i < n; i++) {
    if (i % Math.round(fs * 0.25) === 0) {
      seg++;
      for (const v of voices) { v.on = r() > 0.35 ? 1 : 0; if (r() > 0.7) v.f = 300 + r() * 2500; }
    }
    let s = 0;
    for (const v of voices) {
      v.f *= 1 + v.rate / fs;
      if (v.f < 250 || v.f > 4500) v.rate = -v.rate;
      v.ph += (2 * Math.PI * v.f) / fs;
      s += v.on * v.amp * (Math.sin(v.ph) + 0.4 * Math.sin(2 * v.ph));
    }
    x[i] = s + 0.01 * gaussian(r);
  }
  // 偶发敲击
  for (let k = 0; k < seconds * 2; k++) {
    const at = Math.floor(r() * (n - fs * 0.05));
    const f = 600 + r() * 3000;
    for (let i = 0; i < fs * 0.05; i++) x[at + i] += 0.2 * Math.exp(-i / (fs * 0.008)) * Math.sin((2 * Math.PI * f * i) / fs);
  }
  return x;
}

/** 线性插值重采样（用于“44.1k 录、48k 查”的跨设备测试）。 */
export function resample(x, fromFs, toFs) {
  const n = Math.floor((x.length * toFs) / fromFs);
  const y = new Float32Array(n);
  const ratio = fromFs / toFs;
  for (let i = 0; i < n; i++) {
    const p = i * ratio, i0 = Math.floor(p), f = p - i0;
    y[i] = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f;
  }
  return y;
}

/** 直接卷积（只用于短 IR 的测试；页面里用 ConvolverNode）。 */
export function convolve(x, h) {
  const y = new Float32Array(x.length + h.length - 1);
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    for (let j = 0; j < h.length; j++) y[i + j] += xi * h[j];
  }
  return y;
}

/** 16-bit PCM 单声道 WAV 编码。 */
export function encodeWav(x, fs) {
  const n = x.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** 解码 16-bit / 32-bit float PCM WAV（只取第一声道）。 */
export function decodeWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('不是 WAV 文件');
  let o = 12, fmt = null;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), ch: v.getUint16(o + 10, true), fs: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') {
      if (!fmt) throw new Error('WAV 缺少 fmt 段');
      const bps = fmt.bits / 8, frames = Math.floor(size / (bps * fmt.ch));
      const x = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const p = o + 8 + i * bps * fmt.ch;
        x[i] = fmt.format === 3 ? v.getFloat32(p, true) : fmt.bits === 16 ? v.getInt16(p, true) / 32768 : 0;
      }
      return { x, fs: fmt.fs };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV 缺少 data 段');
}

/**
 * 试音盘：五声音阶的拨弦钟声（Karplus-Strong）+ 一点环境底噪。合成信号，页面上明确标“合成”，不冒充北航录音。
 * 旋律有起伏，搓起来能听出快慢和正反。
 */
export function synthChimes({ fs = 48000, seconds = 10, seed = 21 } = {}) {
  const r = rng(seed);
  const n = Math.round(seconds * fs);
  const x = new Float32Array(n);
  const scale = [0, 2, 4, 7, 9, 12, 14, 16]; // 宫商角徵羽
  const base = 392; // G4
  const phrase = [0, 2, 4, 3, 2, 4, 5, 7, 6, 4, 3, 2, 1, 0, 2, 0];
  const beat = 0.6;
  for (let k = 0; k * beat < seconds - 0.5; k++) {
    const deg = phrase[k % phrase.length];
    const f = base * Math.pow(2, scale[deg] / 12);
    const start = Math.round((0.15 + k * beat) * fs);
    const len = Math.min(n - start, Math.round(fs * 2.2));
    const period = Math.max(2, Math.round(fs / f));
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = r() * 2 - 1;
    let idx = 0;
    const amp = k % 4 === 0 ? 0.42 : 0.3;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % period];
      ring[idx] = 0.4985 * (a + b);
      x[start + i] += amp * a;
      idx = (idx + 1) % period;
    }
  }
  // 底噪 + 每 2.4 s 一记轻敲，搓的时候有“节拍”
  for (let i = 0; i < n; i++) x[i] += 0.006 * gaussian(r);
  for (let t = 1.2; t < seconds; t += 2.4) {
    const s = Math.round(t * fs);
    for (let i = 0; i < fs * 0.04 && s + i < n; i++) x[s + i] += 0.25 * Math.exp(-i / (fs * 0.004)) * (r() * 2 - 1);
  }
  return x;
}

/** 合成声场 IR：指数衰减噪声，高频衰减更快（每样本一阶低通，截止随时间下降）。标“合成”，用于没有实测时的降级。 */
export function synthIR({ fs = 48000, rt60 = 1.0, seconds, seed = 5, predelay = 0.008 } = {}) {
  const r = rng(seed);
  const len = Math.round((seconds || Math.min(4, rt60 * 1.3)) * fs);
  const ir = new Float32Array(len);
  const k = (3 * Math.LN10) / rt60;
  let lp = 0;
  const pd = Math.round(predelay * fs);
  ir[0] = 1;
  for (let i = pd; i < len; i++) {
    const t = i / fs;
    const fc = 9000 * Math.exp(-t / (rt60 * 0.6)) + 600;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / fs);
    lp += a * (gaussian(r) - lp);
    ir[i] += 0.5 * Math.exp(-k * t) * lp;
  }
  const fade = Math.round(fs * 0.05);
  for (let i = 0; i < fade; i++) ir[len - 1 - i] *= i / fade;
  return ir;
}
