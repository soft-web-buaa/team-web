// 播放器：同一时间只响一条。示例声音走合成配方，真实录音（有 src）走 <audio>。
// 浏览器要求用户手势后才能出声，所以 play() 只能在点击、按键的处理函数里调用。
import { reactive } from 'vue';
import { RECIPES, makeKit, renderRecipe } from './synth.js';

export const player = reactive({ id: null, t: 0, dur: 0, error: '' });

let ctx = null;
let master = null;
let analyser = null;
let current = null;
let raf = 0;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('这个浏览器不能播放声音，换 Chrome、Edge 或 Safari 试试。');
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
  }
  return ctx;
}

/** 当前输出的响度，0 到 1，给波形"呼吸"用 */
export function level() {
  if (!analyser || !current) return 0;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 3);
}

function finish() {
  if (!current) return;
  const c = current;
  current = null;
  cancelAnimationFrame(raf);
  try {
    c.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  } catch {
    /* 上下文已关闭，无需处理 */
  }
  setTimeout(() => {
    try {
      c.bus.disconnect();
    } catch {
      /* 已断开 */
    }
    if (c.el) c.el.pause();
  }, 150);
  player.id = null;
  player.t = 0;
}

export function stop() {
  finish();
}

function loop() {
  if (!current) return;
  player.t = current.el ? current.el.currentTime : ctx.currentTime - current.startedAt;
  if (!current.el && player.t >= current.dur) {
    finish();
    return;
  }
  raf = requestAnimationFrame(loop);
}

/** 点一下播放，再点一下停止 */
export async function toggle(sound) {
  if (current && player.id === sound.id) {
    finish();
    return;
  }
  finish();
  player.error = '';
  try {
    const c = ensure();
    const resumed = c.state === 'suspended' ? c.resume() : null;
    const bus = c.createGain();
    bus.connect(master);
    if (resumed) await resumed;

    if (sound.src) {
      const el = new Audio(sound.src);
      el.crossOrigin = 'anonymous';
      c.createMediaElementSource(el).connect(bus);
      await el.play();
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : sound.duration || 10;
      el.onended = () => {
        if (current && current.el === el) finish();
      };
      current = { bus, el, dur, startedAt: 0 };
      player.dur = dur;
    } else {
      const r = RECIPES[sound.recipe];
      if (!r) throw new Error('这条示例声音的合成配方不存在。');
      const trim = c.createGain();
      trim.gain.value = r.trim ?? 1;
      trim.connect(bus);
      const startedAt = c.currentTime + 0.06;
      r.build(makeKit(c, trim, startedAt));
      current = { bus, el: null, dur: r.duration, startedAt };
      player.dur = r.duration;
    }
    player.id = sound.id;
    player.t = 0;
    raf = requestAnimationFrame(loop);
  } catch (e) {
    current = null;
    player.id = null;
    const name = e && e.name;
    if (name === 'NotSupportedError' || name === 'NotFoundError') player.error = '没有找到这段声音的文件，刷新页面再试一次。';
    else if (name === 'NotAllowedError') player.error = '浏览器拦住了播放，再点一次播放键。';
    else if (e && e.message && /[一-龥]/.test(e.message)) player.error = e.message;
    else player.error = '播放失败，刷新页面再试一次。';
  }
}

const peakCache = new Map();

/** 波形的轮廓：把整段声音分成 n 段，取每段最大振幅，归一化到 0 到 1 */
export async function getPeaks(sound, n = 56) {
  const key = `${sound.id}:${n}`;
  if (peakCache.has(key)) return peakCache.get(key);
  let data;
  if (sound.src) {
    const res = await fetch(sound.src);
    const ab = await res.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const tmp = new AC();
    const buf = await tmp.decodeAudioData(ab);
    tmp.close();
    data = buf.getChannelData(0);
  } else {
    data = (await renderRecipe(sound.recipe)).getChannelData(0);
  }
  const step = Math.max(1, Math.floor(data.length / n));
  const out = new Float32Array(n);
  let max = 1e-6;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * step; j < (i + 1) * step && j < data.length; j++) m = Math.max(m, Math.abs(data[j]));
    out[i] = m;
    max = Math.max(max, m);
  }
  for (let i = 0; i < n; i++) out[i] = Math.sqrt(out[i] / max);
  peakCache.set(key, out);
  return out;
}
