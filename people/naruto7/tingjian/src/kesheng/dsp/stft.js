// 刻声 · STFT。参数按“时间”而不是“样本”定，44.1k / 48k 设备得到同样的帧率与频带。
import { fft, hann } from './fft.js';

export const STFT_DEFAULTS = Object.freeze({
  fftSize: 2048,
  hopSeconds: 0.01, // 10 ms 一帧：刻纹的时间分辨率，也是指纹的 Δt 单位
});

/** 帧移（样本数）。 */
export function hopSize(sampleRate, hopSeconds = STFT_DEFAULTS.hopSeconds) {
  return Math.max(1, Math.round(sampleRate * hopSeconds));
}

/**
 * 增量 STFT：录音时一块块喂进来，帧一满就回调，刻刀和指纹共用同一份结果。
 * 每帧输出 Float32Array(fftSize/2+1) 的功率谱（|X|²，未取对数）。
 */
export class StreamingSTFT {
  constructor(sampleRate, { fftSize = STFT_DEFAULTS.fftSize, hopSeconds = STFT_DEFAULTS.hopSeconds } = {}) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.hop = hopSize(sampleRate, hopSeconds);
    this.win = hann(fftSize);
    this.buf = new Float32Array(fftSize); // 环形窗口
    this.filled = 0;
    this.sinceHop = 0;
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
    this.frames = 0;
    // 让第一帧的中心落在 t=0：先填半窗零
    this.filled = fftSize / 2;
    this.sinceHop = this.hop;
    this.writeIdx = fftSize / 2;
  }

  /** 喂一段样本，每产生一帧调用 onFrame(power, frameIndex)。 */
  push(samples, onFrame) {
    const N = this.fftSize;
    for (let i = 0; i < samples.length; i++) {
      this.buf[this.writeIdx] = samples[i];
      this.writeIdx = (this.writeIdx + 1) % N;
      if (this.filled < N) this.filled++;
      this.sinceHop++;
      if (this.filled === N && this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        onFrame(this._frame(), this.frames++);
      }
    }
  }

  _frame() {
    const N = this.fftSize;
    const { re, im, win, buf } = this;
    for (let i = 0; i < N; i++) {
      re[i] = buf[(this.writeIdx + i) % N] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const out = new Float32Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
    return out;
  }
}

/** 一次性 STFT：返回帧数组（功率谱）。 */
export function stft(samples, sampleRate, opts = {}) {
  const s = new StreamingSTFT(sampleRate, opts);
  const frames = [];
  s.push(samples, (p) => frames.push(p));
  return { frames, hop: s.hop, fftSize: s.fftSize, sampleRate, frameRate: sampleRate / s.hop };
}

/**
 * 把功率谱压成 nBands 条对数频带（dB），用于刻纹纹理。
 * fMin–fMax 之间按对数等分；返回 Float32Array(nBands)，单位 dBFS（相对满幅正弦）。
 */
export function makeBandMapper(sampleRate, fftSize, nBands = 64, fMin = 60, fMax = 12000) {
  const binHz = sampleRate / fftSize;
  const edges = [];
  for (let b = 0; b <= nBands; b++) edges.push(fMin * Math.pow(fMax / fMin, b / nBands));
  const ranges = [];
  for (let b = 0; b < nBands; b++) {
    let lo = Math.floor(edges[b] / binHz);
    let hi = Math.ceil(edges[b + 1] / binHz);
    lo = Math.max(1, Math.min(lo, fftSize / 2));
    hi = Math.max(lo + 1, Math.min(hi, fftSize / 2 + 1));
    ranges.push([lo, hi]);
  }
  // 满幅正弦在 Hann 窗下的峰值功率 ≈ (N/4)²
  const ref = (fftSize / 4) ** 2;
  return function toBands(power, out = new Float32Array(nBands)) {
    for (let b = 0; b < nBands; b++) {
      const [lo, hi] = ranges[b];
      let m = 0;
      for (let k = lo; k < hi; k++) if (power[k] > m) m = power[k];
      out[b] = 10 * Math.log10(m / ref + 1e-12);
    }
    return out;
  };
}
