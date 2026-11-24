// 刻声 · 一按就刻（第十轮）。
// 「想到 → 录完」只剩两步：打开页面，按住这颗钮（松手就停；最长十秒）。地点、落款、投稿都放到后面，想补再补。
// 这个模块不依赖三维：页面一到它就能用——三维还在摆盘时按下去，声音照样收进来，摆好之后再落到盘上。
// 收音走和「在这里刻」同一个 worklet（worklets/capture.js）；这里只管麦克风、计时和一颗钮的样子，刻纹与入柜交给 plan3d.js（attach）。
// 权限弹窗会吞掉「按住」：开麦前已经松手的，改成「再按一次停」（和地点卡上那颗钮同一个规矩）。

const MAX_SEC = 10;
const MIC = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } };

const q = {
  ctx: null, state: 'idle', chunks: [], n: 0, fs: 48000, at: null, mode: 'hold', released: false,
  mic: null, sink: null, pending: null, err: null,
  btn: null, label: null,
};
const listeners = { start: [], chunk: [], stop: [], error: [] };
const emit = (k, v) => listeners[k].forEach((f) => f(v));

let ctxReady = null;
/** 页面上唯一的 AudioContext（录音 worklet 已加载）。分区图放声音也用它。 */
export async function ensureCtx() {
  if (!ctxReady) ctxReady = (async () => {
    q.ctx = new AudioContext({ latencyHint: 'interactive' });
    await q.ctx.audioWorklet.addModule(new URL('../../worklets/capture.js', import.meta.url));
    return q.ctx;
  })().catch((e) => { ctxReady = null; throw e; });
  const c = await ctxReady;
  if (c.state !== 'running') await c.resume();
  return c;
}

function micError(err) {
  if (err && err.name === 'NotAllowedError') return '浏览器没有允许用麦克风：点地址栏左侧的图标，改成允许，再按一次。';
  if (err && err.name === 'NotFoundError') return '这台设备没有找到麦克风。';
  if (!window.isSecureContext) return '麦克风只能在 https 或 localhost 页面上用。';
  return `麦克风打不开：${(err && err.message) || '未知原因'}。`;
}

function paint() {
  const b = q.btn;
  if (!b) return;
  b.classList.toggle('is-rec', q.state === 'rec' || q.state === 'opening');
  b.style.setProperty('--p', q.state === 'rec' ? Math.min(1, q.n / (MAX_SEC * q.fs)).toFixed(3) : '0');
  q.label.textContent = q.state === 'opening' ? '在开麦克风…' : q.state === 'rec' ? (q.mode === 'toggle' ? '再按一次停' : '松手就停') : '按住 刻十秒';
  b.setAttribute('aria-pressed', String(q.state === 'rec'));
}

async function start(mode) {
  if (q.state !== 'idle') { if (q.state === 'rec' && q.mode === 'toggle') stop(); return; }
  q.state = 'opening'; q.mode = mode; q.released = false; q.chunks = []; q.n = 0; q.err = null;
  paint();
  try {
    await ensureCtx();
    const stream = await navigator.mediaDevices.getUserMedia(MIC);
    if (q.state !== 'opening') { stream.getTracks().forEach((t) => t.stop()); return; }
    const src = q.ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(q.ctx, 'kesheng-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const sink = q.ctx.createGain();
    sink.gain.value = 0;
    src.connect(node).connect(sink).connect(q.ctx.destination);
    q.mic = { close() { node.port.postMessage('stop'); node.port.onmessage = null; src.disconnect(); node.disconnect(); sink.disconnect(); stream.getTracks().forEach((t) => t.stop()); } };
    if (q.mode === 'hold' && q.released) q.mode = 'toggle';
    q.fs = q.ctx.sampleRate;
    q.at = new Date();
    q.state = 'rec';
    paint();
    emit('start', { fs: q.fs, at: q.at });
    const max = Math.round(MAX_SEC * q.fs);
    node.port.onmessage = ({ data }) => {
      if (q.state !== 'rec') return;
      const x = data.samples.subarray(0, Math.max(0, Math.min(data.samples.length, max - q.n)));
      if (x.length) { q.chunks.push(x); q.n += x.length; emit('chunk', { x, n: q.n, fs: q.fs }); paint(); }
      if (q.n >= max) stop();
    };
  } catch (err) {
    q.state = 'idle';
    q.err = micError(err);
    paint();
    emit('error', q.err);
  }
}

function stop() {
  if (q.state === 'opening') { q.released = true; return; }
  if (q.state !== 'rec') return;
  q.state = 'idle';
  q.mic.close();
  q.mic = null;
  const pcm = new Float32Array(q.n);
  let o = 0;
  for (const c of q.chunks) { pcm.set(c, o); o += c.length; }
  q.chunks = [];
  const take = { pcm, fs: q.fs, at: q.at, seconds: q.n / q.fs };
  paint();
  // 三维还没摆好：先存着，attach 时交出去
  if (listeners.stop.length) emit('stop', take); else q.pending = take;
}

/** 把钮挂上：按住刻、松手停；键盘空格 / 回车 = 开始，再按一次停。 */
export function mount(btn) {
  q.btn = btn;
  q.label = btn.querySelector('span');
  btn.addEventListener('pointerdown', (ev) => { if (ev.button === 0) { ev.preventDefault(); start('hold'); } });
  btn.addEventListener('pointerup', () => { if (q.mode === 'hold') stop(); else if (q.state === 'opening') q.released = true; });
  btn.addEventListener('pointerleave', () => { if (q.state === 'rec' && q.mode === 'hold') stop(); });
  btn.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    ev.preventDefault();
    if (ev.repeat) return;
    if (q.state === 'rec') stop(); else start('toggle');
  });
  btn.addEventListener('click', (ev) => ev.preventDefault());
  btn.disabled = false;
  paint();
}

/** plan3d.js 摆好之后接手：on.start / on.chunk / on.stop / on.error。摆好之前录完的那一段，接手时立刻交出去。 */
export function attach(on) {
  for (const k of Object.keys(listeners)) if (on[k]) listeners[k].push(on[k]);
  if (q.state === 'rec' && on.start) on.start({ fs: q.fs, at: q.at, n: q.n, chunks: q.chunks.slice() });
  if (q.pending && on.stop) { const p = q.pending; q.pending = null; on.stop(p); }
}

export const status = () => ({ state: q.state, n: q.n, fs: q.fs, err: q.err, pending: !!q.pending });
export const audioContext = () => q.ctx;

const btn = document.getElementById('quick');
if (btn) mount(btn);
window.__quick = { status, attach };
