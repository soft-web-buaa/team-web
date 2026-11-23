// 示例声音：在浏览器里用 Web Audio 合成，不是真实录音，也没有版权问题。
// 真实录音到位后，在 data/sounds.js 里给条目加 src，播放器会优先用 src。
// trim 是音量系数，按离线渲染的均方根校到约 0.035，让几段声音连着播时响度接近（scripts 里没有这项检查，改配方后请重测）。
// 每个配方是 build(kit)：往 kit.out 里排好整段声音，时间一律用相对本段开头的秒数。
// 随机数全部用固定种子，每次听到的一样。本文件不碰 window，Node 里也能 import（check-sounds 要用）。

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseCache = new WeakMap();
function noiseBuf(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const r = rng(7);
    const len = Math.floor(ctx.sampleRate * 4);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** 把 ctx、出口、起始时刻打包，配方里只管写"第几秒发什么声" */
export function makeKit(ctx, out, t0) {
  const at = (t) => t0 + t;

  /** 一个音：可选滑音 f→f2，指数包络 */
  function tone({ t, f, f2, type = 'sine', a = 0.004, d = 0.3, peak = 0.3 }) {
    const s = at(t);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, s);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, s + a + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(peak, s + a);
    g.gain.exponentialRampToValueAtTime(0.0001, s + a + d);
    o.connect(g);
    g.connect(out);
    o.start(s);
    o.stop(s + a + d + 0.05);
  }

  /** 一团噪声：滤波后做包络（dur 必须大于 a） */
  function hiss({ t, dur, type = 'bandpass', f = 1000, q = 0.8, peak = 0.1, a = 0.02, r = 0.1, offset = 0 }) {
    const s = at(t);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx);
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(peak, s + a);
    g.gain.setValueAtTime(peak, s + Math.max(a, dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(out);
    src.start(s, offset % 3.5);
    src.stop(s + dur + 0.05);
  }

  /** 人声嘈杂的底噪：带通噪声，音量随机起伏，不含任何语音 */
  function murmur({ f, q, peak, dur, seed, step = 0.3 }) {
    const r = rng(seed);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx);
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at(0));
    for (let t = step; t < dur - 0.8; t += step) g.gain.linearRampToValueAtTime(peak * (0.55 + r() * 0.9), at(t));
    g.gain.linearRampToValueAtTime(0.0001, at(dur));
    src.connect(flt);
    flt.connect(g);
    g.connect(out);
    src.start(at(0), r() * 3);
    src.stop(at(dur) + 0.05);
  }

  return { ctx, out, at, tone, hiss, murmur, rng };
}

export const RECIPES = {
  // 图书馆闭馆铃：三下，一下比一下轻
  bell: {
    duration: 10,
    trim: 0.8,
    build(k) {
      const parts = [[1, 0.5, 2.8], [2.0, 0.22, 2.0], [2.76, 0.3, 1.6], [4.07, 0.12, 1.0], [5.4, 0.1, 0.8]];
      [0, 3.1, 6.2].forEach((t0, i) => {
        const hit = 1 - i * 0.12;
        parts.forEach(([ratio, amp, decay]) => k.tone({ t: t0 + 0.3, f: 640 * ratio, d: decay, peak: amp * 0.55 * hit }));
        k.hiss({ t: t0 + 0.3, dur: 0.06, type: 'highpass', f: 3000, peak: 0.05, a: 0.003, r: 0.03 });
      });
      k.hiss({ t: 0, dur: 10, type: 'lowpass', f: 300, q: 0.5, peak: 0.012, a: 1, r: 1 });
    },
  },

  // 早八预备铃：两音一组，响三遍，底下是走廊的嘈杂
  prepbell: {
    duration: 7,
    trim: 1.0,
    build(k) {
      [0.6, 2.4, 4.2].forEach((t0) => {
        k.tone({ t: t0, f: 988, type: 'triangle', a: 0.01, d: 0.55, peak: 0.28 });
        k.tone({ t: t0 + 0.6, f: 740, type: 'triangle', a: 0.01, d: 0.7, peak: 0.28 });
        k.tone({ t: t0, f: 1976, a: 0.01, d: 0.3, peak: 0.06 });
      });
      k.murmur({ f: 500, q: 0.4, peak: 0.05, dur: 7, seed: 31 });
    },
  },

  // 清晨的鸟：两三种叫声，错开着
  birds: {
    duration: 12,
    trim: 3.5,
    build(k) {
      const r = k.rng(11);
      k.hiss({ t: 0, dur: 12, type: 'lowpass', f: 700, q: 0.5, peak: 0.018, a: 1.5, r: 1.5 });
      let t = 0.5;
      while (t < 10.5) {
        const n = 3 + Math.floor(r() * 4);
        const base = 2300 + r() * 1700;
        for (let i = 0; i < n; i++) {
          const f = base * (0.9 + r() * 0.25);
          k.tone({ t: t + i * 0.13, f, f2: f * (0.72 + r() * 0.8), a: 0.008, d: 0.07 + r() * 0.05, peak: 0.1 });
        }
        if (r() > 0.4) {
          const f = 1500 + r() * 400;
          k.tone({ t: t + 0.9, f, f2: f * 1.25, a: 0.01, d: 0.2, peak: 0.07 });
          k.tone({ t: t + 1.2, f: f * 1.25, f2: f, a: 0.01, d: 0.25, peak: 0.07 });
        }
        t += 1.4 + r() * 1.6;
      }
    },
  },

  // 操场哨声：一长三短，后面是散开的人群
  whistle: {
    duration: 9,
    trim: 0.7,
    build(k) {
      const { ctx, out, at } = k;
      const blast = (t, dur, f) => {
        const s = at(t);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 26;
        const lg = ctx.createGain();
        lg.gain.value = 70;
        lfo.connect(lg);
        lg.connect(o.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.3, s + 0.04);
        g.gain.setValueAtTime(0.3, s + dur - 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
        o.connect(bp);
        bp.connect(g);
        g.connect(out);
        o.start(s);
        lfo.start(s);
        o.stop(s + dur + 0.05);
        lfo.stop(s + dur + 0.05);
        k.hiss({ t, dur, f: f * 1.2, q: 2, peak: 0.05, a: 0.03, r: 0.05 });
      };
      blast(0.8, 1.0, 2900);
      blast(3.1, 0.35, 3000);
      blast(3.8, 0.35, 3000);
      blast(4.5, 0.35, 3000);
      k.murmur({ f: 800, q: 0.5, peak: 0.05, dur: 9, seed: 41 });
    },
  },

  // 食堂窗口：嘈杂的底噪、餐具碰撞、一声刷卡
  canteen: {
    duration: 12,
    trim: 1.6,
    build(k) {
      const r = k.rng(23);
      k.murmur({ f: 420, q: 0.5, peak: 0.07, dur: 12, seed: 1 });
      k.murmur({ f: 900, q: 0.7, peak: 0.06, dur: 12, seed: 2 });
      k.murmur({ f: 1800, q: 0.8, peak: 0.035, dur: 12, seed: 3 });
      for (let t = 0.6; t < 11; t += 0.35 + r() * 0.9) {
        const f = 3000 + r() * 2200;
        k.tone({ t, f, a: 0.002, d: 0.09, peak: 0.05 });
        k.tone({ t, f: f * 1.51, a: 0.002, d: 0.06, peak: 0.03 });
      }
      [2.0, 6.6].forEach((t) => k.tone({ t, f: 1800, a: 0.005, d: 0.09, peak: 0.12 }));
    },
  },

  // 雨落在车棚上：细密的雨，加上棚顶的大水滴
  rain: {
    duration: 12,
    trim: 0.85,
    build(k) {
      const r = k.rng(5);
      k.hiss({ t: 0, dur: 12, type: 'highpass', f: 1800, q: 0.4, peak: 0.08, a: 1, r: 1.5 });
      k.hiss({ t: 0, dur: 12, type: 'lowpass', f: 500, q: 0.4, peak: 0.04, a: 1, r: 1.5 });
      for (let i = 0; i < 160; i++) {
        const f = 800 + r() * 1800;
        k.tone({ t: r() * 11.5, f, f2: f * 0.55, a: 0.002, d: 0.03 + r() * 0.04, peak: 0.03 + r() * 0.04 });
      }
      for (let t = 0.8; t < 11.5; t += 0.9 + r() * 1.2) {
        const f = 420 + r() * 260;
        k.tone({ t, f, f2: f * 0.8, a: 0.002, d: 0.22, peak: 0.09 });
        k.tone({ t, f: f * 2.4, a: 0.002, d: 0.1, peak: 0.03 });
      }
    },
  },

  // 球场运球：运球、鞋底摩擦、球砸篮板
  basketball: {
    duration: 9,
    trim: 0.9,
    build(k) {
      const r = k.rng(9);
      const bounce = (t, v = 1) => {
        k.tone({ t, f: 150, f2: 52, a: 0.002, d: 0.13, peak: 0.55 * v });
        k.hiss({ t, dur: 0.06, type: 'lowpass', f: 400, q: 0.5, peak: 0.22 * v, a: 0.002, r: 0.03 });
      };
      const run = (t0, n, gap) => {
        for (let i = 0; i < n; i++) bounce(t0 + i * gap, 0.9 + r() * 0.1);
      };
      run(0.3, 5, 0.43);
      k.tone({ t: 2.7, f: 1700, f2: 2500, type: 'sawtooth', a: 0.01, d: 0.12, peak: 0.03 });
      k.tone({ t: 3.35, f: 2200, f2: 1500, type: 'sawtooth', a: 0.01, d: 0.1, peak: 0.03 });
      k.hiss({ t: 4.1, dur: 0.25, f: 1200, q: 1.2, peak: 0.12, a: 0.003, r: 0.15 });
      k.tone({ t: 4.1, f: 310, f2: 280, type: 'triangle', a: 0.003, d: 0.45, peak: 0.12 });
      k.tone({ t: 4.65, f: 1900, a: 0.003, d: 0.35, peak: 0.04 });
      bounce(4.9, 0.8);
      bounce(5.3, 0.55);
      bounce(5.6, 0.35);
      run(6.4, 5, 0.43);
      k.murmur({ f: 600, q: 0.5, peak: 0.03, dur: 9, seed: 4 });
    },
  },

  // 东门花坛的猫：两声，背景是夜里的虫鸣
  cat: {
    duration: 7,
    trim: 1.0,
    build(k) {
      const { ctx, out, at } = k;
      const meow = (t, f0, len) => {
        const s = at(t);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, s);
        o.frequency.linearRampToValueAtTime(f0 * 1.55, s + len * 0.38);
        o.frequency.linearRampToValueAtTime(f0 * 0.85, s + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.5, s + 0.1);
        g.gain.setValueAtTime(0.5, s + len * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, s + len);
        g.connect(out);
        const formant = (freqs, q, amp) => {
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = q;
          f.frequency.setValueAtTime(freqs[0], s);
          f.frequency.linearRampToValueAtTime(freqs[1], s + len * 0.4);
          f.frequency.linearRampToValueAtTime(freqs[2], s + len);
          const a = ctx.createGain();
          a.gain.value = amp;
          o.connect(f);
          f.connect(a);
          a.connect(g);
        };
        formant([700, 1500, 800], 4, 1);
        formant([2600, 2600, 2600], 5, 0.35);
        o.start(s);
        o.stop(s + len + 0.05);
      };
      meow(1.0, 430, 0.95);
      meow(3.9, 480, 0.8);
      k.hiss({ t: 0, dur: 7, type: 'lowpass', f: 350, q: 0.5, peak: 0.02, a: 1, r: 1 });
      for (let b = 0; b < 12; b++) for (let i = 0; i < 4; i++) k.tone({ t: 0.2 + b * 0.55 + i * 0.065, f: 4300, a: 0.004, d: 0.03, peak: 0.015 });
    },
  },
};

/** 离线渲染一个配方（浏览器里用：画波形、测峰值） */
export async function renderRecipe(name, sampleRate = 22050) {
  const r = RECIPES[name];
  if (!r) throw new Error(`没有这个示例声音：${name}`);
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(1, Math.ceil(r.duration * sampleRate), sampleRate);
  const trim = ctx.createGain();
  trim.gain.value = r.trim ?? 1;
  trim.connect(ctx.destination);
  r.build(makeKit(ctx, trim, 0));
  return ctx.startRendering();
}
