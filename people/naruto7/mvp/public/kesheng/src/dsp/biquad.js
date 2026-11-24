// 刻声 · RBJ biquad。用于分倍频程测混响；浏览器和 Node 跑同一份代码，单测才算数。

function coeffs(type, f0, fs, q) {
  const w0 = (2 * Math.PI * f0) / fs;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0, b1, b2;
  if (type === 'bandpass') { b0 = alpha; b1 = 0; b2 = -alpha; }
  else if (type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  else if (type === 'highpass') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else throw new Error(`未知滤波器：${type}`);
  const a0 = 1 + alpha;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cw) / a0, (1 - alpha) / a0];
}

/** 单节 biquad，返回新数组。 */
export function biquad(x, type, f0, fs, q = Math.SQRT1_2) {
  const [b0, b1, b2, a1, a2] = coeffs(type, f0, fs, q);
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}

/**
 * 倍频程带通：两节级联（4 阶），Q=√2 对应约 1 倍频程带宽。
 * 滤波器自身的振铃远短于要测的混响（500 Hz 时约 10 ms 量级），T20 拟合从 −5 dB 开始可以避开它。
 */
export function octaveBand(x, fc, fs) {
  return biquad(biquad(x, 'bandpass', fc, fs, Math.SQRT2), 'bandpass', fc, fs, Math.SQRT2);
}

/**
 * 时间反转滤波：先倒序、滤波、再倒回。滤波器振铃挪到拍手起点之前，衰减段不再被它拉长。
 * 这是测短混响的常用做法（滤波器时间常数与 RT 可比时）；对稳态噪声底的估计没有影响。
 */
export function octaveBandReversed(x, fc, fs) {
  const r = Float32Array.from(x).reverse();
  return octaveBand(r, fc, fs).reverse();
}
