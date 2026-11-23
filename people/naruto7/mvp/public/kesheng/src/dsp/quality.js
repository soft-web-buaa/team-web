// 刻声 · 寻片前的录音质量检查（docs/FIND-v2.md §3）。
// 原则：明显不行就直说，不硬给答案；能判的照样判，质量问题附在结果后面说。
// 门槛是先验取值，没在真机坏样本上标定过。FIELD-PROTOCOL-v1 §5 的北航坏样本到手后复标（eval/buaa/）。
import { hopSize } from './stft.js';

export const QUALITY = Object.freeze({
  silentRmsDb: -70,  // 整段 RMS 低于此：几乎没录到声音。照样判完，没认出时这条原因排在最前。TAU 开发城市真机查询整段 RMS 最低 −46.2 dBFS
  clipFrac: 0.01,    // |x| ≥ 0.999 的样本超过 1%：削波严重。TAU 开发城市真机查询最多 0.034%
  gateBlockDb: -90,  // 20 ms 块的 RMS 低于此，记为「被门限压成了静音」（与 lab/field.html 同口径）
  gateFrac: 0.2,     // 这样的块超过 20%：疑似降噪门限
  narrowDb: -42,     // 4.5–7.5 kHz 对 0.5–3.5 kHz 的平均功率比低于此：窄带。TAU 开发城市 1281 条 8 s 宽带查询（页面同一路径，3/4.5/6/8 s 判读点）最低 −47.8 dB，有 3 条（0.23%，都是 B 设备）在某个判读点低于此；同一批过 8 kHz 链路后最高 −93.5 dB（eval/narrow_recheck*.mjs|py）
  // 每个判读点（3 / 4.5 / 6 / 8 s）的最少哈希数（总数，含重复）：约为 TAU 开发城市真机查询 1 分位（4129 / 6289 / 8627 / 11420，bandsPerFrame 18）的 1/4。
  // 持续纯音（风机、电流声）哈希总数不少但几乎全是重复值，不会被标成 few；它们靠计分口径（只数不同哈希）拿不到高分
  minHashes: [1000, 1500, 2100, 2800],
});

const db = (p) => (p > 0 ? 10 * Math.log10(p) : -Infinity);

/** 电平统计：RMS 与峰值（dBFS）、削波样本比例、被门限压成静音的 20 ms 块比例。 */
export function levelStats(x, fs) {
  let sum = 0, peak = 0, clip = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    sum += x[i] * x[i];
    if (a > peak) peak = a;
    if (a >= 0.999) clip++;
  }
  const B = Math.max(1, Math.round(fs * 0.02));
  const th = Math.pow(10, QUALITY.gateBlockDb / 10); // 功率门限
  let gated = 0, blocks = 0;
  for (let s = 0; s + B <= x.length; s += B) {
    let e = 0;
    for (let i = s; i < s + B; i++) e += x[i] * x[i];
    if (e / B < th) gated++;
    blocks++;
  }
  const n = Math.max(1, x.length);
  return { rmsDb: db(sum / n), peakDb: db(peak * peak), clipFrac: clip / n, gateFrac: blocks ? gated / blocks : 0 };
}

/** 高频对中频的平均功率比（dB）：4.5–7.5 kHz 对 0.5–3.5 kHz，帧上平均。采样率太低、收不到 7.5 kHz 时返回 −Infinity；没有声音时返回 null。 */
export function hfRatioDb(frames, sampleRate, fftSize) {
  if (sampleRate / 2 < 7500) return -Infinity;
  // StreamingSTFT 开头先填半窗零：前几帧的窗口跨过「零 → 信号」的阶跃，阶跃把能量铺满高频，
  // 会让 8 kHz 链路的录音看起来像宽带（开发城市 8 kHz 链路 1281 条里有 207 条因此漏检）。跳过这几帧。
  const skip = Math.ceil(fftSize / 2 / hopSize(sampleRate));
  if (frames.length > skip) frames = frames.slice(skip);
  if (!frames.length) return null;
  const binHz = sampleRate / fftSize;
  const band = (lo, hi) => [Math.ceil(lo / binHz), Math.ceil(hi / binHz)]; // [lo, hi)，与 eval 的 f ≥ lo 且 f < hi 一致
  const [a0, a1] = band(500, 3500), [b0, b1] = band(4500, 7500);
  let lo = 0, hi = 0;
  for (const f of frames) {
    for (let k = a0; k < a1; k++) lo += f[k];
    for (let k = b0; k < b1; k++) hi += f[k];
  }
  lo /= a1 - a0; hi /= b1 - b0;
  if (!(lo > 0)) return null;
  return db(hi / lo);
}

/**
 * 一次判读时的质量评估。look = 判读点序号（0…3），hashes = 这次查询的哈希数，
 * settings = MediaStreamTrack.getSettings()（看浏览器有没有真的关掉降噪等处理）。
 * 返回各项数值和 flags（按严重程度排序）。silent 为真时几乎不可能认出，describeQuality 会把它排在最前。
 */
export function assessQuality({ x, fs, frames, fftSize, hashes, look = 0, settings = {} }) {
  const lv = levelStats(x, fs);
  const hf = hfRatioDb(frames, fs, fftSize);
  const flags = [];
  const silent = !(lv.rmsDb >= QUALITY.silentRmsDb);
  if (silent) flags.push('silent');
  if (settings.noiseSuppression === true || settings.echoCancellation === true || settings.autoGainControl === true) flags.push('processing');
  if (!silent && lv.gateFrac > QUALITY.gateFrac) flags.push('gate');
  if (!silent && hashes < QUALITY.minHashes[Math.min(look, QUALITY.minHashes.length - 1)]) flags.push('few');
  if (lv.clipFrac > QUALITY.clipFrac) flags.push('clip');
  const narrow = !silent && hf !== null && hf < QUALITY.narrowDb;
  if (narrow) flags.push('narrow');
  return { ...lv, hfRatioDb: hf, hashes, flags, silent, narrow };
}

const WHY = {
  silent: '几乎没录到声音。看看麦克风是不是被静音了，或者离声音近一点',
  processing: '浏览器没有关掉降噪或回声消除，环境声被削掉了一部分',
  gate: '麦克风像是在把安静的部分压成静音（降噪门限），能比对的声音少了',
  few: '这段声音太单调，能用来比对的特征太少',
  clip: '录得太响，削波了。离声源远一点再试',
};

/** 没认出来时，给用户的那一句原因；没有值得说的质量问题时返回空串。窄带只记录，不当作原因（回放层在窄带下照常工作）。 */
export function describeQuality(q) {
  const f = q.flags.find((k) => k in WHY);
  return f ? WHY[f] : '';
}
