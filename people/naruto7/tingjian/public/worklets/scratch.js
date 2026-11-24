// 刻声 · 搓盘 worklet。两种模式：
//   电机（motor）：速率按时间常数靠向 1（转）或 0（停），像真唱机的起停惯性；
//   手按（hold）：主线程给出“手要盘在哪个位置 + 手的速度”，worklet 用速度前馈 + 位置误差反馈锁住手，
//                 速率可为任意实数（负数即倒放）。音画都以 worklet 的位置为准，手和声音不会滑脱。
// 播放：分数位置 + 4 点 Catmull-Rom 插值；慢搓时一阶低通截止频率随 |速率| 下降（慢放本来就闷）。

class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = null;
    this.srcRate = sampleRate;
    this.pos = 0; // 源样本位置（0…n）
    this.rate = 0;
    this.motor = 0; // 电机目标：0 停 / 1 转
    this.hold = null; // {target, vel, t}：target/vel 以源样本为单位
    this.lp = 0;
    this.lastReport = -1;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.buffer) {
        this.buf = m.buffer;
        this.srcRate = m.sampleRate || sampleRate;
        this.pos = 0;
        this.rate = 0;
        this.hold = null;
      }
      if (m.motor !== undefined) this.motor = m.motor;
      if (m.hold !== undefined) this.hold = m.hold; // null 表示松手
      if (m.seek !== undefined && this.buf) this.pos = m.seek * this.buf.length;
      if (m.rate !== undefined) this.rate = m.rate; // 直接设速率（「接上」时不要起转惯性：上一段声音还在耳朵里）
    };
  }

  wrapDiff(d) {
    const n = this.buf.length;
    d %= n;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    if (!this.buf) { out.fill(0); return true; }
    const b = this.buf, n = b.length;
    const blockDur = out.length / sampleRate;

    // 本块的目标速率
    let desired, slew;
    if (this.hold) {
      const h = this.hold;
      const targetNow = h.target + h.vel * Math.max(0, currentTime - h.t);
      const err = this.wrapDiff(targetNow - this.pos);
      desired = (h.vel + 30 * err) / this.srcRate;
      desired = Math.max(-12, Math.min(12, desired));
      slew = 0.6;
    } else {
      desired = this.motor;
      const tau = this.motor > this.rate ? 0.35 : 0.5; // 起转 0.35 s，刹停 0.5 s
      slew = 1 - Math.exp(-blockDur / tau);
    }
    const r0 = this.rate;
    const r1 = r0 + (desired - r0) * slew;
    const step = this.srcRate / sampleRate;

    for (let i = 0; i < out.length; i++) {
      const r = r0 + ((r1 - r0) * i) / out.length;
      const p = this.pos;
      const i1 = Math.floor(p), f = p - i1;
      const at = (k) => { k %= n; if (k < 0) k += n; return b[k]; };
      const y0 = at(i1 - 1), y1 = at(i1), y2 = at(i1 + 1), y3 = at(i1 + 2);
      const c1 = 0.5 * (y2 - y0);
      const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
      const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
      const s = ((c3 * f + c2) * f + c1) * f + y1;
      const fc = 300 + Math.min(1, Math.abs(r)) * 17700;
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
      this.lp += a * (s - this.lp);
      out[i] = this.lp;
      this.pos += r * step;
      if (this.pos >= n) this.pos -= n;
      else if (this.pos < 0) this.pos += n;
    }
    this.rate = r1;
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);

    if (currentTime - this.lastReport >= 0.015) {
      this.lastReport = currentTime;
      this.port.postMessage({ pos: this.pos, rate: this.rate, t: currentTime });
    }
    return true;
  }
}

registerProcessor('kesheng-scratch', ScratchProcessor);
