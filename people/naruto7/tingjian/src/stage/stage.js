// 听见校园 · 舞台：整站唯一的一块三维画布。换板块只换机位和模式，所以过场是连贯的一镜（DESIGN.md §4）。
// 这里「演」：每帧的光（读 clock.js 的钟点）、机位与过场、地点楼的提起与落回、社区的光柱、唱片的刻纹与唱臂、搓盘、刻。
// 场景怎么「搭」在 scene.js（移植自刻声 plan3d.js）。页面（Vue）只通过下面导出的函数说话，不碰 three.js。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { build, RIN, ROUT, RP, TILE_TOP, LABEL_R, TAU, COL, WAVE_FS, WAVE_W, WAVE_H } from './scene.js';
import { cutWhole, GrooveCutter, TURN, TEX_W, BANDS, R0, R1, PITCH, MAX_SEC } from '../kesheng/web/groove.js';
import { semesterBands, bandLayout, bandAt } from '../kesheng/web/plan3d/bands.js';
import { rigFor } from '../kesheng/web/plan3d/light-rig.js';
import { SCENERY, crownPick, seasonOf } from '../kesheng/web/plan3d/model.js';
import { clock, toHex } from '../lib/clock.js';
import * as audio from '../lib/audio.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let G = null;                 // scene.js 返回的句柄
let controls = null, canvas = null, labelsEl = null;
let built = false, revealed = false, lite = false;
const cb = { place: () => {}, zone: () => {}, empty: () => {}, clip: () => {}, state: () => {} };
export const on = (k, f) => { cb[k] = f; };

// ====================================================================================
// 状态
// ====================================================================================
const S = {
  mode: 'screen',             // screen 屏风后 / home 留声机 / place 地点 / community 社区 / time 年轮 / mine 我的
  place: null, zone: null, hover: null, hoverPlace: null,
  pins: new Map(),            // placeId → [{ mine, age(0..1), id }]（下面的最早）
  columns: new Map(),         // placeId → 张数（社区的光柱）
  colMax: 1,
  mineOnly: false,            // 我的：只有我的盘亮
  bands: [], open: [], layout: [], hoverBand: -1, activeBand: -1, focusSem: null,
  echoes: [], echoActive: -1,
  inset: 0,                   // 右侧纸压住画布的宽度（像素）：画面中心挪到左边那块的中间
  insetBottom: 0,             // 手机：底部抽屉压住画布的高度（像素）：画面中心挪到上面那块的中间
};
let current = null;           // { e, pcm, fs, dur, seconds, env, tex }
let cut = null;               // 正在刻：{ cutter, n, fs }
let motorOn = false, seekT = 0, armLift = 14, spin = 0, grab = null, down = null;

// ====================================================================================
// 机位：一个机位 = { t 看哪一点, d 距离, polar 俯仰, az 方位 }。过场是一串机位，距离按对数插值
// ====================================================================================
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 画面里没被纸压住的那一块：桌面是左边（S.inset 是右侧纸的宽），手机是上面（S.insetBottom 是底部抽屉的高）
function fitDist(radius) {
  const W = Math.max(1, canvas.clientWidth), H = Math.max(1, canvas.clientHeight);
  const w = Math.max(1, W - (W > 760 ? S.inset : 0)), h = Math.max(1, H - S.insetBottom);
  const k = Math.min(h / H, w / H);          // 能用的那一块，按整幅画面的高折算
  return radius / (Math.tan((G.camera.fov * Math.PI) / 360) * Math.max(0.2, k));
}
const POSES = {
  home: () => ({ t: V(60, -60, 60), d: Math.max(3000, fitDist((RP + 250) * 1.08)), polar: 0.8, az: -0.3 }),
  community: () => ({ t: V(0, 40, 0), d: Math.max(3100, fitDist((RP + 200) * 1.12)), polar: 0.66, az: -0.62 }),
  time: () => ({ t: V(0, 0, 0), d: fitDist(RP + 140), polar: 0.035, az: 0 }),
  mine: () => ({ t: V(40, -40, 40), d: Math.max(3000, fitDist((RP + 250) * 1.05)), polar: 0.74, az: 0.42 }),
  screen: () => grooveClose(),
  high: () => ({ t: V(0, 0, 0), d: Math.max(3600, fitDist((RP + 250) * 1.3)), polar: 0.42, az: poseNow().az }),
};
function heroPose(pid, az = null) {
  const h = G.heroObj.get(pid);
  if (!h) { const p = G.pinObj.get(pid); return { t: p.group.position.clone().setY(TILE_TOP + 20), d: 900, polar: 0.92, az: az ?? poseNow().az }; }
  const z = G.zoneObj.get(h.zone);
  const wp = new THREE.Vector3();
  h.pivot.getWorldPosition(wp);
  const r = Math.max(h.size.x, h.size.z) * 0.75 + h.size.y * 1.2 + 30;   // 楼连同台座占画面一半左右
  return { t: V(wp.x, TILE_TOP + z.lift + LIFT(h) * 0.7 + h.size.y * 0.3, wp.z), d: Math.max(260, fitDist(r)), polar: 1.0, az: az ?? poseNow().az };
}
const LIFT = (h) => 36 + h.size.y * 0.35;
function grooveClose() {
  const r = (RIN + ROUT) / 2, psi = G.ARM.psi + 0.35;
  const spot = V(Math.sin(psi) * r, 0, -Math.cos(psi) * r);
  return { t: spot, d: 30, polar: 0.62, az: Math.atan2(spot.x, spot.z) + 0.9 };
}
function poseNow() {
  return { t: controls.target.clone(), d: G.camera.position.distanceTo(controls.target), polar: controls.getPolarAngle(), az: controls.getAzimuthalAngle() };
}
function applyPose(p) {
  const pos = new THREE.Vector3().setFromSphericalCoords(p.d, p.polar, p.az).add(p.t);
  G.camera.position.copy(pos);
  controls.target.copy(p.t);
}
const ease = { inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), out: (k) => 1 - Math.pow(1 - k, 3), smoother: (k) => k * k * k * (k * (k * 6 - 15) + 10) };
function mixPose(a, b, k, { look = k } = {}) {
  let daz = b.az - a.az; daz = ((daz + Math.PI * 3) % TAU) - Math.PI;
  return { t: a.t.clone().lerp(b.t, look), d: Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k), polar: a.polar + (b.polar - a.polar) * k, az: a.az + daz * k };
}
let shot = null;              // { segs, i, t0, from }
/** 一串机位。seg = { to: 机位或返回机位的函数, dur 毫秒, ease, look: 'early'（视点先到，像 Powers of Ten）, at: 开始时调用 } */
function play(segs) {
  if (reduced) { for (const s of segs) { s.at && s.at(); } const last = segs.at(-1); applyPose(typeof last.to === 'function' ? last.to() : last.to); shot = null; controls.enabled = true; return; }
  shot = { segs, i: -1, t0: 0, from: null };
  controls.enabled = false;
  next(performance.now());
}
function next(now) {
  shot.i++;
  if (shot.i >= shot.segs.length) { shot = null; controls.enabled = true; return; }
  const s = shot.segs[shot.i];
  shot.from = poseNow(); shot.t0 = now;
  s.target = typeof s.to === 'function' ? s.to() : s.to;
  if (s.at) s.at();
}
function stepShot(now) {
  if (!shot) return;
  const s = shot.segs[shot.i];
  const k = Math.min(1, (now - shot.t0) / s.dur), e = (ease[s.ease] || ease.inOut)(k);
  if (s.live) s.target = s.to();          // 目标在动（楼正在被提起来）：每帧重算
  const look = s.look === 'early' ? 1 - Math.pow(1 - Math.min(1, e / 0.35), 3) : s.look === 'late' ? Math.pow(Math.max(0, (e - 0.65) / 0.35), 3) : e;
  applyPose(mixPose(shot.from, s.target, e, { look }));
  if (k >= 1) next(now);
}
export const flying = () => !!shot;

// —— 过场预算：秀一次惊讶，秀两次习惯，次次秀会烦（组长 2026-11-24）。完整版每会话只给这么几次，之后用短版 ——
const BUDGET = { intro: 1, enterPlace: 2, toCrowd: 1, toMine: 1 };
function full(key) {
  if (reduced) return false;
  let n = 0;
  try { n = Number(sessionStorage.getItem(`tj-show-${key}`) || 0); sessionStorage.setItem(`tj-show-${key}`, String(n + 1)); } catch { /* 隐私模式：每次都当第一次 */ }
  return n < (BUDGET[key] ?? 1);
}
export function shows() {
  const o = {};
  for (const k of Object.keys(BUDGET)) { try { o[k] = Number(sessionStorage.getItem(`tj-show-${k}`) || 0); } catch { o[k] = 0; } }
  return o;
}

// ====================================================================================
// 模式
// ====================================================================================
/** 换板块。mode：home / place / community / time / mine。place 模式要给 pid。 */
export function setMode(mode, { pid = null } = {}) {
  if (!built) { S.mode = mode; S.place = pid; return; }
  const prev = S.mode, prevPlace = S.place;
  if (prev === mode && prevPlace === pid) return;
  const crowd = mode === 'community' || mode === 'mine';
  S.mode = mode;
  S.place = mode === 'place' ? pid : null;
  S.zone = mode === 'place' && pid ? G.pinObj.get(pid).zone : null;
  S.mineOnly = mode === 'mine';
  G.controls_minPolar = mode === 'time' ? 0.02 : 0.32;
  controls.minPolarAngle = G.controls_minPolar;
  if (!revealed) return;

  if (mode === 'place') {
    const az = poseNow().az;
    if (prev !== 'place' && full('enterPlace')) {
      const z = G.zoneObj.get(S.zone);
      play([
        { to: { t: V(z.c.x, TILE_TOP, -z.c.y), d: 1500, polar: 0.82, az: az + 0.12 }, dur: 650, ease: 'inOut' },
        { to: () => heroPose(pid, az + 0.4), dur: 1050, ease: 'out', live: true },
      ]);
    } else play([{ to: () => heroPose(pid, az + (prev === 'place' ? 0.25 : 0.3)), dur: 760, ease: 'out', live: true }]);
  } else if (prev === 'place' && crowd && full(mode === 'mine' ? 'toMine' : 'toCrowd')) {
    // 个体 → 群体：楼落回盘里，镜头拉高看整张盘，再转到目标；光柱在最后一段里升起来
    play([
      { to: () => ({ ...heroPose(prevPlace), d: heroPose(prevPlace).d * 1.6, polar: 0.82 }), dur: 520, ease: 'inOut', live: true },
      { to: POSES.high, dur: 1000, ease: 'inOut' },
      { to: POSES[mode], dur: 780, ease: 'out' },
    ]);
  } else if ((prev === 'community' || prev === 'mine') && mode === 'place') {
    play([{ to: () => heroPose(pid), dur: 900, ease: 'inOut', live: true }]);
  } else {
    play([{ to: POSES[mode] || POSES.home, dur: mode === 'time' || prev === 'time' ? 1300 : 1000, ease: 'inOut' }]);
  }
  cb.state(stateView());
}
const stateView = () => ({ mode: S.mode, place: S.place, zone: S.zone });

/** 屏风退开之后：刻槽里一镜拉出整台唱机（刻声的 Powers of Ten 倒放），区块从盘心往外立起来。 */
export function reveal({ quick = false } = {}) {
  if (!built) { pendingReveal = { quick }; return; }
  revealed = true;
  riseT0 = performance.now();
  const target = S.mode === 'place' && S.place ? () => heroPose(S.place) : POSES[S.mode] || POSES.home;
  if (quick || !full('intro')) {
    for (const o of G.zoneObj.values()) o.rise = quick ? 1 : o.rise;
    play([{ to: target, dur: quick ? 1 : 900, ease: 'out' }]);
  } else {
    applyPose(grooveClose());
    play([{ to: target, dur: 4600, ease: 'smoother', look: 'late' }]);
  }
  quality.after = performance.now() + 5200;
}
let pendingReveal = null, riseT0 = 0;

export function setInset(px, bottom = 0) {
  const a = Math.max(0, Math.round(px)), b = Math.max(0, Math.round(bottom));
  if (a === S.inset && b === S.insetBottom) return;
  S.inset = a; S.insetBottom = b; resizeNow = true;
  if (built && revealed && !shot) play([{ to: S.mode === 'place' && S.place ? () => heroPose(S.place) : POSES[S.mode] || POSES.home, dur: 600, ease: 'out', live: true }]);
}

// ====================================================================================
// 数据进来：钉点上的盘、社区的光柱、学期带、回声针
// ====================================================================================
/** pins：Map(placeId → [{ id, mine, age }])，按时间从早到晚。 */
export function setPins(pins) { S.pins = pins; if (built) paintPins(); }
/** columns：Map(placeId → 数)。社区板块里光柱的高度。 */
export function setColumns(columns) {
  S.columns = columns;
  S.colMax = Math.max(1, ...columns.values());
}
/** 全部条目（含史料与概念盘）：外圈一个学期一带。 */
export function setBands(list) {
  S.bands = semesterBands(list).slice(-32);
  S.open = S.bands.map((b, i) => S.open[i] || 0);
}
export const bands = () => S.bands.map((b) => ({ semester: b.semester, label: b.label, n: b.n }));
/** 年轮里点一个学期：那一带展开（不换正在放的盘）。null = 跟着正在放的那张。 */
export function focusSemester(sem) { S.focusSem = sem; }
/** 这张盘上的回声：[{ t, mine }]；active 是正在浮起的那一条的下标。 */
export function setEchoes(list) { S.echoes = list || []; syncEchoMarks(); }
export function setEchoActive(i) { S.echoActive = i; }

const MAXD = 14, PIN_STEP = 2.2;
const INKC = new THREE.Color(COL.ink), AGED = new THREE.Color('#A9B1BE'), SCOPEC = new THREE.Color(COL.scope), FADED = new THREE.Color('#7A828E');
function paintPins() {
  for (const [pid, o] of G.pinObj) {
    const list = (S.pins.get(pid) || []).slice(-MAXD);
    const n = list.length;
    o.n = n;
    o.needle.scale.y = o.top - 4;
    o.needle.position.y = (o.top - 4) / 2;
    o.discs.forEach((d, i) => {
      const it = list[i];
      d.visible = i < n;
      d.position.y = o.top - 4 + i * PIN_STEP;
      if (!it) return;
      const on = current && current.e.id === it.id;
      if (on) d.material.color.copy(SCOPEC);
      else if (S.mineOnly) d.material.color.copy(it.mine ? SCOPEC : FADED);
      else if (it.mine) d.material.color.copy(SCOPEC);
      else d.material.color.copy(INKC).lerp(AGED, it.age || 0);
      d.material.emissive.set(on ? COL.scope : '#000000');
      d.material.emissiveIntensity = on ? 0.35 : 0;
    });
    o.head.position.y = o.top - 4 + n * PIN_STEP + 0.4;
    o.head.material.color.set(n ? COL.paper : COL.alu);
  }
}
let landing = null;
/** 刚刻好的那张：从高处落到针上，落定时轻轻一弹。 */
export function landOn(pid) { landing = { pid, t0: performance.now() }; }

// ====================================================================================
// 唱片：刻纹、刻槽里的波形、死蜡刻字、学期带、回声针
// ====================================================================================
function fillWave(pcm, fs) {
  const d = G.waveTex.image.data, step = fs / WAVE_FS, n = Math.min(WAVE_W * WAVE_H, Math.floor(pcm.length / step));
  let pk = 1e-4;
  for (let i = 0; i < pcm.length; i++) pk = Math.max(pk, Math.abs(pcm[i]));
  d.fill(128);
  for (let k = 0; k < n; k++) {
    let a = 0, c = 0;
    for (let j = Math.floor(k * step); j < Math.floor((k + 1) * step); j++) { a += pcm[j]; c++; }
    d[k] = 128 + Math.round(127 * Math.max(-1, Math.min(1, (a / (c || 1)) / pk)));
  }
  G.waveTex.needsUpdate = true;
}
function inscribe(t) {
  const c = G.inscCanvas;
  if (c.dataset.t === t) return;
  c.dataset.t = t;
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const rMid = LABEL_R + 15, kx = W / (TAU * rMid), ky = H / 29;
  g.scale(kx / ky, 1);
  g.fillStyle = '#fff';
  g.font = `${Math.round(H * 0.62)}px "Zhuque", "Noto Serif CJK SC", serif`;
  g.textBaseline = 'middle';
  let x = 40;
  [...t].forEach((ch, i) => {
    const j = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    g.save(); g.translate(x, H / 2 + j * 3); g.rotate(j * 0.05); g.fillText(ch, 0, 0); g.restore();
    x += g.measureText(ch).width * 1.08;
  });
  G.inscTex.needsUpdate = true;
}
function envelope(pcm, fs) {
  const hop = Math.round(fs / 50), env = new Float32Array(Math.ceil(pcm.length / hop));
  for (let i = 0; i < env.length; i++) {
    let q = 0;
    for (let j = i * hop; j < Math.min(pcm.length, (i + 1) * hop); j++) q += pcm[j] * pcm[j];
    env[i] = Math.sqrt(q / hop);
  }
  return env;
}

/** 放一张盘：取声 → 刻进外圈 → 交给搓盘。e 需要 id、seconds，以及 synth / url / pcm 之一；label 是死蜡上刻的字。 */
export async function load(e, { autoplay = true, label = '' } = {}) {
  const snd = await audio.soundOf(e);
  const { pcm, fs } = snd;
  const tex = snd.tex || (snd.tex = cutWhole(pcm, fs).tex);
  current = { e, pcm, fs, dur: pcm.length / fs, seconds: Math.min(e.seconds || MAX_SEC, MAX_SEC), env: snd.env || (snd.env = envelope(pcm, fs)), tex };
  if (built) {
    G.grooveTex.image.data.set(tex);
    G.grooveTex.needsUpdate = true;
    fillWave(pcm, fs);
    inscribe(label || e.no || '');
    const u = G.platterMat.uniforms;
    u.uHas.value = 1; u.uCut.value = current.seconds; u.uDur.value = current.dur;
    paintPins();
  }
  seekT = performance.now();
  if (autoplay) {
    await audio.ensureCtx();
    audio.post({ buffer: pcm, sampleRate: fs });
    audio.report.pos = 0; audio.report.rate = 0;
    setMotor(true);
  } else if (audio.context()) {
    audio.post({ buffer: pcm, sampleRate: fs });
    setMotor(false, true);
  } else pendingBuffer = true;
  cb.clip(clipView());
  return current;
}
let pendingBuffer = false;
const clipView = () => (current ? { id: current.e.id, seconds: current.seconds, dur: current.dur, env: current.env, playing: motorOn } : null);
export const clip = clipView;
export const envOf = () => (current ? current.env : null);

export function setMotor(onOff, quiet = false) {
  if (onOff && !motorOn && !quiet) audio.dropClick();
  motorOn = onOff;
  audio.post({ motor: onOff ? 1 : 0 });
  cb.clip(clipView());
}
export async function toggle() {
  if (!current) return;
  await audio.ensureCtx();
  if (pendingBuffer) { audio.post({ buffer: current.pcm, sampleRate: current.fs }); pendingBuffer = false; }
  setMotor(!motorOn);
}
export async function seek(t) {
  if (!current) return;
  await audio.ensureCtx();
  if (pendingBuffer) { audio.post({ buffer: current.pcm, sampleRate: current.fs }); pendingBuffer = false; }
  const x = Math.max(0, Math.min(current.seconds, t));
  audio.post({ seek: x / current.dur, rate: 1 });
  Object.assign(audio.report, { pos: x * current.fs, rate: 1, t: audio.context().currentTime });
  seekT = performance.now();
  setMotor(true);
}
/** 正在放到第几秒（0..dur）。 */
export function position() {
  const ctx = audio.context();
  if (!current || !ctx) return 0;
  const n = current.pcm.length, r = audio.report;
  let p = r.pos + r.rate * current.fs * Math.max(0, ctx.currentTime - r.t);
  p = ((p % n) + n) % n;
  return p / current.fs;
}
export const playing = () => !!(current && motorOn);

// —— 刻：麦克风的声音一块一块刻进外圈，唱针跟着刻刀往里走 ——
export function cutBegin(fs, label) {
  setMotor(false, true);
  cut = { cutter: new GrooveCutter(fs), n: 0, fs };
  if (!built) return;
  G.waveTex.image.data.fill(128); G.waveTex.needsUpdate = true;
  G.grooveTex.image.data.fill(0); G.grooveTex.needsUpdate = true;
  inscribe(label);
  const u = G.platterMat.uniforms;
  u.uHas.value = 1; u.uCut.value = 0; u.uDur.value = MAX_SEC;
  S.echoes = []; syncEchoMarks();
}
export function cutFeed(x) {
  if (!cut) return;
  const d = built ? G.waveTex.image.data : null, step = cut.fs / WAVE_FS, n0 = cut.n;
  if (d) {
    for (let k = Math.ceil(n0 / step); k * step < n0 + x.length && k < d.length; k++) d[k] = 128 + Math.round(127 * Math.max(-1, Math.min(1, x[Math.floor(k * step - n0)] * 4)));
    G.waveTex.needsUpdate = true;
  }
  cut.n += x.length;
  cut.cutter.push(x, (i, col) => {
    if (!built) return;
    for (let k = 0; k < BANDS; k++) G.grooveTex.image.data[k * TEX_W + i] = col[k];
    G.grooveTex.needsUpdate = true;
  });
  if (built) G.platterMat.uniforms.uCut.value = cut.n / cut.fs;
}
export function cutEnd() { if (!cut) return null; const out = cut.cutter.finish(); cut = null; return out; }
export const cutting = () => !!cut;

// —— 回声针：钉在某一秒的话，立在盘面刻纹上那一秒的位置，跟着盘转 ——
const echoMarks = { group: null, items: [] };
let MARK_GEO = null;
function syncEchoMarks() {
  if (!built) return;
  if (!echoMarks.group) {
    MARK_GEO = { needle: new THREE.CylinderGeometry(1.1, 1.1, 1, 8), head: new THREE.SphereGeometry(11, 16, 12) };
    echoMarks.group = new THREE.Group();
    echoMarks.group.position.y = 0.6;
    G.scene.add(echoMarks.group);
  }
  for (const m of echoMarks.items) echoMarks.group.remove(m.obj);
  echoMarks.items = [];
  S.echoes.forEach((x, i) => {
    const obj = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: x.mine ? COL.scope : '#F2F4F3', toneMapped: false, transparent: true, opacity: 0.9 });
    const needle = new THREE.Mesh(MARK_GEO.needle, mat);
    needle.scale.y = 46; needle.position.y = 23;
    const head = new THREE.Mesh(MARK_GEO.head, mat);
    head.position.y = 48;
    obj.add(needle, head);
    obj.userData = { head, mat };
    echoMarks.group.add(obj);
    echoMarks.items.push({ obj, t: x.t, i });
  });
}
function stepEchoMarks() {
  const g = echoMarks.group;
  if (!g) return;
  const show = !!current && !cut && echoMarks.items.length > 0 && S.mode !== 'place';
  g.visible = show;
  if (!show) return;
  g.rotation.y = -G.platterMat.uniforms.uAngle.value;
  for (const m of echoMarks.items) {
    const r = stylusRadius(Math.min(m.t, current.seconds));
    const psi = -TAU * ((m.t / TURN) % 1);
    m.obj.position.set(Math.sin(psi) * r, 0, -Math.cos(psi) * r);
    const on = m.i === S.echoActive;
    m.obj.userData.head.scale.setScalar(on ? 1.7 : 1);
    m.obj.userData.mat.opacity = on ? 1 : 0.8;
  }
}

function activeBandIndex() {
  const sem = S.focusSem || (current && !cut ? current.e.semester : null);
  return sem ? S.bands.findIndex((b) => b.semester === sem) : -1;
}
function activeSpan() {
  const i = S.activeBand;
  if (i >= 0 && S.layout[i] && S.open[i] > 0.02 && !S.focusSem) return [S.layout[i].r0, S.layout[i].r1];
  return [ROUT, RIN];
}
function stylusRadius(sec) {
  const rn = R0 - (PITCH * Math.min(sec, MAX_SEC)) / TURN;
  const [a0, a1] = activeSpan();
  return a1 + ((rn - R1) / (R0 - R1)) * (a0 - a1);
}
function stepBands(dt) {
  const act = activeBandIndex();
  S.activeBand = act;
  for (let i = 0; i < S.bands.length; i++) {
    const goal = i === act ? 1 : 0;
    S.open[i] += (goal - S.open[i]) * (reduced ? 1 : 1 - Math.exp(-dt / 0.22));
    if (Math.abs(goal - S.open[i]) < 1e-3) S.open[i] = goal;
  }
  S.layout = bandLayout(S.bands, RIN, ROUT, S.open);
  const u = G.platterMat.uniforms;
  u.uNB.value = S.layout.length;
  S.layout.forEach((L, i) => {
    const b = S.bands[i];
    const dim = S.focusSem && b.semester !== S.focusSem ? 1 : 0;
    const flags = dim + (S.hoverBand === i ? 2 : 0) + (i === act ? 4 : 0);
    u.uB.value[i].set(L.r0, L.r1, Math.min(b.n, 40), flags);
  });
  const sp = activeSpan();
  u.uAct.value.set(sp[0], sp[1]);
  u.uActOn.value = act >= 0 && S.open[act] > 0.02 && !S.focusSem ? 1 : 0;
}

// ====================================================================================
// 光：只读 clock.js 的钟点。太阳、软箱、天光、窗灯、背景、纸纹暗角都从同一个钟点来
// ====================================================================================
let envHex = '', envT = 0, bgKey = '';
const tmpC = new THREE.Color();
function stepLight(now) {
  const T = clock.tokens, L = T.light;
  const az = (L.az * Math.PI) / 180, el = (L.el * Math.PI) / 180;
  G.sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(2400);
  G.sun.intensity = L.i;
  G.sun.color.setRGB(L.col[0] / 255, L.col[1] / 255, L.col[2] / 255, THREE.SRGBColorSpace);
  const u = G.platterMat.uniforms;
  u.uSunDir.value.copy(G.sun.position).normalize();
  u.uSunCol.value.set(G.sun.color.r, G.sun.color.g, G.sun.color.b).multiplyScalar(L.i);
  const hexCol = toHex(L.col);
  const rig = rigFor(hexCol);
  u.uBoxCol.value.forEach((v, i) => v.set(rig.boxes[i][0], rig.boxes[i][1], rig.boxes[i][2]).multiplyScalar(G.STUDIO[i].i));
  G.hemi.color.setRGB(rig.sky[0], rig.sky[1], rig.sky[2]);
  G.hemi.groundColor.setRGB(rig.ground[0], rig.ground[1], rig.ground[2]);
  G.hemi.intensity = L.hemi;
  // 环境贴图（金属件、楼面上的软箱反射）：光色变了才重烘，最多 0.7 秒一次（PMREM 一次几十毫秒）
  if (hexCol !== envHex && now - envT > 700) {
    envHex = hexCol; envT = now;
    const old = G.scene.environment;
    G.scene.environment = G.studioEnv(G.pmrem, rig.light);
    if (old) old.dispose();
  }
  G.scene.environmentIntensity = 1 - 0.93 * L.night;
  G.U.uNight.value = L.night;
  G.U.uLit.value = L.lit;
  for (const n of G.nightMats) n.mat.emissiveIntensity = L.night * n.k;
  G.labelMat.emissiveIntensity = 0.55 * L.night;
  const placeDim = S.mode === 'place' ? 0.62 : 1;
  u.uBright.value = L.plat * placeDim;
  G.zoneObj.forEach((o) => { o.poolMat.opacity = 0.5 * L.night; });
  G.bloom.strength = 0.08 + 0.42 * L.night;
  G.bloom.threshold = 1.9;          // 只让窗灯、路灯、示波黄发亮；唱臂的镀铬在月光下不该糊成一团
  const key = `${T.bg0.map(Math.round)}|${T.bg1.map(Math.round)}`;
  if (key !== bgKey) {
    bgKey = key;
    G.paintBackdrop(tmpC.setRGB(T.bg0[0] / 255, T.bg0[1] / 255, T.bg0[2] / 255, THREE.SRGBColorSpace).clone(), new THREE.Color().setRGB(T.bg1[0] / 255, T.bg1[1] / 255, T.bg1[2] / 255, THREE.SRGBColorSpace));
  }
  const grain = G.composer.passes.at(-1).uniforms;
  grain.uVig.value += ((S.mode === 'place' ? 0.62 : T.dark ? 0.7 : 0.82) - grain.uVig.value) * 0.06;
  // 选择性聚焦：地点模式下，除了被提起的楼，整幅画面褪向这个钟点的天色（上下两色的中间）
  grain.uTint.value.set((T.bg0[0] * 0.55 + T.bg1[0] * 0.45) / 255, (T.bg0[1] * 0.55 + T.bg1[1] * 0.45) / 255, (T.bg0[2] * 0.55 + T.bg1[2] * 0.45) / 255);
  grain.uTintK.value += ((S.mode === 'place' ? (T.dark ? 0.42 : 0.5) : 0) - grain.uTintK.value) * (reduced ? 1 : 0.07);
  grain.uGrain.value = T.dark ? 0.03 : 0.02;
}
// —— 四季：校园的景跟着正在放的那张录下的月份走；没有就照今天 ——
let seasonCur = null;
const hidden = new THREE.Matrix4().makeScale(0, 0, 0), tint = new THREE.Color();
function applySeason(name) {
  if (seasonCur === name) return;
  seasonCur = name;
  const Sx = SCENERY[name];
  const cols = Sx.crown.map(([c]) => new THREE.Color(c));
  for (const f of G.forest) {
    f.seeds.forEach((seed, i) => {
      const k = crownPick(name, seed);
      if (k < 0) { f.crowns.setMatrixAt(i, hidden); return; }
      f.crowns.setMatrixAt(i, f.mtx[i]);
      tint.copy(cols[k]).multiplyScalar(0.9 + ((seed * 7919) % 97) / 97 * 0.2);
      f.crowns.setColorAt(i, tint);
    });
    f.crowns.instanceMatrix.needsUpdate = true;
    if (f.crowns.instanceColor) f.crowns.instanceColor.needsUpdate = true;
  }
  for (const z of G.seasonal) for (const t of z.tints) {
    if (t.mat === z.tileMat) t.on.set(Sx.tile); else if (t.mat === z.roadMat) t.on.set(Sx.road); else if (t.mat === z.greenMat) t.on.set(Sx.green);
  }
  G.snowU.value = Sx.snow;
}
export const season = () => seasonCur;

// ====================================================================================
// 指针：搓盘 / 转视角 / 点选
// ====================================================================================
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function toNdc(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
}
function platterPoint(ev) {
  toNdc(ev);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, p)) return null;
  return { rho: Math.hypot(p.x, -p.z), psi: Math.atan2(p.x, -p.z) };
}
function pick(ev) {
  toNdc(ev);
  const hit = ray.intersectObjects(G.pickables, false)[0];
  if (!hit) return null;
  return hit.object.userData.place ? { place: hit.object.userData.place } : hit.object.userData.zone ? { zone: hit.object.userData.zone } : null;
}
function wirePointer() {
  canvas.addEventListener('pointerdown', async (ev) => {
    down = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };
    if (shot || S.mode === 'place') return;
    const pp = platterPoint(ev);
    const onGroove = pp && pp.rho > RIN - 20 && pp.rho < ROUT + 20 && current && !pick(ev);
    if (!onGroove) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('is-scratching');
    const first = !audio.context();
    await audio.ensureCtx();
    if (first || pendingBuffer) { audio.post({ buffer: current.pcm, sampleRate: current.fs }); pendingBuffer = false; }
    const pos0 = first ? 0 : position() * current.fs;
    grab = { band: bandAt(S.layout, pp.rho), id: ev.pointerId, last: pp.psi, turn: 0, pos0, target: pos0, vel: 0, lastT: performance.now(), moved: 0, x: ev.clientX, y: ev.clientY, start: ev.timeStamp };
    audio.post({ hold: { target: pos0, vel: 0, t: audio.context().currentTime } });
  }, { capture: true });
  canvas.addEventListener('pointermove', (ev) => {
    if (grab && ev.pointerId === grab.id) {
      const pp = platterPoint(ev);
      if (!pp) return;
      let d = pp.psi - grab.last;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      grab.last = pp.psi; grab.turn += d;
      grab.moved = Math.max(grab.moved, Math.hypot(ev.clientX - grab.x, ev.clientY - grab.y));
      const now = performance.now(), target = grab.pos0 + (grab.turn / TAU) * TURN * current.fs, dt = Math.max(1, now - grab.lastT) / 1000;
      grab.vel = grab.vel * 0.4 + ((target - grab.target) / dt) * 0.6;
      grab.target = target; grab.lastT = now;
      audio.post({ hold: { target, vel: grab.vel, t: audio.context().currentTime } });
      return;
    }
    if (ev.buttons) return;
    hoverAt(ev);
  });
  const release = (ev) => {
    if (grab && ev.pointerId === grab.id) {
      const click = grab.moved < 5 && ev.timeStamp - grab.start < 300;
      grab = null;
      canvas.classList.remove('is-scratching');
      audio.post({ hold: null });
      if (click) setMotor(!motorOn);
      down = null;
      return;
    }
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    if (moved < 5 && ev.timeStamp - down.t < 500 && !shot) {
      const h = pick(ev);
      if (h && h.place) cb.place(h.place);
      else if (h && h.zone) cb.zone(h.zone);
      else cb.empty();
    }
    down = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { S.hover = null; S.hoverPlace = null; S.hoverBand = -1; });
  canvas.addEventListener('keydown', (ev) => {
    const p = poseNow();
    const step = { ArrowLeft: [-0.2, 0, 1], ArrowRight: [0.2, 0, 1], ArrowUp: [0, -0.1, 1], ArrowDown: [0, 0.1, 1], '+': [0, 0, 0.85], '=': [0, 0, 0.85], '-': [0, 0, 1.18] }[ev.key];
    if (step) {
      ev.preventDefault();
      play([{ to: { t: p.t, d: Math.min(controls.maxDistance, Math.max(controls.minDistance, p.d * step[2])), polar: Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, p.polar + step[1])), az: p.az + step[0] }, dur: 260, ease: 'out' }]);
    } else if (ev.key === ' ' && current) { ev.preventDefault(); toggle(); }
  });
}
function hoverAt(ev) {
  const h = pick(ev);
  const pp = platterPoint(ev);
  const onGroove = pp && pp.rho > RIN - 20 && pp.rho < ROUT + 20 && current && !h && S.mode !== 'place';
  canvas.classList.toggle('is-pointing', !!h || !!onGroove);
  S.hoverBand = pp && !h && pp.rho > RIN - 2 && pp.rho < ROUT + 2 ? bandAt(S.layout, pp.rho) : -1;
  S.hover = h ? (h.zone || G.pinObj.get(h.place).zone) : null;
  S.hoverPlace = h && h.place ? h.place : null;
}

// ====================================================================================
// 地名签（HTML 叠在画布上）
// ====================================================================================
const tags = new Map();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function buildTags() {
  for (const p of G.campus.places) {
    const t = document.createElement('div');
    t.className = 'tag';
    t.innerHTML = `<span><u aria-hidden="true"></u>${esc(p.name)}<b></b></span>`;
    labelsEl.appendChild(t);
    tags.set(p.id, t);
  }
}
const v3 = new THREE.Vector3();
function placeTag(t, x, y, z, show) {
  if (!show) { if (t.style.display !== 'none') t.style.display = 'none'; return; }
  v3.set(x, y, z).project(G.camera);
  if (v3.z > 1) { t.style.display = 'none'; return; }
  t.style.display = '';
  t.style.transform = `translate(${((v3.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v3.y) / 2) * canvas.clientHeight}px) translate(-50%, -100%)`;
}
function updateTags() {
  const narrow = canvas.clientWidth < 720;
  // 社区里只给最高的几根挂名字（全挂会叠成一团），其余的悬停才出来
  const topN = new Set(S.mode === 'community' ? [...S.columns.entries()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, narrow ? 3 : 6).map((x) => x[0]) : []);
  for (const p of G.campus.places) {
    const o = G.pinObj.get(p.id), t = tags.get(p.id);
    const crowd = S.mode === 'community';
    const mine = S.mode === 'mine' && (S.pins.get(p.id) || []).some((x) => x.mine);
    const show = revealed && !shot && S.mode !== 'place' && S.mode !== 'time' && (S.hoverPlace === p.id || (crowd && topN.has(p.id)) || mine || (S.mode === 'home' && S.hover === p.z && !narrow));
    const n = crowd ? (S.columns.get(p.id) || 0) : mine ? (S.pins.get(p.id) || []).filter((x) => x.mine).length : (S.pins.get(p.id) || []).length;
    const b = t.querySelector('b');
    const txt = n ? String(n) : '';
    if (b.textContent !== txt) b.textContent = txt;
    t.classList.toggle('is-playing', !!(current && current.e.placeId === p.id));
    const colH = crowd ? o.h : 0;
    placeTag(t, o.group.position.x, o.group.position.y + Math.max(o.head.position.y + 6, colH + 8), o.group.position.z, show);
  }
}

// ====================================================================================
// 每帧
// ====================================================================================
const quality = { samples: [], last: 0, after: Infinity, median: null };
function watchFrames(now) {
  if (lite || now < quality.after || quality.samples.length >= 45 || shot) { quality.last = now; return; }
  if (quality.last) quality.samples.push(now - quality.last);
  quality.last = now;
  if (quality.samples.length === 45) {
    const med = [...quality.samples].sort((a, b) => a - b)[22];
    quality.median = Math.round(med);
    if (med > 40) { lite = true; G.gtao.enabled = false; G.renderer.setPixelRatio(1); G.composer.setPixelRatio(1); resizeNow = true; }
  }
}
let resizeNow = true, lastW = 0, lastH = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!resizeNow && w === lastW && h === lastH) return;
  resizeNow = false; lastW = w; lastH = h;
  G.renderer.setSize(w, h, false);
  G.composer.setSize(w, h);
  G.camera.aspect = w / h;
  const cover = w > 760 ? S.inset : 0, under = w > 760 ? 0 : S.insetBottom;
  if (cover || under) G.camera.setViewOffset(w, h, cover / 2, under / 2, w, h); else G.camera.clearViewOffset();
  G.camera.updateProjectionMatrix();
  G.composer.passes.at(-1).uniforms.uRes.value.set(w * G.renderer.getPixelRatio(), h * G.renderer.getPixelRatio());
}

let lastNow = 0, frames = 0, visible = true;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function frame(now) {
  requestAnimationFrame(frame);
  if (!visible) return;
  frames++;
  const dt = Math.min(0.25, lastNow ? (now - lastNow) / 1000 : 0.016);   // 慢设备一帧很长：动画按真实时间走，不拖尾
  lastNow = now;
  resize();
  // 开场：区块从盘心往外依次立起来
  G.zoneObj.forEach((o) => {
    if (o.rise < 1) {
      if (!revealed) { o.bgroup.scale.y = 0.001; return; }
      const d = Math.hypot(o.c.x, o.c.y) / 700;
      o.rise = Math.min(1, Math.max(0, (now - riseT0 - 900 - d * 520) / 900));
      o.bgroup.scale.y = Math.max(0.001, easeOut(o.rise));
    }
  });
  // 区块：地点模式下，这个地点所在的区块照常，其余压暗；悬停的区块抬一点
  G.zoneObj.forEach((o, id) => {
    const inPlace = S.mode === 'place';
    const sel = inPlace ? S.zone === id : false, hov = !inPlace && S.hover === id && S.mode === 'home';
    o.lift += ((hov ? 6 : 0) - o.lift) * (reduced ? 1 : 0.14);
    o.group.position.y = o.lift;
    const dim = inPlace || (S.mode === 'mine');
    const k = reduced ? 1 : 0.12;
    for (const t of o.tints) t.mat.color.lerp(dim && !sel ? t.dim : t.on, k);
    o.bldMat.userData.win.value += ((dim && !sel ? 0.25 : 1) - o.bldMat.userData.win.value) * k;
  });
  // 地点楼：提起来、慢慢转、垫上纸台座；离开时落回原位
  G.heroObj.forEach((h, pid) => {
    const on = S.mode === 'place' && S.place === pid;
    const goal = on ? LIFT(h) : 0;
    h.lift += (goal - h.lift) * (reduced ? 1 : 1 - Math.exp(-dt / (on ? 0.32 : 0.22)));
    if (Math.abs(goal - h.lift) < 0.05) h.lift = goal;
    h.pivot.position.y = h.lift;
    if (on && !reduced) h.spin += dt * 0.16; else h.spin += (Math.round(h.spin / TAU) * TAU - h.spin) * (reduced ? 1 : 0.08);
    h.pivot.rotation.y = h.spin;
    h.pedestal.visible = h.lift > 0.6;
    h.pedestal.scale.setScalar(Math.min(1, h.lift / Math.max(1, goal || LIFT(h))));
  });
  // 钉点：随区块立起；地点模式下藏起来；社区里升起光柱
  G.pinObj.forEach((o, pid) => {
    const z = G.zoneObj.get(o.zone);
    o.group.position.y = TILE_TOP + z.lift;
    o.group.scale.y = Math.max(0.001, easeOut(z.rise));
    o.group.visible = z.rise > 0.02 && S.mode !== 'place';
    const crowd = S.mode === 'community';
    const goalH = crowd ? 30 + 360 * Math.sqrt((S.columns.get(pid) || 0) / S.colMax) : 0;
    o.h += (goalH - o.h) * (reduced ? 1 : 1 - Math.exp(-dt / 0.45));
    o.column.scale.set(1, Math.max(0.001, o.h), 1);
    o.column.position.y = 0;
    const dark = clock.tokens.dark;
    o.column.material.color.set(S.hoverPlace === pid ? COL.scope : dark ? '#DDE4F0' : '#2B3954');
    o.column.material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    o.column.material.opacity = Math.min(1, o.h / 30) * (dark ? 0.55 : 0.32);
    o.halo.material.opacity = Math.min(1, o.h / 30) * 0.7;
    o.halo.material.color.set(dark ? '#DDE4F0' : '#2B3954');
    if (landing && landing.pid === pid && o.n) {
      const t = reduced ? 1 : Math.min(1, (now - landing.t0) / 900);
      const kk = t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.08;
      const d = o.discs[o.n - 1], y = o.top - 4 + (o.n - 1) * PIN_STEP;
      d.position.y = y + (1 - kk) * 160; d.rotation.y = (1 - kk) * 6;
      o.head.position.y = y + 3.5 + Math.max(0, (1 - kk) * 160);
      if (t >= 1) { d.position.y = y; d.rotation.y = 0; o.head.position.y = y + 3.5; landing = null; }
    }
  });
  stepShot(now);
  controls.update();
  const camD = G.camera.position.distanceTo(controls.target);
  const nearGoal = Math.min(20, Math.max(0.25, camD * 0.02));
  if (Math.abs(G.camera.near - nearGoal) / nearGoal > 0.15) { G.camera.near = nearGoal; G.camera.updateProjectionMatrix(); }
  // 盘面：角度 = 播放位置
  let play = 0;
  const u = G.platterMat.uniforms;
  if (current && !cut) {
    play = position();
    spin = ((TAU * play) / TURN) % TAU;
    u.uPlay.value = play;
    u.uTrail.value = audio.context() && (Math.abs(audio.report.rate) > 0.02 || grab) ? 1 : 0;
  }
  u.uCam.value.copy(G.camera.position);
  if (cut) {
    play = cut.n / cut.fs;
    spin = ((TAU * play) / TURN) % TAU;
    u.uPlay.value = play; u.uTrail.value = 1;
  }
  stepBands(dt);
  const r = stylusRadius(cut ? play : current ? Math.min(play, current.seconds) : 0);
  const seeking = !reduced && now - seekT < 450;
  G.armTo(seeking ? G.ARM.r + (r - G.ARM.r) * 0.2 : r);
  const live = audio.context() && current && Math.abs(audio.report.rate) > 0.02;
  G.needleTip.material.color.set(live ? COL.scope : COL.lathe);
  const armDown = (live || grab || cut) && !seeking;
  armLift += ((armDown ? 0 : 14) - armLift) * (reduced ? 1 : 1 - Math.exp(-dt / (armDown ? 0.08 : 0.12)));
  G.arm.rotation.z = Math.atan2(armLift, G.ARM.L);
  u.uAngle.value = spin + G.ARM.psi;
  G.rim.rotation.y = -u.uAngle.value;
  stepEchoMarks();
  if (G.powerLed) G.powerLed.material.emissiveIntensity += ((motorOn || cut ? 2.4 : 0.15) - G.powerLed.material.emissiveIntensity) * 0.2;
  const lvl = live && current ? Math.min(1, current.env[Math.floor(play * 50)] * 5 || 0) : 0;
  G.contact.material.opacity = armLift < 1.5 && (live || cut) ? 0.35 + 0.65 * (cut ? 0.5 : lvl) : 0;
  G.contact.scale.setScalar(1 + 0.6 * lvl);
  // 正在放的地点：地面上一圈圈往外走的刻纹（地点模式下落在楼的台座下面）
  const pid = current && current.e.placeId;
  const pin = pid && G.pinObj.get(pid);
  if (pin && !cut) {
    const z = G.zoneObj.get(pin.zone), h = G.heroObj.get(pid);
    const base = h ? h.pivot.getWorldPosition(v3).clone() : pin.group.position.clone();
    const yy = h && h.lift > 0.5 ? base.y - 5.4 : TILE_TOP + z.lift + 0.3;
    G.ripples.forEach((rp, i) => {
      rp.visible = true;
      const phase = reduced ? (i + 1) / 5 : ((now / 1000) * 0.45 + i / G.ripples.length) % 1;
      const rad = (h && h.lift > 0.5 ? h.R * 1.05 : 14) + phase * 70;
      rp.scale.set(rad, rad, 1);
      rp.position.set(base.x, yy, base.z);
      rp.material.opacity = (live ? 0.25 + 0.75 * lvl : 0.18) * (1 - phase);
      rp.material.color.set(COL.scope).multiplyScalar(1 + 2.2 * G.U.uNight.value);
    });
  } else G.ripples.forEach((rp) => { rp.visible = false; });
  updateTags();
  stepLight(now);
  const at = current && current.e.at ? current.e.at : current && current.e.date ? `${current.e.date}T12:00:00` : null;
  applySeason((at && seasonOf(at)) || seasonOf(new Date()) || '秋');
  // 移轴：焦平面落在镜头看的那一点；地点模式下虚得多，盘面退成模糊的轮廓
  v3.copy(controls.target).project(G.camera);
  const focus = (v3.y + 1) / 2, dist = camD;
  const inPlace = S.mode === 'place';
  const blurGoal = inPlace ? 3.4 : dist < 2000 ? 2.4 : 0.5;
  tilt += (blurGoal - tilt) * (reduced ? 1 : 0.08);
  // 地点模式下焦平面挪到画面外：整幅都虚（被提起的楼在下面另画一遍，是清楚的）
  focusR += ((inPlace ? -1.3 : focus) - focusR) * (reduced ? 1 : 0.08);
  const W = Math.max(1, canvas.clientWidth);
  G.tiltH.uniforms.h.value = tilt / W;
  G.tiltV.uniforms.v.value = (tilt / W) * W / Math.max(1, canvas.clientHeight);
  G.tiltH.uniforms.r.value = G.tiltV.uniforms.r.value = focusR;
  G.composer.render();
  // 选择性聚焦（学 Confused-Tree 声景校园的双层画法，但在同一块画布里）：只画第 1 层（地点楼、台座、波纹），清掉深度、不画背景、不重画阴影
  let anyLift = false;
  G.heroObj.forEach((h) => { if (h.lift > 0.5) anyLift = true; });
  if (anyLift) {
    const r = G.renderer, bg = G.scene.background, ac = r.autoClear, su = r.shadowMap.autoUpdate;
    r.autoClear = false; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(null);
    r.clearDepth();
    G.scene.background = null;
    // 第 1 层上有全部 16 栋地点楼：这一遍只留被提起来的，别的在上一遍里已经画过（虚的）
    const off = [];
    G.heroObj.forEach((h) => { if (h.lift <= 0.5 && h.pivot.visible) { h.pivot.visible = false; off.push(h); } });
    G.camera.layers.set(1);
    r.render(G.scene, G.camera);
    G.camera.layers.set(0);
    for (const h of off) h.pivot.visible = true;
    G.scene.background = bg; r.autoClear = ac; r.shadowMap.autoUpdate = su;
  }
  watchFrames(now);
}
let tilt = 0.5, focusR = 0.5;

// ====================================================================================
// 启动
// ====================================================================================
/** 搭舞台。canvas 与地名签的容器由页面给。返回 false = 这个浏览器画不出三维。 */
export async function init(canvasNode, labelsNode, campus) {
  canvas = canvasNode; labelsEl = labelsNode;
  const q = new URLSearchParams(location.search).get('q');
  lite = q === 'lite';
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) throw new Error('no webgl2');
    const dbg = probe.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    if (q !== 'full' && /SwiftShader|llvmpipe|Software/i.test(name)) lite = true;   // 软渲染：直接用省电档
  } catch { return false; }
  // 建场景要占住主线程一两秒：先让浏览器把屏风画出来
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await document.fonts.load('30px "Zhuque"').catch(() => {});
  G = build(canvas, campus, { lite });
  controls = new OrbitControls(G.camera, canvas);
  G.camera.far = 20000; G.camera.updateProjectionMatrix();
  Object.assign(controls, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.32, maxPolarAngle: 1.18, minDistance: 18, maxDistance: 14000, rotateSpeed: 0.6, zoomSpeed: 0.7 });
  buildTags();
  wirePointer();
  built = true;
  paintPins();
  syncEchoMarks();
  if (current) {
    G.grooveTex.image.data.set(current.tex); G.grooveTex.needsUpdate = true;
    fillWave(current.pcm, current.fs);
    const u = G.platterMat.uniforms;
    u.uHas.value = 1; u.uCut.value = current.seconds; u.uDur.value = current.dur;
  }
  resize();
  applyPose(S.mode === 'screen' ? grooveClose() : (POSES[S.mode] || POSES.home)());
  controls.update();
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; lastNow = 0; });
  requestAnimationFrame(frame);
  if (pendingReveal) { const p = pendingReveal; pendingReveal = null; reveal(p); }
  window.__stage = { get mode() { return S.mode; }, get place() { return S.place; }, get frames() { return frames; }, get flying() { return !!shot; }, get lite() { return lite; }, get quality() { return quality.median; },
    shows, get season() { return seasonCur; }, get pos() { return position(); }, get playing() { return playing(); }, get clip() { return current && current.e.id; },
    heroLift: (pid) => G.heroObj.get(pid)?.lift ?? null, column: (pid) => G.pinObj.get(pid)?.h ?? null, get revealed() { return revealed; },
    pinScreen: (pid) => { const o = G.pinObj.get(pid); const v = o.group.position.clone().setY(o.group.position.y + o.head.position.y - 2).project(G.camera); const r = canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    heroScreen: (pid) => { const h = G.heroObj.get(pid); const v = h.pivot.getWorldPosition(new THREE.Vector3()).setY(TILE_TOP + h.size.y * 0.5).project(G.camera); const r = canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    dbg: () => ({ calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles }) };
  return true;
}
export const isBuilt = () => built;
export const isLite = () => lite;
/** 凑近看刻槽 / 退回来。 */
export function zoomGroove(inOut) {
  if (!current) return;
  if (inOut) play([{ to: grooveClose, dur: 3800, ease: 'smoother', look: 'early' }]);
  else play([{ to: POSES[S.mode] || POSES.home, dur: 2600, ease: 'smoother', look: 'late' }]);
}
