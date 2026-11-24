// 程序化声景：不加载任何音频文件，全部用 WebAudio 实时合成。
// 每个声景层（风、鸟、车流、水声、人声、钟声……）对应一个「乐器」：
// 噪声 + 滤波器 + 低频调制做环境底噪，短小的包络音做事件（钟声、鸟叫、刷卡、哨声）。
// 声音默认关闭；点「声音：开」后才创建 AudioContext，并跟随当前选中的声景与天光时段。

const TAU = Math.PI * 2;

export function createSoundscape(hooks = {}) {
  let ctx = null;
  let master = null;
  let comp = null;
  let panner = null;
  let analyser = null;
  const buffers = { white: null, brown: null };
  let enabled = false;
  let paused = false;          // 被「更多」里的声音临时打断
  let currentLayers = null;    // 当前声景的层列表，恢复时重建用
  let volume = 0.6;
  let scene = null;
  let slot = '上午';
  let currentProfile = null;
  let currentPoint = null;
  let spatialTimer = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function makeCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    master.connect(comp);
    comp.connect(panner);
    panner.connect(analyser);
    analyser.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    for (const kind of ['white', 'brown']) {
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = clamp(last * 3.2, -1, 1); } else d[i] = w;
      }
      buffers[kind] = buf;
    }
    return ctx;
  }

  // —— 小工具 ——
  function noise(kind = 'white', rate = 1) {
    const s = ctx.createBufferSource();
    s.buffer = buffers[kind];
    s.loop = true;
    s.playbackRate.value = rate;
    return s;
  }
  function bq(type, freq, q = 0.8) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }
  function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function lfo(freq, depth, param, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
    return { osc: o, gain: g };
  }
  function startAll(nodes) { for (const n of nodes) if (n && n.start && !n._started) { try { n.start(); } catch { /* 已启动 */ } n._started = true; } }

  /** 随机间隔的循环调度（事件型声音用）。 */
  function repeat(owner, minMs, maxMs, fn) {
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const t = ctx.currentTime + 0.02;
      fn(t);
      const ms = minMs + Math.random() * (maxMs - minMs);
      owner.timers.push(setTimeout(tick, ms));
    };
    owner.timers.push(setTimeout(tick, 300 + Math.random() * (maxMs - minMs) * 0.5));
    return () => { stopped = true; };
  }

  // —— 乐器：每个返回 { out, stop }，out 是这个层的总音量 ——
  function instrument(type, kind) {
    const out = gain(0);
    const nodes = [];
    const timers = [];
    const owner = { timers };
    const add = (n) => { nodes.push(n); return n; };
    let stopExtra = null;

    switch (type) {
      case 'wind': {
        const src = add(noise('brown', 0.9));
        const f = add(bq('bandpass', 480, 0.6));
        const g = gain(0.6);
        add(lfo(0.07, 220, f.frequency));
        add(lfo(0.05, 0.18, g.gain));
        src.connect(f); f.connect(g); g.connect(out);
        break;
      }
      case 'leaves': {
        const src = add(noise('white', 1.2));
        const hp = add(bq('highpass', 2400, 0.5));
        const g = gain(0.3);
        add(lfo(2.6, 0.16, g.gain));
        add(lfo(0.4, 900, hp.frequency));
        src.connect(hp); hp.connect(g); g.connect(out);
        break;
      }
      case 'traffic': {
        const src = add(noise('brown', 0.55));
        const lp = add(bq('lowpass', 300, 0.7));
        const g = gain(0.55);
        add(lfo(0.09, 0.25, g.gain));
        const src2 = add(noise('white', 0.8));
        const bp = add(bq('bandpass', 900, 1.6));
        const g2 = gain(0.05);
        add(lfo(0.13, 0.035, g2.gain));
        src.connect(lp); lp.connect(g); g.connect(out);
        src2.connect(bp); bp.connect(g2); g2.connect(out);
        break;
      }
      case 'hum': {
        const o1 = add(ctx.createOscillator()); o1.type = 'sine'; o1.frequency.value = 58;
        const o2 = add(ctx.createOscillator()); o2.type = 'sine'; o2.frequency.value = 91; o2.detune.value = 6;
        const lp = add(bq('lowpass', 220, 0.6));
        const g = gain(0.5);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
        break;
      }
      case 'machine': {
        const o = add(ctx.createOscillator()); o.type = 'sawtooth'; o.frequency.value = 52;
        const bp = add(bq('bandpass', 260, 1.2));
        const g = gain(0.32);
        add(lfo(7.3, 120, bp.frequency));
        o.connect(bp); bp.connect(g); g.connect(out);
        break;
      }
      case 'crowd': {
        const src = add(noise('white', 0.6));
        const bp = add(bq('bandpass', 620, 1.1));
        const g = gain(0.35);
        add(lfo(0.23, 180, bp.frequency));
        add(lfo(0.17, 0.12, g.gain));
        src.connect(bp); bp.connect(g); g.connect(out);
        const src2 = add(noise('white', 0.75));
        const bp2 = add(bq('bandpass', 1500, 1.8));
        const g2 = gain(0.09);
        add(lfo(0.31, 400, bp2.frequency));
        src2.connect(bp2); bp2.connect(g2); g2.connect(out);
        break;
      }
      case 'water': {
        const src = add(noise('white', 0.7));
        const lp = add(bq('lowpass', 1400, 0.7));
        const g = gain(0.25);
        src.connect(lp); lp.connect(g); g.connect(out);
        stopExtra = repeat(owner, 260, 1400, (t) => {
          const o = ctx.createOscillator(); o.type = 'sine';
          const f0 = 380 + Math.random() * 700;
          o.frequency.setValueAtTime(f0, t);
          o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.05);
          const gg = ctx.createGain();
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.05, t + 0.008);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
          o.connect(gg); gg.connect(out);
          o.start(t); o.stop(t + 0.14);
        });
        break;
      }
      case 'birds': {
        const g = gain(1);
        g.connect(out);
        stopExtra = repeat(owner, 1400, 4200, (t) => {
          const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const t0 = t + i * (0.08 + Math.random() * 0.12);
            const o = ctx.createOscillator(); o.type = 'sine';
            const f0 = 2400 + Math.random() * 1300;
            o.frequency.setValueAtTime(f0, t0);
            o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), t0 + 0.07);
            const gg = ctx.createGain();
            gg.gain.setValueAtTime(0, t0);
            gg.gain.linearRampToValueAtTime(0.07, t0 + 0.01);
            gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
            o.connect(gg); gg.connect(g);
            o.start(t0); o.stop(t0 + 0.14);
          }
        });
        break;
      }
      case 'insects': {
        const o = add(ctx.createOscillator()); o.type = 'square'; o.frequency.value = 4300;
        const bp = add(bq('bandpass', 4300, 6));
        const g = gain(0.11);
        add(lfo(34, 0.09, g.gain, 'square'));
        o.connect(bp); bp.connect(g); g.connect(out);
        break;
      }
      case 'voice': {
        const o = add(ctx.createOscillator()); o.type = 'sawtooth'; o.frequency.value = 118;
        const f1 = add(bq('bandpass', 560, 4));
        const f2 = add(bq('bandpass', 1150, 5));
        const g = gain(0.22);
        add(lfo(0.37, 26, o.frequency));
        add(lfo(0.21, 160, f1.frequency));
        add(lfo(0.29, 240, f2.frequency));
        add(lfo(0.5, 0.08, g.gain));
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
        break;
      }
      case 'piano': {
        const g = gain(1); g.connect(out);
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        stopExtra = repeat(owner, 1300, 3600, (t) => {
          const semi = scale[Math.floor(Math.random() * scale.length)];
          const f = 220 * Math.pow(2, semi / 12);
          for (const [mult, vol, dur] of [[1, 0.12, 1.6], [2.01, 0.05, 1.1], [3.02, 0.02, 0.7]]) {
            const o = ctx.createOscillator(); o.type = 'triangle';
            o.frequency.value = f * mult;
            const gg = ctx.createGain();
            gg.gain.setValueAtTime(0, t);
            gg.gain.linearRampToValueAtTime(vol, t + 0.012);
            gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(gg); gg.connect(g);
            o.start(t); o.stop(t + dur + 0.05);
          }
        });
        break;
      }
      case 'bell': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 5200, 11000, (t) => {
          const f = 760 + Math.random() * 240;
          for (const [mult, vol, dur] of [[1, 0.11, 2.4], [2.76, 0.04, 1.7], [5.4, 0.02, 1.1]]) {
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.value = f * mult;
            const gg = ctx.createGain();
            gg.gain.setValueAtTime(0, t);
            gg.gain.linearRampToValueAtTime(vol, t + 0.006);
            gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(gg); gg.connect(g);
            o.start(t); o.stop(t + dur + 0.05);
          }
        });
        break;
      }
      case 'click': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 1800, 5200, (t) => {
          const o = ctx.createOscillator(); o.type = 'square';
          o.frequency.value = 1100 + Math.random() * 500;
          const gg = ctx.createGain();
          gg.gain.setValueAtTime(0.05, t);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
          o.connect(gg); gg.connect(g);
          o.start(t); o.stop(t + 0.06);
        });
        break;
      }
      case 'dishes': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 700, 2400, (t) => {
          const src = ctx.createBufferSource(); src.buffer = buffers.white;
          src.loop = true;
          const bp = bq('bandpass', 2400 + Math.random() * 2200, 9);
          const gg = gain(0);
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.07, t + 0.005);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          src.connect(bp); bp.connect(gg); gg.connect(g);
          src.start(t); src.stop(t + 0.2);
        });
        break;
      }
      case 'steps': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 420, 1300, (t) => {
          const src = ctx.createBufferSource(); src.buffer = buffers.white;
          const lp = bq('lowpass', 700, 1.1);
          const gg = gain(0);
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.09, t + 0.004);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
          src.connect(lp); lp.connect(gg); gg.connect(g);
          src.start(t); src.stop(t + 0.11);
        });
        break;
      }
      case 'whistle': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 6000, 13000, (t) => {
          const o = ctx.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(1900, t);
          o.frequency.exponentialRampToValueAtTime(2650, t + 0.09);
          o.frequency.setValueAtTime(2650, t + 0.16);
          o.frequency.exponentialRampToValueAtTime(1800, t + 0.28);
          const gg = ctx.createGain();
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.05, t + 0.02);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          o.connect(gg); gg.connect(g);
          o.start(t); o.stop(t + 0.32);
        });
        break;
      }
      case 'ball': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 900, 2600, (t) => {
          const o = ctx.createOscillator(); o.type = 'sine';
          o.frequency.setValueAtTime(95, t);
          o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
          const gg = ctx.createGain();
          gg.gain.setValueAtTime(0.16, t);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
          o.connect(gg); gg.connect(g);
          o.start(t); o.stop(t + 0.16);
        });
        break;
      }
      case 'door': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 7000, 16000, (t) => {
          const src = ctx.createBufferSource(); src.buffer = buffers.white;
          src.loop = true;
          const bp = bq('bandpass', 500, 3);
          bp.frequency.setValueAtTime(380, t);
          bp.frequency.linearRampToValueAtTime(720, t + 0.4);
          const gg = gain(0);
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.05, t + 0.06);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          src.connect(bp); bp.connect(gg); gg.connect(g);
          src.start(t); src.stop(t + 0.55);
        });
        break;
      }
      case 'cat': {
        const g = gain(1); g.connect(out);
        stopExtra = repeat(owner, 7000, 15000, (t) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth';
          o.frequency.setValueAtTime(420, t);
          o.frequency.exponentialRampToValueAtTime(620, t + 0.18);
          o.frequency.exponentialRampToValueAtTime(360, t + 0.65);
          const bp = bq('bandpass', 1050, 2.2);
          const gg = ctx.createGain();
          gg.gain.setValueAtTime(0, t);
          gg.gain.linearRampToValueAtTime(0.055, t + 0.05);
          gg.gain.linearRampToValueAtTime(0.03, t + 0.5);
          gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
          o.connect(bp); bp.connect(gg); gg.connect(g);
          o.start(t); o.stop(t + 0.72);
        });
        break;
      }
      default: {
        // 兜底：一层很轻的风，至少不会静音
        const src = add(noise('white', 0.7));
        const lp = add(bq('lowpass', 800, 0.6));
        const g = gain(0.12);
        src.connect(lp); lp.connect(g); g.connect(out);
      }
    }

    const started = () => {
      if (nodes.length) startAll(nodes);
    };
    return {
      out,
      kind,
      started,
      stop() {
        if (stopExtra) stopExtra();
        for (const t of timers) clearTimeout(t);
        try { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch { /* 已断开 */ }
        setTimeout(() => {
          try { out.disconnect(); } catch { /* 已断开 */ }
          for (const n of nodes) { try { n.stop && n.stop(); } catch { /* 已停 */ } try { n.disconnect && n.disconnect(); } catch { /* 已断 */ } }
        }, 500);
      },
    };
  }

  function buildScene(profile) {
    const bus = gain(0);
    bus.connect(master);
    const layers = [];
    const list = window.__layersAt ? window.__layersAt(profile, slot) : null;
    return { bus, layers, profile, list };
  }

  /** 具体建声：由外部传入 layersAt 的结果（保持 audio.js 不依赖 soundscape.js）。 */
  function build(profile, layersList) {
    const bus = gain(0);
    bus.connect(master);
    const layers = [];
    for (const l of layersList) {
      if (!l || l.w < 0.07) continue;
      const inst = instrument(l.synth, l.id);
      inst.started();
      const w = clamp(l.w, 0.06, 1.6);
      const base = 0.16 * w;
      inst.out.gain.value = 0;
      inst.out.gain.setTargetAtTime(base, ctx.currentTime, 0.4);
      inst.out.connect(bus);
      layers.push({ id: l.id, synth: l.synth, inst, w, base });
    }
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.9);
    return { bus, layers, profile };
  }

  function disposeScene(s, fade = 0.8) {
    if (!s) return;
    try {
      s.bus.gain.cancelScheduledValues(ctx.currentTime);
      s.bus.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    } catch { /* 已断开 */ }
    for (const l of s.layers) l.inst.stop();
    setTimeout(() => { try { s.bus.disconnect(); } catch { /* 已断开 */ } }, fade * 1000 + 600);
  }

  function play(profile, layersList, point) {
    if (!enabled) return;
    if (!makeCtx()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!layersList || !layersList.length) return;
    currentProfile = profile;
    currentPoint = point || null;
    currentLayers = layersList;
    paused = false;
    if (scene) disposeScene(scene, 0.7);
    scene = build(profile, layersList);
    hooks.onPlay?.(profile);
    applySpatial();
  }

  function stopAll(fade = 0.8) {
    if (scene) { disposeScene(scene, fade); scene = null; }
    paused = false;
    currentProfile = null;
    currentPoint = null;
    currentLayers = null;
    hooks.onStop?.();
  }

  /** 被「更多」里的声音临时打断：停掉声景但记住是哪一条，之后 resume() 接着播。 */
  function pause() {
    if (!enabled || !scene || paused) return false;
    disposeScene(scene, 0.35);
    scene = null;
    paused = true;
    try { if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.06); } catch { /* 已断开 */ }
    hooks.onPause?.();
    return true;
  }
  /** 「更多」的声音播完后恢复刚才的声景。 */
  function resume() {
    if (!enabled || !paused || !currentProfile || !currentLayers || !currentLayers.length) return false;
    if (!makeCtx()) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (scene) disposeScene(scene, 0.2);
    scene = build(currentProfile, currentLayers);
    paused = false;
    try { if (master) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.12); } catch { /* 已断开 */ }
    applySpatial();
    hooks.onResume?.();
    return true;
  }

  function setVolume(v) {
    volume = clamp(v, 0, 1);
    if (master && enabled) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.1);
    hooks.onVolume?.(volume);
  }

  /** 切换天光时段：不重建整段声景，只把各层音量按新权重推过去。 */
  function setSlot(next, layersList) {
    slot = next;
    if (layersList && layersList.length) currentLayers = layersList;
    if (!scene || !enabled || paused) return;
    if (layersList && layersList.length) {
      // 简化：整段重建（层数少，重建比逐层改参数更稳）
      const old = scene;
      scene = build(scene.profile, layersList);
      disposeScene(old, 1.6);
    }
  }

  /** 方向感：镜头越正对声源，越居中；越靠画面一侧，声像越偏。 */
  function applySpatial() {
    if (!enabled || !ctx || !currentPoint) return;
    const cam = hooks.getCam ? hooks.getCam() : null;
    if (!cam || !cam.pos) return;
    const px = currentPoint.x;
    const pz = -currentPoint.y;
    const dx = px - cam.pos[0];
    const dz = pz - cam.pos[2];
    const dist = Math.hypot(dx, dz);
    const fx = cam.target[0] - cam.pos[0];
    const fz = cam.target[2] - cam.pos[2];
    const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);   // 声源相对镜头朝向的夹角
    const pan = clamp(Math.sin(ang) * 0.8, -1, 1);
    const near = clamp(1.25 - dist / 1500, 0.45, 1);
    try {
      if (panner.pan) panner.pan.setTargetAtTime(pan, ctx.currentTime, 0.2);
      if (master && enabled) master.gain.setTargetAtTime(volume * 0.9 * near, ctx.currentTime, 0.2);
    } catch { /* 忽略 */ }
  }
  function startSpatialPoll() {
    if (spatialTimer) return;
    spatialTimer = setInterval(applySpatial, 220);
  }
  function stopSpatialPoll() { clearInterval(spatialTimer); spatialTimer = 0; }

  async function enable() {
    if (enabled) return true;
    if (!makeCtx()) return false;
    try { await ctx.resume(); } catch { /* 忽略 */ }
    enabled = true;
    master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.2);
    startSpatialPoll();
    hooks.onEnable?.(true);
    return true;
  }
  function disable() {
    if (!enabled) return;
    enabled = false;
    stopSpatialPoll();
    stopAll(0.35);
    if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    hooks.onEnable?.(false);
  }
  async function toggle() { if (enabled) { disable(); return false; } return enable(); }

  /** 电平（0..1），给界面上的小电平条用。 */
  function level() {
    if (!analyser || !enabled) return 0;
    const arr = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(arr);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) { const v = (arr[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / arr.length) * 2.4);
  }

  return {
    get enabled() { return enabled; },
    get paused() { return paused; },
    get profile() { return currentProfile; },
    get volume() { return volume; },
    enable, disable, toggle, play, stopAll, pause, resume, setVolume, setSlot, applySpatial, level,
    dispose() { disable(); try { ctx && ctx.close(); } catch { /* 已关闭 */ } ctx = null; },
  };
}
