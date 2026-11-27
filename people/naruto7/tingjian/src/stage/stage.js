// 听见校园 · 舞台：整站唯一的一块三维画布。换板块只换机位和模式，所以过场是连贯的一镜（DESIGN.md §4）。
// 这里「演」：每帧的光（读 clock.js 的钟点）、机位与过场、地点楼的提起与落回、社区的数据、唱片的刻纹与唱臂、搓盘、刻。
// 场景怎么「搭」在 scene.js（移植自刻声 plan3d.js）。页面（Vue）只通过下面导出的函数说话，不碰 three.js。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { build, setTier, tier as tierNow, TIERS, RIN, ROUT, RP, TILE_TOP, LABEL_R, TAU, COL, WAVE_FS, WAVE_W, WAVE_H, EX } from './scene.js';
import { cutWhole, GrooveCutter, TURN, TEX_W, BANDS, R0, R1, PITCH, MAX_SEC } from '../kesheng/web/groove.js';
import { semesterBands, bandLayout, bandAt } from '../kesheng/web/plan3d/bands.js';
import { rigFor } from '../kesheng/web/plan3d/light-rig.js';
import { SCENERY, crownPick, seasonOf } from '../kesheng/web/plan3d/model.js';
import { clock, toHex, tokensAt } from '../lib/clock.js';
import * as audio from '../lib/audio.js';
import { paintGround, paintMedal, medalSpec } from './ground.js';
import { createDataFx } from './datafx.js';
import { attachSplat, detachSplat, stepSplat, splatState } from './splat.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let G = null;                 // scene.js 返回的句柄
let controls = null, canvas = null, labelsEl = null;
let built = false, revealed = false, lite = false, warmed = false;
const cb = { place: () => {}, zone: () => {}, empty: () => {}, clip: () => {}, state: () => {} };
export const on = (k, f) => { cb[k] = f; };

// ====================================================================================
// 状态
// ====================================================================================
const S = {
  mode: 'screen',             // screen 屏风后 / home 留声机 / place 地点 / community 社区 / time 年轮 / mine 我的
  place: null, zone: null, hover: null, hoverPlace: null,
  pins: new Map(),            // placeId → [{ mine, age(0..1), id }]（下面的最早）
  mineOnly: false,            // 我的：只有我的盘亮
  bands: [], open: [], layout: [], hoverBand: -1, activeBand: -1, focusSem: null,
  echoes: [], echoActive: -1,
  data: null,                 // 社区的数据地图：{ form, metric, stats, hour }；null = 原始地图
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
  // 首页（组长 2026-11-26：唱机小、镜头远，四周一大片空的纯色和它对着干）：镜头压近，盘心的校园撑满左边那块，
  // 唱机的底座和唱臂出画，画面里看不到「一台唱机悬在空里」的边；剩下的背景只是边角上的一点
  home: () => ({ t: V(40, 0, 30), d: fitDist(RIN * 1.16), polar: 0.7, az: -0.36 }),
  community: () => {
    const f = S.data && S.data.form;
    if (f === 'lights') return { t: V(0, 0, 40), d: Math.max(2500, fitDist(RIN * 1.1)), polar: 0.42, az: -0.18 };       // 夜景：像卫星，偏俯看
    if (f === 'nebula' || f === 'surface' || f === 'fill') return { t: V(0, 80, 20), d: Math.max(2500, fitDist(RIN * 1.15)), polar: 0.86, az: -0.5 };   // 有高度的：斜着看，峰才立得起来
    if (f) return { t: V(0, 0, 40), d: Math.max(2600, fitDist(RIN * 1.18)), polar: 0.36, az: -0.18 };   // 地面上的图：俯看
    return { t: V(0, 40, 0), d: Math.max(3100, fitDist((RP + 200) * 1.12)), polar: 0.66, az: -0.62 };
  },
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
  const r = Math.max(h.size.x, h.size.z) * 0.62 + h.size.y * 0.8 + 14;   // 楼连同台座占画面一大半（2026-11-26 拉近：细节要看得见）
  return { t: V(wp.x, TILE_TOP + z.lift + LIFT(h) * 0.7 + h.size.y * 0.35, wp.z), d: Math.max(220, fitDist(r)), polar: 1.1, az: heroAz(h) };   // 放低一点：多看立面、少看屋顶
}
// 进楼的机位固定（组长 2026-11-26：楼不要转，选一个效果好的角度）：从东南方向看四分之三面，正面（朝南、长的那一面）占大半，
// 东山墙收在右边；南北窄长的楼（长边朝东）改从东偏南看。世界坐标 +z 是南
const heroAz = (h) => (h.size.z > h.size.x * 1.25 ? Math.PI / 2 - 0.55 : 0.55);
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
// —— 重点楼的 splat 特写：清单里有这个地点就挂真点云，没有就什么都不做（细节在 splat.js）——
let splatAt = null;
function syncSplat() {
  if (!built) return;
  const pid = S.mode === 'place' && S.place ? S.place : null;
  if (pid === splatAt) return;
  splatAt = pid;
  const h = pid ? G.heroObj.get(pid) : null;
  if (h) attachSplat(pid, h.pivot, { renderer: G.renderer, scene: G.scene, pedestal: h.pedestal });
  else detachSplat();
}

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
  if (built && G.ground) G.ground.visible = mode === 'community' && !!S.data && GROUND_FORMS.has(S.data.form);
  G.controls_minPolar = mode === 'time' ? 0.02 : 0.32;
  controls.minPolarAngle = G.controls_minPolar;
  if (!revealed) return;
  syncSplat();

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
    // 个体 → 群体：楼落回盘里，镜头拉高看整张盘，再转到目标；星云在最后一段里聚起来
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
  syncSplat();
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
// 数据进来：钉点上的盘、学期带、回声针
// ====================================================================================
/** pins：Map(placeId → [{ id, mine, age }])，按时间从早到晚。 */
export function setPins(pins) { S.pins = pins; shadowDirty = true; if (built) paintPins(); }
/** 数据地图。d = { form, metric, stats: Map(placeId → 统计), values: Map(placeId → 数), hour } 或 null（回到原始地图）。
 *  星云、夜景、曲面、注满是三维的（datafx.js）；热力、等高线、年轮、钟面画在地面贴图上。换画法时俯仰角跟着变（地面上的图要俯看）。 */
const FX_FORMS = new Set(['nebula', 'lights', 'surface', 'fill']);
const GROUND_FORMS = new Set(['heat', 'contour', 'rings', 'clock']);
export function setData(d) {
  const prevForm = S.data ? S.data.form : null;
  S.data = d;
  S.night = !!d && d.pal === 'night';
  if (!built) return;
  const fx = !!d && FX_FORMS.has(d.form);
  const nightAhead = S.night || clock.tokens.dark;
  G.fx.set(fx ? { form: d.form, values: d.values, colors: d.colors, metric: d.metric, dark: nightAhead, plain: !!d.plain } : { form: null, values: new Map() });
  const on = !!d && GROUND_FORMS.has(d.form);
  if (on) {
    const t = clock.tokens;
    paintGround(G.groundCanvas, { E: RIN, places: G.campus.places.map((p) => ({ id: p.id, x: p.x / 10, z: -p.y / 10 })), stats: d.stats, metric: d.metric, form: d.form, dark: t.dark, ink: t.ink.map(Math.round), hour: d.hour });
    G.groundTex.needsUpdate = true;
    // 白天正常叠（像墨印在纸上），夜里相加（像光）
    G.ground.material.blending = t.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    G.ground.material.needsUpdate = true;
  }
  G.ground.visible = on;
  // 年轮、钟面：每个地方上空一张小盘
  const medal = !!d && (d.form === 'rings' || d.form === 'clock');
  if (medal) {
    const t = clock.tokens, spec = medalSpec(d.stats, d.metric, G.campus.places.map((p) => ({ ...p, name: p.name })), t.dark);
    for (const m of spec.list) {
      const o = G.pinObj.get(m.id);
      const has = m.items.length > 0;
      o.medal.visible = has;
      if (!has) continue;
      paintMedal(o.medalCanvas, d.form, m.items, { c: m.c, dark: t.dark, hour: d.hour, cmax: spec.cmax });
      o.medalTex.needsUpdate = true;
      o.medalR = 24 + 22 * m.k;
    }
  } else for (const o of G.pinObj.values()) o.medal.visible = false;
  S.medals = medal;
  const kind = (f) => (!f ? 0 : f === 'lights' ? 1 : FX_FORMS.has(f) ? 2 : 3);
  if (S.mode === 'community' && revealed && kind(prevForm) !== kind(d && d.form)) play([{ to: POSES.community, dur: 1100, ease: 'inOut' }]);
}
/** 全部条目（含史料与概念盘）：外圈一个学期一带。 */
export function setBands(list) {
  S.bands = semesterBands(list).slice(-32);
  S.open = S.bands.map((b, i) => S.open[i] || 0);
}
export const bands = () => S.bands.map((b) => ({ semester: b.semester, label: b.label, n: b.n }));
/** 年轮里点一个学期：那一带展开（不换正在放的盘）。null = 跟着正在放的那张。 */
export function focusSemester(sem) { S.focusSem = sem; }
/** 年轮的放法 A（唱片变星系）：校园沉进盘里，盘心让给星系（页面上一块圆的画布叠在盘心上，见 discScreen）。 */
export function setSink(on) { S.sink = !!on; }
let sinkK = 0;
/** 盘心（刻纹带以内）此刻在屏幕上的圆：{ x, y, r }（CSS 像素）；镜头还在飞时 settled = false。 */
export function discScreen() {
  if (!built) return null;
  const c = v3.set(0, 0.5, 0).project(G.camera), W = canvas.clientWidth, H = canvas.clientHeight;
  const x = ((c.x + 1) / 2) * W, y = ((1 - c.y) / 2) * H;
  const e = v3.set(RIN - 14, 0.5, 0).project(G.camera), ex = ((e.x + 1) / 2) * W, ey = ((1 - e.y) / 2) * H;
  const r0 = canvas.getBoundingClientRect();
  return { x: x + r0.left, y: y + r0.top, r: Math.hypot(ex - x, ey - y), settled: !shot, k: sinkK };
}
/** 这张盘上的回声：[{ t, mine }]；active 是正在浮起的那一条的下标。 */
export function setEchoes(list) { S.echoes = list || []; syncEchoMarks(); }
export function setEchoActive(i) { S.echoActive = i; }

const MAXD = 14, PIN_STEP = 2.2;
// 数据地图里校园的素纸色。白天的太阳很强（场景亮度会超过 1，最后的色调映射再压回白）：纸色要压得够暗，
// 照亮之后才刚好是浅纸色；不然半透明的墨盖上去，也会被色调映射压回白，什么都看不见（2026-11-25 实测）
const DATA_LIGHT = new THREE.Color('#8B8F93'), DATA_DARK = new THREE.Color('#242B3C'), DATA_NIGHT = new THREE.Color('#18202F');
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
  lastPlay = 0;
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
  // 放完停在末尾的那张：再按就从头放
  if (!motorOn && position() >= current.seconds - 0.05) { audio.post({ seek: 0, rate: 0 }); Object.assign(audio.report, { pos: 0, rate: 0, t: audio.context().currentTime }); lastPlay = 0; }
  setMotor(!motorOn);
}
export async function seek(t) {
  if (!current) return;
  await audio.ensureCtx();
  if (pendingBuffer) { audio.post({ buffer: current.pcm, sampleRate: current.fs }); pendingBuffer = false; }
  const x = Math.max(0, Math.min(current.seconds, t));
  audio.post({ seek: x / current.dur, rate: 1 });
  Object.assign(audio.report, { pos: x * current.fs, rate: 1, t: audio.context().currentTime });
  lastPlay = x;
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

// —— 那一晚：一个人一个晚上在校园里走过、录下的几处。地上一条虚线连起来（只画已经走过的那一段），
//    一颗示波黄的光点从上一处走到这一处；每到一处，那里的签亮起来。stops = [{ pid, label }]；at = 当前走到第几处 ——
const walk = { group: null, ribbon: null, dot: null, halo: null, marks: [], pts: [], at: -1, from: null, t0: 0, dur: 1, on: false, path: [] };
const WALK_W = 7;   // 路线的宽（米）
function walkPos(pid) {
  const o = G.pinObj.get(pid);
  return o ? new THREE.Vector3(o.group.position.x, TILE_TOP + 3, o.group.position.z) : null;
}
/** 一条贴地的带子：沿折线两侧各偏 w/2，uv.x 是累计长度（米），着色器里用它画虚线和流动 */
function ribbonGeo(pts, w) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    if (i) acc += pts[i].distanceTo(pts[i - 1]);
    pos.push(pts[i].x + nx * w / 2, pts[i].y, pts[i].z + nz * w / 2, pts[i].x - nx * w / 2, pts[i].y, pts[i].z - nz * w / 2);
    uv.push(acc, 0, acc, 1);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
export function setWalk(stops) {
  if (!built) return;
  if (!walk.group) {
    walk.group = new THREE.Group();
    const rmat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(COL.scope) }, uT: { value: 0 }, uLen: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uT, uLen;
        void main(){
          float across = 1.0 - abs(vUv.y * 2.0 - 1.0);            // 中间实、两边虚
          float core = smoothstep(0.35, 0.75, across);
          float dash = step(0.42, fract((vUv.x - uT * 26.0) / 16.0)); // 往前流的虚线
          float tail = smoothstep(0.0, 40.0, vUv.x) * (0.55 + 0.45 * smoothstep(uLen - 160.0, uLen, vUv.x)); // 起点淡入，越近走到的越亮
          float a = (0.28 * across + 0.72 * core * dash) * tail;
          gl_FragColor = vec4(uCol * (1.0 + 0.6 * core), a);
        }`,
    });
    walk.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), rmat);
    walk.ribbon.renderOrder = 5;
    walk.dot = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 14), new THREE.MeshBasicMaterial({ color: '#FFF4CC', toneMapped: false, depthTest: false }));
    walk.dot.renderOrder = 7;
    walk.halo = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64), new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false, toneMapped: false }));
    walk.halo.rotation.x = -Math.PI / 2; walk.halo.renderOrder = 6;
    walk.group.add(walk.ribbon, walk.dot, walk.halo);
    G.scene.add(walk.group);
  }
  for (const m of walk.marks) walk.group.remove(m);
  walk.marks = [];
  walk.pts = (stops || []).map((x) => walkPos(x.pid)).filter(Boolean);
  // 一处一个落脚圈：同一处录了好几段，只画一个
  const seen = new Set();
  for (const p of walk.pts) {
    const k = `${Math.round(p.x)},${Math.round(p.z)}`;
    if (seen.has(k)) continue; seen.add(k);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 48), new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p); m.renderOrder = 6; m.userData.k = k; m.userData.hit = 0;
    walk.group.add(m); walk.marks.push(m);
  }
  walk.on = walk.pts.length > 0;
  walk.at = -1; walk.from = null; walk.path = [];
  walk.group.visible = walk.on;
  S.walking = walk.on;
  if (walk.on && revealed && S.mode !== 'place') {   // 镜头退到刚好装下整条路线，俯得多一点：路线才读得出来
    const c = walk.pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(walk.pts.length);
    const r = Math.max(160, ...walk.pts.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
    play([{ to: { t: V(c.x, TILE_TOP, c.z), d: Math.max(700, fitDist(r * 1.35 + 60)), polar: 0.58, az: poseNow().az }, dur: 1400, ease: 'inOut' }]);
  }
}
/** 走到第 i 处：光点用 dur 毫秒从上一处走过去，带子跟着长。 */
export function walkTo(i, dur = 1600) {
  if (!walk.on || !walk.pts[i]) return;
  if (walk.at >= 0) walk.path.push(walk.dot.position.clone());
  walk.from = walk.at >= 0 ? walk.dot.position.clone() : walk.pts[i].clone();
  walk.at = i; walk.t0 = performance.now(); walk.dur = reduced ? 1 : Math.max(1, dur);
}
export function endWalk() {
  const was = walk.on;
  if (walk.group) walk.group.visible = false;
  walk.on = false; walk.at = -1; S.walking = false;
  if (was && revealed && S.mode !== 'place') play([{ to: POSES[S.mode] || POSES.home, dur: 1200, ease: 'inOut' }]);
}
function stepWalk(now) {
  if (!walk.on || walk.at < 0) { if (walk.group) walk.group.visible = false; return; }
  walk.group.visible = S.mode !== 'place';
  const k = Math.min(1, (now - walk.t0) / walk.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const goal = walk.pts[walk.at];
  walk.dot.position.lerpVectors(walk.from, goal, e);
  const pts = walk.path.concat([walk.dot.position.clone()]).filter((p, i, a) => !i || p.distanceTo(a[i - 1]) > 0.5);
  if (pts.length > 1) {
    walk.ribbon.geometry.dispose();
    walk.ribbon.geometry = ribbonGeo(pts, WALK_W);
    let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    walk.ribbon.material.uniforms.uLen.value = len;
    walk.ribbon.visible = true;
  } else walk.ribbon.visible = false;
  walk.ribbon.material.uniforms.uT.value = reduced ? 0 : now / 1000;
  const sc = Math.max(0.7, G.camera.position.distanceTo(controls.target) / 1400);
  walk.dot.scale.setScalar(sc);
  const ph = reduced ? 0.5 : ((now / 1000) * 0.7) % 1;
  walk.halo.position.copy(walk.dot.position);
  walk.halo.scale.setScalar((9 + ph * 30) * sc);
  walk.halo.material.opacity = 0.7 * (1 - ph);
  // 落脚圈：走到过的亮着，正在的那一处最亮
  const here = `${Math.round(goal.x)},${Math.round(goal.z)}`;
  for (const m of walk.marks) {
    if (k >= 1 && m.userData.k === here) m.userData.hit = 1;
    const tgt = m.userData.k === here && k >= 1 ? 0.95 : m.userData.hit ? 0.45 : 0.12;
    m.material.opacity += (tgt - m.material.opacity) * 0.12;
    m.scale.setScalar(18 * sc);
  }
}

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
// 阴影（2026-11-26，进站掉帧）：阴影贴图原来每帧都把整个校园再画一遍。现在只在有东西动的时候重画：太阳挪了、区块在立起或抬起、
// 地点楼在提起或转、盘落到针上、唱臂在动、季节换了、校园在沉。其余的帧沿用上一张
let shadowDirty = true;
const sunLast = new THREE.Vector3();
const tmpC = new THREE.Color();
// 夜观：数据地图选「夜观色」时，舞台的光与背景渐变到入夜的蓝紫（21:30），页面的纸照旧跟着钟点。离开就渐变回来
const NIGHT_T = tokensAt(21.5);
const MOON = new THREE.Color().setRGB(0.46, 0.58, 0.86), MOON_GROUND = new THREE.Color().setRGB(0.03, 0.045, 0.08);
let nightK = 0, mixed = null;
const lerpA = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function toks() {
  const a = clock.tokens;
  if (nightK < 0.001) return a;
  const b = NIGHT_T, t = nightK;
  if (!mixed || mixed.a !== a || mixed.t !== t) {
    const daz = ((b.light.az - a.light.az + 540) % 360) - 180;
    const light = { az: (a.light.az + daz * t + 360) % 360, col: lerpA(a.light.col, b.light.col, t) };
    for (const k of ['el', 'i', 'hemi', 'night', 'lit', 'plat']) light[k] = a.light[k] + (b.light[k] - a.light[k]) * t;
    mixed = { a, t, v: { ...a, dark: t > 0.5 ? true : a.dark, bg0: lerpA(a.bg0, b.bg0, t), bg1: lerpA(a.bg1, b.bg1, t), light } };
  }
  return mixed.v;
}
function stepLight(now) {
  const T = toks(), L = T.light;
  const az = (L.az * Math.PI) / 180, el = (L.el * Math.PI) / 180;
  G.sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(2400);
  if (G.sun.position.distanceToSquared(sunLast) > 4) { sunLast.copy(G.sun.position); shadowDirty = true; }
  G.sun.intensity = L.i;
  G.sun.color.setRGB(L.col[0] / 255, L.col[1] / 255, L.col[2] / 255, THREE.SRGBColorSpace);
  G.sun.color.lerp(MOON, L.night * 0.4);   // 夜里这盏就是月亮：token 的紫只管纸和背景，打在楼顶上的光偏冷蓝
  const u = G.platterMat.uniforms;
  u.uSunDir.value.copy(G.sun.position).normalize();
  u.uSunCol.value.set(G.sun.color.r, G.sun.color.g, G.sun.color.b).multiplyScalar(L.i);
  const hexCol = toHex(L.col);
  const rig = rigFor(hexCol);
  u.uBoxCol.value.forEach((v, i) => v.set(rig.boxes[i][0], rig.boxes[i][1], rig.boxes[i][2]).multiplyScalar(G.STUDIO[i].i));
  // 月光（2026-11-27 夜景写实）：夜里的主光色偏紫（#A8A2E0），天光跟着它，整城是一层均匀的紫。
  // 月下的天光其实是冷蓝的，暖的只有窗和路灯——入夜时把半球光的天色往冷蓝拉，地面反光也跟着冷，冷暖才分得开
  const mk = L.night * 0.55;
  G.hemi.color.setRGB(rig.sky[0], rig.sky[1], rig.sky[2]).lerp(MOON, mk);
  G.hemi.groundColor.setRGB(rig.ground[0], rig.ground[1], rig.ground[2]).lerp(MOON_GROUND, mk);
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
  G.zoneObj.forEach((o) => { o.poolMat.opacity = 0.75 * L.night; });   // 路灯下那一圈暖光：和冷的月光对着，灯下才像有灯
  // 操场（2026-11-26 组员：整站变色时操场一直不变，突兀）：草皮、塑胶跑道的饱和色在暗光下仍然显眼，
  // 画线是不受光的白线。入夜时两种场地色往这个钟点的天光色里褪、压暗；画线跟着天光的亮度走
  const nk = L.night, sunK = Math.min(1, L.i / 2.6);
  tmpC.setRGB(L.col[0] / 255, L.col[1] / 255, L.col[2] / 255, THREE.SRGBColorSpace);
  for (const z of G.seasonal) {
    if (!z.pitchMat) continue;
    for (const t of z.tints) {
      if (t.mat === z.pitchMat) t.on.set('#5E9A5A').lerp(tmpC, 0.18 + 0.3 * nk).multiplyScalar(1 - 0.35 * nk);
      else if (t.mat === z.trackMat) t.on.set('#B85C45').lerp(tmpC, 0.18 + 0.3 * nk).multiplyScalar(1 - 0.35 * nk);
    }
    z.lineMat.color.set(COL.paper).multiply(tmpC).multiplyScalar(0.35 + 0.65 * sunK);
    z.lineMat.opacity = 0.85 - 0.45 * nk;
  }
  G.bloom.strength = 0.08 + 0.42 * L.night;
  G.bloom.threshold = 1.9;          // 只让窗灯、路灯、示波黄发亮
  // 唱盘顶面那圈金属边：平环像镜子，把月光整片反进镜头，峰值远超阈值，bloom 一放就是一团紫光。入夜压暗反射率、磨成缎面
  G.lip.material.color.set('#D9DDE1').multiplyScalar(1 - 0.6 * L.night);
  G.lip.material.roughness = 0.18 + 0.3 * L.night;
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
  shadowDirty = true;
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
// 签先算好位置，最后一起避让：按数从大到小，压到前面已经放下的签就先藏起来（悬停的、正在放的总是显示）
function placeTag(t, x, y, z, show, below = false, rank = 0, must = false) {
  if (!show) return null;
  v3.set(x, y, z).project(G.camera);
  if (v3.z > 1) return null;
  const sx = ((v3.x + 1) / 2) * canvas.clientWidth, sy = ((1 - v3.y) / 2) * canvas.clientHeight;
  const w = t._w || (t._w = Math.max(60, t.textContent.length * 13 + 34)), h = 26;
  return { t, sx, sy, below, rank, must, box: [sx - w / 2, below ? sy + 2 : sy - h, sx + w / 2, below ? sy + 2 + h : sy] };
}
function updateTags() {
  const narrow = canvas.clientWidth < 720;
  // 社区里只给最高的几根挂名字（全挂会叠成一团），其余的悬停才出来
  const vals = S.data ? S.data.values : new Map();
  const topN = new Set(S.mode === 'community' ? [...vals.entries()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, narrow ? 3 : 6).map((x) => x[0]) : []);
  const want = [];
  for (const p of G.campus.places) {
    const o = G.pinObj.get(p.id), t = tags.get(p.id);
    const crowd = S.mode === 'community';
    const mine = S.mode === 'mine' && (S.pins.get(p.id) || []).some((x) => x.mine);
    const show = revealed && !shot && S.mode !== 'place' && S.mode !== 'time' && (S.hoverPlace === p.id || (crowd && (S.medals ? o.medal && o.medal.visible : topN.has(p.id))) || mine || (S.mode === 'home' && S.hover === p.z && !narrow));
    const n = crowd ? (vals.get(p.id) || 0) : mine ? (S.pins.get(p.id) || []).filter((x) => x.mine).length : (S.pins.get(p.id) || []).length;
    const b = t.querySelector('b');
    const txt = n ? (crowd && (!S.data || S.data.metric === 'count') ? `${n} 张` : String(n)) : '';
    if (b.textContent !== txt) { b.textContent = txt; t._w = 0; }
    const playingHere = !!(current && current.e.placeId === p.id);
    t.classList.toggle('is-playing', playingHere);
    const must = S.hoverPlace === p.id || playingHere;
    let q;
    const fy = crowd && S.data && FX_FORMS.has(S.data.form) ? G.fx.tagY(p.id) : null;
    if (fy != null) q = placeTag(t, o.group.position.x, fy, o.group.position.z, show, false, n, must);
    else if (crowd && S.medals && o.medal && o.medal.visible) q = placeTag(t, o.group.position.x, o.group.position.y + o.medal.position.y, o.group.position.z + o.medalR * 1.02, show, true, n, must);   // 小盘模式：签挂在盘的下沿（朝镜头那一边）
    else q = placeTag(t, o.group.position.x, o.group.position.y + Math.max(o.head.position.y + 6, (crowd ? o.h : 0) + 10), o.group.position.z, show, false, n, must);
    if (q) want.push(q); else if (t.style.display !== 'none') t.style.display = 'none';
  }
  want.sort((a, b) => (b.must - a.must) || (b.rank - a.rank));
  const put = [];
  for (const q of want) {
    const [x0, y0, x1, y1] = q.box;
    const hit = !q.must && put.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0);
    if (hit) { if (q.t.style.display !== 'none') q.t.style.display = 'none'; continue; }
    put.push(q.box);
    q.t.style.display = '';
    q.t.style.transform = `translate(${q.sx}px, ${q.sy}px) translate(-50%, ${q.below ? '2px' : '-100%'})`;
  }
}

// ====================================================================================
// 每帧
// ====================================================================================
// —— 画质：按实测的帧时降档（scene.js TIERS）。过场里不量；量的是这一档稳定下来之后的 45 帧 ——
//   起点：独显 high、其余 mid、软渲染与触屏 low。太慢（中位数 > 40 ms）降一档，再量。只降不升：屏幕刷新率把帧时封在 16.7 ms，量不出余量。
//   落定的档记在本机（同一块显卡），下次从它开始，照样会降
const quality = { samples: [], last: 0, after: Infinity, median: null, pinned: false };
const LADDER = ['low', 'mid', 'high'];
let gpuName = '';
const strongGpu = () => /NVIDIA|GeForce|RTX|Quadro|Radeon RX|Radeon Pro|Arc A|Apple M\d (Pro|Max|Ultra)/i.test(gpuName);
function remember(t) { try { localStorage.setItem('tj-tier', JSON.stringify({ t, gpu: gpuName })); } catch { /* 隐私模式 */ } }
function goTier(t) {
  shadowDirty = true;
  setTier(t); lite = t === 'low'; resizeNow = true;
  quality.samples = []; quality.last = 0; quality.after = performance.now() + 1500;
}
function watchFrames(now) {
  if (quality.pinned || now < quality.after || shot || quality.samples.length >= 45) { quality.last = now; return; }
  if (quality.last) quality.samples.push(now - quality.last);
  quality.last = now;
  if (quality.samples.length < 45) return;
  const med = [...quality.samples].sort((a, b) => a - b)[22];
  quality.median = Math.round(med);
  const i = LADDER.indexOf(tierNow());
  if (med > 40 && i > 0) { goTier(LADDER[i - 1]); return; }
  remember(tierNow());
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
    if (sinkK > 0.001 || o.sunk) { o.bgroup.scale.y = Math.max(0.001, easeOut(o.rise) * (1 - 0.985 * sinkK)); o.sunk = sinkK > 0.001; }
  });
  const sinkGoal = S.sink && S.mode === 'time' ? 1 : 0;
  sinkK += (sinkGoal - sinkK) * (reduced ? 1 : 1 - Math.exp(-dt / 0.35));
  if (Math.abs(sinkGoal - sinkK) < 0.002) sinkK = sinkGoal;
  // 区块：地点模式下，这个地点所在的区块照常，其余压暗；悬停的区块抬一点
  G.zoneObj.forEach((o, id) => {
    const inPlace = S.mode === 'place';
    const sel = inPlace ? S.zone === id : false, hov = !inPlace && S.hover === id && S.mode === 'home';
    o.lift += ((hov ? 6 : 0) - o.lift) * (reduced ? 1 : 0.14);
    o.group.position.y = o.lift;
    const data = S.mode === 'community' && !!S.data && !S.data.plain;   // plain：社区的原始地图，校园照旧上色，只在上空加星云
    const dim = inPlace || (S.mode === 'mine') || data || !!S.walking;   // 那一晚：城市压暗，路线才浮得出来
    const k = reduced ? 1 : 0.12;
    // 数据地图：校园褪成一张素纸（亮时浅、暗时深），地面上的图才压得住
    const paleC = S.data && S.data.form === 'lights' ? DATA_NIGHT : toks().dark ? DATA_DARK : DATA_LIGHT;
    for (const t of o.tints) t.mat.color.lerp(data ? paleC : dim && !sel ? t.dim : t.on, k);
    // 夜景给楼留一点点窗灯（其余数据画法照旧关掉）：楼的轮廓和体块才看得出
    const winGoal = data && FX_FORMS.has(S.data.form) ? (S.data.form === 'lights' && S.night ? 0.06 : 0) : S.walking ? 0.12 : dim && !sel ? 0.25 : 1;
    o.bldMat.userData.win.value += (winGoal - o.bldMat.userData.win.value) * k;
  });
  // 地点楼：提起来、垫上纸台座；离开时落回原位
  G.heroObj.forEach((h, pid) => {
    const on = S.mode === 'place' && S.place === pid;
    const goal = on ? LIFT(h) : 0;
    h.lift += (goal - h.lift) * (reduced ? 1 : 1 - Math.exp(-dt / (on ? 0.32 : 0.22)));
    if (Math.abs(goal - h.lift) < 0.05) h.lift = goal;
    h.pivot.position.y = h.lift;
    h.spin += (Math.round(h.spin / TAU) * TAU - h.spin) * (reduced ? 1 : 0.08);   // 不再自转；旧的转角收回到正
    h.pivot.rotation.y = h.spin;
    for (const mt of h.mats) if (mt.userData.detail) mt.userData.detail.value = Math.min(1, h.lift / LIFT(h));
    h.pedestal.visible = h.lift > 0.6;
    h.pedestal.scale.setScalar(Math.min(1, h.lift / Math.max(1, goal || LIFT(h))));
  });
  // 钉点：随区块立起；地点模式下藏起来
  G.pinObj.forEach((o, pid) => {
    const z = G.zoneObj.get(o.zone);
    o.group.position.y = TILE_TOP + z.lift;
    o.group.scale.y = Math.max(0.001, easeOut(z.rise));
    o.group.visible = z.rise > 0.02 && S.mode !== 'place' && sinkK < 0.4;
    if (o.medal && o.medal.visible) {
      o.medal.position.y = o.top + 30 + (reduced ? 0 : Math.sin(now / 1400 + o.top) * 1.5);
      o.medal.scale.setScalar(o.medalR);
      o.medal.visible = S.mode === 'community' && !!S.medals;
    }
    if (landing && landing.pid === pid && o.n) {
      const t = reduced ? 1 : Math.min(1, (now - landing.t0) / 900);
      const kk = t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.08;
      const d = o.discs[o.n - 1], y = o.top - 4 + (o.n - 1) * PIN_STEP;
      d.position.y = y + (1 - kk) * 160; d.rotation.y = (1 - kk) * 6;
      o.head.position.y = y + 3.5 + Math.max(0, (1 - kk) * 160);
      if (t >= 1) { d.position.y = y; d.rotation.y = 0; o.head.position.y = y + 3.5; landing = null; }
    }
  });
  const nightGoal = S.night && S.mode === 'community' ? 1 : 0;
  nightK += (nightGoal - nightK) * (reduced ? 1 : 1 - Math.exp(-dt / 0.5));
  if (Math.abs(nightK - nightGoal) < 0.002) nightK = nightGoal;
  G.fx.step(dt, { camera: G.camera, height: canvas.clientHeight, pixelRatio: G.renderer.getPixelRatio(), reduced });
  stepShot(now);
  stepSplat(dt);
  controls.update();
  const camD = G.camera.position.distanceTo(controls.target);
  const nearGoal = Math.min(20, Math.max(0.25, camD * 0.02));
  if (Math.abs(G.camera.near - nearGoal) / nearGoal > 0.15) { G.camera.near = nearGoal; G.camera.updateProjectionMatrix(); }
  // 盘面：角度 = 播放位置
  let play = 0;
  const u = G.platterMat.uniforms;
  if (current && !cut) {
    play = position();
    // 放一遍就停（组长 2026-11-26）：唱针走到这一段的末尾，电机断电，盘靠惯性停在后面的空槽里；绕回开头也算放完
    if (motorOn && !grab && (play >= current.seconds || play < lastPlay - current.dur * 0.5)) setMotor(false, true);
    lastPlay = play;
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
  stepWalk(now);
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
  if (S.mode === 'screen' && warmed && !shot) return;   // 屏风盖着画布：不画（进站时 App 先换模式再拉镜头）
  // 有东西在动：区块立起 / 抬起、地点楼提起或在转、盘在落、唱臂在动、校园在沉
  G.zoneObj.forEach((o) => { if (o.rise < 1 || Math.abs(o.lift - o.liftShadow) > 0.05) { shadowDirty = true; o.liftShadow = o.lift; } });
  G.heroObj.forEach((h) => { if (h.lift > 0.05 || h.liftShadow > 0.05) { shadowDirty = true; } h.liftShadow = h.lift; });
  if (landing || Math.abs(armLift - armShadow) > 0.05 || Math.abs(G.ARM.r - armRShadow) > 0.2 || (sinkK > 0.001 && sinkK < 0.999)) { shadowDirty = true; armShadow = armLift; armRShadow = G.ARM.r; }
  G.renderer.shadowMap.autoUpdate = false;
  if (shadowDirty) { G.renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  G.composer.render();
  // 选择性聚焦（学 Confused-Tree 声景校园的双层画法，但在同一块画布里）：只画第 1 层（地点楼、台座、波纹），清掉深度、不画背景、不重画阴影
  let anyLift = false;
  G.heroObj.forEach((h) => { if (h.lift > 0.5) anyLift = true; });
  if (anyLift) heroPass();
  watchFrames(now);
}
let tilt = 0.5, focusR = 0.5, armShadow = 0, armRShadow = 0, lastPlay = 0;

// —— 特写（2026-11-26：组员与组长说进楼放大后楼看着糙）——
// 被提起的那栋楼单独画一遍：画进一块 4× 多重采样的缓冲（原来直接画到屏幕上，没有抗锯齿，边是锯齿），再贴回画面。
// 这一遍有自己的光（像拍产品）：一盏主光从镜头左上方来、一盏轮廓光从楼背后来，太阳压一点。两盏只在第 1 层，不照别的东西
let heroRT = null, heroQuad = null, keyL = null, rimL = null;
// 两盏补光开场就在（平时亮度 0）：灯的盏数一变，所有材质都要重编着色器；放在开场，屏风后面就一起编好了
function buildHeroLights() {
  keyL = new THREE.DirectionalLight(0xffffff, 0); rimL = new THREE.DirectionalLight(0xffffff, 0);
  for (const l of [keyL, rimL]) l.layers.set(1);   // 只照第 1 层：盘和校园的着色器不多算两盏灯
  G.scene.add(keyL, keyL.target, rimL, rimL.target);
}
const ccol = new THREE.Color();
function heroPass() {
  const r = G.renderer, w = r.domElement.width, h = r.domElement.height;
  if (!heroRT) {
    heroRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: tierNow() === 'low' ? 0 : 4 });
    heroQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { t: { value: heroRT.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // 缓冲里是线性、预乘过透明度的颜色：先除回去，再做色调映射和 sRGB，最后按预乘叠到画面上（边缘不发黑）
      fragmentShader: `uniform sampler2D t; varying vec2 vUv;
        void main(){ vec4 c = texture2D(t, vUv); if (c.a < 0.002) discard; gl_FragColor = vec4(c.rgb / c.a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor = vec4(gl_FragColor.rgb * c.a, c.a); }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, depthTest: false, depthWrite: false,
    }));
  }
  if (heroRT.width !== w || heroRT.height !== h) heroRT.setSize(w, h);
  let lifted = null;
  G.heroObj.forEach((x) => { if (x.lift > 0.5 && (!lifted || x.lift > lifted.lift)) lifted = x; });
  const k = lifted ? Math.min(1, lifted.lift / LIFT(lifted)) : 0;
  // 光：主光在镜头方位左转 50°、仰 38°；轮廓光在楼背后、仰 24°。夜里主光弱一些、轮廓光偏暖（窗里的灯）
  const L = toks().light, az = controls.getAzimuthalAngle(), c = lifted.pivot.getWorldPosition(v3).clone();
  const at = (a, el, d = 600) => c.clone().add(new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)).multiplyScalar(d));
  keyL.position.copy(at(az + 0.87, 0.66)); keyL.target.position.copy(c);
  rimL.position.copy(at(az + Math.PI + 0.35, 0.42)); rimL.target.position.copy(c);
  keyL.intensity = k * (1.25 - 0.55 * L.night);
  keyL.color.setRGB(1, 0.985, 0.96);
  rimL.intensity = k * (1.8 + 0.6 * L.night);
  rimL.color.copy(ccol.set(L.night > 0.5 ? '#FFC892' : '#DCE6FF'));
  const sunI = G.sun.intensity, hemiI = G.hemi.intensity;
  G.sun.intensity = sunI * (1 - 0.45 * k); G.hemi.intensity = hemiI * (1 - 0.2 * k);
  const bg = G.scene.background, ac = r.autoClear, su = r.shadowMap.autoUpdate, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
  r.autoClear = false; r.shadowMap.autoUpdate = false;
  G.scene.background = null;
  // 第 1 层上有全部 16 栋地点楼：这一遍只留被提起来的，别的在上一遍里已经画过（虚的）
  const off = [];
  G.heroObj.forEach((x) => { if (x.lift <= 0.5 && x.pivot.visible) { x.pivot.visible = false; off.push(x); } });
  r.setRenderTarget(heroRT);
  r.setClearColor(0x000000, 0); r.clear(true, true, false);
  G.camera.layers.set(1);
  r.render(G.scene, G.camera);
  G.camera.layers.set(0);
  r.setRenderTarget(null);
  heroQuad.render(r);
  for (const x of off) x.pivot.visible = true;
  G.sun.intensity = sunI; G.hemi.intensity = hemiI; keyL.intensity = 0; rimL.intensity = 0;
  G.scene.background = bg; r.autoClear = ac; r.shadowMap.autoUpdate = su; r.setClearColor(cc, ca);
}

// ====================================================================================
// 启动
// ====================================================================================
/** 搭舞台。canvas 与地名签的容器由页面给。返回 false = 这个浏览器画不出三维。 */
export async function init(canvasNode, labelsNode, campus) {
  canvas = canvasNode; labelsEl = labelsNode;
  const q = new URLSearchParams(location.search).get('q');
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) throw new Error('no webgl2');
    const dbg = probe.getExtension('WEBGL_debug_renderer_info');
    gpuName = dbg ? String(probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    probe.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { return false; }
  // 画质档：网址指定（不再自动降）> 本机记住的（同一块显卡）> 猜
  let t = { full: 'high', mid: 'mid', lite: 'low' }[q] || null;
  if (t) quality.pinned = true;
  if (!t) { try { const m = JSON.parse(localStorage.getItem('tj-tier') || 'null'); if (m && m.gpu === gpuName && TIERS[m.t]) t = m.t; } catch { /* 没记过 */ } }
  if (!t) t = /SwiftShader|llvmpipe|Software/i.test(gpuName) || matchMedia('(pointer: coarse)').matches ? 'low' : strongGpu() ? 'high' : 'mid';
  lite = t === 'low';
  // 建场景、编译着色器都在屏风后面做，分几步，每步之间把主线程让给屏风（盘在转、按钮要响应）
  const pause = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  await pause();
  await document.fonts.load('30px "Zhuque"').catch(() => {});
  G = await build(canvas, campus, { tier: t, pause });
  // 数据地图的地面：一块画布贴图，铺在区块地面上方一点（ground.js 画）
  G.groundCanvas = document.createElement('canvas');
  G.groundCanvas.width = G.groundCanvas.height = lite ? 1024 : 2048;
  G.groundTex = new THREE.CanvasTexture(G.groundCanvas);
  G.groundTex.colorSpace = THREE.SRGBColorSpace;
  G.groundTex.anisotropy = 4;
  {
    const geo = new THREE.PlaneGeometry(RIN * 2, RIN * 2); geo.rotateX(-Math.PI / 2);
    G.ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: G.groundTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    G.ground.position.y = TILE_TOP + 0.35;
    G.ground.renderOrder = 3;
    G.ground.visible = false;
    G.scene.add(G.ground);
    const disc = new THREE.CircleGeometry(1, 72); disc.rotateX(-Math.PI / 2);
    for (const o of G.pinObj.values()) {
      o.medalCanvas = document.createElement('canvas');
      o.medalCanvas.width = o.medalCanvas.height = lite ? 192 : 256;
      o.medalTex = new THREE.CanvasTexture(o.medalCanvas);
      o.medalTex.colorSpace = THREE.SRGBColorSpace;
      o.medalTex.anisotropy = 4;
      o.medal = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ map: o.medalTex, transparent: true, toneMapped: false, depthWrite: false }));
      o.medal.renderOrder = 5;
      o.medal.visible = false;
      o.medalR = 30;
      o.group.add(o.medal);
    }
  }
  G.fx = createDataFx({ scene: G.scene, campus: G.campus, TILE_TOP, EX, lite });
  buildHeroLights();
  controls = new OrbitControls(G.camera, canvas);
  G.camera.far = 20000; G.camera.updateProjectionMatrix();
  Object.assign(controls, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.32, maxPolarAngle: 1.18, minDistance: 18, maxDistance: 14000, rotateSpeed: 0.6, zoomSpeed: 0.7 });
  buildTags();
  wirePointer();
  built = true;
  paintPins();
  if (S.data) setData(S.data);   // 直接从数据地图的网址进站：搭好之前来的那一次要补上
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
  await warm(pause);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; lastNow = 0; });
  requestAnimationFrame(frame);
  if (pendingReveal) { const p = pendingReveal; pendingReveal = null; reveal(p); }
  window.__stage = { get mode() { return S.mode; }, get place() { return S.place; }, get frames() { return frames; }, get flying() { return !!shot; }, get lite() { return lite; }, get tier() { return tierNow(); }, get quality() { return quality.median; }, get warmed() { return warmed; },
    shows, get season() { return seasonCur; }, get pos() { return position(); }, get playing() { return playing(); }, get clip() { return current && current.e.id; },
    heroLift: (pid) => G.heroObj.get(pid)?.lift ?? null, crowd: (pid) => (S.data ? S.data.values.get(pid) ?? 0 : null), get dataForm() { return S.data ? S.data.form : null; }, get revealed() { return revealed; },
    pinScreen: (pid) => { const o = G.pinObj.get(pid); const v = o.group.position.clone().setY(o.group.position.y + o.head.position.y - 2).project(G.camera); const r = canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    heroScreen: (pid) => { const h = G.heroObj.get(pid); const v = h.pivot.getWorldPosition(new THREE.Vector3()).setY(TILE_TOP + h.size.y * 0.5).project(G.camera); const r = canvas.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    dbg: () => ({ calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles }),
    get splat() { return splatState(); },
    look: (x, z, d, polar, az) => play([{ to: { t: V(x, TILE_TOP + 4, z), d, polar, az }, dur: 1, ease: 'out' }]) };   // 截图走查用：看某一处
  return true;
}
/** 预编译：第一帧要编译约 50 个着色器（实测核显上 3 秒 + 1.5 秒卡死）。
 *  先按真实的渲染目标异步编译场景材质（不卡主线程），再画一帧很小的，把阴影深度和后期的着色器编完；然后才开始画。 */
async function warm(pause) {
  const r = G.renderer;
  try {
    r.setRenderTarget(G.composer.renderTarget1);
    await r.compileAsync(G.scene, G.camera);
    // 地点楼在特写里多两盏补光（只在第 1 层）：灯的盏数不同就是另一套着色器，也在这里先编好，免得第一次进楼时卡一下
    G.camera.layers.set(1);
    await r.compileAsync(G.scene, G.camera);
    G.camera.layers.set(0);
  } catch { G.camera.layers.set(0); /* 不支持并行编译：退回第一帧里同步编 */ }
  r.setRenderTarget(null);
  await pause();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // 后期各道的材质也异步编（它们画进半浮点的渲染目标，和真画时一样）
  try {
    const tmp = new G.THREE.Scene(), quad = new G.THREE.PlaneGeometry(2, 2), seen = new Set();
    for (const pass of G.composer.passes) for (const v of Object.values(pass)) {
      const list = Array.isArray(v) ? v : [v];
      for (const m of list) if (m && m.isMaterial && !seen.has(m)) { seen.add(m); tmp.add(new G.THREE.Mesh(quad, m)); }
    }
    r.setRenderTarget(G.composer.renderTarget1);
    await r.compileAsync(tmp, G.camera);
    r.setRenderTarget(null);
    quad.dispose();
  } catch { r.setRenderTarget(null); }
  await pause();
  // 再画一帧很小的：剩下的（阴影深度、画到屏幕上的最后一道）在这一帧里编完
  r.setSize(48, 30, false); G.composer.setSize(48, 30);
  G.composer.render();
  resizeNow = true; lastW = 0; void w; void h;
  resize();
  // 再在屏风后面画一帧全尺寸的：全尺寸的渲染目标（泛光、移轴、环境光遮蔽）第一次用时要分配显存，原来这一下落在进站的第一帧（约 70 毫秒）
  await pause();
  G.composer.render();
  warmed = true;
}
export const isBuilt = () => built;
export const tier = () => tierNow();
export const isLite = () => lite;
/** 凑近看刻槽 / 退回来。 */
export function zoomGroove(inOut) {
  if (!current) return;
  if (inOut) play([{ to: grooveClose, dur: 3800, ease: 'smoother', look: 'early' }]);
  else play([{ to: POSES[S.mode] || POSES.home, dur: 2600, ease: 'smoother', look: 'late' }]);
}
