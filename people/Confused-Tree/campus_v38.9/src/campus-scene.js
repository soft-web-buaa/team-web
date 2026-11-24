// 北航学院路校区 · 卡纸模型（独立版）
// ------------------------------------------------------------------------------------
// 本文件从「刻声 · 十秒声片柜」的三维校园（plan3d.js，MIT）里把**校区模型**整段抽出来：
// 十个区块的地块 / 道路 / 绿地 / 水面 / 跑道 / 球场，157 栋卡纸楼（窗是印在纸上的立面），
// 主楼东立面的线稿、体育馆（铝壳 + 凹口 + 尖翼 + 大台阶）、游泳馆（筒拱）、馆前雕塑、
// 树（四季换冠）、路灯（入夜发光）、共享单车、长椅、球门篮架、园名纸牌、主楼屋顶校名。
// 影棚光、时段天光（夜/晨/上午/午/下午/晚）、四季景观、AO/泛光/移轴/纸纹后期也一并搬来。
//
// 刻意没有搬的是「声音」那一层：唱盘、唱臂、声片钉、年轮、录音/播放/馆藏、以及外圈学期刻纹。
// 这里的校园不站在唱片上，它就是一座可以绕着看的模型。
//
// 纯函数（纸色、立面参数、四季色）在 ./model.js；同一套灯的色温在 ./light-rig.js；数据在 ./data/campus-xy.json。
import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { mergeGeometries } from './vendor/three/BufferGeometryUtils.js';
import { EffectComposer } from './vendor/three/EffectComposer.js';
import { RenderPass } from './vendor/three/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/OutputPass.js';
import { FUNC_CARD, ERA, ROOF_PAPER, POOL_STONE, STYLE, tintOf, facadeOf, offsetRing, ringArea, obbOf, SCENERY, crownPick } from './model.js';
import { SLOT_LIGHT, rigFor } from './light-rig.js';

// —— 模型尺度 —— 数据里的坐标是分米，m() 换成米；楼高按作者估算的米数，竖向放大 EX 只为看得清体量
const EX = 1.6;
const BASE_TOP = 6, TILE_TOP = 10;            // 底板顶面、区块地块顶面（米）
const POOL_WALL = 13;                          // 游泳馆石材墙身（米，已含竖向放大），拱顶另做
const COL = { paper: '#F2F4F3' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const m = (v) => v / 10;
// 启动计时（性能诊断用）：window.__timing 里是各阶段结束时距模块开始执行的毫秒数
const T_MOD = performance.now();
const timing = { module: +T_MOD.toFixed(1), data: 0, fonts: 0, scene: 0, campus: 0, firstFrame: 0, gl: '', rendered: 0, renderTotal: 0, lastRenderMs: 0 };
if (typeof window !== 'undefined') window.__timing = timing;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// —— 画质档 —— 打开就要能转，所以按机器分三档；软件渲染（没开硬件加速）直接进 low。
//   full：1.5 倍像素、抗锯齿、按需阴影、纸窗着色器、全部树与道具、夜里泛光
//   lite：1 倍像素、无阴影、纸窗、全部树与道具
//   low ：0.55 倍像素、无抗锯齿 / 阴影 / 纸窗、三分之一的树、不放单车与长椅——这是给软渲染和核显留的活路
// 自动档会在转起来之后按实测帧时逐级降像素比和道具数量（不会改动已编译的材质，避免中途卡一下）。
const LEVELS = {
  full: { dpr: 1, aa: true, shadows: true, windows: true, treeStep: 1, bikes: true, props: true, bloom: true, rippleCell: 3.0, rippleLayers: 2 },
  lite: { dpr: 1, aa: false, shadows: false, windows: true, treeStep: 1, bikes: true, props: true, bloom: false, rippleCell: 4.2, rippleLayers: 2 },
  low: { dpr: 0.85, aa: false, shadows: false, windows: true, treeStep: 2, bikes: false, props: false, bloom: false, rippleCell: 6.5, rippleLayers: 1 },
};
const Q = new URLSearchParams(location.search).get('q');
// 建真正的 WebGL 上下文之前先探一下是不是软件渲染：决定抗锯齿、像素比，这些创建后就改不了
const probe = (() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { software: true, name: '' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* 忽略 */ }
    return { software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name), name };
  } catch { return { software: false, name: '' }; }
})();
const quality = {
  name: Q === 'full' || Q === 'lite' || Q === 'low' ? Q : (probe.software ? 'low' : 'full'),
  auto: Q !== 'full' && Q !== 'lite' && Q !== 'low',
  software: probe.software,
  dpr: 0,                     // 实际像素比（自动档会往下调）
  step: 0,                    // 自动降档到第几级
  samples: [], last: 0, median: null,
};
const level = () => LEVELS[quality.name];
quality.dpr = level().dpr;
if (quality.name === 'full') quality.dpr = Math.min(1.25, devicePixelRatio || 1);   // 高分屏只给到 1.25，慢机器还有自动降档兜着
// ?dpr=0.7 可以手动钉一个像素比（调试 / 极慢机器兜底）
const dprQ = parseFloat(new URLSearchParams(location.search).get('dpr') || '');
if (Number.isFinite(dprQ) && dprQ >= 0.3) quality.dpr = Math.min(2, dprQ);

// ====================================================================================
// 全局状态
// ====================================================================================
let renderer = null, scene = null, camera = null, controls = null, composer = null;
let bloom = null, sun = null, hemi = null, pmrem = null, envFor = null;
let canvas = null, labelsEl = null, hooks = {};
let campus = null, CAMPUS_R = 620;
// 底部黑胶唱片：恒定角速度 30 秒一圈；用每帧 dt 累加角度，开关时不跳变
let recordGrp = null, recordRadius = 0, recordAngle = 0, recordOn = true, recordLastDirty = 0;
// 唱针：默认抬起，有声音播放时落到唱片上
let tonearm = null, tonearmPivot = null, tonearmCur = 0, tonearmTarget = 0;
const RECORD_TURN = 60;        // 秒 / 圈
const RECORD_TOP = 2.0;        // 唱片顶面高度：比底板底沿(0)高 2，让模型"埋"进唱片里
const zoneObj = new Map();          // 区块 id → { group, bgroup, tints, bldMat, poolMat, lift, rise, c, tall }
const pickables = [];               // 可拾取的网格（地块、楼、体育馆、游泳馆、主楼立面）
const forest = [];                  // 每个区块的树冠实例：{ crowns, trunks, seeds, mtx, n }
const seasonal = [];                // 每个区块的地面材质，换季时改「平常」那一档颜色
const nightMats = [];               // 随入夜发光的材质：{ mat, k }
const snowU = { value: 0 };         // 屋面积雪（0..1），卡纸楼的着色器读它
const U = { uNight: { value: 0 }, uLit: { value: 0 } };   // 窗灯：入夜程度、亮着的窗占比
const trim = { bikes: [], props: [] };   // 自动降档时要能关掉的东西
const sel = { zone: null, hover: null, flat: false };   // flat：点地点时整块不抬起，地面波纹才看得见
const zoneTags = new Map(), placeMarks = new Map();
const placeTint = new Map();   // 地点 → 声景类别颜色（粒子波纹用）
let zoneMeta = [];
let slotName = '上午', seasonName = '秋';
let fly = null, lightPaper = null, lightShown = null;
let shadowDirty = 0;          // 阴影贴图不是每帧重画：只有灯光在变、区块在抬/降、季节在换时标脏
let dirty = true;             // 画面只在有变化时重画（静止时不烧 CPU）
let dirtyUntil = 0;           // 这段时间内保持连续重画（抬起动画、天光过渡、悬停高亮）
let frameCount = 0, lastNow = 0;
let activePlace = null;   // 正在起波纹的地点（标签点亮）

// ====================================================================================
// 时段的天光：太阳方位（从正北顺时针）、高度角、强度、色温、入夜程度、亮窗占比、背景
// ====================================================================================
const LIGHT = {
  夜: { az: 40, el: 40, i: 0.5, col: SLOT_LIGHT['夜'], hemi: 0.35, night: 1, lit: 0.27, bg: ['#141A28', '#030406'], hour: '二十三时' },
  晨: { az: 92, el: 11, i: 2.1, col: SLOT_LIGHT['晨'], hemi: 0.92, night: 0.22, lit: 0.18, bg: ['#3A3440', '#07080B'], hour: '七时' },
  上午: { az: 132, el: 36, i: 2.6, col: SLOT_LIGHT['上午'], hemi: 1.21, night: 0, lit: 0, bg: ['#2B303A', '#060709'], hour: '十时' },
  午: { az: 180, el: 63, i: 2.8, col: SLOT_LIGHT['午'], hemi: 1.36, night: 0, lit: 0, bg: ['#30343C', '#07080A'], hour: '十二时' },
  下午: { az: 232, el: 30, i: 2.6, col: SLOT_LIGHT['下午'], hemi: 1.21, night: 0, lit: 0, bg: ['#33302E', '#070708'], hour: '十六时' },
  晚: { az: 262, el: 15, i: 3.0, col: SLOT_LIGHT['晚'], hemi: 0.92, night: 0.36, lit: 0.42, bg: ['#3D2E2C', '#080607'], hour: '十九时' },
};
for (const k in LIGHT) { LIGHT[k].col = new THREE.Color(LIGHT[k].col); LIGHT[k].bg = LIGHT[k].bg.map((c) => new THREE.Color(c)); }
const light = { cur: null, from: null, to: null, t0: 0, dur: 1, queue: [] };
const LKEYS = ['az', 'el', 'i', 'hemi', 'night', 'lit'];
function snapLight(name) {
  const L = LIGHT[name];
  const o = { name };
  for (const k of LKEYS) o[k] = L[k];
  o.col = L.col.clone(); o.bg0 = L.bg[0].clone(); o.bg1 = L.bg[1].clone();
  return o;
}
function lightTo(name, dur = 1400) {
  if (!LIGHT[name]) return;
  if (!light.cur) { light.cur = snapLight(name); return; }
  light.queue.push({ name, dur });
}
// 镜头默认落点：从东南方斜上方看整块校园（target 由 measureCampus() 挪到校园外接矩形中心）
const HOME = {
  _target: new THREE.Vector3(0, 16, 0),
  get target() { return this._target.clone(); },
  polar: 0.80, azim: -0.30,
  get dist() {
    const aspect = Math.max(0.4, (canvas?.clientWidth || 1) / (canvas?.clientHeight || 1));
    return Math.max(1400, (CAMPUS_R + 120) * 0.84 / (Math.tan((camera.fov * Math.PI) / 360) * aspect));
  },
};
let CAMPUS_C = { x: 0, z: 0 };
let CAMPUS_BB = { x0: -600, x1: 600, z0: -600, z1: 600 };

// ====================================================================================
// 平面几何小工具：数据里的环是 [x,y,x,y,…] 分米；地图北 = −z
// ====================================================================================
function shapeFrom(rings) {
  const toV = (r) => { const v = []; for (let i = 0; i < r.length; i += 2) v.push(new THREE.Vector2(m(r[i]), m(r[i + 1]))); return v; };
  const s = new THREE.Shape(toV(rings[0]));
  for (const h of rings.slice(1)) s.holes.push(new THREE.Path(toV(h)));
  return s;
}
/** 平面形状挤出成体：底在 y=0，高 h。 */
function extrude(rings, h) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(rings), { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  return g;
}
function flat(rings, y) {
  const g = new THREE.ShapeGeometry(shapeFrom(rings));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g.toNonIndexed();
}
/** 道路：折线按宽度铺成带子（端头不做圆角）。 */
function ribbon(line, y) {
  const w = m(line[0]) / 2, pos = [];
  const pts = [];
  for (let i = 1; i < line.length; i += 2) pts.push([m(line[i]), m(line[i + 1])]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * w, ny = (dx / L) * w;
    const q = [[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny]];
    for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k][0], y, -q[k][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

// ====================================================================================
// 展柜底：屏幕空间的径向渐变（颜色跟天光走），校园下一圈软影
// ====================================================================================
const bgCanvas = document.createElement('canvas');
bgCanvas.width = bgCanvas.height = 256;
const bgTex = new THREE.CanvasTexture(bgCanvas);
bgTex.colorSpace = THREE.SRGBColorSpace;
function paintBackdrop(c0, c1) {
  const g = bgCanvas.getContext('2d');
  const gr = g.createRadialGradient(96, 70, 0, 128, 120, 210);
  gr.addColorStop(0, `#${c0.getHexString()}`);
  gr.addColorStop(1, `#${c1.getHexString()}`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  bgTex.needsUpdate = true;
}
function buildBackdrop() {
  scene.background = bgTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  gr.addColorStop(0, 'rgba(3,5,10,0.9)');
  gr.addColorStop(0.66, 'rgba(3,5,10,0.6)');
  gr.addColorStop(1, 'rgba(3,5,10,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.scale.setScalar((CAMPUS_R + 150) * 3.4);
  disc.position.set(CAMPUS_C.x, -16, CAMPUS_C.z);   // 挪到唱片下方，别和唱片打架
  disc.renderOrder = -1;
  scene.add(disc);
}

// ====================================================================================
// 后期：只留夜里的泛光（窗灯、路灯的那层光晕）。白天不走后期链、不编译后期着色器——
// 首帧要快，粗糙一点没关系；入夜第一次用到时才建。
// ====================================================================================
function ensureComposer() {
  if (composer) return;
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 }));
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.35, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w && h) composer.setSize(w, h);
}
// —— 自动降档：不改已经编译好的材质（换材质会卡一下），只降像素比、稀疏树木、藏掉小道具 ——
function setTrees(frac) {
  for (const f of forest) {
    const n = Math.max(0, Math.round(f.n * frac));
    f.crowns.count = n;
    if (f.trunks) f.trunks.count = n;
  }
  dirty = true;
}
function setBikes(on) { for (const m of trim.bikes) m.visible = on; dirty = true; }
function setProps(on) { for (const m of trim.props) m.visible = on; dirty = true; }
function stepDown() {
  if (!quality.auto) return;
  // low 档本来就低，最多再降两档，别把画面糊成一片；full / lite 可以一路降到底
  if (quality.step >= (quality.name === 'low' ? 2 : 4)) return;
  quality.step++;
  if (quality.step === 1) quality.dpr = Math.min(quality.dpr, 0.85);
  else if (quality.step === 2) { quality.dpr = Math.min(quality.dpr, 0.75); setTrees(0.6); setBikes(false); }
  else if (quality.step === 3) { quality.dpr = Math.min(quality.dpr, 0.6); setTrees(0.35); setProps(false); }
  else { quality.dpr = Math.min(quality.dpr, 0.5); setTrees(0.2); }
  renderer.setPixelRatio(quality.dpr);
  if (composer) composer.setPixelRatio(quality.dpr);
  resize(true);
}
/** 帧时采样：只在连续重画时量（拖动、天光过渡），16 帧取中位，慢于约 30fps 就再降一档。 */
function sampleFrames(now) {
  if (!quality.auto || quality.step >= 4) return;
  if (now < (timing.firstFrame || 0) + 500) return;           // 跳过开机第一帧的着色器编译
  if (quality.last && now - quality.last < 400) quality.samples.push(now - quality.last);
  else quality.samples = [];                                   // 中间静止过：重新量
  quality.last = now;
  if (quality.samples.length >= 16) {
    const med = [...quality.samples].sort((a, b) => a - b)[8];
    quality.median = Math.round(med);
    quality.samples = [];
    // 慢得厉害就一步跨两档：一帧超过 0.1 秒的机器，不该再让它慢慢试
    if (med > 100 && quality.step === 0) quality.step = 1;
    if (med > 34) stepDown();
  }
}

// ====================================================================================
// 立面：窗是印在卡纸上的（不开洞）。aFac = [层高, 开间, 样式, 种子]；入夜按比例亮起暖光
// ====================================================================================
function windowize(mat) {
  mat.userData.win = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.uNight;
    sh.uniforms.uLit = U.uLit;
    sh.uniforms.uWin = mat.userData.win;
    sh.uniforms.uSnow = snowU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFac; varying vec4 vFac; varying vec3 vLoc; varying vec3 vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vGN = normal; vFac = aFac;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFac; varying vec3 vLoc; varying vec3 vGN; uniform float uNight, uLit, uWin, uSnow;
        float wHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float box1(float x, float a, float b, float aa) { return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // 纸纹：两层低频噪声，±3%
          vec3 wp = vLoc * vec3(0.9, 1.7, 0.9);
          float fib = wHash(floor(wp)) * 0.5 + wHash(floor(wp * 3.1 + 7.0)) * 0.5;
          diffuseColor.rgb *= 0.97 + 0.06 * fib;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.95), uSnow * smoothstep(0.6, 0.9, vGN.y));
          float style = floor(vFac.z + 0.5);
          float side = 1.0 - smoothstep(0.3, 0.5, abs(vGN.y));
          if (style < 3.5 && side > 0.01) {
            vec2 t = normalize(vec2(-vGN.z, vGN.x) + 1e-5);
            float cs = dot(vLoc.xz, t) / vFac.y + vFac.w * 7.0, cy = vLoc.y / vFac.x;
            vec2 f = fract(vec2(cs, cy));
            float aa = clamp(fwidth(cs) * 0.9, 0.0, 0.5), ab = clamp(fwidth(cy) * 0.9, 0.0, 0.5);
            float fade = 1.0 - smoothstep(0.32, 0.5, max(aa, ab));      // 远看糊成一片时只留一层淡灰，不出摩尔纹
            float win = 0.0, line = 0.0;
            if (style < 0.5) win = box1(f.x, 0.22, 0.78, aa) * box1(f.y, 0.3, 0.8, ab);
            else if (style < 1.5) {
              win = box1(f.x, 0.3, 0.7, aa) * box1(f.y, 0.24, 0.84, ab) * step(0.6, cy);
              float pil = fract(cs / 3.0);
              line = box1(pil, 0.0, 0.05, aa / 3.0) * 0.6 + (1.0 - smoothstep(0.55, 0.6, vLoc.y / vFac.x)) * 0.35;   // 壁柱 + 勒脚
            } else if (style < 2.5) {
              win = box1(f.y, 0.38, 0.86, ab) * (1.0 - box1(f.x, 0.0, 0.04, aa));
            } else {
              win = box1(f.x, 0.3, 0.7, aa) * box1(f.y, 0.34, 0.76, ab);
              line = box1(f.y, 0.08, 0.14, ab) * step(0.5, fract(cs * 0.5)) * 0.7;
            }
            win *= side * step(0.25, cy);
            float ink = win * fade;
            vec3 glass = vec3(0.30, 0.37, 0.45);
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, ink * 0.62 * (1.0 - uNight * 0.5));
            diffuseColor.rgb *= 1.0 - line * side * fade * 0.16 - (1.0 - fade) * 0.06 * side;
            vec3 cell = vec3(floor(cs), floor(cy), floor(dot(vLoc.xz, normalize(vGN.xz + 1e-5)) * 0.5));
            float lit = step(wHash(cell + vFac.w), uLit) * win;
            totalEmissiveRadiance += vec3(1.0, 0.74, 0.42) * lit * uNight * uWin * (2.0 + 2.4 * wHash(cell + 3.1));
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'ks-card-v2';
}

// ====================================================================================
// 影棚：三盏长条软箱（世界坐标，米）+ 上亮下暗的球面；换时段只换色温
// ====================================================================================
const STUDIO = [
  { c: [-1500, 2200, -900], at: [0, 0, 200], u: [1, 0, 1], hu: 1300, hv: 170, col: [1, 1, 1], i: 34, env: 0.32 },
  { c: [2300, 1100, 300], at: [0, 0, 0], u: [0, 1, 0], hu: 520, hv: 1300, col: [1, 1, 1], i: 16, env: 0.22 },
  { c: [-600, 1300, -2700], at: [0, 0, -200], u: [1, 0, 0], hu: 2400, hv: 190, col: [1, 1, 1], i: 26, env: 0.26 },
].map((b) => {
  const C = new THREE.Vector3(...b.c), N = new THREE.Vector3(...b.at).sub(C).normalize();
  const g = new THREE.Vector3(...b.u), Uh = g.sub(N.clone().multiplyScalar(g.dot(N))).normalize(), Vh = new THREE.Vector3().crossVectors(N, Uh);
  return { ...b, C, N, U: Uh.clone().multiplyScalar(b.hu), V: Vh.clone().multiplyScalar(b.hv), Uh, Vh, color: new THREE.Color(...b.col) };
});
function studioEnv(pmrem, tintC = [1, 1, 1]) {
  const k = 1 / 40;                          // PMREM 的远裁剪面只到几百：整间屋子按比例缩进去，方向不变
  const s = new THREE.Scene();
  const sph = new THREE.SphereGeometry(90, 48, 24), pos = sph.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 90, t = Math.max(0, y);
    const v = 0.012 + 0.12 * Math.pow(t, 2.0) + (y < 0 ? 0.006 * (1 + y) : 0);
    col[i * 3] = v * tintC[0]; col[i * 3 + 1] = v * tintC[1]; col[i * 3 + 2] = v * tintC[2];
  }
  sph.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  for (const b of STUDIO) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(tintC[0], tintC[1], tintC[2]).multiplyScalar(b.i * b.env), side: THREE.DoubleSide }));
    pl.matrix.makeBasis(b.Uh.clone().multiplyScalar(b.hu * k), b.Vh.clone().multiplyScalar(b.hv * k), b.N.clone());
    pl.matrix.setPosition(b.C.clone().multiplyScalar(k));
    pl.matrixAutoUpdate = false;
    s.add(pl);
  }
  return pmrem.fromScene(s, 0.02, 0.1, 400).texture;
}

// ====================================================================================
// 卡纸模型：一栋楼 = 墙身（0.35 米细倒角）+ 檐口 + 女儿墙 + 屋顶小房；颜色走顶点色，立面走 aFac
// ====================================================================================
const ringM = (r) => { const v = []; for (let i = 0; i < r.length; i += 2) v.push([m(r[i]), m(r[i + 1])]); return v; };
const shapeM = (pts, holes = []) => {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
};
/** 平面环挤出成一块板：底 y0、顶 y1；bevel > 0 时先内缩再倒角，外轮廓不变。 */
function slab(pts, y0, y1, { bevel = 0, holes = [] } = {}) {
  const b = holes.length ? 0 : Math.min(bevel, (y1 - y0) / 3);
  const g = new THREE.ExtrudeGeometry(shapeM(b ? offsetRing(pts, -b) : pts, holes),
    { depth: Math.max(0.02, y1 - y0 - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + b, 0);
  return g;
}
/** 刷顶点色（朝上的面用 roof，其余用 wall）并写立面参数。返回非索引几何。 */
function dress(g0, wall, roof, fac) {
  const g = g0.index ? g0.toNonIndexed() : g0;
  const n = g.attributes.normal, N = n.count, col = new Float32Array(N * 3), f = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const c = n.getY(i) > 0.5 ? roof : wall;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    f.set(fac, i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFac', new THREE.BufferAttribute(f, 4));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2), 2));
  return g;
}
/** 一张纸的颜色：底色 + 这一栋自己的一点偏差（同一种纸，裁的批次不同）。 */
function paperOf(hex, seed) {
  const c = new THREE.Color(hex), t = tintOf(seed), hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(0.95, Math.max(0.05, hsl.l + t.dl)));
  c.r = Math.max(0, c.r + t.dw * 0.5); c.b = Math.max(0, c.b - t.dw * 0.5);
  return c;
}

// —— 人的尺度：几样小物件（米，真实尺寸；摆的时候整体放大 1.6 倍）——
const UPY = new THREE.Vector3(0, 1, 0);
const tint = new THREE.Color();
const BIKE_COL = ['#E9C33B', '#3D82C4', '#4FA36A'].map((c) => new THREE.Color(c));
const BIKE_GEO = (() => {
  const w = new THREE.CylinderGeometry(0.33, 0.33, 0.06, 6, 1, true).rotateX(Math.PI / 2);
  const a = w.clone().translate(-0.52, 0.36, 0), b = w.clone().translate(0.52, 0.36, 0);
  const frame = new THREE.BoxGeometry(1.0, 0.1, 0.06).translate(0, 0.6, 0);
  const seat = new THREE.BoxGeometry(0.24, 0.3, 0.12).translate(-0.24, 0.78, 0);
  const basket = new THREE.BoxGeometry(0.28, 0.42, 0.4).translate(0.62, 0.8, 0);
  return mergeGeometries([a, b, frame, seat, basket].map((g) => g.toNonIndexed()));
})();
const BENCH_GEO = mergeGeometries([new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0), new THREE.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.7, -0.2),
  new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(-0.8, 0.22, 0), new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(0.8, 0.22, 0)].map((g) => g.toNonIndexed()));
const GOAL_GEO = mergeGeometries([new THREE.BoxGeometry(0.12, 2.44 * 1.6, 0.12).translate(0, 1.22 * 1.6, -3.66), new THREE.BoxGeometry(0.12, 2.44 * 1.6, 0.12).translate(0, 1.22 * 1.6, 3.66),
  new THREE.BoxGeometry(0.12, 0.12, 7.44).translate(0, 2.44 * 1.6, 0)].map((g) => g.toNonIndexed()));
const HOOP_GEO = mergeGeometries([new THREE.BoxGeometry(0.15, 3.05 * 1.6, 0.15).translate(0.6, 1.52 * 1.6, 0), new THREE.BoxGeometry(0.08, 1.05 * 1.6, 1.8).translate(0, 3.2 * 1.6, 0),
  new THREE.BoxGeometry(1.0, 0.12, 0.15).translate(0.15, 2.6 * 1.6, 0)].map((g) => g.toNonIndexed()));
const NET_GEO = (W) => mergeGeometries([new THREE.BoxGeometry(0.1, 1.1 * 1.6, 0.1).translate(0, 0.55 * 1.6, -W / 2 + 0.6), new THREE.BoxGeometry(0.1, 1.1 * 1.6, 0.1).translate(0, 0.55 * 1.6, W / 2 - 0.6),
  new THREE.BoxGeometry(0.04, 0.5, W - 1.2).translate(0, 1.4, 0)].map((g) => g.toNonIndexed()));

/** 一块印着字的纸牌（Canvas 贴图，仿宋）：模型上贴的园名、主楼屋顶的校名。w×h 米，平放或立着。 */
function plate(text, w, h, { color = '#24304A', bg = null, flat = true, size = 0.72, weight = '' } = {}) {
  const K = 28, c = document.createElement('canvas');
  c.width = Math.round(w * K); c.height = Math.round(h * K);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = c.height * size;
  g.font = `${weight}${fs}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  const tw = g.measureText(text).width;
  if (tw > c.width * 0.94) { fs *= (c.width * 0.94) / tw; g.font = `${weight}${fs}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`; }
  g.fillText(text, c.width / 2, c.height / 2 + fs * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: !bg, alphaTest: bg ? 0 : 0.05, side: THREE.DoubleSide }));
  if (flat) mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = !flat;
  return mesh;
}

// —— 主楼东立面：照着照片描的一张线稿（比例从照片量，不贴照片）——
function elevation(wM, hM, { floors = 6, portico = false } = {}) {
  const K = 8, c = document.createElement('canvas');
  c.width = Math.min(1024, Math.round(wM * K)); c.height = Math.round(hM * K);
  const g = c.getContext('2d'), kx = c.width / wM, ky = c.height / hM;
  g.fillStyle = '#E8E4DA'; g.fillRect(0, 0, c.width, c.height);
  const fl = hM / floors, bay = 3.6, nb = Math.max(1, Math.round(wM / bay)), bw = wM / nb;
  g.fillStyle = '#D3CCBE'; g.fillRect(0, c.height - fl * ky, c.width, fl * ky);
  g.fillStyle = '#85827C'; g.fillRect(0, 0, c.width, 1.1 * ky);
  g.fillStyle = '#A5A197'; g.fillRect(0, 1.1 * ky, c.width, 0.35 * ky);
  for (let f = 0; f < floors; f++) {
    const y0 = (hM - (f + 1) * fl + fl * 0.24) * ky, wh = fl * 0.55 * ky;
    for (let b = 0; b < nb; b++) {
      const x0 = (b * bw + bw * 0.215) * kx, ww = bw * 0.57 * kx;
      g.fillStyle = '#566F86'; g.fillRect(x0, y0, ww, wh);
      g.strokeStyle = '#24304A'; g.lineWidth = Math.max(1, 0.12 * kx); g.strokeRect(x0, y0, ww, wh);
      g.beginPath(); g.moveTo(x0 + ww / 2, y0); g.lineTo(x0 + ww / 2, y0 + wh); g.moveTo(x0, y0 + wh * 0.32); g.lineTo(x0 + ww, y0 + wh * 0.32); g.stroke();
      g.fillStyle = '#F4F1EA'; g.fillRect(x0 - 0.15 * kx, y0 + wh, ww + 0.3 * kx, 0.22 * ky);   // 窗台
    }
  }
  if (portico) {
    const pw = Math.min(wM * 0.42, 20), x0 = (wM - pw) / 2 * kx, top = (hM - fl * 1.35) * ky;
    g.fillStyle = '#E8E4DA'; g.fillRect(x0, top, pw * kx, (hM * ky) - top);
    g.fillStyle = '#9C988F'; g.fillRect(x0 - 0.5 * kx, top, (pw + 1) * kx, 0.7 * ky);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#F4F1EA'; g.fillRect(x0 + (pw * (0.08 + i * 0.28)) * kx, top + 0.7 * ky, 0.9 * kx, (hM * ky) - top); }
    g.fillStyle = '#B8343C'; g.fillRect(x0 + pw * 0.3 * kx, top + 0.95 * ky, pw * 0.4 * kx, 1.1 * ky);
    g.fillStyle = '#3B3A36'; for (let i = 0; i < 3; i++) g.fillRect(x0 + (pw * (0.13 + i * 0.28)) * kx, (hM - fl * 0.8) * ky, pw * 0.16 * kx, fl * 0.8 * ky);
  }
  // 纸纹：极淡的横向纤维
  g.globalAlpha = 0.05; g.fillStyle = '#000';
  for (let i = 0; i < 600; i++) g.fillRect(((i * 7919) % 997) / 997 * c.width, ((i * 104729) % 991) / 991 * c.height, 6 + (i % 13) * 3, 1);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
/** 主楼朝东（朝学院路）的几段墙：每段贴一张线稿；最东那一段（门廊所在）画门廊。 */
function zhulouFront(b) {
  const pts = ringM(b.r[0]), H = b.h * EX, g = new THREE.Group();
  const segs = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, by - ay);
    if (L < 8 || (by - ay) / L < 0.9) continue;              // 外环逆时针、外法线在右手边：朝东的边是自南往北走（y 递增）
    segs.push({ ax, ay, bx, by, L, x: (ax + bx) / 2 });
  }
  if (!segs.length) return g;
  const east = Math.max(...segs.map((q) => q.x));
  for (const q of segs) {
    const isFront = q.x === east;
    const mat = new THREE.MeshLambertMaterial({ map: elevation(q.L, H, { floors: 6, portico: isFront }) });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(q.L, H), mat);
    pl.rotation.y = Math.PI / 2;
    pl.position.set(q.x + 0.12, H / 2, -(q.ay + q.by) / 2);
    pl.scale.x = -1;                                          // 平面的正面朝 +x 时纹理是反的：翻回来
    pl.receiveShadow = true;
    pl.userData.zone = b.zone;
    g.add(pl);
  }
  return g;
}

/** 四坡屋顶（OSM roof:shape=hipped）：按外接矩形起坡，屋脊沿长轴。 */
function hipRoof(o, y0) {
  const q = obb(o), L = q.L, W = q.W, rise = W * 0.32 * (EX / 1.6), r = Math.max(0, (L - W) / 2);
  const P = (u, v, h) => new THREE.Vector3(u, y0 + h, v);
  const a = P(-W / 2, -L / 2, 0), b = P(W / 2, -L / 2, 0), c = P(W / 2, L / 2, 0), d = P(-W / 2, L / 2, 0), e = P(0, -r, rise), f = P(0, r, rise);
  const g = tris([a, e, b, b, e, f, b, f, c, c, f, d, d, f, e, d, e, a]);
  g.rotateY(q.rotY);
  g.translate(q.x, 0, q.z);
  return g;
}
const NONE_FAC = (seed) => [1, 1, STYLE.none, seed];
/** 一栋楼的全部卡片。返回几何的数组（同一区块里合并成一个网格）。 */
function cardBuilding(b, zi) {
  const out = [];
  const pts = ringM(b.r[0]), holes = b.r.slice(1).map(ringM);
  const pool = b.n === '游泳馆';
  const H = pool ? POOL_WALL : b.h * EX;
  const era = b.era && ERA[b.era];
  const key = b.n || `${zi}:${b.o[0]}:${b.o[1]}`;
  const wall = paperOf(pool ? POOL_STONE : era ? era.wall : FUNC_CARD[b.f ?? 0], key);
  const roof = paperOf(ROOF_PAPER, key + '屋');
  const fc = facadeOf(b, H);
  const seed = Math.min(0.999, Math.max(0, tintOf(key + '窗').dw * 16 + 0.5));
  const thin = b.o[4] < 90;                         // 宽不到 9 米的小房子：不倒角、不起女儿墙
  out.push(dress(slab(pts, 0, H, { bevel: thin ? 0 : 0.35, holes }), wall, roof, [fc.floor, fc.bay, pool ? STYLE.none : fc.style, seed]));
  if (pool) return out;
  // 檐口：普通楼挑 0.45 米的一道纸边；五十年代那批挑 1.5 米，暗红的出檐下面一道黄
  const eOut = era ? (b.era === 'eave' ? 1.5 : 1.0) : 0.45, eH = era ? 1.5 : 0.7;
  const eCol = era ? paperOf(era.eave, key + '檐') : wall.clone().multiplyScalar(0.9);
  if (!holes.length) {
    // 檐口是一圈纸边（中间镂空，屋面露出来）：外沿挑出 eOut，里沿缩进墙里 1 米
    const rim = (d0, d1, y0, y1, c) => { const inn = offsetRing(pts, -d1); if (Math.abs(ringArea(inn)) > 8) out.push(dress(slab(offsetRing(pts, d0), y0, y1, { holes: [inn.slice().reverse()] }), c, c, NONE_FAC(seed))); };
    rim(eOut, 1.0, H - eH, H, eCol);
    if (era) rim(eOut * 0.55, 0.6, H - eH - 0.7, H - eH, paperOf(era.under, key + '椽'));
  }
  if (b.rf === 'hipped') {
    out.push(dress(hipRoof(b.o, H), roof, roof, NONE_FAC(seed)));
  } else if (!thin && !holes.length) {
    // 女儿墙：沿屋面一圈 1.1 米高、0.5 米厚的纸条
    const inner = offsetRing(pts, -0.5);
    if (Math.abs(ringArea(inner)) > 20) out.push(dress(slab(pts, H, H + 1.1 * (EX / 1.6), { holes: [inner.slice().reverse()] }), wall.clone().multiplyScalar(0.96), wall, NONE_FAC(seed)));
    // 屋顶小房（楼梯间 / 机房）：五层以上、够长够宽的楼才有
    if (fc.L >= 5 && b.o[3] > 300 && b.o[4] > 110) {
      const q = obb(b.o), w = Math.min(7, q.W * 0.34), l = Math.min(14, q.L * 0.14), h = 3.0 * EX * 0.8;
      const bx = new THREE.BoxGeometry(w, h, l);
      bx.rotateY(q.rotY);
      const off = (tintOf(key + '房').dl * 4) * q.L * 0.6;
      bx.translate(q.x + Math.sin(q.rotY) * off, H + h / 2, q.z + Math.cos(q.rotY) * off);
      out.push(dress(bx, wall.clone().multiplyScalar(0.94), roof, NONE_FAC(seed)));
    }
  }
  return out;
}
/** 地图上的外接矩形 o=[cx, cy, 长轴角(毫弧度), 长, 宽]（分米）→ 世界坐标的中心与朝向。 */
function obb(o) {
  const a = o[2] / 1000;
  return { x: m(o[0]), z: -m(o[1]), L: m(o[3]), W: m(o[4]), rotY: Math.atan2(Math.cos(a), -Math.sin(a)) };
}
/** 一串三角形（世界坐标的 Vector3，每三个一组）→ 平面法线的几何体。 */
function tris(pts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  return g;
}
/** 两点之间一根细杆（屋架、竖梃）。 */
function beam(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// ====================================================================================
// 体育馆：十字形平面；玻璃底座往里缩，上面是往外斜挑的铝壳；东西两翼的壳沿上翘；
// 屋顶金字塔天窗；北立面两道心形凹口，中间一道尖翼斜插下来；北面大台阶和花池，东北角一座雕塑
// ====================================================================================
const GYM = { G1: 9, H1: 28, LIFT: 3.5 };
function gymModel(b, mats) {
  const G = campus.gym, P = (r) => { const v = []; for (let i = 0; i < r.length; i += 2) v.push([m(r[i]), m(r[i + 1])]); return v; };
  const base = P(G.base), top = P(G.top), core = P(G.core), N = base.length;
  const W = (p, y) => new THREE.Vector3(p[0], y, -p[1]);
  const cross = N === 12;                  // 十字形：0-1 南端，2-5 东翼，6-7 北端（正面），8-11 西翼
  const hTop = (i) => GYM.H1 + (cross && [3, 4, 9, 10].includes(i) ? GYM.LIFT : 0);
  const cx = core.reduce((s, p) => s + p[0], 0) / core.length, cy = core.reduce((s, p) => s + p[1], 0) / core.length;
  const apexH = b.h * EX + 6;
  const g = new THREE.Group();
  const add = (geo, mat, shadow = true) => { const o = new THREE.Mesh(geo, mat); o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o; };

  // 玻璃底座 + 壳底的挑檐板
  add(extrude([G.glass], GYM.G1), mats.glass);
  add(flat([G.base, G.glass], GYM.G1), mats.soffit, false);

  // 铝壳：底圈（壳底）到顶圈（壳沿）的直纹面
  const shell = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const b0 = W(base[i], GYM.G1), b1 = W(base[j], GYM.G1), t0 = W(top[i], hTop(i)), t1 = W(top[j], hTop(j));
    shell.push(b0, b1, t1, b0, t1, t0);
  }
  // 屋面：主体平，两翼朝外抬起
  const roof = [];
  const quad = (a, b2, c, d) => roof.push(W(top[a], hTop(a)), W(top[b2], hTop(b2)), W(top[c], hTop(c)), W(top[a], hTop(a)), W(top[c], hTop(c)), W(top[d], hTop(d)));
  if (cross) { quad(0, 1, 6, 7); quad(2, 3, 4, 5); quad(8, 9, 10, 11); }
  else for (const [a, b2, c] of THREE.ShapeUtils.triangulateShape(top.map(([x, y]) => new THREE.Vector2(x, y)), [])) roof.push(W(top[a], hTop(a)), W(top[b2], hTop(b2)), W(top[c], hTop(c)));
  add(tris(shell), mats.shell);
  add(tris(roof), mats.roof);

  // 壳面上的竖肋，正面留给凹口和尖翼
  const fins = [];
  for (let i = 0; i < N; i++) {
    if (cross && i === 6) continue;
    const j = (i + 1) % N;
    const b0 = W(base[i], GYM.G1), b1 = W(base[j], GYM.G1), t0 = W(top[i], hTop(i)), t1 = W(top[j], hTop(j));
    const nf = new THREE.Vector3().crossVectors(b1.clone().sub(b0), t0.clone().sub(b0)).normalize();
    const mid = b0.clone().add(b1).multiplyScalar(0.5);
    if (nf.x * (mid.x - cx) + nf.z * (mid.z + cy) < 0) nf.negate();
    const n = Math.max(1, Math.round(b0.distanceTo(b1) / 6.5));
    for (let k = 1; k < n; k++) {
      const u = k / n, pb = b0.clone().lerp(b1, u), pt = t0.clone().lerp(t1, u);
      const pb2 = pb.clone().addScaledVector(nf, 1.3), pt2 = pt.clone().addScaledVector(nf, 1.3);
      fins.push(pb, pt, pt2, pb, pt2, pb2);
    }
  }
  if (fins.length) add(tris(fins), mats.fin, false);

  // 正面（北端 6→7）：参数面 F(u, v)，u 自西向东，v 自壳底到壳沿
  if (cross) {
    const A0 = W(base[7], GYM.G1), A1 = W(base[6], GYM.G1), B0 = W(top[7], hTop(7)), B1 = W(top[6], hTop(6));
    const nf = new THREE.Vector3().crossVectors(A1.clone().sub(A0), B0.clone().sub(A0)).normalize();
    if (nf.z > 0) nf.negate();               // 朝北 = −z
    const F = (u, v, out = 0) => A0.clone().lerp(A1, u).lerp(B0.clone().lerp(B1, u), v).addScaledVector(nf, out);
    // 两道心形凹口：圆鼓的上半在外侧，尖头朝下往中间收
    const notch = [];
    for (const s of [-1, 1]) {
      const cu = 0.5 + s * 0.215, ring = [];
      for (let k = 0; k <= 22; k++) {
        const a = (s < 0 ? -0.2 : 1.2) * Math.PI + ((s < 0 ? 1.4 : -1.4) * Math.PI * k) / 22;
        ring.push(new THREE.Vector2(cu + Math.cos(a) * 0.17, 0.6 + Math.sin(a) * 0.3));
      }
      ring.push(new THREE.Vector2(0.5 + s * 0.06, 0.12));
      for (const [a, b2, c] of THREE.ShapeUtils.triangulateShape(ring, [])) notch.push(...[a, b2, c].map((q) => F(ring[q].x, ring[q].y, 0.3)));
    }
    add(tris(notch), mats.notch, false);
    // 尖翼：从天窗顶斜插下来，越过正面，在入口上方收成尖
    const apex = W([cx, cy], apexH), M = F(0.5, 1, 3), T = F(0.5, 0.05, 11);
    const e = A1.clone().sub(A0).normalize().multiplyScalar(1.6);
    const L = [apex, M, T].map((p) => p.clone().sub(e)), R = [apex, M, T].map((p) => p.clone().add(e));
    const blade = [L[0], L[1], L[2], R[0], R[2], R[1]];
    for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; blade.push(L[k], R[k], R[k2], L[k], R[k2], L[k2]); }
    add(tris(blade), mats.shell);
    // 北面大台阶 + 平台 + 花池（台阶从广场往南升到入口平台）
    const [x0, x1, y0, y1] = G.stairs.map(m), n = 9, rise = 0.42, d = (y1 - y0) / n, back = Math.min(...base.map((p) => p[1]).filter((y) => y > y0 - 12)) - 3;
    const steps = [];
    for (let k = 0; k < n; k++) {
      const yA = y1 - k * d, h = (k + 1) * rise;
      const bx = new THREE.BoxGeometry(x1 - x0, h, yA - back);
      bx.translate((x0 + x1) / 2, h / 2, -(yA + back) / 2);
      steps.push(bx);
    }
    add(mergeGeometries(steps), mats.granite);
    const bed = (xa, xb, top_) => { const bx = new THREE.BoxGeometry(xb - xa, 1.1, 4.6); const k = 4.6, ym = y1 - d * k; const o = add(bx, [mats.granite, mats.granite, top_, mats.granite, mats.granite, mats.granite]); o.position.set((xa + xb) / 2, (k + 1) * rise + 0.55, -ym); };
    bed(x0 + 4, x0 + 10, mats.planter); bed(x1 - 10, x1 - 4, mats.planter); bed((x0 + x1) / 2 - 7, (x0 + x1) / 2 + 7, mats.flowers);
  }

  // 金字塔天窗：四条斜脊 + 四条中脊
  const C = core.map((p) => W(p, GYM.H1)), A = W([cx, cy], apexH), pyr = [];
  for (let i = 0; i < C.length; i++) pyr.push(C[i], C[(i + 1) % C.length], A);
  add(tris(pyr), mats.sky);
  const ridges = [];
  for (let i = 0; i < C.length; i++) { ridges.push(beam(C[i], A, 0.5)); ridges.push(beam(C[i].clone().lerp(C[(i + 1) % C.length], 0.5), A, 0.3)); }
  add(mergeGeometries(ridges), mats.fin);

  g.position.y = 0;
  g.traverse((o) => { if (o.isMesh) o.userData.zone = b.zone; });
  return { group: g };
}

/** 馆前雕塑：黑色基座上三道不锈钢旋环、一片斜插的尖刃、几颗四角星。 */
function sculpture(p, mats) {
  const g = new THREE.Group();
  const add = (geo, mat) => { const o = new THREE.Mesh(geo, mat); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(3.6, 4.4, 3.6).translate(0, 2.2, 0), mats.plinth);
  for (let k = 0; k < 3; k++) {
    const R = 5 - 0.75 * k;
    const ring = add(new THREE.TorusGeometry(R, 0.55, 10, 56, Math.PI * 1.62), mats.steel);
    ring.position.set((k - 1) * 1.5, 4.4 + R + 0.4 + k * 0.8, (k - 1) * 0.4);
    ring.rotation.set(0.25 * (k - 1), 0.5 + k * 0.95, -0.6 + k * 0.5);
  }
  const blade = add(new THREE.ConeGeometry(1.5, 15, 3), mats.steel);
  blade.scale.set(1, 1, 0.22);
  blade.position.set(-2.4, 16, 0.6);
  blade.rotation.z = 0.42;
  const star = new THREE.OctahedronGeometry(0.75).scale(1, 1.7, 0.35);
  for (const [x, y, z] of [[3.6, 15.5, 0.5], [4.8, 13.2, -0.8], [-4.4, 9.4, 1.1], [0.4, 7.8, 3.2], [1.8, 12.4, 2.6]]) {
    add(star, mats.steel).position.set(x, y, z);
    add(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 4).translate(0, -1.4, 0), mats.steel).position.set(x, y, z);
  }
  g.position.set(m(p[0]), 0, -m(p[1]));
  g.rotation.y = 0.5;
  g.traverse((o) => { if (o.isMesh) o.userData.zone = p.zone; });
  return g;
}

/** 游泳馆：沿长轴的筒拱顶，十三道弧形钢屋架露在外面；两端是半圆的玻璃山墙。 */
function poolRoof(b, mats) {
  const q = obb(b.o), W = q.W * 1.02, L = q.L * 1.02, rise = Math.max(4, b.h * EX - POOL_WALL);
  const Rr = (W * W / 4 + rise * rise) / (2 * rise), half = Math.asin(W / 2 / Rr);
  const arc = (r) => { const v = []; for (let i = 0; i <= 40; i++) { const t = -half + (2 * half * i) / 40; v.push(new THREE.Vector2(r * Math.sin(t), r * Math.cos(t) - (Rr - rise))); } return v; };
  const sh = new THREE.Shape([new THREE.Vector2(-W / 2, 0), ...arc(Rr), new THREE.Vector2(W / 2, 0)]);
  const vault = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 1 });
  vault.translate(0, 0, -L / 2);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(vault, mats.vault));
  const ribShape = new THREE.Shape([...arc(Rr + 0.9), ...arc(Rr - 0.05).reverse()]);
  const rib = new THREE.ExtrudeGeometry(ribShape, { depth: 0.9, bevelEnabled: false, curveSegments: 1 });
  const ribs = [];
  for (let i = 0; i < 13; i++) { const r = rib.clone(); r.translate(0, 0, -L / 2 + ((L - 0.9) * i) / 12); ribs.push(r); }
  g.add(new THREE.Mesh(mergeGeometries(ribs), mats.fin));
  // 两端山墙：玻璃 + 竖梃 + 一道横档
  const gable = new THREE.ShapeGeometry(sh), bars = [];
  const yAt = (x) => Math.sqrt(Math.max(0, Rr * Rr - x * x)) - (Rr - rise);
  for (const s of [-1, 1]) {
    const z = s * (L / 2 + 0.12);
    const gl = new THREE.Mesh(gable, mats.poolGlass);
    gl.position.z = z;
    if (s < 0) gl.rotation.y = Math.PI;
    g.add(gl);
    for (let x = -W / 2 + 3.2; x < W / 2 - 1; x += 3.2) bars.push(beam(new THREE.Vector3(x, 0, z + s * 0.2), new THREE.Vector3(x, yAt(x), z + s * 0.2), 0.18));
    bars.push(beam(new THREE.Vector3(-W / 2 * 0.86, rise * 0.45, z + s * 0.2), new THREE.Vector3(W / 2 * 0.86, rise * 0.45, z + s * 0.2), 0.18));
  }
  g.add(new THREE.Mesh(mergeGeometries(bars), mats.fin));
  g.rotation.y = q.rotY;
  g.position.set(q.x, POOL_WALL, q.z);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.zone = b.zone; } });
  return g;
}

// ====================================================================================
// 贴图：路灯下的暖光斑、体育馆广场铺装、树冠色
// ====================================================================================
let lampTex = null;
function poolTexture() {
  if (lampTex) return lampTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,214,160,1)');
  gr.addColorStop(0.35, 'rgba(255,190,130,0.45)');
  gr.addColorStop(1, 'rgba(255,170,110,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  lampTex = new THREE.CanvasTexture(c);
  lampTex.colorSpace = THREE.SRGBColorSpace;
  return lampTex;
}
/** 体育馆广场的铺装：12 米一格的深浅方块 + 3 米一道的石缝（贴图坐标就是地面米数）。 */
function pavingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#C9C0B0' : '#D8D0C2'; g.fillRect(i * 128, j * 128, 128, 128); }
  g.strokeStyle = 'rgba(120,110,96,0.35)';
  g.lineWidth = 1.2;
  for (let k = 0; k <= 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 24, 1 / 24);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
// 树冠：十月下旬的北京——大多还绿着（深浅三种），银杏开始泛黄
const CROWN = [['#4E7A42', 0.3], ['#5F8C48', 0.26], ['#3F6A3E', 0.2], ['#7E9A4A', 0.1], ['#C6A23C', 0.14]].map(([c, w]) => [new THREE.Color(c), w]);
function crownColor(i) {
  let r = ((i * 2654435761) >>> 0) / 4294967296;
  for (const [c, w] of CROWN) { if ((r -= w) < 0) return c; }
  return CROWN[0][0];
}

// ====================================================================================
// 校园：底板 + 十个区块（地块、道路、绿地、水面、跑道、球场、楼、树、路灯、单车、长椅）
// ====================================================================================
/** 黑胶唱片贴图：同心纹路 + 高光弧 + 外圈印刷字（会随唱片一起转）。 */
function recordTexture() {
  const S = 2048, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const R = S / 2;
  g.translate(R, R);
  const bg = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  bg.addColorStop(0, '#20232C');
  bg.addColorStop(0.55, '#12141B');
  bg.addColorStop(1, '#07080B');
  g.fillStyle = bg;
  g.beginPath(); g.arc(0, 0, R - 2, 0, Math.PI * 2); g.fill();
  // 同心纹路
  let ring = 0;
  for (let r = R * 0.30; r < R * 0.997; r += 1.8 + Math.random() * 1.6) {
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
    const trackRing = ring % 7 === 0;
    g.strokeStyle = 'rgba(214,222,235,' + (trackRing ? 0.17 : 0.05 + Math.random() * 0.055).toFixed(3) + ')';
    g.lineWidth = trackRing ? 2.8 : 1.5;
    g.stroke();
    ring += 1;
  }
  // 细微尘点 / 划痕
  for (let i = 0; i < 320; i++) {
    const a = Math.random() * Math.PI * 2, rr = (0.31 + Math.random() * 0.68) * R;
    g.fillStyle = 'rgba(230,235,245,' + (0.015 + Math.random() * 0.05).toFixed(3) + ')';
    g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 1.7, 1.5);
  }
  // 两道淡淡的环形高光
  try {
    const cg = g.createConicGradient(-0.8, 0, 0);
    cg.addColorStop(0, 'rgba(255,255,255,0.26)');
    cg.addColorStop(0.16, 'rgba(255,255,255,0)');
    cg.addColorStop(0.52, 'rgba(255,255,255,0.14)');
    cg.addColorStop(0.66, 'rgba(255,255,255,0)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(0, 0, R - 3, 0, Math.PI * 2); g.fill();
  } catch { /* 老浏览器没有 conicGradient */ }
  // 外圈印刷字（露在模型外的环带上，随唱片转）
  g.save();
  g.font = '600 26px "Songti SC","SimSun",serif';
  g.fillStyle = 'rgba(242,244,243,0.62)';
  g.textAlign = 'center';
  const N = 40;
  for (let i = 0; i < N; i++) {
    g.save();
    g.rotate((i / N) * Math.PI * 2);
    g.fillText(i % 2 === 0 ? '声景校园' : '北航 · 学院路', 0, -R * 0.945);
    g.restore();
  }
  g.restore();
  // 内圈标签（多数被模型盖住，露一点边）
  g.beginPath(); g.arc(0, 0, R * 0.20, 0, Math.PI * 2);
  g.fillStyle = '#E4D8BE'; g.fill();
  g.beginPath(); g.arc(0, 0, R * 0.195, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(36,48,74,0.35)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = 'rgba(36,48,74,0.7)';
  g.font = '500 30px "Songti SC","SimSun",serif';
  g.textAlign = 'center';
  g.fillText('声景校园', 0, -R * 0.045);
  g.font = '400 18px system-ui,sans-serif';
  g.fillText('SOUNDSCAPE · BUAA · 2 rpm', 0, R * 0.045);
  // 中心孔
  g.beginPath(); g.arc(0, 0, R * 0.012, 0, Math.PI * 2);
  g.fillStyle = '#0B0D12'; g.fill();
  // 最外一道亮边
  g.beginPath(); g.arc(0, 0, R - 4, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(230,190,58,0.85)'; g.lineWidth = 5; g.stroke();
  for (const rr of [0.365, 0.52, 0.70, 0.885]) {
    g.beginPath(); g.arc(0, 0, R * rr, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(190,200,215,0.10)'; g.lineWidth = 1.6; g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/**
 * 唱片上的接触阴影：把校园底板轮廓画成一块柔和的暗影贴在唱片顶面上。
 * 它是静态的（不跟唱片转），刚好露在底板轮廓外一圈，让模型像"压"在唱片上，而不是硬边相接。
 */
function addRecordContactShadow() {
  // 软接触阴影：以校园中心为圆心的柔和暗影。不用轮廓贴图——之前贴图边缘会在唱片上
  // 切出一条直的明暗线，很难看；圆形渐变没有方向，边缘完全淡出。
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const half = S / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(0,0,0,0.34)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.32)');
  grad.addColorStop(0.90, 'rgba(0,0,0,0.20)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const size = CAMPUS_R * 2.12;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(CAMPUS_C.x, RECORD_TOP + 0.02, CAMPUS_C.z);
  mesh.userData.noPick = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
}

/** 底部大黑胶唱片：顶面比底板底沿高 2（模型下半截埋进唱片），转速恒定 60 秒/圈。 */
function buildRecord() {
  recordRadius = CAMPUS_R + Math.max(38, CAMPUS_R * 0.07);
  const H = 14;
  const top = RECORD_TOP;                   // 顶面比底板底沿高 2：底板下半截埋进唱片，去掉台阶
  const geo = new THREE.CylinderGeometry(recordRadius, recordRadius * 0.985, H, 200, 1);
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x2C303B, roughness: 0.34, metalness: 0.62 });
  const topMat = new THREE.MeshStandardMaterial({ map: recordTexture(), roughness: 0.48, metalness: 0.32 });
  const bottomMat = new THREE.MeshBasicMaterial({ color: 0x08090C });
  recordGrp = new THREE.Mesh(geo, [sideMat, topMat, bottomMat]);
  recordGrp.position.set(CAMPUS_C.x, top - H / 2, CAMPUS_C.z);
  recordGrp.renderOrder = -2;
  recordGrp.userData.noPick = true;
  scene.add(recordGrp);
  addRecordContactShadow();
  try { recordOn = localStorage.getItem('ss-record') !== '0'; } catch { recordOn = true; }
}

/** 唱针：底座在唱片南沿外，臂伸向唱片，默认抬起；播放时落针。 */
/** 木制针脚：一块圆角木板，长 0.8×唱片半径、宽 0.15×唱片半径；默认抬起，播放时落到唱片上。 */
function roundedRectShape(L, W, r) {
  const s = new THREE.Shape();
  const x = L / 2, y = W / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

function buildTonearm() {
  const R = recordRadius;
  const L = R * 0.8;          // 长 = 0.8 × 唱片半径
  const W = R * 0.15;         // 宽 = 0.15 × 唱片半径
  const T = Math.max(18, R * 0.05);   // 木板厚度
  const grp = new THREE.Group();
  // 支点放在唱片北侧外沿附近（默认镜头从南看，北沿在画面上方）
  grp.position.set(CAMPUS_C.x, 0, CAMPUS_C.z - R * 1.62);   // 固定点放到唱片外侧（离圆心 1.62R），播放时臂与圆心连线成 15°

  const wood = new THREE.MeshStandardMaterial({ color: 0x9C6B40, roughness: 0.74, metalness: 0.04 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x6B4325, roughness: 0.8, metalness: 0.03 });

  // 底座：唱片上的木质转轴盘
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.055, 10, 40), woodDark);
  base.position.y = RECORD_TOP + 5;
  grp.add(base);
  // 支点在外侧：加一根落地木柱，别让它悬空
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.022, R * 0.03, 96, 20), woodDark);
  stand.position.y = RECORD_TOP - 43;
  grp.add(stand);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.06, R * 0.07, 8, 32), wood);
  foot.position.y = RECORD_TOP - 92;
  grp.add(foot);

  const pivot = new THREE.Group();
  pivot.position.y = RECORD_TOP + 44;
  grp.add(pivot);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.016, R * 0.018, 36, 20), wood);
  post.position.y = -18;
  pivot.add(post);

  // 圆角木板（挤出 + 倒角，四角圆滑）
  const shape = roundedRectShape(L, W, W * 0.32);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: T, bevelEnabled: true, bevelSize: T * 0.14, bevelThickness: T * 0.14, bevelSegments: 3, curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -T / 2, 0);
  const arm = new THREE.Mesh(geo, wood);
  arm.position.x = L / 2;
  pivot.add(arm);

  // 木纹装饰条
  const inlayGeo = new THREE.ExtrudeGeometry(roundedRectShape(L * 0.9, W * 0.12, W * 0.06), { depth: 2, bevelEnabled: false, curveSegments: 8 });
  inlayGeo.rotateX(-Math.PI / 2);
  inlayGeo.translate(0, T / 2, 0);
  const inlay = new THREE.Mesh(inlayGeo, woodDark);
  inlay.position.x = L / 2;
  pivot.add(inlay);

  // 针座 + 木针
  const needleX = L * 0.86;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.02, R * 0.03, 9, 20), woodDark);
  head.position.set(needleX, -T / 2 - 4, 0);
  pivot.add(head);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.004, R * 0.002, 15, 8), woodDark);
  needle.position.set(needleX, -T / 2 - 8 - 7, 0);
  pivot.add(needle);

  tonearmPivot = pivot;
  tonearmCur = 0;
  tonearmTarget = 0;
  pivot.rotation.z = 0.055;    // 默认抬起
  pivot.rotation.y = -1.05;    // 默认向外摆开（不播放时）
  tonearm = grp;
  grp.userData.noPick = true;
  scene.add(grp);
}

function buildCampus() {
  const base = new THREE.Mesh(extrude(campus.campus, BASE_TOP), new THREE.MeshLambertMaterial({ color: '#8C867B' }));   // 底板：灰板纸
  base.position.y = 0.4;
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  // 材质只用 Lambert / Phong：比 PBR 的 Standard 便宜得多，首帧着色器编译快一大截。
  // 「粗糙一点」是这一版的取舍：纸感还在，金属的反光弱了。
  const matte = (o) => new THREE.MeshLambertMaterial(o);
  const shiny = (o) => new THREE.MeshPhongMaterial({ specular: '#E6ECF2', shininess: 80, ...o });
  const glow = (mat, k) => { nightMats.push({ mat, k }); return mat; };
  // 地标的材质（体育馆与游泳馆在同一个区块，选别的区块时跟着压暗）
  const lm = {
    shell: shiny({ color: '#C8CDD2', shininess: 140, specular: '#F4F8FA', side: THREE.DoubleSide }),
    roof: shiny({ color: '#9AA2AA', shininess: 90, side: THREE.DoubleSide }),
    soffit: shiny({ color: '#8E979F', shininess: 80, side: THREE.DoubleSide }),
    fin: shiny({ color: '#7D8790', shininess: 100, side: THREE.DoubleSide }),
    glass: glow(shiny({ color: '#2F4A5E', shininess: 160, specular: '#CFE8FF', emissive: '#FFD39A', emissiveIntensity: 0 }), 1.5),
    sky: glow(shiny({ color: '#B9D2DC', shininess: 130, emissive: '#FFE2B8', emissiveIntensity: 0, side: THREE.DoubleSide }), 1.1),
    notch: glow(shiny({ color: '#1F2B3D', shininess: 90, emissive: '#FFCB8A', emissiveIntensity: 0, side: THREE.DoubleSide }), 0.5),
    granite: matte({ color: '#B9B1A4', side: THREE.DoubleSide }),
    planter: matte({ color: '#5E8A48' }),
    flowers: matte({ color: '#D9893A' }),
    vault: shiny({ color: '#C9CED2', shininess: 60 }),
    poolGlass: glow(shiny({ color: '#3D6A8E', shininess: 150, specular: '#CFE8FF', emissive: '#CFE8FF', emissiveIntensity: 0, side: THREE.DoubleSide }), 1.2),
    plinth: matte({ color: '#1C1F25' }),
    steel: shiny({ color: '#E1E4E6', shininess: 180, specular: '#FFFFFF' }),
    paving: matte({ map: pavingTexture() }),
  };
  const lmDim = new THREE.Color('#8B929B');
  const bikeMat = matte({ color: '#FFFFFF' });
  const benchMat = matte({ color: '#8C6E52' });
  const kitMat = matte({ color: '#ECEDEA' });
  const parkDone = new Set();
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const postGeo = new THREE.CylinderGeometry(0.22, 0.3, 7.5, 6);
  postGeo.translate(0, 3.75, 0);
  const headGeo = new THREE.SphereGeometry(0.85, 12, 8);
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const lampHeadMat = glow(matte({ color: '#E9ECEC', emissive: '#FFD9A8', emissiveIntensity: 0 }), 5);
  const trunkMat = matte({ color: '#6E655C' });
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();

  const sideMat = matte({ color: '#C9BEA9' });   // 卡纸板的切边

  campus.zones.forEach((z, zi) => {
    const group = new THREE.Group();
    group.name = z.id;
    // 每种材质登记「平常 / 选中 / 被压暗」三档颜色，每帧往目标色上靠（见 frame）
    const tints = [];
    const mat = (color, o = {}, dim = '#6B727A', selC = null) => {
      const mt = matte({ color, ...o });
      tints.push({ mat: mt, on: new THREE.Color(color), dim: new THREE.Color(dim), sel: selC && new THREE.Color(selC) });
      return mt;
    };
    const tileMat = mat(SCENERY['秋'].tile, {}, '#5C636D', '#B9B6AC');
    const roadMat = mat(SCENERY['秋'].road, {}, '#8A9199');
    const greenMat = mat(SCENERY['秋'].green, {}, '#6C7775');
    seasonal.push({ tints, tileMat, roadMat, greenMat });
    const pitchMat = mat('#5E9A5A', {}, '#5B6968');
    const trackMat = mat('#B85C45', {}, '#6B6466');
    const bldMat = mat('#FFFFFF', { vertexColors: true }, '#A3A9B1');
    if (level().windows) windowize(bldMat);   // 低配档不印窗：少一套自定义着色器，软渲染少吃一大截
    const treeMat = mat('#FFFFFF', {}, '#7F8890');
    const lineMat = new THREE.LineBasicMaterial({ color: COL.paper, transparent: true, opacity: 0.85 });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

    // 地块：一块一个网格
    for (const t of z.tiles) {
      const o = new THREE.Mesh(extrude(t.r, TILE_TOP - BASE_TOP), [tileMat, sideMat]);
      o.position.y = BASE_TOP;
      o.receiveShadow = true;
      o.userData.zone = z.id;
      group.add(o);
      pickables.push(o);
    }

    const ground = (list, y, mt) => { if (!list.length) return; const o = new THREE.Mesh(mergeGeometries(list.map((g) => flat(g, y))), mt); o.receiveShadow = true; group.add(o); };
    if (z.roads.length) {
      const rd = new THREE.Mesh(mergeGeometries(z.roads.map((r) => ribbon(r, TILE_TOP + 0.06))), roadMat);
      rd.receiveShadow = true;
      group.add(rd);
    }
    ground(z.green, TILE_TOP + 0.03, greenMat);
    ground(z.track, TILE_TOP + 0.045, trackMat);
    ground(z.pitch, TILE_TOP + 0.05, pitchMat);
    ground(z.water, TILE_TOP + 0.05, mat('#4F7FA0', {}, '#4E5966'));
    // 场地画线：跑道分道线、球场边线
    if (z.lines.length) {
      const seg = [];
      for (const ln of z.lines) for (let i = 1; i + 3 < ln.length; i += 2) seg.push(m(ln[i]), TILE_TOP + 0.12, -m(ln[i + 1]), m(ln[i + 2]), TILE_TOP + 0.12, -m(ln[i + 3]));
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      group.add(new THREE.LineSegments(lg, lineMat));
    }

    // 楼：卡纸模型（cardBuilding）；体育馆整栋另做，游泳馆只做石材墙身、拱顶另做
    const bs = campus.buildings.filter((b) => b.z === zi);
    const plain = bs.filter((b) => b.n !== '体育馆');
    const bldGeo = plain.length ? mergeGeometries(plain.flatMap((b) => cardBuilding(b, zi))) : null;
    const bgroup = new THREE.Group();
    bgroup.position.y = TILE_TOP;
    if (bldGeo) {
      const bld = new THREE.Mesh(bldGeo, bldMat);
      bld.castShadow = true;
      bld.receiveShadow = true;
      bld.userData.zone = z.id;
      bgroup.add(bld);
      pickables.push(bld);
    }
    const lmHere = [];
    for (const b of bs) if (b.n === '主楼') { const f = zhulouFront({ ...b, zone: z.id }); bgroup.add(f); f.traverse((o) => { if (o.isMesh) pickables.push(o); }); }
    // 主楼屋顶那一排红字：立在东侧檐口上，朝学院路
    for (const b of bs) {
      if (b.n !== '主楼') continue;
      const xs = ringM(b.r[0]).map((p) => p[0]), ys = ringM(b.r[0]).map((p) => p[1]);
      const sign = plate('北京航空航天大学', 62, 7.5, { color: '#B8343C', flat: false, size: 0.9 });
      sign.rotation.y = Math.PI / 2;
      sign.position.set(Math.max(...xs) - 1.5, b.h * EX + 1.2 + 3.75, -(Math.min(...ys) + Math.max(...ys)) / 2);
      bgroup.add(sign);
    }
    // 园名：做模型的人插在草地上的小纸牌（绿园、晨读园、静园、唯实园）
    for (const pk of campus.parks || []) {
      if (pk.a < 2000 || parkDone.has(pk.n)) continue;
      const near = campus.zones.reduce((a, q) => (Math.hypot(q.c[0] - pk.x, q.c[1] - pk.y) < Math.hypot(a.c[0] - pk.x, a.c[1] - pk.y) ? q : a));
      if (near.id !== z.id) continue;
      parkDone.add(pk.n);
      const g = new THREE.Group();
      const card = plate(pk.n, 4.2 * pk.n.length + 2, 5.2, { bg: '#F4F1EA', color: '#3B4452', flat: false, size: 0.66 });
      card.position.y = 7.4;
      g.add(card);
      for (const dx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), kitMat); leg.position.set(dx * (2.1 * pk.n.length - 0.6), 2.5, -0.05); g.add(leg); }
      g.position.set(m(pk.x), 0, -m(pk.y));
      g.rotation.y = 0.35;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      bgroup.add(g);
    }
    for (const b of bs) {
      if (b.n === '体育馆') {
        const gm = gymModel({ ...b, zone: z.id }, lm);
        bgroup.add(gm.group);
        gm.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
        if (campus.gym.plaza) {
          const pz = new THREE.Mesh(flat(campus.gym.plaza, TILE_TOP + 0.08), lm.paving);
          pz.receiveShadow = true;
          group.add(pz);
        }
        if (campus.gym.sculpture) bgroup.add(sculpture(Object.assign([...campus.gym.sculpture], { zone: z.id }), lm));
        lmHere.push(...Object.values(lm));
      } else if (b.n === '游泳馆') {
        const roof = poolRoof({ ...b, zone: z.id }, lm);
        bgroup.add(roof);
        roof.traverse((o) => { if (o.isMesh) pickables.push(o); });
      }
    }
    for (const mt of new Set(lmHere)) tints.push({ mat: mt, on: mt.color.clone(), dim: mt.color.clone().lerp(lmDim, 0.7), sel: null });

    // 树：林地成片、草地疏植、路边成行（位置由原项目的 build-campus.py 确定性生成）
    // 低配档隔几棵栽一棵：树占了这个场景六成以上的三角形，稀疏一点能在软渲染上换回几十毫秒
    const treeStep = level().treeStep;
    const nT0 = z.trees.length / 3;
    const treeIdx = [];
    for (let i = 0; i < nT0; i++) if (treeStep === 1 || i % treeStep === 0) treeIdx.push(i);
    const nT = treeIdx.length;
    const treeSeeds = [], treeMtx = [];
    if (nT) {
      const crowns = new THREE.InstancedMesh(crownGeo, treeMat, nT);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, nT);
      for (let k = 0; k < nT; k++) {
        const i = treeIdx[k];
        const x = m(z.trees[i * 3]), y = -m(z.trees[i * 3 + 1]), r = m(z.trees[i * 3 + 2]);
        const th = 2.4 + r * 0.5;
        mtx.compose(ps.set(x, th + r * 1.05, y), qt.identity(), sc.set(r, r * 1.22, r));
        crowns.setMatrixAt(k, mtx);
        const seed = z.trees[i * 3] * 31 + z.trees[i * 3 + 1];
        tint.copy(crownColor(seed)).multiplyScalar(0.9 + ((seed * 7919) % 97) / 97 * 0.2);
        crowns.setColorAt(k, tint);
        treeSeeds.push(seed);
        treeMtx.push(mtx.clone());
        mtx.compose(ps.set(x, 0, y), qt.identity(), sc.set(1, th + r * 0.4, 1));
        trunks.setMatrixAt(k, mtx);
      }
      crowns.castShadow = trunks.castShadow = true;
      crowns.receiveShadow = true;
      bgroup.add(trunks, crowns);
      forest.push({ crowns, trunks, seeds: treeSeeds, mtx: treeMtx, n: nT });
    }
    // 人的尺度：楼门口一排排共享单车、园里的长椅、球场的球门和篮架
    const nB = (z.bikes || []).length / 3;
    if (nB && level().bikes) {
      const bikes = new THREE.InstancedMesh(BIKE_GEO, bikeMat, nB);
      for (let i = 0; i < nB; i++) {
        const x = m(z.bikes[i * 3]), y = -m(z.bikes[i * 3 + 1]), a = z.bikes[i * 3 + 2] / 1000;
        mtx.compose(ps.set(x, 0, y), qt.setFromAxisAngle(UPY, a + Math.PI / 2), sc.set(1.6, 1.6, 1.6));
        bikes.setMatrixAt(i, mtx);
        bikes.setColorAt(i, BIKE_COL[(z.bikes[i * 3] * 7 + z.bikes[i * 3 + 1] * 13 >>> 0) % 7 < 3 ? 0 : (z.bikes[i * 3] + z.bikes[i * 3 + 1] >>> 0) % 2 ? 1 : 2]);
      }
      bgroup.add(bikes);                          // 不投影：拉近才看得清的东西，影子省掉一遍阴影贴图
      trim.bikes.push(bikes);
    }
    const nC = (z.benches || []).length / 3;
    if (nC && level().props) {
      const benches = new THREE.InstancedMesh(BENCH_GEO, benchMat, nC);
      for (let i = 0; i < nC; i++) {
        mtx.compose(ps.set(m(z.benches[i * 3]), 0, -m(z.benches[i * 3 + 1])), qt.setFromAxisAngle(UPY, z.benches[i * 3 + 2] / 1000), sc.set(1.6, 1.6, 1.6));
        benches.setMatrixAt(i, mtx);
      }
      benches.castShadow = true;
      bgroup.add(benches);
      trim.props.push(benches);
    }
    const kit = [];
    (z.pitch || []).forEach((r, k) => {
      const sport = (z.pitchK || [])[k] || '';
      const q = obbOf(ringM(r[0])), c = Math.cos(q.ang), sn = Math.sin(q.ang);
      const at = (u, v) => [q.cx + u * c - v * sn, q.cy + u * sn + v * c];
      const put = (geo, u, v, rot) => { const [x, y] = at(u, v); const g = geo.clone(); g.rotateY(q.ang + rot); g.translate(x, 0, -y); kit.push(g); };
      if (/soccer|futsal/.test(sport) && q.L > 20) { put(GOAL_GEO, q.L / 2 - 1.2, 0, 0); put(GOAL_GEO, -q.L / 2 + 1.2, 0, Math.PI); }
      else if (/basketball/.test(sport) && q.L > 14) { put(HOOP_GEO, q.L / 2 - 1.6, 0, 0); put(HOOP_GEO, -q.L / 2 + 1.6, 0, Math.PI); }
      else if (/tennis|volleyball|badminton/.test(sport)) { put(NET_GEO(q.W), 0, 0, 0); }
    });
    if (kit.length && level().props) {
      const o = new THREE.Mesh(mergeGeometries(kit), kitMat);
      o.castShadow = true;
      bgroup.add(o);
      trim.props.push(o);
    }
    // 路灯：灯杆 + 灯头；入夜灯头发光、地上一圈暖色光斑
    const nL = z.lamps.length / 2;
    if (nL) {
      const posts = new THREE.InstancedMesh(postGeo, trunkMat, nL);
      const heads = new THREE.InstancedMesh(headGeo, lampHeadMat, nL);
      const spots = new THREE.InstancedMesh(poolGeo, poolMat, nL);
      for (let i = 0; i < nL; i++) {
        const x = m(z.lamps[i * 2]), y = -m(z.lamps[i * 2 + 1]);
        mtx.compose(ps.set(x, 0, y), qt.identity(), sc.set(1, 1, 1));
        posts.setMatrixAt(i, mtx);
        mtx.compose(ps.set(x, 8.0, y), qt.identity(), sc.set(1, 1, 1));
        heads.setMatrixAt(i, mtx);
        mtx.compose(ps.set(x, 0.2, y), qt.identity(), sc.set(26, 1, 26));
        spots.setMatrixAt(i, mtx);
      }
      spots.renderOrder = 1;
      bgroup.add(posts, heads, spots);
    }
    group.add(bgroup);

    scene.add(group);
    const c = { x: m(z.c[0]), y: m(z.c[1]) };
    const cz = -c.y;   // 区块中心的世界 z（地图北 = −z；c.y 存的是地图北向坐标）
    // 这一块摊开多大：楼的外接矩形四角 + 球场 / 跑道 / 水面这些真占了地方的场地（绿地面积太大，不算）
    let ext = 0;
    for (const b of bs) {
      const q = obb(b.o);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ext = Math.max(ext, Math.hypot(q.x + (sx * q.L) / 2 - c.x, q.z + (sz * q.W) / 2 - cz));
    }
    for (const list of [z.pitch || [], z.track || [], z.water || []]) {
      for (const item of list) {
        const rings = Array.isArray(item[0]) ? item : [item];   // pitch 是「环组」，track / water 是单个环
        for (const ring of rings) for (let i = 0; i < ring.length; i += 2) ext = Math.max(ext, Math.hypot(m(ring[i]) - c.x, -m(ring[i + 1]) - cz));
      }
    }
    zoneObj.set(z.id, {
      group, bgroup, tints, bldMat, poolMat, lift: 0, ext,
      c, tall: Math.max(...bs.map((b) => (b.n === '体育馆' ? b.h * EX + 6 : b.h * EX))),
      rise: 1,
    });
  });
}

// ====================================================================================
// 标签：十个区块名 + 十六个地点圆点（点圆点起波纹）
// ====================================================================================
function buildTags() {
  for (const z of campus.zones) {
    const t = document.createElement('div');
    t.className = 'tag is-zone';
    t.innerHTML = `<span>${esc(z.name)}</span>`;
    labelsEl.appendChild(t);
    zoneTags.set(z.id, t);
  }
  // 地点：常驻的小圆点；悬停出名字，点一下从那里起一圈波纹
  for (const p of campus.places) {
    const el = document.createElement('div');
    el.className = 'pmark';
    el.innerHTML = `<button type="button" class="pmark-dot" aria-label="在「${esc(p.name)}」起一圈波纹"></button><span class="pmark-name">${esc(p.name)}</span>`;
    el.querySelector('.pmark-dot').addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      selectPlace(p.id);
    });
    labelsEl.appendChild(el);
    placeMarks.set(p.id, el);
  }
}
const v3 = new THREE.Vector3();
function placeTag(t, x, y, z, show) {
  if (!show) { t.style.display = 'none'; return; }
  v3.set(x, y, z).project(camera);
  if (v3.z > 1) { t.style.display = 'none'; return; }
  const r = canvas.getBoundingClientRect();
  t.style.display = '';
  t.style.transform = `translate(${((v3.x + 1) / 2) * r.width}px, ${((1 - v3.y) / 2) * r.height}px) translate(-50%, -100%)`;
}
/** 地点圆点：以投影点为中心（CSS 里用负 margin 让圆点居中），不加 -50% 偏移。 */
function markAt(el, x, y, z, show) {
  if (!show) { el.style.display = 'none'; return; }
  v3.set(x, y, z).project(camera);
  if (v3.z > 1) { el.style.display = 'none'; return; }
  const r = canvas.getBoundingClientRect();
  el.style.display = '';
  el.style.transform = `translate(${((v3.x + 1) / 2) * r.width}px, ${((1 - v3.y) / 2) * r.height}px)`;
}
function updateTags() {
  const narrow = canvas.clientWidth < 700;
  for (const z of campus.zones) {
    const o = zoneObj.get(z.id);
    const t = zoneTags.get(z.id);
    const show = o.rise > 0.9 && (!narrow || sel.hover === z.id || sel.zone === z.id);
    t.classList.toggle('is-dim', !!sel.zone && sel.zone !== z.id);
    t.classList.toggle('is-on', sel.zone === z.id);
    placeTag(t, o.c.x, TILE_TOP + o.lift + Math.min(o.tall, 60) + 34, -o.c.y, show);
  }
  // 地点圆点：常驻；选中区块时显示该区块的地点名；正在起波的那个点变亮
  for (const p of campus.places) {
    const o = zoneObj.get(p.z);
    const el = placeMarks.get(p.id);
    el.classList.toggle('is-near', sel.zone === p.z);
    el.classList.toggle('is-on', activePlace === p.id);
    el.classList.toggle('is-dim', !!sel.zone && sel.zone !== p.z);
    markAt(el, m(p.x), TILE_TOP + o.lift + Math.max(10, p.h * EX) + 6, -m(p.y), o.rise > 0.9);
  }
}

// ====================================================================================
// 地面波纹：二维波场（楼是硬障碍、校园边界吸收），场值直接写成地面纹理。
// 换地点时旧波只会加快振幅衰减（× e^(−oldFade·t)），波速由网格和固定 dt 决定，不受影响。
// 仿真按真实时间累加推进（不随帧率忽快忽慢），一圈波 2.5 秒，越扩越淡。
// ====================================================================================
const RIPPLE = {
  speed: 45,       // 米/秒（波速，固定）
  burst: 0.9,      // 声源持续时间（仿真秒）
  freq: 2.4,       // Hz：决定一圈圈之间的间距（越大越密）
  life: 2.0,       // 一个波纹的寿命（秒）
  amp: 900,        // 声源注入幅度
  damp: 0.999,     // 每步的全局衰减
  oldFade: 8,      // 被新波纹顶掉后额外的衰减速率（1/秒）：0.3–0.6 秒内淡掉
  edge: 7,         // 校园边界内侧吸收带宽度（格）
  lift: 1.4,       // 波纹面离地面的高度（米）：略微浮起，免得被地面/跑道线压住
};
const ripple = {
  points: null, pPos: null, pAlpha: null, pSize: null, pGeo: null, pMat: null, maxP: 0, field: null, w: 0, h: 0, cell: 3.5, x0: 0, z0: 0,
  inside: null, obstacle: null, dampCell: null, dtMax: 0.0155, k2: 0.45, layers: [],
  acc: 0,           // 仿真时间累加器
  ref: 0,           // 行进波的峰值振幅：不透明度按它归一，波衰减时画面跟着变淡
  rel: 0,
};

/** 把一条环（世界坐标 x,z 成对）按扫描线填进掩码。 */
function fillRing(mask, ring, value, w, h, x0, z0, cell) {
  const pts = [];
  for (let i = 0; i + 1 < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  const n = pts.length;
  if (!n) return;
  let minZ = Infinity, maxZ = -Infinity;
  for (const q of pts) { if (q[1] < minZ) minZ = q[1]; if (q[1] > maxZ) maxZ = q[1]; }
  const gy0 = Math.max(0, Math.ceil((minZ - z0) / cell - 0.5));
  const gy1 = Math.min(h - 1, Math.floor((maxZ - z0) / cell - 0.5));
  const xs = [];
  for (let gy = gy0; gy <= gy1; gy++) {
    const zc = z0 + (gy + 0.5) * cell;
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
      if ((az <= zc && bz > zc) || (bz <= zc && az > zc)) xs.push(ax + ((zc - az) / (bz - az)) * (bx - ax));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const gx0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5));
      const gx1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let gx = gx0; gx <= gx1; gx++) mask[gy * w + gx] = value;
    }
  }
}

function buildRippleGrid() {
  if (ripple.points) return;
  const cell = level().rippleCell;
  const pad = cell * 2;
  const { x0, x1, z0, z1 } = CAMPUS_BB;
  const gw = Math.max(8, Math.ceil((x1 - x0 + pad * 2) / cell));
  const gh = Math.max(8, Math.ceil((z1 - z0 + pad * 2) / cell));
  const gx0 = x0 - pad, gz0 = z0 - pad;
  const n = gw * gh;
  // 校园轮廓：外侧 1，洞 0
  const outline = [];
  for (let i = 0; i + 1 < campus.campus[0].length; i += 2) outline.push(m(campus.campus[0][i]), -m(campus.campus[0][i + 1]));
  const inside = new Uint8Array(n);
  fillRing(inside, outline, 1, gw, gh, gx0, gz0, cell);
  for (let k = 1; k < campus.campus.length; k++) {
    const hole = [];
    for (let i = 0; i + 1 < campus.campus[k].length; i += 2) hole.push(m(campus.campus[k][i]), -m(campus.campus[k][i + 1]));
    fillRing(inside, hole, 0, gw, gh, gx0, gz0, cell);
  }
  // 楼是硬障碍（体育馆、游泳馆也在 buildings 里），楼里的洞扣掉
  const obstacle = new Uint8Array(n);
  for (const b of campus.buildings) {
    for (let k = 0; k < b.r.length; k++) {
      const ring = [];
      for (let i = 0; i + 1 < b.r[k].length; i += 2) ring.push(m(b.r[k][i]), -m(b.r[k][i + 1]));
      fillRing(obstacle, ring, k === 0 ? 1 : 0, gw, gh, gx0, gz0, cell);
    }
  }
  for (let i = 0; i < n; i++) if (!inside[i]) obstacle[i] = 0;
  // 校园边界内侧的吸收带（离轮廓 1..edge 格逐渐加强吸收，波到边缘就没了）
  const dist = new Uint8Array(n);
  const q = new Int32Array(n); let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    const gx = i % gw, gy = (i / gw) | 0;
    if (gx === 0 || gy === 0 || gx === gw - 1 || gy === gh - 1 || !inside[i - 1] || !inside[i + 1] || !inside[i - gw] || !inside[i + gw]) { dist[i] = 1; q[qt++] = i; }
  }
  while (qh < qt) {
    const i = q[qh++], d = dist[i];
    if (d >= RIPPLE.edge) continue;
    for (const j of [i - 1, i + 1, i - gw, i + gw]) if (j >= 0 && j < n && inside[j] && !dist[j]) { dist[j] = d + 1; q[qt++] = j; }
  }
  const dampCell = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) { dampCell[i] = 0; continue; }
    const d = dist[i];
    dampCell[i] = d ? RIPPLE.damp * (1 - 0.55 * Math.pow((RIPPLE.edge + 1 - d) / RIPPLE.edge, 2)) : RIPPLE.damp;
  }
  // 固定 dt（波速不随机器帧率变），k2 = (c·dt/dx)²。取 0.35 的 CFL 系数：k2 = 0.1225，
  // 稳定且数值色散小；dt 变小后每帧推进更细，仿真时间靠累加器追真实时间，所以波看起来是 45 m/s。
  const dtMax = (cell / RIPPLE.speed) * 0.22;
  const k2 = Math.pow((RIPPLE.speed * dtMax) / cell, 2);
  // 波纹的「笔」：粒子。波峰经过的格子放一颗白色小亮点，其他位置不放——
  // 于是画面上是一圈圈往外扩的白色粒子环，位置/反射/淡出全由波场决定。
  const field = new Float32Array(gw * gh);
  const maxP = level().name === 'low' ? 1200 : 3200;
  const pPos = new Float32Array(maxP * 3);
  const pAlpha = new Float32Array(maxP);
  const pSize = new Float32Array(maxP);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying float vA;
      void main() {
        vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.06, d);
        gl_FragColor = vec4(uColor, a * vA * uOpacity);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.visible = false;
  scene.add(points);
  Object.assign(ripple, {
    points, pPos, pAlpha, pSize, pGeo: geo, pMat: mat, maxP, field,
    w: gw, h: gh, cell, x0: gx0, z0: gz0, inside, obstacle, dampCell, dtMax, k2,
  });
}

/** 地点在楼里：从地点所在格往外找最近的一格空地，波从楼脚下起。 */
function freeCellNear(gx, gy) {
  const { w, h, inside, obstacle } = ripple;
  for (let r = 0; r <= 40; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = gx + dx, y = gy + dy;
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x;
      if (inside[i] && !obstacle[i]) return i;
    }
  }
  return gy * w + gx;
}

/** 从「世界坐标 x、北向 y（米）」处起一圈波纹。波纹的来源是区块中心，点地点圆点触发。 */
function startRippleAt(x, yNorth, placeId, color) {
  buildRippleGrid();
  const gx = Math.round((x - ripple.x0) / ripple.cell - 0.5);
  const gy = Math.round((-yNorth - ripple.z0) / ripple.cell - 0.5);
  const src = freeCellNear(gx, gy);
  // 旧波：波速不变，只加快振幅衰减；最多留 level().rippleLayers 层
  for (const l of ripple.layers) l.fadeRate = Math.max(l.fadeRate, RIPPLE.oldFade);
  while (ripple.layers.length >= level().rippleLayers) ripple.layers.shift();
  ripple.layers.push({ u: new Float32Array(ripple.w * ripple.h), p: new Float32Array(ripple.w * ripple.h), n: new Float32Array(ripple.w * ripple.h), simT: 0, fadeRate: 0, src });
  ripple.points.visible = true;
  ripple.ref = 0;          // 新的一圈波重新建立不透明度参考
  ripple.tint = color ? new THREE.Color(color) : null;
  activePlace = placeId || null;
  dirty = true;
  dirtyUntil = performance.now() + RIPPLE.life * 1000 + 800;
}

/** 推进一步波场：u_next = (2u − u_prev + k2·∇²u) · 阻尼 · 衰减 */
function advanceRipple(layer) {
  const { w, h, inside, obstacle, dampCell, k2, dtMax } = ripple;
  const u = layer.u, p = layer.p, n = layer.n;
  const f = layer.fadeRate ? Math.exp(-layer.fadeRate * dtMax) : 1;
  // 双缓冲：邻居一律读「上一帧的 u」，新值写进 n，循环完再交换。
  // 原地更新会让左/上邻居变成新值，等于混进隐式格式，数值会指数发散。
  for (let gy = 1; gy < h - 1; gy++) {
    const row = gy * w;
    for (let gx = 1; gx < w - 1; gx++) {
      const i = row + gx;
      if (!inside[i]) { n[i] = 0; p[i] = 0; continue; }                   // 校园外：吸收带
      if (obstacle[i]) {
        // 楼：软边界——一半能量被楼吸收、一半继续（不再是 100% 反射的硬墙）
        const cur = u[i];
        const avg = (u[i - 1] + u[i + 1] + u[i - w] + u[i + w]) * 0.25;
        n[i] = avg * 0.5;
        p[i] = cur * 0.25;
        continue;
      }
      const cur = u[i];
      const lap = u[i - 1] + u[i + 1] + u[i - w] + u[i + w] - 4 * cur;
      let nxt = (2 * cur - p[i] + k2 * lap) * dampCell[i] * f;
      if (!(nxt > -50 && nxt < 50)) nxt = 0;   // 兜底：数值真发散了就清零，不让一帧毁掉整个场
      n[i] = nxt;
      p[i] = cur * f;
    }
  }
  layer.n = u;
  layer.u = n;
  // 声源：一阵正弦脉冲（前 burst 秒），之后自由衰减
  const t = layer.simT;
  if (t < RIPPLE.burst) {
    const env = Math.sin((Math.PI * t) / RIPPLE.burst);
    const drive = RIPPLE.amp * env * Math.sin(2 * Math.PI * RIPPLE.freq * t) * dtMax;
    const s = layer.src;
    if (inside[s] && !obstacle[s]) {
      const nu = layer.u;
      nu[s] += drive;
      nu[s - 1] += drive * 0.2; nu[s + 1] += drive * 0.2; nu[s - w] += drive * 0.2; nu[s + w] += drive * 0.2;
    }
  }
  layer.simT += dtMax;
}

/** 把各层场叠加后「画」成粒子：波峰经过的格子放一颗白色小亮点，其余位置不放。
 *  每帧用行进波的峰值重新归一（跳过声源附近），并乘时间包络让粒子随波扩散、淡出、末尾归零。 */
function compositeRipple() {
  const { w, h, inside, obstacle, field, pPos, pAlpha, pSize, pGeo, pMat, maxP } = ripple;
  const n = w * h;
  const night = light.cur ? light.cur.night : 0;
  // 粒子颜色：默认白；点声景类别时用该类别的亮色（往白里提亮一点，夜里再偏暖）
  let cr = 1, cg = 1, cb = 1;
  if (ripple.tint) { cr = ripple.tint.r * 0.45 + 0.55; cg = ripple.tint.g * 0.45 + 0.55; cb = ripple.tint.b * 0.45 + 0.55; }
  pMat.uniforms.uColor.value.setRGB(cr, cg * (1 - 0.14 * night), cb * (1 - 0.42 * night));
  const cell = ripple.cell, x0 = ripple.x0, z0 = ripple.z0;
  const layers = ripple.layers;
  // 时间包络：波一边扩散一边变淡，寿命末尾平滑归零，不会「啪」一下消失
  const envs = layers.map((l) => Math.pow(Math.max(0, 1 - l.simT / RIPPLE.life), 1.15));
  const last = layers.length - 1;
  const src = layers[last].src, sw = w;
  const sx = src % sw, sy = (src / sw) | 0;
  const skipR = 8;      // 声源那几格是尖峰，不参与归一化
  let maxRing = 0;
  for (let i = 0; i < n; i++) {
    if (!inside[i] || obstacle[i]) { field[i] = 0; continue; }   // 粒子只在楼外显示
    let val = 0;
    for (let k = 0; k < layers.length; k++) val += layers[k].u[i] * envs[k];
    field[i] = val;
    const gx = i % sw, gy = (i / sw) | 0;
    if (Math.abs(gx - sx) > skipR || Math.abs(gy - sy) > skipR) {
      const nv = Math.abs(layers[last].u[i]);
      if (nv > maxRing) maxRing = nv;
    }
  }
  ripple.ref = maxRing > 0 ? maxRing : ripple.ref;
  ripple.rel = 1;
  const inv = ripple.ref > 0 ? 1 / ripple.ref : 0;
  // 先数一遍符合条件的波峰格子（只取正波峰、且足够强），再按上限抽稀，避免粒子数爆掉
  const thr = 0.012;      // 环上保留的波峰格子（比例，相对于行进波峰值）
  let count = 0;
  for (let i = 0; i < n; i++) {
    const val = field[i];
    if (val <= 0) continue;
    if (!inside[i]) continue;
    if (val * inv < thr) continue;
    count++;
  }
  const step = count > maxP / 2 ? Math.ceil(count / (maxP / 2)) : 1;
  let cand = 0, pIdx = 0;
  const yW = TILE_TOP + RIPPLE.lift;
  // 每个符合条件的格子放 2 颗带抖动的粒子，环看起来更「粒」而不是一条虚线
  const jit = (i, s) => (((i * 1103515245 + s * 12345) >>> 8) % 1000) / 1000 - 0.5;
  for (let i = 0; i < n; i++) {
    const val = field[i];
    if (val <= 0 || !inside[i]) continue;
    if (val * inv < thr) continue;
    if (cand++ % step !== 0) continue;
    const gx = i % sw, gy = (i / sw) | 0;
    const a = Math.pow(Math.min(1, val * inv * 3.2), 2.2);
    for (let rep = 0; rep < 2 && pIdx < maxP; rep++) {
      const ox = jit(i, rep) * cell * 0.45;
      const oz = jit(i, rep + 7) * cell * 0.45;
      const o = pIdx * 3;
      pPos[o] = x0 + gx * cell + cell * 0.5 + ox;
      pPos[o + 1] = yW;
      pPos[o + 2] = z0 + gy * cell + cell * 0.5 + oz;
      pAlpha[pIdx] = 0.55 + 0.45 * a;
      pSize[pIdx] = 20 + 28 * a;
      pIdx++;
    }
    if (pIdx >= maxP) break;
  }
  pGeo.setDrawRange(0, pIdx);
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.aAlpha.needsUpdate = true;
  pGeo.attributes.aSize.needsUpdate = true;
}

/** 每帧推进波纹；返回是否还有活的波纹（有就继续重画）。
 *  仿真时间按真实时间累加：帧快就攒着、攒够一个 dt 才走一步，所以波速不随帧率变。 */
function stepRipple(dtMs) {
  if (!ripple.layers.length) {
    if (ripple.points && ripple.points.visible) { ripple.points.visible = false; activePlace = null; }
    ripple.ref = 0;
    ripple.acc = 0;
    return false;
  }
  ripple.acc += Math.min(0.08, dtMs / 1000);
  let steps = 0;
  while (ripple.acc >= ripple.dtMax && steps < 4) {
    for (const l of ripple.layers) advanceRipple(l);
    ripple.acc -= ripple.dtMax;
    steps++;
  }
  ripple.layers = ripple.layers.filter((l) => l.simT < RIPPLE.life);
  if (!ripple.layers.length) {
    ripple.points.visible = false;
    activePlace = null;
    ripple.ref = 0;
    return false;
  }
  if (steps === 0) return true;   // 这一帧没攒够一步：纹理没变，不重画图像
  compositeRipple();
  return true;
}

/** 点一个地点：选中它所在的区块（相机飞过去、其他压暗、不抬起），
 *  然后从「该区块的中心」起一圈波纹（来源是 10 个区块，圆点只是触发点）。 */
function selectPlace(pid) {
  const p = campus.places.find((q) => q.id === pid);
  if (!p) return;
  const o = zoneObj.get(p.z);
  selectZone(p.z, { flat: true });   // 点地点时不抬整块，波纹要贴在地面上
  // 起波点：地点圆点本身（米制北向坐标），不再是区块中心
  startRippleAt(m(p.x), m(p.y), p.id, placeTint.get(p.id));
  hooks.onPlace?.(p.id);
}

// ====================================================================================
// 视角：拉回全貌 / 凑近一个区块
// ====================================================================================
function setView(v, jump = false, dur = 950) {
  const target = v.target.clone();
  const az = v.azim ?? controls.getAzimuthalAngle();
  const polar = v.polar ?? controls.getPolarAngle();
  const pos = new THREE.Vector3().setFromSphericalCoords(v.dist, polar, az).add(target);
  if (jump || reduced) {
    controls.target.copy(target);
    camera.position.copy(pos);
    controls.update();
    fly = null;
    return;
  }
  fly = { t0: performance.now(), dur, fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: pos };
}
function zoneView(id) {
  const o = zoneObj.get(id);
  // 按这一块摊开的半径定远近：小的区块（体育馆）凑近看，西院家属区那种长条就退远些
  const dist = Math.min(1500, Math.max(900, (o.ext || 200) * 4.2));
  return { target: new THREE.Vector3(o.c.x, TILE_TOP, -o.c.y), dist, polar: Math.min(controls.getPolarAngle(), 0.95) };
}

// ====================================================================================
// 指针：悬停高亮 / 点选区块（拖动仍是转视角）
// ====================================================================================
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
function toNdc(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pick(ev) {
  toNdc(ev);
  const hit = ray.intersectObjects(pickables, false)[0];
  return hit && hit.object.userData.zone ? hit.object.userData.zone : null;
}
function setHover(id) {
  if (sel.hover === id) return;
  sel.hover = id;
  shadowDirty = performance.now() + 900;
  dirtyUntil = performance.now() + 1000;
  canvas.classList.toggle('is-pointing', !!id);
  document.querySelectorAll('.zones button').forEach((b) => b.classList.toggle('is-hover', b.dataset.zone === id));
}
function wirePointer() {
  canvas.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointermove', (ev) => { if (ev.buttons) return; setHover(pick(ev)); });
  const release = (ev) => {
    // 只有「按下后没怎么动就松手」才算点选；按住转视角、拖动漫游都不选。
    // 不设时间上限：渲染慢的机器上按下到松手可能隔一两秒，但那仍是一次点击。
    if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6) {
      const id = pick(ev);
      selectZone(id === sel.zone ? null : id);
    }
    down = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('pointerleave', () => setHover(null));
  canvas.addEventListener('keydown', (ev) => {
    const az = controls.getAzimuthalAngle(), polar = controls.getPolarAngle(), dist = camera.position.distanceTo(controls.target);
    const step = { ArrowLeft: [-0.2, 0, 1], ArrowRight: [0.2, 0, 1], ArrowUp: [0, -0.1, 1], ArrowDown: [0, 0.1, 1], '+': [0, 0, 0.85], '=': [0, 0, 0.85], '-': [0, 0, 1.18] }[ev.key];
    if (step) {
      ev.preventDefault();
      const p = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, polar + step[1]));
      const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist * step[2]));
      setView({ target: controls.target, dist: d, polar: p, azim: az + step[0] });
    } else if (ev.key === 'Escape') {
      selectZone(null);
    } else if (ev.key === '0' || ev.key === 'r' || ev.key === 'R') {
      ev.preventDefault();
      selectZone(null);
    }
  });
}

// ====================================================================================
// 天光：从一个时段平滑过渡到另一个
// ====================================================================================
function stepLight(now) {
  if (!light.cur) light.cur = snapLight(slotName);
  if (!light.to && light.queue.length) {
    const q = light.queue.shift();
    if (light.cur.name !== q.name || light.queue.length === 0) {
      light.from = { ...light.cur, col: light.cur.col.clone(), bg0: light.cur.bg0.clone(), bg1: light.cur.bg1.clone() };
      light.to = snapLight(q.name);
      light.t0 = now; light.dur = reduced ? 1 : q.dur;
    }
  }
  if (light.to) {
    const t = Math.min(1, (now - light.t0) / light.dur), k = t * t * (3 - 2 * t);
    const A = light.from, B = light.to, c = light.cur;
    let daz = ((B.az - A.az + 540) % 360) - 180;
    c.az = A.az + daz * k;
    for (const key of LKEYS) if (key !== 'az') c[key] = A[key] + (B[key] - A[key]) * k;
    c.col.lerpColors(A.col, B.col, k); c.bg0.lerpColors(A.bg0, B.bg0, k); c.bg1.lerpColors(A.bg1, B.bg1, k);
    if (t >= 1) { light.cur = { ...B, col: B.col.clone(), bg0: B.bg0.clone(), bg1: B.bg1.clone() }; light.to = null; }
  }
  if (!light.to && !light.queue.length && light.cur.name !== slotName) lightTo(slotName);
  const c = light.cur;
  const az = (c.az * Math.PI) / 180, el = (c.el * Math.PI) / 180;
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(2400);
  sun.intensity = c.i;
  sun.color.copy(c.col);
  // 一套灯一个色温：软箱、半球光、纸都取太阳这一刻的色度（light-rig.js）
  const rig = rigFor(`#${c.col.getHexString()}`);
  hemi.color.setRGB(rig.sky[0], rig.sky[1], rig.sky[2]);
  hemi.groundColor.setRGB(rig.ground[0], rig.ground[1], rig.ground[2]);
  if (rig.paper !== lightPaper) { lightPaper = rig.paper; document.documentElement.style.setProperty('--paper', rig.paper); }
  // 环境贴图（金属件、楼面的软箱反射）：过渡走完才重烘一次
  if (!light.to && envFor !== c.name) {
    envFor = c.name;
    const old = scene.environment;
    scene.environment = studioEnv(pmrem, rig.light);
    if (old) old.dispose();
  }
  hemi.intensity = c.hemi;
  scene.environmentIntensity = 1 - 0.93 * c.night;
  renderer.toneMappingExposure = 1.05;
  U.uNight.value = c.night;
  U.uLit.value = c.lit;
  for (const n of nightMats) n.mat.emissiveIntensity = c.night * n.k;
  zoneObj.forEach((o) => { o.poolMat.opacity = 0.5 * c.night; });
  if (!c.bgDone || light.to) { paintBackdrop(c.bg0, c.bg1); c.bgDone = !light.to; }
  const shown = light.to ? light.to.name : c.name;
  if (shown !== lightShown) { lightShown = shown; hooks.onLight?.({ name: shown, hour: LIGHT[shown].hour }); }
}

// ====================================================================================
// 四季景观：树冠配色、落叶、地三色、屋面积雪
// ====================================================================================
const scene4 = { cur: null };
const hiddenM = new THREE.Matrix4().makeScale(0, 0, 0);
function applySeason(name) {
  if (!SCENERY[name] || scene4.cur === name) return;
  scene4.cur = name;
  shadowDirty = performance.now() + 900;
  dirtyUntil = performance.now() + 1400;
  const S = SCENERY[name];
  const cols = S.crown.map(([c]) => new THREE.Color(c));
  for (const f of forest) {
    f.seeds.forEach((seed, i) => {
      const k = crownPick(name, seed);
      if (k < 0) { f.crowns.setMatrixAt(i, hiddenM); return; }
      f.crowns.setMatrixAt(i, f.mtx[i]);
      tint.copy(cols[k]).multiplyScalar(0.9 + ((seed * 7919) % 97) / 97 * 0.2);
      f.crowns.setColorAt(i, tint);
    });
    f.crowns.instanceMatrix.needsUpdate = true;
    if (f.crowns.instanceColor) f.crowns.instanceColor.needsUpdate = true;
  }
  for (const z of seasonal) for (const t of z.tints) {
    if (t.mat === z.tileMat) t.on.set(S.tile); else if (t.mat === z.roadMat) t.on.set(S.road); else if (t.mat === z.greenMat) t.on.set(S.green);
  }
  snowU.value = S.snow;
}

// ====================================================================================
// 每帧：没有变化就不画（静止时 CPU 归零），有变化才更新 + 渲染
// ====================================================================================
function resize(force = false) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const pr = renderer.getPixelRatio();
  if (force || renderer.domElement.width !== Math.round(w * pr) || renderer.domElement.height !== Math.round(h * pr)) {
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
}
function frame(now) {
  frameCount++;
  const dt = Math.min(1, lastNow ? (now - lastNow) / 1000 : 0.016);
  lastNow = now;
  resize();
  // 选区块：选中的抬起来、更白；其余压暗
  let animating = false;
  zoneObj.forEach((o, id) => {
    const selected = sel.zone === id, hovered = sel.hover === id;
    const goal = selected ? (sel.flat ? 0 : 20) : hovered ? 6 : 0;
    if (Math.abs(o.lift - goal) > 0.06) animating = true;
    o.lift += (goal - o.lift) * (reduced ? 1 : 0.14);
    o.group.position.y = o.lift;
    o.bgroup.position.y = TILE_TOP;
    const dim = sel.zone && !selected;
    const k = reduced ? 1 : 0.15;
    for (const t of o.tints) t.mat.color.lerp(dim ? t.dim : selected && t.sel ? t.sel : t.on, k);
    if (o.bldMat.userData.win) o.bldMat.userData.win.value += ((dim ? 0.25 : 1) - o.bldMat.userData.win.value) * k;
  });
  if (fly) {
    const t = Math.min(1, (now - fly.t0) / fly.dur), k = fly.dur > 1500 ? t * t * t * (t * (t * 6 - 15) + 10) : 1 - Math.pow(1 - t, 3);
    controls.target.lerpVectors(fly.fromT, fly.toT, k);
    camera.position.lerpVectors(fly.fromP, fly.toP, k);
    if (t >= 1) fly = null;
    animating = true;
  }
  if (light.to || light.queue.length) animating = true;
  controls.update();                      // 阻尼移动会触发 change → dirty
  // 唱片：恒定角速度（30 秒一圈）；dt 累加，开关/切后台都不跳变
  if (recordGrp && recordOn && !document.hidden && !reduced && !document.body.classList.contains('is-calm')) {
    recordAngle += dt * (Math.PI * 2 / RECORD_TURN);
    recordGrp.rotation.y = recordAngle;
    if (now - recordLastDirty > 33) { recordLastDirty = now; dirty = true; }   // 用 30fps 重画
  }
  // 唱针：有声音时落针，暂停/停止时抬起（用 0..1 插值）
  if (tonearm && Math.abs(tonearmCur - tonearmTarget) > 0.002) {
    tonearmCur += (tonearmTarget - tonearmCur) * (reduced ? 1 : 0.10);
    if (Math.abs(tonearmCur - tonearmTarget) <= 0.002) tonearmCur = tonearmTarget;
    tonearmPivot.rotation.z = 0.055 * (1 - tonearmCur);
    tonearmPivot.rotation.y = -1.05 + (-1.309 - -1.05) * tonearmCur;   // 播放时摆到与「圆心-固定点」连线成 15°
    dirty = true;
  }
  if (animating || now < dirtyUntil) dirty = true;
  if (!dirty) { requestAnimationFrame(frame); return; }   // 静止：不画
  dirty = false;
  const camD = camera.position.distanceTo(controls.target);
  const nearGoal = Math.min(20, Math.max(0.25, camD * 0.02));
  if (Math.abs(camera.near - nearGoal) / nearGoal > 0.15) { camera.near = nearGoal; camera.updateProjectionMatrix(); }
  stepLight(now);
  // 地面波纹：有波在跑就推进一步并继续重画
  if (stepRipple(dt * 1000)) dirty = true;
  updateTags();
  // 阴影贴图按需重画：第一帧先不画，之后天光在过渡、刚点了区块 / 悬停 / 换季时再画
  const firstDraw = !timing.firstFrame;
  if (renderer.shadowMap.enabled && !firstDraw && (light.to || light.queue.length || now < shadowDirty)) renderer.shadowMap.needsUpdate = true;
  // 白天直接渲染；入夜且画质够才走泛光链（第一次用到才建，省掉开机时那几套后期着色器）
  const night = light.cur ? light.cur.night : 0;
  const nightBloom = night > 0.02 && level().bloom;
  const r0 = performance.now();
  if (nightBloom) {
    ensureComposer();
    bloom.strength = 0.1 + 0.6 * night;
    bloom.threshold = 1.6;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  const rendMs = performance.now() - r0;
  timing.lastRenderMs = +rendMs.toFixed(1);
  timing.rendered += 1;
  timing.renderTotal += rendMs;
  if (firstDraw) {
    timing.firstFrame = +performance.now().toFixed(1);
    timing.firstRenderMs = +(performance.now() - r0).toFixed(1);
    // 首帧之后留一小段连续重画的时间：把阴影贴图补上，再停下来待机
    shadowDirty = performance.now() + 600;
    dirtyUntil = performance.now() + 1600;   // 留一小段连续渲染：把阴影补上，并量帧时决定要不要降档
    hooks.onFirstFrame?.();
  }
  sampleFrames(now);
  requestAnimationFrame(frame);
}

// ====================================================================================
// 区块选中 / 相机接口
// ====================================================================================
function selectZone(id, opts) {
  if (id && !zoneObj.has(id)) return;
  sel.zone = id || null;
  sel.flat = !!(id && opts && opts.flat);
  shadowDirty = performance.now() + 1400;
  dirtyUntil = performance.now() + 1800;   // 抬起来的这几帧要把阴影跟着重画
  setView(id ? zoneView(id) : HOME);
  document.querySelectorAll('.zones button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === id)));
  hooks.onZone?.(sel.zone, sel.zone ? zoneMeta.find((z) => z.id === sel.zone) : null);
}

// ====================================================================================
// 入口
// ====================================================================================
async function loadCampus() {
  const res = await fetch(new URL('./data/campus-xy.json', import.meta.url));
  if (!res.ok) throw new Error(`campus-xy.json ${res.status}`);
  return res.json();
}
function measureCampus(data) {
  let r = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const ring of data.campus) for (let i = 0; i < ring.length; i += 2) {
    const x = m(ring[i]), y = m(ring[i + 1]);
    r = Math.max(r, Math.hypot(x, y));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  CAMPUS_R = Math.max(200, r);
  CAMPUS_C = { x: (x0 + x1) / 2, z: -(y0 + y1) / 2 };
  CAMPUS_BB = { x0, x1, z0: -y1, z1: -y0 };
  HOME._target.set(CAMPUS_C.x, 16, CAMPUS_C.z);
}
function buildMeta(data) {
  zoneMeta = data.zones.map((z, zi) => ({
    id: z.id, name: z.name,
    buildings: data.buildings.filter((b) => b.z === zi).length,
    places: data.places.filter((p) => p.z === z.id).map((p) => p.name),
  }));
}

export async function init(userHooks = {}) {
  hooks = userHooks;
  canvas = document.getElementById('gl');
  labelsEl = document.getElementById('labels');
  if (!canvas || !labelsEl) throw new Error('页面缺少 #gl 或 #labels');

  const params = new URLSearchParams(location.search);
  slotName = LIGHT[params.get('slot')] ? params.get('slot') : '上午';
  seasonName = SCENERY[params.get('season')] ? params.get('season') : '夏';   // 默认夏天（可用 ?season=春/秋/冬 覆盖）

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: level().aa, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('WebGL 上下文建不起来');
  } catch (err) {
    renderer = null;
    return { ok: false, reason: err.message || String(err) };
  }
  timing.gl = probe.name;
  quality.software = probe.software;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 20, 12000);

  try { campus = await loadCampus(); } catch (err) {
    return { ok: false, reason: `campus-xy.json 读不到（${err.message}）` };
  }
  measureCampus(campus);
  buildMeta(campus);
  timing.data = +performance.now().toFixed(1);

  // 字体先到位：主楼屋顶的校名、园名纸牌都是 Canvas 贴图，画的时候字体必须已经加载。
  // 这里不等 requestAnimationFrame——预渲染总览是普通 HTML，页面早就画出来了，不用给「加载画面」留两帧。
  await document.fonts.load('30px "KS Fangsong Plan"').catch(() => {});
  timing.fonts = +performance.now().toFixed(1);

  // —— 场景 ——
  renderer.setPixelRatio(quality.dpr);
  renderer.shadowMap.enabled = level().shadows;
  renderer.shadowMap.autoUpdate = false;          // 只有灯在变 / 区块在动才重画阴影贴图（绕视角时不用一遍）
  renderer.shadowMap.needsUpdate = false;         // 第一帧先不画阴影（省一次全场景深度渲染），第二帧再补上
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;   // ACES 会把用途色洗成粉灰；Neutral 保住色相
  renderer.toneMappingExposure = 1.05;
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = studioEnv(pmrem);
  scene.environmentIntensity = 1;

  hemi = new THREE.HemisphereLight(0xf2f4f3, 0x24304a, 0.55);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfffcf4, 2.6);
  sun.castShadow = level().shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -820, right: 820, top: 820, bottom: -820, near: 100, far: 4200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.2;
  scene.add(sun, sun.target);
  timing.scene = +performance.now().toFixed(1);

  buildBackdrop();
  paintBackdrop(LIGHT[slotName].bg[0], LIGHT[slotName].bg[1]);
  buildCampus();
  buildRecord();
  buildTonearm();
  timing.campus = +performance.now().toFixed(1);
  buildRippleGrid();                       // 波纹网格先建好，第一次点地点时不卡一下
  timing.ripple = +performance.now().toFixed(1);

  controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.32;
  controls.maxPolarAngle = 1.18;
  controls.minDistance = 18;
  controls.maxDistance = 7000;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.7;
  controls.addEventListener('change', () => { dirty = true; });

  resize();
  setView(HOME, true);
  buildTags();
  wirePointer();
  applySeason(seasonName);
  hooks.onSeason?.(seasonName);

  // 打开页面看到的就是完整的校园：不排「夜→晨→上午」的开场、不播区块升起。
  light.cur = snapLight(slotName);
  lightShown = light.cur.name;
  envFor = light.cur.name;
  dirty = true;                                   // 第一帧一定要画
  hooks.onLight?.({ name: lightShown, hour: LIGHT[lightShown].hour });
  requestAnimationFrame(frame);

  return {
    ok: true,
    zones: zoneMeta,
    stats: { zones: zoneMeta.length, buildings: campus.buildings.length, places: campus.places.length },
    setSlot(name) { if (!LIGHT[name]) return; slotName = name; lightTo(name); dirtyUntil = performance.now() + 2600; },
    get slot() { return slotName; },
    setSeason(name) { if (!SCENERY[name]) return; seasonName = name; applySeason(name); hooks.onSeason?.(name); dirtyUntil = performance.now() + 1400; },
    get season() { return scene4.cur; },
    selectZone,
    hoverZone: (id) => setHover(id),
    resetView() { selectZone(null); },
    get zone() { return sel.zone; },
    stats3d() {
      let meshes = 0, trisN = 0;
      scene.traverse((o) => { if (!o.isMesh || !o.visible) return; meshes++; const g = o.geometry; if (!g) return; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; trisN += n * (o.isInstancedMesh ? o.count : 1); });
      return { meshes, tris: Math.round(trisN), calls: renderer.info.render.calls };
    },
    get quality() { return { name: quality.name, dpr: quality.dpr, step: quality.step, median: quality.median ?? null, software: quality.software }; },
    cam() {
      return {
        target: controls.target.toArray().map((v) => +v.toFixed(1)),
        pos: camera.position.toArray().map((v) => +v.toFixed(1)),
        dist: +camera.position.distanceTo(controls.target).toFixed(1),
        polar: +controls.getPolarAngle().toFixed(3),
        azim: +controls.getAzimuthalAngle().toFixed(3),
        homeDist: +HOME.dist.toFixed(1),
      };
    },
    /** 区块中心在屏幕上的位置（测试 / 外部挂件用）。 */
    zoneScreen(id) {
      const o = zoneObj.get(id);
      if (!o) return null;
      const v = new THREE.Vector3(o.c.x, TILE_TOP, -o.c.y).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    /** 屏幕坐标上拾取到哪个区块（测试用）。 */
    pickScreen(x, y) { return pick({ clientX: x, clientY: y }); },
    /** 每个区块摊开的半径与区块视图的距离（测试 / 调参用）。 */
    zoneInfo(id) {
      const o = zoneObj.get(id);
      return o && { ext: +o.ext.toFixed(1), dist: zoneView(id).dist };
    },
    /** 地点圆点的屏幕位置（测试 / 外部挂件用）。 */
    placeScreen(pid) {
      const el = placeMarks.get(pid);
      if (!el || el.style.display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    /** 直接从某个地点起一圈波纹（外部调用 / 测试用）。 */
    rippleAt(pid) { selectPlace(pid); },
    /** 16 处地点（米制坐标，给声景地图 / 声景档案用）。 */
    places: campus.places.map((p) => ({ id: p.id, name: p.name || p.n, zone: p.z, x: m(p.x), y: m(p.y) })),
    /** 4 个园子（米制坐标、按面积去重），只在声景地图里出现。 */
    parks: (() => {
      const seen = new Set();
      return (campus.parks || [])
        .filter((pk) => pk.a >= 4000)
        .sort((a, b) => b.a - a.a)
        .filter((pk) => (seen.has(pk.n) ? false : (seen.add(pk.n), true)))
        .map((pk) => ({ name: pk.n, x: m(pk.x), y: m(pk.y), a: pk.a / 100 }));
    })(),
    /** 校园轮廓（米制、北向坐标），给声景小地图描边用。 */
    outline: (() => {
      const ring = campus.campus[0] || [];
      const out = [];
      for (let i = 0; i + 1 < ring.length; i += 2) out.push([m(ring[i]), m(ring[i + 1])]);
      return out;
    })(),
    /** 给 3D 地点圆点写声景类别（颜色 + data-cat，供筛选 CSS 用）。 */
    setPlaceMeta(map) {
      for (const pid in map) {
        const el = placeMarks.get(pid);
        if (!el) continue;
        const meta = map[pid];
        el.dataset.cat = meta.category;
        el.style.setProperty('--cat', meta.color);
        const dot = el.querySelector('.pmark-dot');
        if (dot) dot.style.setProperty('--cat', meta.color);
      }
    },
    /** 地点 → 波纹颜色（点圆点时粒子用这个色）。 */
    setPlaceTints(map) { placeTint.clear(); for (const pid in map) placeTint.set(pid, map[pid]); },
    /** 飞到某个点（园子等非区块点位）并从那里起一圈波纹。 */
    focusPoint(x, yNorth, opts = {}) {
      const target = new THREE.Vector3(x, TILE_TOP, -yNorth);
      setView({ target, dist: opts.dist || 620, polar: Math.min(controls.getPolarAngle(), 0.9) });
      setHover(null);
      startRippleAt(x, yNorth, null, opts.color);
    },
    /** 唱针：true = 落针（有声音播放），false = 抬起。 */
    setTonearm(on) { tonearmTarget = on ? 1 : 0; dirty = true; },
    get tonearm() { return { playing: tonearmTarget === 1, t: +tonearmCur.toFixed(3) }; },
    /** 唱片：开关 / 角度 / 参数（30 秒一圈）。 */
    setRecordSpin(on) {
      recordOn = !!on;
      dirty = true;
      try { localStorage.setItem('ss-record', recordOn ? '1' : '0'); } catch { /* 隐私模式 */ }
    },
    get record() {
      return { on: recordOn, angle: +(recordAngle * 180 / Math.PI % 360).toFixed(2), angleRad: recordAngle, secondsPerTurn: RECORD_TURN, radius: +(recordRadius || 0).toFixed(1) };
    },
    get ripple() { return { active: activePlace, layers: ripple.layers.map((l) => ({ t: +l.simT.toFixed(2), src: l.src, fade: +l.fadeRate.toFixed(1) })), grid: ripple.w ? [ripple.w, ripple.h] : null, n: ripple.pGeo ? ripple.pGeo.drawRange.count : 0, visible: ripple.points ? ripple.points.visible : false, rel: +(ripple.rel || 0).toFixed(3) }; },
    get light() { return light.to ? light.to.name : light.cur.name; },
    get seasonNow() { return scene4.cur; },
  };
}












































































