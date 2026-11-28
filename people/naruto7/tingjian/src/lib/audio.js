// 听见校园 · 声音：全站只有一个 AudioContext（手机上开两个会互相抢）。
// 放：刻声的搓盘 worklet（电机起停有惯性、手按可以倒放）。录：刻声的录音 worklet，麦克风只在按住时打开。
import { synthClip } from '../kesheng/web/plan3d/sounds.js';
import { padToTurns, MAX_SEC } from '../kesheng/web/groove.js';

export const FS = 48000;
let ctx = null, ready = null, player = null;
export let report = { pos: 0, rate: 0, t: 0 };
const listeners = new Set();
export const onReport = (f) => { listeners.add(f); return () => listeners.delete(f); };

export async function ensureCtx() {
  if (!ready) ready = (async () => {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/scratch.js`);
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/capture.js`);
    player = new AudioWorkletNode(ctx, 'kesheng-scratch', { numberOfInputs: 0, outputChannelCount: [2] });
    player.port.onmessage = (ev) => { report = ev.data; listeners.forEach((f) => f(report)); };
    const g = ctx.createGain();
    g.gain.value = 0.9;
    player.connect(g).connect(ctx.destination);
    return ctx;
  })().catch((e) => { ready = null; throw e; });
  const c = await ready;
  if (c.state !== 'running') await c.resume();
  return c;
}
export const context = () => ctx;
export const post = (m) => { if (player) player.port.postMessage(m); };

/** 一张盘的声音：{ pcm, fs }。概念盘页面现场合成；史料与云上的盘取文件解码。 */
const cache = new Map();
export async function soundOf(e) {
  if (cache.has(e.id)) return cache.get(e.id);
  let out;
  if (e.pcm) out = { pcm: padToTurns(e.pcm, e.fs), fs: e.fs };
  else if (e.synth) out = { pcm: padToTurns(synthClip(e.synth.v, e.synth.seed, e.seconds || 10, FS), FS), fs: FS };
  else {
    await ensureCtx();
    const res = await fetch(e.url);
    if (!res.ok) throw new Error(`取不到这段声音（HTTP ${res.status}）`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    out = { pcm: padToTurns(buf.getChannelData(0).slice(0, Math.round(MAX_SEC * buf.sampleRate)), buf.sampleRate), fs: buf.sampleRate };
  }
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  cache.set(e.id, out);
  return out;
}

/** 落针：电机从停到转时一声很轻的「嗒」。 */
export function dropClick() {
  if (!ctx) return;
  const fs = ctx.sampleRate, n = Math.round(fs * 0.09), b = ctx.createBuffer(1, n, fs), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (fs * 0.012)) * (i < fs * 0.001 ? 1 : 0.45);
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 2200; g.gain.value = 0.07;
  src.buffer = b;
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start();
}

// —— 录 ——
const MIC = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } };
export function micError(err) {
  if (err && err.name === 'NotAllowedError') return '浏览器没有允许用麦克风：在浏览器的网站设置里把麦克风改成允许，再按一次。';
  if (err && err.name === 'NotFoundError') return '这台设备没有找到麦克风。';
  if (typeof window !== 'undefined' && !window.isSecureContext) return '麦克风只能在 https 或本机地址上用。';
  return `麦克风打不开：${(err && err.message) || '未知原因'}。`;
}
/** 开麦。onChunk(samples) 每 20 毫秒一包。返回 { fs, close() }。 */
export async function openMic(onChunk) {
  await ensureCtx();
  const stream = await navigator.mediaDevices.getUserMedia(MIC);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'kesheng-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const sink = ctx.createGain();
  sink.gain.value = 0;
  src.connect(node).connect(sink).connect(ctx.destination);
  node.port.onmessage = ({ data }) => onChunk(data.samples, data.peak);
  return {
    fs: ctx.sampleRate,
    close() { node.port.postMessage('stop'); node.port.onmessage = null; src.disconnect(); node.disconnect(); sink.disconnect(); stream.getTracks().forEach((t) => t.stop()); },
  };
}

/** 16 位单声道 WAV。上传前降到 24 kHz：十秒 480 KB，服务端上限 1 MB。 */
export function encodeWav(pcm, fs, toFs = 24000) {
  let x = pcm;
  if (fs !== toFs) {
    const n = Math.floor((pcm.length * toFs) / fs);
    x = new Float32Array(n);
    const k = fs / toFs;
    for (let i = 0; i < n; i++) {           // 盒式低通 + 线性插值：够用，不是母带处理
      const c = i * k, i0 = Math.floor(c);
      let s = 0, m = 0;
      for (let j = Math.max(0, i0 - 1); j <= Math.min(pcm.length - 1, i0 + 1); j++) { s += pcm[j]; m++; }
      x[i] = s / (m || 1);
    }
  }
  const buf = new ArrayBuffer(44 + x.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, toFs, true);
  v.setUint32(28, toFs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return new Uint8Array(buf);
}
