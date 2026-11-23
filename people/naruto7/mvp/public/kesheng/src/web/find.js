// 刻声 · 听声寻片的「边听边判」：主页与分区图共用同一段判定（docs/FIND-v2.md §2.2、§5）。
// 口径全在 src/dsp/fingerprint.js 与 src/dsp/quality.js；这里只负责「喂样本 → 在 3 / 4.5 / 6 / 8 秒各判一次 → 定档」，
// 逻辑原样搬自 app.js（2026-10-21 之前的版本），没有改任何门槛、比值或判读点。
// 三档：match 认出（直接放）/ candidate 只给候选（不自动放）/ reject 没认出（附上质量原因）。
import { StreamingSTFT } from '../dsp/stft.js';
import { fingerprintFrames, NULL_FIT } from '../dsp/fingerprint.js';
import { assessQuality, describeQuality } from '../dsp/quality.js';

export const LOOKS = NULL_FIT.looks;
export const MAX_LISTEN = LOOKS[LOOKS.length - 1];

/** 只给候选：8 秒时最高分过了门槛、但没比第二名高出 1.5 倍。候选 = 分数过门槛的前两张。 */
export function candidateOf(res) {
  if (!res || res.match || !res.ranked.length || res.seconds < MAX_LISTEN) return null;
  const ids = res.ranked.slice(0, 2).filter((r) => r.score >= res.threshold).map((r) => r.id); // 与「认出」同一道门槛，只是没过 1.5 倍
  return ids.length ? ids : null;
}

/**
 * 一次寻片。push() 一块块喂样本（任意长度），返回 true 表示已经定档、不用再喂。
 * onLook(L) 在每个没认出的判读点之后调用（页面用来报「在听，L 秒，还没认出…」）。
 */
export class Listener {
  constructor(index, fs, { settings = {}, onLook = null } = {}) {
    this.index = index; this.fs = fs; this.settings = settings; this.onLook = onLook;
    this.need = Math.round(MAX_LISTEN * fs);
    this.x = new Float32Array(this.need);
    this.sp = new StreamingSTFT(fs);
    this.frames = [];
    this.n = 0; this.li = 0; this.res = null; this.quality = null; this.at = null;
  }

  get done() { return !!(this.res && this.res.match) || this.li >= LOOKS.length || this.n >= this.need; }

  push(samples) {
    if (this.li >= LOOKS.length || (this.res && this.res.match)) return true;
    const chunk = samples.subarray(0, Math.min(samples.length, this.need - this.n));
    this.x.set(chunk, this.n); this.n += chunk.length;
    this.sp.push(chunk, (p) => this.frames.push(p));
    // 帧数够了就判一次；和离线评测（eval/e1_seq.mjs）一样，用前 L·100 帧重算指纹。录满就判剩下的判读点
    while (this.li < LOOKS.length && (this.frames.length >= Math.round(LOOKS[this.li] * 100) || this.n >= this.need)) {
      const L = LOOKS[this.li];
      const fr = this.frames.slice(0, Math.round(L * 100));
      const prints = fingerprintFrames(fr, this.fs, this.sp.fftSize);
      this.res = this.index.query(prints, { seconds: L, nLooks: LOOKS.length });
      this.quality = assessQuality({ x: this.x.subarray(0, Math.round(L * this.fs)), fs: this.fs, frames: fr, fftSize: this.sp.fftSize,
        hashes: prints.length, look: this.li, settings: this.settings });
      this.at = L; this.li++;
      if (this.res.match) break;
      if (this.li < LOOKS.length && this.onLook) this.onLook(L);
    }
    return this.done;
  }

  /** 定档。没喂够也能调（麦克风中途断流）：按已有的最后一次判读算。 */
  result() {
    const res = this.res;
    const cands = candidateOf(res);
    const tier = res && res.match ? 'match' : cands ? 'candidate' : 'reject';
    return { tier, res, candidates: cands || [], quality: this.quality, seconds: this.at };
  }
}

// —— 页面上说的话（FIND-v2 §5；主页与分区图逐字一致）——
export const words = {
  listening: (sec) => `在听，最多 ${sec} 秒…`,
  look: (L) => `在听，${L} 秒，还没认出…`,
  match: (place, at, pos) => `认出来了：${place}（听了 ${at} 秒），接着第 ${pos.toFixed(1)} 秒往下放。`,
  candidate: (names) => (names.length > 1
    ? `像${names.map((n) => `「${n}」`).join('，也像')}，分不开，没有直接放。点柜里的盘自己听听。`
    : `有点像「${names[0]}」，但不够确定，没有直接放。点柜里的那张自己听听。`),
  reject: (quality) => {
    const why = quality ? describeQuality(quality) : '';
    return why ? `没认出来：${why}。` : '没认出来。这一步只认柜里那段录音本身；同一个地方换个时间录的声音，它认不出。';
  },
  starved: '麦克风没有送来足够的声音，再试一次。',
};

/** 认出之后，盘该从哪一秒接着放：匹配偏移 + 已经听了的时长，绕回盘长之内。 */
export function resumeAt(match, at, dur) {
  return (((match.offsetFrames / 100 + at) % dur) + dur) % dur;
}
