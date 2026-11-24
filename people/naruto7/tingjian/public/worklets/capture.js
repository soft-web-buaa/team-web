// 刻声 · 录音 worklet：把麦克风的 128 帧小块攒成约 20 ms 一包发回主线程，同时报峰值（用于“正在录”的电平）。
// 主线程负责计时和截断到 10 秒；worklet 只搬运，不做分析。

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.02);
    this.chunk = new Float32Array(this.size);
    this.n = 0;
    this.active = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.active = false; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.chunk[this.n++] = ch[i];
        if (this.n === this.chunk.length) {
          let peak = 0;
          for (let j = 0; j < this.n; j++) { const a = Math.abs(this.chunk[j]); if (a > peak) peak = a; }
          const out = this.chunk;
          this.port.postMessage({ samples: out, peak }, [out.buffer]);
          this.chunk = new Float32Array(this.size); // 注意：转移后 out.length 为 0，不能用它
          this.n = 0;
        }
      }
    }
    if (!this.active && this.n > 0) {
      const out = this.chunk.slice(0, this.n);
      this.port.postMessage({ samples: out, peak: 0, last: true }, [out.buffer]);
      this.n = 0;
    }
    return this.active;
  }
}

registerProcessor('kesheng-capture', CaptureProcessor);
