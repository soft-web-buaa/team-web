// 刻声 · 刻纹：录音 → STFT → 64 条对数频带 → 盘面纹理（每帧一列）+ 指纹。
// 录音时逐块喂入（刻刀实时推进）；导入的文件一次喂完。两条路径是同一段代码。
import { StreamingSTFT, makeBandMapper } from '../dsp/stft.js';
import { fingerprintFrames } from '../dsp/fingerprint.js';

export const TURN = 2.0;     // 秒/圈（30 rpm）：10 秒正好 5 圈，循环时盘面角度无缝
export const MAX_SEC = 10;
export const TEX_W = 1000;   // 10 秒 × 100 帧
export const BANDS = 64;
export const R0 = 0.93, R1 = 0.36;
export const PITCH = (R0 - R1) / (MAX_SEC / TURN);
const DB_LO = -96, DB_HI = -24;

export class GrooveCutter {
  constructor(fs) {
    this.fs = fs;
    this.stft = new StreamingSTFT(fs);
    this.toBands = makeBandMapper(fs, this.stft.fftSize, BANDS);
    this.tex = new Uint8Array(BANDS * TEX_W);
    this.col = new Uint8Array(BANDS);
    this.bands = new Float32Array(BANDS);
    this.frames = [];
    this.count = 0;
  }

  /** 喂样本；每产生一列调用 onColumn(index, column)。 */
  push(samples, onColumn) {
    this.stft.push(samples, (power, i) => {
      if (i >= TEX_W) return;
      this.frames.push(power);
      this.toBands(power, this.bands);
      for (let k = 0; k < BANDS; k++) {
        const v = Math.max(0, Math.min(1, (this.bands[k] - DB_LO) / (DB_HI - DB_LO)));
        const byte = Math.round(Math.pow(v, 1.15) * 255);
        this.col[k] = byte;
        this.tex[k * TEX_W + i] = byte;
      }
      this.count = i + 1;
      if (onColumn) onColumn(i, this.col);
    });
  }

  /** 收尾：生成指纹并释放帧缓存。 */
  finish() {
    const prints = fingerprintFrames(this.frames, this.fs, this.stft.fftSize);
    this.frames = [];
    return { tex: this.tex, prints };
  }
}

/** 一次性：整段 PCM → 纹理 + 指纹。 */
export function cutWhole(pcm, fs) {
  const c = new GrooveCutter(fs);
  c.push(pcm);
  return c.finish();
}

/** 补齐到整圈（循环时角度无缝）；最长 10 秒。 */
export function padToTurns(pcm, fs) {
  const n = Math.min(pcm.length, Math.round(MAX_SEC * fs));
  const turns = Math.max(1, Math.ceil(n / (TURN * fs) - 1e-9));
  const out = new Float32Array(Math.round(turns * TURN * fs));
  out.set(pcm.subarray(0, n));
  return out;
}
