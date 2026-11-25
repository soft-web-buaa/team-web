// 听见校园 · 三维舞台的场景：一台唱机，学院路校园是盘心的标签。
// 移植自刻声 plan3d.js（第十轮）：唱片、刻纹、机座、唱臂、卡纸校园、钉点、后期。这里只「搭」，不「演」：
// 每帧的光、机位、播放、过场都在 stage.js。和刻声的差别：
//   1. 地点所在的那栋楼单独成一个网格（hero），点进地点时它能被从模型里提起来，落在一只纸台座上（DESIGN.md §4）。
//   2. 每根钉点多一根光柱，社区板块里它升起来，高度是这里的张数。
//   3. 画布与页面解耦：画布由外面传进来，画质、可见性由 stage.js 管。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { TURN, TEX_W, BANDS, R0, R1, PITCH, MAX_SEC } from '../kesheng/web/groove.js';
import { FUNC_CARD, ERA, ROOF_PAPER, POOL_STONE, STYLE, tintOf, facadeOf, offsetRing, ringArea, obbOf, SCENERY } from '../kesheng/web/plan3d/model.js';

export const EX = 1.6;                       // 竖向放大（楼高是作者估算，放大只为看得清体量）
export const BASE_TOP = 6, TILE_TOP = 10;    // 校园底座、区块地块的顶面高度（米）
export const RIN = 775, ROUT = 935, RP = 965; // 刻纹带内外半径、盘半径（米）
export const LABEL_R = RIN - 40;
export const WAVE_FS = 8000, WAVE_W = 1024, WAVE_H = 80;
export const TAU = Math.PI * 2;
export const COL = { paper: '#F2F4F3', alu: '#D3D7DA', lathe: '#515C6A', ink: '#24304A', scope: '#E6BE3A' };
export const MAXB = 32;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let campus = null, canvasEl = null, renderer = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 20, 12000);
const zoneObj = new Map();            // id → { group, tile, tints, bldMat, ... }
const pinObj = new Map();             // placeId → { group, needle, discs, head, top, column }
const heroObj = new Map();            // placeId → { group, pivot, base, size, pedestal }
const pickables = [];
let waveTex = null, inscTex = null, inscCanvas = null;
let platterMat = null, grooveTex = null, carriage = null, needleTip = null, ripples = [];
let arm = null, contact = null, rim = null;
let pmrem = null;
let composer = null, gtao = null, bloom = null, tiltH = null, tiltV = null, sun = null, hemi = null, labelMat = null;
const U = { uNight: { value: 0 }, uLit: { value: 0 } };
const nightMats = [];
const forest = [];
const seasonal = [];
const snowU = { value: 0 };
const m = (v) => v / 10;              // 分米 → 米
function shapeFrom(rings) {
  const toV = (r) => { const v = []; for (let i = 0; i < r.length; i += 2) v.push(new THREE.Vector2(m(r[i]), m(r[i + 1]))); return v; };
  const s = new THREE.Shape(toV(rings[0]));
  for (const h of rings.slice(1)) s.holes.push(new THREE.Path(toV(h)));
  return s;
}

/** 平面形状挤出成体：底在 y=0，高 h；地图北 = −z。 */
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
// —— 展柜底：屏幕空间的径向渐变（颜色跟天光走），盘下一圈软影 ——
let shadowDisc = null;
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
  disc.scale.setScalar((RP + 250) * 3.4);
  disc.position.y = PLINTH.top - PLINTH.h - 36;
  disc.renderOrder = -1;
  shadowDisc = disc;
  scene.add(disc);
}

// —— 后期：环境光遮蔽（楼脚、树下、天井压暗，体量才立得住）→ 泛光（只让窗灯、路灯、示波黄发亮）
//      → 移轴（只在拉近时明显，总览几乎不虚）→ 色调 → 纸纹与暗角。场景先画进 4× 多重采样的缓冲，边线不起锯齿。
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0.022 }, uVig: { value: 0.74 }, uTint: { value: new THREE.Vector3(0.5, 0.5, 0.5) }, uTintK: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uGrain, uVig, uTintK; uniform vec3 uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - vec2(0.48, 0.5)) * vec2(uRes.x / uRes.y, 1.0);
      c.rgb *= mix(uVig, 1.0, smoothstep(1.05, 0.32, length(q)));
      // 进地点时，盘和校园褪进这个钟点的天色里，只剩轮廓（被提起的那栋楼另画一遍，不经过这里）
      c.rgb = mix(c.rgb, uTint, uTintK);
      c.rgb += (h(floor(vUv * uRes)) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};
// —— 画质档：同一台唱机，三档只差像素比、抗锯齿、环境光遮蔽、阴影贴图（2026-11-25 在 AMD 610M 核显上实测）——
//   high：像素比 ≤1.5、4× MSAA、环境光遮蔽、4096 阴影（独显）
//   mid ：像素比 ≤1.25、无 MSAA、无环境光遮蔽、2048 阴影（核显：1440×900 下 50–60 帧；high 在同一台上只有 8–20 帧）
//   low ：像素比 0.75、1024 阴影（软渲染、很弱的手机）
export const TIERS = {
  high: { dpr: 1.5, msaa: 4, ao: true, shadow: 4096 },
  mid: { dpr: 1.25, msaa: 0, ao: false, shadow: 2048 },
  low: { dpr: 0.75, msaa: 0, ao: false, shadow: 1024 },
};
let tierNow = 'mid';
function buildComposer(t) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: t.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, 1, 1, undefined,
    { radius: 14, distanceExponent: 1.4, thickness: 12, scale: 1.25, samples: 16, screenSpaceRadius: false },
    { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.9;
  gtao.enabled = t.ao;
  composer.addPass(gtao);
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.35, 1.6);
  composer.addPass(bloom);
  tiltH = new ShaderPass(HorizontalTiltShiftShader);
  tiltV = new ShaderPass(VerticalTiltShiftShader);
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GrainShader));
}
const dprOf = (t) => Math.min(t.dpr, Math.max(0.75, devicePixelRatio || 1));
/** 换画质档（不重建场景）：像素比、MSAA、环境光遮蔽、阴影贴图。调用方负责之后重设尺寸。 */
export function setTier(name) {
  const t = TIERS[name];
  if (!t || name === tierNow) return tierNow;
  tierNow = name;
  gtao.enabled = t.ao;
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) if (rt.samples !== t.msaa) { rt.samples = t.msaa; rt.dispose(); }
  if (sun.shadow.mapSize.x !== t.shadow) { sun.shadow.mapSize.set(t.shadow, t.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  renderer.setPixelRatio(dprOf(t));
  composer.setPixelRatio(dprOf(t));
  return tierNow;
}
export const tier = () => tierNow;
// —— 立面：窗是印在卡纸上的（不开洞）。每个顶点带 aFac = [层高, 开间, 样式, 种子]（cardBuilding 写），按 OSM 的层数排窗。
//      白天是灰蓝的油墨窗；入夜按比例亮起暖光。整张纸带一层很淡的纤维纹（轻微不均）。
//      样式：0 普通窗格 / 1 五十年代（窄高窗 + 壁柱 + 勒脚）/ 2 新主楼（横向带窗）/ 3 住宅（小窗 + 阳台线）/ 4 不印窗
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

// —— 影棚：三盏长条软箱（世界坐标，米）。黑胶上的镜面反射、各向异性高光，和楼、金属件的环境反射，都来自同这三盏 ——
// 颜色（r10）：三盏和太阳同一个色度，只在亮度上分主次（light-rig.js）；时段一换，环境贴图跟着重烘一次
// c = 中心，at = 朝向哪一点，u = 长边方向的粗略指向，hu / hv = 半长、半宽，col × i = 亮度（线性，HDR），env = 进环境贴图时的倍数
const STUDIO = [
  { c: [-1500, 2200, -900], at: [0, 0, 200], u: [1, 0, 1], hu: 1300, hv: 170, col: [1, 1, 1], i: 34, env: 0.32 },
  { c: [2300, 1100, 300], at: [0, 0, 0], u: [0, 1, 0], hu: 520, hv: 1300, col: [1, 1, 1], i: 16, env: 0.22 },
  { c: [-600, 1300, -2700], at: [0, 0, -200], u: [1, 0, 0], hu: 2400, hv: 190, col: [1, 1, 1], i: 26, env: 0.26 },
].map((b) => {
  const C = new THREE.Vector3(...b.c), N = new THREE.Vector3(...b.at).sub(C).normalize();
  const g = new THREE.Vector3(...b.u), Uh = g.sub(N.clone().multiplyScalar(g.dot(N))).normalize(), Vh = new THREE.Vector3().crossVectors(N, Uh);
  return { ...b, C, N, U: Uh.clone().multiplyScalar(b.hu), V: Vh.clone().multiplyScalar(b.hv), Uh, Vh, color: new THREE.Color(...b.col) };
});

/** 环境贴图：一间暗的影棚（上亮下暗的球面）+ 三盏软箱。换掉 RoomEnvironment 那间灰白的屋子：金属件、玻璃、楼的高光都落在同几盏灯上。 */
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
// —— 唱片：黑漆面。外圈刻纹按学期分带（bands.js）：最外是最早的学期，挨着校园的是最近的；带里一道细环 = 一张盘。
//      正在放的那张所在的学期，那一带展开，刻的是这张声片自己的频谱螺旋（groove.js，和刻声盘同一套）；唱针落在那一带里。
//      带与带之间是没刻纹的光面：软箱在光面上照得清清楚楚，在刻纹上被拉成一道道径向的光——黑胶在灯下就是这个样子。
function buildPlatter() {
  grooveTex = new THREE.DataTexture(new Uint8Array(TEX_W * BANDS), TEX_W, BANDS, THREE.RedFormat, THREE.UnsignedByteType);
  grooveTex.minFilter = grooveTex.magFilter = THREE.LinearFilter;
  grooveTex.needsUpdate = true;
  waveTex = new THREE.DataTexture(new Uint8Array(WAVE_W * WAVE_H).fill(128), WAVE_W, WAVE_H, THREE.RedFormat, THREE.UnsignedByteType);
  waveTex.minFilter = waveTex.magFilter = THREE.NearestFilter;
  waveTex.needsUpdate = true;
  inscCanvas = document.createElement('canvas');
  inscCanvas.width = 8192; inscCanvas.height = 64;
  inscTex = new THREE.CanvasTexture(inscCanvas);
  inscTex.minFilter = THREE.LinearMipmapLinearFilter;
  inscTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  platterMat = new THREE.ShaderMaterial({
    uniforms: {
      uG: { value: grooveTex }, uAngle: { value: 0 }, uPlay: { value: 0 }, uCut: { value: 0 }, uDur: { value: MAX_SEC },
      uTrail: { value: 0 }, uHas: { value: 0 }, uBright: { value: 1 },
      uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3(1, 1, 1) },
      uB: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) }, uNB: { value: 0 },
      uAct: { value: new THREE.Vector2(ROUT, RIN) }, uActOn: { value: 0 },
      uW: { value: waveTex }, uInsc: { value: inscTex },
      uBoxC: { value: STUDIO.map((b) => b.C) }, uBoxU: { value: STUDIO.map((b) => b.U) }, uBoxV: { value: STUDIO.map((b) => b.V) },
      uBoxCol: { value: STUDIO.map((b) => new THREE.Vector3(b.color.r, b.color.g, b.color.b).multiplyScalar(b.i)) },
    },
    vertexShader: `varying vec2 vP; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vP = vec2(w.x, -w.z); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vP; varying vec3 vW;
      uniform sampler2D uG;
      uniform float uAngle, uPlay, uCut, uDur, uTrail, uHas, uBright, uActOn;
      uniform vec3 uCam, uSunDir, uSunCol;
      uniform vec4 uB[${MAXB}];
      uniform int uNB;
      uniform vec2 uAct;
      uniform vec3 uBoxC[3], uBoxU[3], uBoxV[3], uBoxCol[3];
      uniform sampler2D uW, uInsc;
      const float TAU = 6.28318530718;
      // 刻槽里的波形（-1..1）：tau 秒处，8 kHz 的点之间线性插值
      float wtex(float i) { return texture2D(uW, vec2((mod(i, ${WAVE_W}.0) + 0.5) / ${WAVE_W}.0, (floor(i / ${WAVE_W}.0) + 0.5) / ${WAVE_H}.0)).r * 255.0 / 127.0 - 128.0 / 127.0; }
      float wave(float tau) { float x = clamp(tau, 0.0, 9.9999) * ${WAVE_FS}.0, i0 = floor(x); return mix(wtex(i0), wtex(i0 + 1.0), x - i0); }
      const float TURN_S = ${TURN.toFixed(4)};
      const float R0 = ${R0.toFixed(4)}, R1 = ${R1.toFixed(4)}, P = ${PITCH.toFixed(6)};
      const float TEX_SEC = ${MAX_SEC.toFixed(1)};
      const float RIN = ${RIN.toFixed(1)}, ROUT = ${ROUT.toFixed(1)}, RP = ${RP.toFixed(1)}, RLAB = ${LABEL_R.toFixed(1)};
      const vec3 LAC = vec3(0.010, 0.010, 0.012);           // 黑漆
      const vec3 SCOPE = vec3(0.79, 0.51, 0.04);             // 示波黄（线性）
      float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      // 镜面方向 R 打到第 i 盏软箱上的亮度（0..1，soft = 边缘羽化，按软箱半边长的比例）
      float boxHit(int i, vec3 Pw, vec3 R, float soft) {
        vec3 C = uBoxC[i], U = uBoxU[i], V = uBoxV[i];
        vec3 N = normalize(cross(U, V));
        float d = dot(R, N);
        if (abs(d) < 1e-4) return 0.0;
        float t = dot(C - Pw, N) / d;
        if (t <= 0.0) return 0.0;
        vec3 Q = Pw + R * t - C;
        float u = abs(dot(Q, U) / dot(U, U)), v = abs(dot(Q, V) / dot(V, V));
        return (1.0 - smoothstep(1.0 - soft, 1.0 + soft, u)) * (1.0 - smoothstep(1.0 - soft * 2.0, 1.0 + soft * 2.0, v));
      }
      // 刻纹的各向异性高光：纹沿圆周走，槽壁的法线只往径向歪——只有半程向量 H 落在「法线 × 径向」那个面里（T·H ≈ 0）的地方才反光，
      // 所以高光是一条过盘心、指向灯的径向光带（黑胶在灯下的那个「领结」）。w = 光带的宽（软箱越大越宽）；V 形槽的壁是 45°，再斜就照不到
      float kk(vec3 T, vec3 L, vec3 V, float w) {
        vec3 H = normalize(L + V);
        float t = dot(T, H);
        float tilt = acos(clamp(H.y / max(1e-4, length(H - T * t)), -1.0, 1.0));
        return exp(-t * t / (w * w)) * (1.0 - smoothstep(0.62, 0.78, tilt)) * smoothstep(0.0, 0.3, H.y);
      }
      void main() {
        float rho = length(vP);
        float px = max(fwidth(rho), 1e-3);
        vec3 V = normalize(uCam - vW);
        vec3 Nn = vec3(0.0, 1.0, 0.0);
        vec3 rad = normalize(vec3(vW.x, 0.0, vW.z) + 1e-5);
        vec3 T = vec3(-rad.z, 0.0, rad.x);
        vec3 R = reflect(-V, Nn);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(Nn, V), 0.0), 5.0);

        // 这一点是光面（land，0）还是刻纹（groove，1）；sheen = 刻纹把光散开的程度
        float groove = 0.0, sheen = 0.6, dimK = 1.0, glow = 0.0, edgeScope = 0.0, edgeHover = 0.0, wallLit = 0.0, insc = 0.0;
        float fineZ = 1.0 - smoothstep(0.08, 0.5, px);
        // 引入槽与外沿：三道引入纹
        if (rho > ROUT && rho < RP) {
          float lead = 1.0 - smoothstep(0.0, px * 1.5, min(min(abs(rho - ROUT - 5.0), abs(rho - ROUT - 9.0)), abs(rho - ROUT - 13.0)) - 0.5);
          groove = lead * 0.8; sheen = 0.5;
        }
        // 走出槽：一道锁纹（locked groove：针走到这里就在同一圈里一直转）
        if (rho < RIN && rho > RLAB - 2.0) {
          groove = (1.0 - smoothstep(0.0, px * 1.5, abs(rho - RIN + 5.0) - 0.6)) * 0.8;
          // 死蜡刻字：这张盘的号和学期，手刻的细划痕。只有斜光扫过才读得出（见下面 insc 的光照）
          float r0 = RLAB + 2.0, r1 = RIN - 10.0;
          if (rho > r0 && rho < r1) insc = texture2D(uInsc, vec2(fract((atan(vP.x, vP.y) - uAngle) / TAU + 0.62), (rho - r0) / (r1 - r0))).r;
        }
        bool spiral = uHas > 0.5 && ((uActOn > 0.5 && rho <= uAct.x && rho >= uAct.y) || (uActOn < 0.5 && rho <= ROUT && rho >= RIN));
        if (!spiral && rho >= RIN - 0.5 && rho <= ROUT + 0.5) {
          for (int i = 0; i < ${MAXB}; i++) {
            if (i >= uNB) break;
            vec4 b = uB[i];
            float fl = b.w;
            float act = step(3.5, mod(fl, 8.0)), hov = step(1.5, mod(fl, 4.0)), dim = step(0.5, mod(fl, 2.0));
            // 带边的细线：正在放的那一带是示波黄，悬停的那一带是亮灰
            float eL = 1.0 - smoothstep(0.0, px * 1.2, min(abs(rho - b.x), abs(rho - b.y)));
            edgeScope = max(edgeScope, eL * act * uHas);
            edgeHover = max(edgeHover, eL * hov);
            if (rho <= b.x && rho >= b.y) {
              float t = (b.x - rho) / max(1e-3, b.x - b.y) * b.z;   // 带里第几张盘
              float k = floor(t), f = fract(t);
              float w = (b.x - b.y) / max(1.0, b.z);                  // 一道细环的宽（米）
              float aa = clamp(px / max(w * 0.12, 1e-3), 0.0, 1.0);    // 远看细环糊成一片：按像素尺度淡出
              float micro = mix(step(0.08, f) * step(f, 0.95), 0.87, aa);
              groove = 1.0;
              float fine = 1.0 - smoothstep(0.3, 1.2, px);
              float ripple = 0.5 + 0.5 * sin(rho * 5.3 + hash(k + b.z) * 6.28);
              sheen = (0.32 + 0.6 * hash(k * 7.13 + b.x)) * mix(1.0, 0.75 + 0.5 * ripple, fine) * mix(0.25, 1.0, micro);
              dimK = mix(1.0, 0.28, dim) * (1.0 + 0.7 * hov);
              break;
            }
          }
        }
        if (spiral) {
          float a0 = uActOn > 0.5 ? uAct.x : ROUT, a1 = uActOn > 0.5 ? uAct.y : RIN;
          float rn = R1 + (rho - a1) / max(1e-3, a0 - a1) * (R0 - R1);
          float psi = atan(vP.x, vP.y);
          float g = fract((uAngle - psi) / TAU);
          float u = (R0 - rn) / P - g;
          float k = floor(u), f = u - k;
          float tau = (g + k) * TURN_S;
          if (k >= 0.0 && tau <= uCut && rn >= R1 - P) {
            float aa = fwidth(u) * 1.2;
            float cut = 1.0 - smoothstep(0.86 - aa, 0.86 + aa, f);
            float e = texture2D(uG, vec2(tau / TEX_SEC, clamp(f / 0.86, 0.0, 1.0))).r;
            groove = cut;
            // 贴近看（一个像素不到半米）：刻槽收成一道 V 形细槽，沿着声音的波形左右摆——留声机的刻槽本来就是这样存声音的
            if (fineZ > 0.0) {
              float c = 0.43 + 0.25 * wave(tau);
              float hw = 0.16, dd = abs(f - c), a2 = fwidth(u) * 1.2;
              float g2 = 1.0 - smoothstep(hw - a2, hw + a2, dd);
              groove = mix(groove, g2, fineZ);
              wallLit = smoothstep(hw * 0.35, hw, dd) * g2 * (f > c ? 1.0 : 0.3) * fineZ;
            }
            sheen = 0.18 + 1.5 * smoothstep(0.03, 0.9, e);          // 响的地方纹更宽，灯下更亮：这一圈就是这张声片的频谱
            float d = mod(uPlay - tau, uDur);
            glow = (d < 0.3 ? 1.0 - d / 0.3 : 0.0) * uTrail * cut * (0.35 + 0.65 * smoothstep(0.02, 0.6, e));
          }
        }

        // 光：软箱 + 太阳（入夜是月光）
        vec3 mirror = vec3(0.0), aniso = vec3(0.0), blur = vec3(0.0);
        for (int i = 0; i < 3; i++) {
          vec3 L = normalize(uBoxC[i] - vW);
          mirror += uBoxCol[i] * boxHit(i, vW, R, 0.03);
          blur += uBoxCol[i] * boxHit(i, vW, R, 0.6);
          aniso += uBoxCol[i] * kk(T, L, V, 0.035) * 0.05;
        }
        aniso += uSunCol * kk(T, normalize(uSunDir), V, 0.012) * 0.12;
        vec3 envR = mix(vec3(0.004, 0.0045, 0.006), vec3(0.03, 0.032, 0.036), smoothstep(0.0, 0.9, R.y));
        vec3 land = (mirror + envR) * fres;
        vec3 grv = (aniso * sheen + blur * 0.006 * (0.4 + sheen) * fres + envR * (1.2 + 2.5 * sheen) * (0.3 + fres)) * dimK;
        vec3 col = LAC * (0.5 + 0.5 * max(dot(Nn, normalize(uSunDir)), 0.0)) * (uSunCol.r * 0.12 + 0.4);
        col += mix(land, grv, groove);
        // 刻字：划痕把镜面打碎——灯在镜面里时字是暗的；灯从斜里扫过时，划痕沿径向把光散回来，字是亮的
        if (insc > 0.01) {
          vec3 sc = vec3(0.0);
          for (int i = 0; i < 3; i++) sc += uBoxCol[i] * kk(rad, normalize(uBoxC[i] - vW), V, 0.09) * 0.03;
          sc += uSunCol * kk(rad, normalize(uSunDir), V, 0.05) * 0.08 + blur * 0.0025 + envR * 1.5;
          col = mix(col, sc, insc * 0.9);
        }
        col += normalize(uBoxCol[0] + 1e-4) * 0.55 * wallLit;
        col *= uBright;
        // 外沿倒角：一道细亮边
        float bevel = smoothstep(RP - 3.0, RP - 0.5, rho);
        col += vec3(0.5, 0.5, 0.52) * bevel * uBright * (0.25 + 0.75 * fres);
        col = mix(col, SCOPE * (1.6 + 2.2 * (1.0 - uBright)), max(glow, edgeScope * 0.85));
        col = mix(col, vec3(0.32, 0.33, 0.35) * uBright, edgeHover * 0.6 * (1.0 - edgeScope));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const top = new THREE.Mesh(new THREE.CircleGeometry(RP, 256), platterMat);
  top.rotation.x = -Math.PI / 2;
  top.name = 'platter';
  scene.add(top);
  scene.add(buildLabel());
  // 唱片的边：薄薄一圈黑漆
  const lacquer = new THREE.MeshPhysicalMaterial({ color: '#050506', metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(RP, RP, 6, 256, 1, true), lacquer);
  edge.position.y = -3;
  scene.add(edge);
  // 唱片下面的转盘：车削铝，侧面一圈频闪点（跟着盘转）。120 个点、一圈 2 秒——60 帧时每帧正好走一个点，转速对了它看上去不动
  const sc = document.createElement('canvas');
  sc.width = 4096; sc.height = 64;
  const sg = sc.getContext('2d');
  sg.fillStyle = '#C9CDD1'; sg.fillRect(0, 0, sc.width, sc.height);
  sg.fillStyle = '#15171B';
  for (let i = 0; i < 120; i++) sg.fillRect((i + 0.25) * (sc.width / 120), 18, (sc.width / 120) * 0.5, 28);
  sg.fillRect(0, 54, sc.width, 2);
  sg.fillRect(0, 8, sc.width, 1);
  const stex = new THREE.CanvasTexture(sc);
  stex.colorSpace = THREE.SRGBColorSpace;
  stex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const metal = new THREE.MeshStandardMaterial({ color: '#FFFFFF', map: stex, metalness: 0.9, roughness: 0.26 });
  const PR = RP + 22;
  rim = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR - 8, 34, 256, 1, true), metal);
  rim.position.y = -6 - 17;
  scene.add(rim);
  const lip = new THREE.Mesh(new THREE.RingGeometry(RP, PR, 256, 1), new THREE.MeshStandardMaterial({ color: '#D9DDE1', metalness: 1, roughness: 0.18 }));
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = -6;
  scene.add(lip);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(RP - 120, RP - 110, 22, 128), new THREE.MeshStandardMaterial({ color: '#0C0D10', metalness: 0.6, roughness: 0.5 }));
  collar.position.y = -51;
  scene.add(collar);
  buildPlinth();
}

// —— 机座：一块圆角方的阳极氧化石墨铝，拉丝顶面、抛光倒角；四只脚。唱片机该有的体量 ——
const PLINTH = { half: RP + 250, r: 150, top: -62, h: 78 };
let powerLed = null;
function buildPlinth() {
  const { half, r } = PLINTH, s = new THREE.Shape();
  s.moveTo(-half + r, -half);
  s.lineTo(half - r, -half); s.quadraticCurveTo(half, -half, half, -half + r);
  s.lineTo(half, half - r); s.quadraticCurveTo(half, half, half - r, half);
  s.lineTo(-half + r, half); s.quadraticCurveTo(-half, half, -half, half - r);
  s.lineTo(-half, -half + r); s.quadraticCurveTo(-half, -half, -half + r, -half);
  const bev = 9;
  const g = new THREE.ExtrudeGeometry(s, { depth: PLINTH.h - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, PLINTH.top - PLINTH.h + bev, 0);
  // 顶面：一张 2048 的拉丝纹（横向细丝）+ 丝印。ExtrudeGeometry 顶面的 uv 就是形状坐标（米），按机座尺寸换成 0..1
  const N = 2048, c = document.createElement('canvas');
  c.width = c.height = N;
  const x2 = c.getContext('2d');
  x2.fillStyle = '#3B3F47'; x2.fillRect(0, 0, N, N);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9000; i++) {
    const y = rnd() * N, l = 80 + rnd() * 900, x = rnd() * N, a = 0.025 + rnd() * 0.05;
    x2.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
    x2.fillRect(x, y, l, 1);
  }
  const k = N / (2 * half), P = (x, z) => [(x + half) * k, (z + half) * k];   // 世界 (x, z) → 贴图像素（贴图 v 朝 −z）
  x2.fillStyle = 'rgba(214,218,222,0.78)';
  x2.textBaseline = 'alphabetic';
  // 左前角：铭牌字
  let [px, py] = P(-half + 120, half - 150);
  x2.font = `${46 * k}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  x2.fillText('刻 声', px, py);
  x2.font = `${15 * k}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  x2.fillText('学院路馆藏 · 十秒声片柜', px, py + 30 * k);
  // 右前角：转速。刻声的盘一圈两秒，就是每分钟三十转（只有这一档，不画 45：没有的档位不印）
  [px, py] = P(half - 330, half - 150);
  x2.font = `${15 * k}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  x2.fillText('转速', px, py - 48 * k);
  x2.font = `${30 * k}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  x2.fillStyle = 'rgba(230,190,58,0.95)';
  x2.fillText('30', px, py);
  x2.font = `${12 * k}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  x2.fillStyle = 'rgba(214,218,222,0.6)';
  x2.fillText('每分钟转数', px, py + 24 * k);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // 形状坐标 → uv：ExtrudeGeometry 的顶面 uv = 形状的 (x, y)；rotateX(−90°) 之后形状的 y 是 −z
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + half) / (2 * half), (uv.getY(i) + half) / (2 * half));
  const mat = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', map: tex, metalness: 0.88, roughness: 0.34, anisotropy: 0.8, anisotropyRotation: 0, clearcoat: 0.3, clearcoatRoughness: 0.25 });
  const slab = new THREE.Mesh(g, mat);
  slab.receiveShadow = true;
  slab.castShadow = true;
  scene.add(slab);
  // 电源灯：电机转着时亮示波黄（frame 里跟着 motorOn 走）
  powerLed = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 3, 24), new THREE.MeshStandardMaterial({ color: '#1A1A1A', emissive: COL.scope, emissiveIntensity: 0, roughness: 0.3 }));
  powerLed.position.set(half - 360, PLINTH.top + 1.5, half - 150 - 20);
  scene.add(powerLed);
  const footMat = new THREE.MeshStandardMaterial({ color: '#0B0C0E', metalness: 0.7, roughness: 0.4 });
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(70, 82, 36, 48), footMat);
    f.position.set(x * (half - 190), PLINTH.top - PLINTH.h - 18, z * (half - 190));
    scene.add(f);
  }
}

/** 盘心标签：石墨蓝的纸面，外沿一圈仿宋印字，像唱片中间那张标签。校园模型就摆在它上面。 */
let labelPaint = null;
/** 在盘心标签的内圈加盖一行字（沿圆周，示波黄）：第一位落款的人和日子。只盖一次，刷新后由馆藏数据决定还在不在。 */
function stampLabel(text) {
  if (!labelPaint) return;
  const { g, k, tex } = labelPaint;
  const r = (LABEL_R - 84) * k, size = 22 * k, chars = [...text];
  g.save();
  g.font = `${size}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  g.fillStyle = COL.scope;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const step = (size * 1.15) / r, a0 = Math.PI / 2 + (step * (chars.length - 1)) / 2;   // 摆在南侧（离观者最近），字头朝外
  chars.forEach((ch, i) => { const a = a0 - step * i; g.save(); g.rotate(a); g.translate(r, 0); g.rotate(-Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); });
  g.restore();
  tex.needsUpdate = true;
}
function buildLabel() {
  const N = 4096, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const k = N / 2 / LABEL_R;                  // 像素 / 米
  g.translate(N / 2, N / 2);
  g.fillStyle = COL.ink;
  g.beginPath(); g.arc(0, 0, LABEL_R * k, 0, Math.PI * 2); g.fill();
  // 两道细线夹住印字
  g.strokeStyle = 'rgba(211,215,218,0.55)';
  g.lineWidth = 0.9 * k;
  for (const r of [LABEL_R - 6, LABEL_R - 58]) { g.beginPath(); g.arc(0, 0, r * k, 0, Math.PI * 2); g.stroke(); }
  // 印字：沿圆周排，字头朝外
  const text = '北京航空航天大学学院路校区　刻声馆藏　二〇二六年秋季学期　每分钟三十转　';
  const r = (LABEL_R - 32) * k, size = 30 * k;
  g.font = `${size}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  g.fillStyle = COL.paper;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text], step = (Math.PI * 2) / chars.length;
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 + step * (i + 0.5);
    g.save();
    g.rotate(a);
    g.translate(r, 0);
    g.rotate(Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  labelPaint = { c, g, k, tex };
  // 夜里只让印字自己微微亮：另画一张只有字的图做自发光
  const e = document.createElement('canvas');
  e.width = e.height = 2048;
  const ge = e.getContext('2d');
  ge.scale(0.5, 0.5);
  ge.drawImage(c, 0, 0);
  const img = ge.getImageData(0, 0, 2048, 2048), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, d[i] - 120) * 1.9; d[i] = d[i + 1] = d[i + 2] = Math.min(255, v); }
  ge.putImageData(img, 0, 0);
  const etex = new THREE.CanvasTexture(e);
  etex.colorSpace = THREE.SRGBColorSpace;
  labelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, emissiveMap: etex, emissive: 0xffe6c4, emissiveIntensity: 0 });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(LABEL_R, 256), labelMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.4;
  mesh.receiveShadow = true;
  return mesh;
}
// —— 校园：底座 + 十个区块（地块、道路、绿地、场地、楼、树、路灯）+ 体育馆一组地标 ——
// 楼按校方导览图的五类用途着色（色相取自导览图图例，压低了饱和度，和盘的五色放在一起不打架）；
// 地面压成中灰，路是浅色——白天靠「浅路 + 彩楼 + 深树」分出层次，不再是一片白。
const POOL_WALL = 13;                  // 游泳馆石材墙身高（米，已含竖向放大），拱顶另做

// —— 卡纸模型：一栋楼 = 墙身（0.35 米的细倒角）+ 檐口 + 女儿墙 + 屋顶小房。颜色走顶点色，立面（印在纸上的窗）走 aFac ——
// 不做屏幕空间描边：边缘的倒角自己会接住软箱的光，那一道细亮线就是卡纸的切边。
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
/** 刷顶点色（朝上的面用 roof，其余用 wall）并写立面参数。返回非索引几何（各种来路的几何才合得起来）。 */
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
const BIKE_COL = ['#E9C33B', '#3D82C4', '#4FA36A'].map((c) => new THREE.Color(c));   // 共享单车三家的车身色
const BIKE_GEO = (() => {
  // 两只轮（六边形的环，不封口）+ 车架、车座、车筐三块：每辆 60 个三角形左右（1679 辆，面数要省）
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

/** 一块印着字的纸牌（Canvas 贴图，仿宋）：模型上贴的园名、主楼屋顶的校名。w×h 米，平放（flat）或立着。 */
function plate(text, w, h, { color = '#24304A', bg = null, flat = true, size = 0.72, weight = '' } = {}) {
  const K = 64, c = document.createElement('canvas');
  c.width = Math.round(w * K); c.height = Math.round(h * K);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = c.height * size;
  g.font = `${weight}${fs}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`;
  const tw = g.measureText(text).width;
  if (tw > c.width * 0.94) { fs *= (c.width * 0.94) / tw; g.font = `${weight}${fs}px "Zhuque", "Noto Serif CJK SC", "STFangsong", "FangSong", serif`; }
  g.fillText(text, c.width / 2, c.height / 2 + fs * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: !bg, roughness: 0.8, alphaTest: bg ? 0 : 0.05, side: THREE.DoubleSide }));
  if (flat) mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = !flat;
  return mesh;
}

// —— 主楼东立面：照着照片描的一张线稿（中青网 2022-10-17 老主楼正面照，out/r6/ref/zhulou-cyol-20221017.png）——
// 不贴照片：照片带透视、树、天光，贴在卡纸模型上一眼就是「照片糊上去的」（out/r6/exp/facade/ 里试过，见回执）。
// 从照片量出来的只有比例：窗宽 = 开间 × 0.57、窗高 = 层高 × 0.55、檐口一道深灰、底层石材、正中一个四柱门廊挂红匾。
// 红匾上不写字：照片上的字认不全，不替它编。
function elevation(wM, hM, { floors = 6, portico = false } = {}) {
  const K = 12, c = document.createElement('canvas');
  c.width = Math.min(2048, Math.round(wM * K)); c.height = Math.round(hM * K);
  const g = c.getContext('2d'), kx = c.width / wM, ky = c.height / hM;
  g.fillStyle = '#E8E4DA'; g.fillRect(0, 0, c.width, c.height);
  const fl = hM / floors, bay = 3.6, nb = Math.max(1, Math.round(wM / bay)), bw = wM / nb;
  // 底层石材 + 檐口
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
    const mat = new THREE.MeshStandardMaterial({ map: elevation(q.L, H, { floors: 6, portico: isFront }), roughness: 0.85 });
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

// —— 体育馆：参照六张公开照片（造型与配色参照，不是测绘）——
// 十字形平面；玻璃底座往里缩，上面是往外斜挑的银色铝壳（倒梯形），东西两翼的壳沿往上翘；
// 屋顶正中一座金字塔天窗；北立面（对着广场）两道心形深色凹口，中间一道尖翼从天窗顶斜插下来；
// 北面是花岗岩大台阶和花池，台阶东北角立着不锈钢雕塑。
const GYM = { G1: 9, H1: 28, LIFT: 3.5 };   // 玻璃底座顶、壳沿、两翼上翘（米）
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
  const shellGeo = tris(shell), roofGeo = tris(roof);
  add(shellGeo, mats.shell);
  add(roofGeo, mats.roof);

  // 壳面上的竖肋（照片里挑檐下一格一格的肋），正面留给凹口和尖翼
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

/** 馆前雕塑：黑色基座上三道不锈钢旋环、一片斜插的尖刃、几颗四角星（参照照片，尺度按地标放大）。 */
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

/** 游泳馆：沿长轴的筒拱顶，十三道弧形钢屋架露在外面；两端是半圆的玻璃山墙（照片里的拱形玻璃立面）。 */
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

function buildCampus() {
  const base = new THREE.Mesh(extrude(campus.campus, BASE_TOP), new THREE.MeshStandardMaterial({ color: '#8C867B', roughness: 0.9 }));   // 底板：灰板纸
  base.position.y = 0.4;
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (mat, k) => { nightMats.push({ mat, k }); return mat; };
  // 地标的材质（体育馆与游泳馆在同一个区块，选别的区块时跟着压暗）
  const lm = {
    shell: std({ color: '#C8CDD2', metalness: 0.88, roughness: 0.28, side: THREE.DoubleSide }),
    roof: std({ color: '#9AA2AA', metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }),
    soffit: std({ color: '#8E979F', metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
    fin: std({ color: '#7D8790', metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }),
    glass: glow(std({ color: '#2F4A5E', metalness: 0.4, roughness: 0.12, emissive: '#FFD39A', emissiveIntensity: 0 }), 1.5),
    sky: glow(std({ color: '#B9D2DC', metalness: 0.55, roughness: 0.1, emissive: '#FFE2B8', emissiveIntensity: 0, side: THREE.DoubleSide }), 1.1),
    notch: glow(std({ color: '#1F2B3D', metalness: 0.5, roughness: 0.2, emissive: '#FFCB8A', emissiveIntensity: 0, side: THREE.DoubleSide }), 0.5),
    granite: std({ color: '#B9B1A4', roughness: 0.85, side: THREE.DoubleSide }),
    planter: std({ color: '#5E8A48', roughness: 1 }),
    flowers: std({ color: '#D9893A', roughness: 1 }),
    vault: std({ color: '#C9CED2', metalness: 0.45, roughness: 0.45 }),
    poolGlass: glow(std({ color: '#3D6A8E', metalness: 0.4, roughness: 0.1, emissive: '#CFE8FF', emissiveIntensity: 0, side: THREE.DoubleSide }), 1.2),
    plinth: std({ color: '#1C1F25', metalness: 0.3, roughness: 0.4 }),
    steel: std({ color: '#E1E4E6', metalness: 1, roughness: 0.16 }),
    paving: std({ map: pavingTexture(), roughness: 0.9 }),
  };
  const lmDim = new THREE.Color('#8B929B');
  const bikeMat = std({ color: '#FFFFFF', roughness: 0.6 });
  const benchMat = std({ color: '#8C6E52', roughness: 0.85 });
  const kitMat = std({ color: '#ECEDEA', roughness: 0.5, metalness: 0.2 });
  const parkDone = new Set();
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const postGeo = new THREE.CylinderGeometry(0.22, 0.3, 7.5, 6);
  postGeo.translate(0, 3.75, 0);
  const headGeo = new THREE.SphereGeometry(0.85, 12, 8);
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const lampHeadMat = glow(std({ color: '#E9ECEC', emissive: '#FFD9A8', emissiveIntensity: 0, roughness: 0.4 }), 5);
  const trunkMat = std({ color: '#6E655C', roughness: 0.9 });
  const mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  
  campus.zones.forEach((z, zi) => {
    const group = new THREE.Group();
    group.name = z.id;
    // 每种材质登记「平常 / 选中 / 被压暗」三档颜色，每帧往目标色上靠（见 frame）
    const tints = [];
    const mat = (color, o = {}, dim = '#6B727A', sel = null) => {
      const mt = std({ color, roughness: 1, ...o });
      tints.push({ mat: mt, on: new THREE.Color(color), dim: new THREE.Color(dim), sel: sel && new THREE.Color(sel) });
      return mt;
    };
    const tileMat = mat(SCENERY['秋'].tile, { roughness: 0.95 }, '#5C636D', '#B9B6AC');
    const roadMat = mat(SCENERY['秋'].road, { roughness: 0.95 }, '#8A9199');
    const greenMat = mat(SCENERY['秋'].green, {}, '#6C7775');
    seasonal.push({ tints, tileMat, roadMat, greenMat });
    const pitchMat = mat('#5E9A5A', {}, '#5B6968');
    const trackMat = mat('#B85C45', {}, '#6B6466');
    const bldMat = mat('#FFFFFF', { roughness: 0.78, vertexColors: true }, '#A3A9B1');
    windowize(bldMat);
    const treeMat = mat('#FFFFFF', { roughness: 0.95 }, '#7F8890');
    const edgeMat = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.32 });
    const lineMat = new THREE.LineBasicMaterial({ color: COL.paper, transparent: true, opacity: 0.85 });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });

    // 地块：一块一个网格。r9 把几块并成一个几何体（mergeGeometries 默认丢掉材质分组），配上 [顶面, 切边] 两个材质之后
    // three.js 既不画它也不拾取它——地块一直是看不见的，看到的「地面」其实是底板（r10 查出来的，见回执）
    const sideMat = std({ color: '#C9BEA9', roughness: 0.9 });   // 卡纸板的切边
    const tileList = z.tiles.map((t) => {
      const o = new THREE.Mesh(extrude(t.r, TILE_TOP - BASE_TOP), [tileMat, sideMat]);
      o.position.y = BASE_TOP;
      o.receiveShadow = true;
      o.userData.zone = z.id;
      group.add(o);
      pickables.push(o);
      return o;
    });
    const tile = tileList[0];

    const ground = (list, y, mt) => { if (!list.length) return; const o = new THREE.Mesh(mergeGeometries(list.map((g) => flat(g, y))), mt); o.receiveShadow = true; group.add(o); };
    if (z.roads.length) {
      const rd = new THREE.Mesh(mergeGeometries(z.roads.map((r) => ribbon(r, TILE_TOP + 0.06))), roadMat);
      rd.receiveShadow = true;
      group.add(rd);
    }
    ground(z.green, TILE_TOP + 0.03, greenMat);
    ground(z.track, TILE_TOP + 0.045, trackMat);
    ground(z.pitch, TILE_TOP + 0.05, pitchMat);
    ground(z.water, TILE_TOP + 0.05, mat('#4F7FA0', { metalness: 0.35, roughness: 0.2 }, '#4E5966'));
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
    // 地点所在的那栋楼（hero）单独成网格：点进地点时它能被提起来。其余的楼并成一个网格
    const heroOf = new Map(campus.places.filter((p) => p.z === z.id).map((p) => [p.b, p]));
    const plain = bs.filter((b) => b.n !== '体育馆' && !heroOf.has(b.n));
    const bldGeo = mergeGeometries(plain.flatMap((b) => cardBuilding(b, zi)));
    const bld = new THREE.Mesh(bldGeo, bldMat);
    bld.castShadow = true;
    bld.receiveShadow = true;
    bld.userData.zone = z.id;
    const bgroup = new THREE.Group();
    bgroup.position.y = TILE_TOP;
    bgroup.add(bld);
    pickables.push(bld);
    const heroMats = [];
    const heroMat = () => { const mt = std({ color: '#FFFFFF', roughness: 0.78, vertexColors: true }); windowize(mt); heroMats.push(mt); return mt; };
    const heroMeshes = new Map();       // 楼名 → 这栋楼的全部部件（之后挪进它自己的枢轴组）
    for (const b of bs) {
      const p = heroOf.get(b.n);
      if (!p || b.n === '体育馆') continue;
      const hm = new THREE.Mesh(mergeGeometries(cardBuilding(b, zi)), heroMat());
      hm.castShadow = true; hm.receiveShadow = true;
      hm.userData.zone = z.id; hm.userData.place = p.id;
      bgroup.add(hm);
      pickables.push(hm);
      heroMeshes.set(b.n, [hm]);
    }
    const lmHere = [];
    for (const b of bs) if (b.n === '主楼') { const f = zhulouFront({ ...b, zone: z.id }); bgroup.add(f); f.traverse((o) => { if (o.isMesh) { pickables.push(o); o.userData.place = heroOf.get('主楼')?.id; } }); heroMeshes.get('主楼')?.push(f); }
    // 主楼屋顶那一排红字（照片：中青网 2022-10-17「一栋老主楼，一生北航情」）：立在东侧檐口上，朝学院路
    for (const b of bs) {
      if (b.n !== '主楼') continue;
      const xs = ringM(b.r[0]).map((p) => p[0]), ys = ringM(b.r[0]).map((p) => p[1]);
      const sign = plate('北京航空航天大学', 62, 7.5, { color: '#B8343C', flat: false, size: 0.9 });
      sign.rotation.y = Math.PI / 2;
      sign.position.set(Math.max(...xs) - 1.5, b.h * EX + 1.2 + 3.75, -(Math.min(...ys) + Math.max(...ys)) / 2);
      bgroup.add(sign);
      heroMeshes.get('主楼')?.push(sign);
    }
    // 园名：做模型的人插在草地上的小纸牌（绿园、晨读园、静园、唯实园）。只立在面积够大的园里，同名的立一块
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
        gm.group.traverse((o) => { if (o.isMesh) { pickables.push(o); o.userData.place = heroOf.get('体育馆')?.id; } });
        if (heroOf.has('体育馆')) heroMeshes.set('体育馆', [gm.group]);
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
        roof.traverse((o) => { if (o.isMesh) { pickables.push(o); o.userData.place = heroOf.get('游泳馆')?.id; } });
        heroMeshes.get('游泳馆')?.push(roof);
      }
    }
    for (const mt of new Set(lmHere)) tints.push({ mat: mt, on: mt.color.clone(), dim: mt.color.clone().lerp(lmDim, 0.7), sel: null });

    // 树：林地成片、草地疏植、路边成行（位置由 build-campus.py 确定性生成）
    const nT = z.trees.length / 3;
    const treeSeeds = [], treeMtx = [];
    if (nT) {
      const crowns = new THREE.InstancedMesh(crownGeo, treeMat, nT);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, nT);
      for (let i = 0; i < nT; i++) {
        const x = m(z.trees[i * 3]), y = -m(z.trees[i * 3 + 1]), r = m(z.trees[i * 3 + 2]);
        const th = 2.4 + r * 0.5;
        mtx.compose(ps.set(x, th + r * 1.05, y), qt.identity(), sc.set(r, r * 1.22, r));
        crowns.setMatrixAt(i, mtx);
        const seed = z.trees[i * 3] * 31 + z.trees[i * 3 + 1];
        tint.copy(crownColor(seed)).multiplyScalar(0.9 + ((seed * 7919) % 97) / 97 * 0.2);
        crowns.setColorAt(i, tint);
        treeSeeds.push(seed);
        treeMtx.push(mtx.clone());
        mtx.compose(ps.set(x, 0, y), qt.identity(), sc.set(1, th + r * 0.4, 1));
        trunks.setMatrixAt(i, mtx);
      }
      crowns.castShadow = trunks.castShadow = true;
      crowns.receiveShadow = true;
      bgroup.add(trunks, crowns);
      forest.push({ crowns, seeds: treeSeeds, mtx: treeMtx });
    }
    // 人的尺度：楼门口一排排共享单车（黄 / 蓝 / 绿三家）、园里的长椅、球场的球门和篮架。尺寸按真实放大 1.6 倍，拉近才看得清
    const nB = (z.bikes || []).length / 3;
    if (nB) {
      const bikes = new THREE.InstancedMesh(BIKE_GEO, bikeMat, nB);
      for (let i = 0; i < nB; i++) {
        const x = m(z.bikes[i * 3]), y = -m(z.bikes[i * 3 + 1]), a = z.bikes[i * 3 + 2] / 1000;
        mtx.compose(ps.set(x, 0, y), qt.setFromAxisAngle(UPY, a + Math.PI / 2), sc.set(1.6, 1.6, 1.6));
        bikes.setMatrixAt(i, mtx);
        bikes.setColorAt(i, BIKE_COL[(z.bikes[i * 3] * 7 + z.bikes[i * 3 + 1] * 13 >>> 0) % 7 < 3 ? 0 : (z.bikes[i * 3] + z.bikes[i * 3 + 1] >>> 0) % 2 ? 1 : 2]);
      }
      bgroup.add(bikes);                          // 不投影：拉近才看得清的东西，影子省掉一遍阴影贴图
    }
    const nC = (z.benches || []).length / 3;
    if (nC) {
      const benches = new THREE.InstancedMesh(BENCH_GEO, benchMat, nC);
      for (let i = 0; i < nC; i++) {
        mtx.compose(ps.set(m(z.benches[i * 3]), 0, -m(z.benches[i * 3 + 1])), qt.setFromAxisAngle(UPY, z.benches[i * 3 + 2] / 1000), sc.set(1.6, 1.6, 1.6));
        benches.setMatrixAt(i, mtx);
      }
      benches.castShadow = true;
      bgroup.add(benches);
    }
    const kit = [];
    (z.pitch || []).forEach((r, k) => {
      const sport = (z.pitchK || [])[k] || '';
      const q = obbOf(ringM(r[0])), c = Math.cos(q.ang), sn = Math.sin(q.ang);
      const at = (u, v) => [q.cx + u * c - v * sn, q.cy + u * sn + v * c];
      const put = (geo, u, v, rot) => { const [x, y] = at(u, v); const g = geo.clone(); g.rotateY(q.ang + rot); g.translate(x, TILE_TOP - TILE_TOP, -y); kit.push(g); };
      if (/soccer|futsal/.test(sport) && q.L > 20) { put(GOAL_GEO, q.L / 2 - 1.2, 0, 0); put(GOAL_GEO, -q.L / 2 + 1.2, 0, Math.PI); }
      else if (/basketball/.test(sport) && q.L > 14) { put(HOOP_GEO, q.L / 2 - 1.6, 0, 0); put(HOOP_GEO, -q.L / 2 + 1.6, 0, Math.PI); }
      else if (/tennis|volleyball|badminton/.test(sport)) { put(NET_GEO(q.W), 0, 0, 0); }
    });
    if (kit.length) { const o = new THREE.Mesh(mergeGeometries(kit), kitMat); o.castShadow = true; bgroup.add(o); }
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
    // hero：每栋地点楼挪进自己的枢轴组（枢轴在楼的中心），下面垫一只纸台座（平时藏着，提起来时出现）
    for (const [name, objs] of heroMeshes) {
      const p = heroOf.get(name);
      const box = new THREE.Box3();
      for (const o of objs) box.expandByObject(o);
      const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.set(ctr.x, 0, ctr.z);
      bgroup.add(pivot);
      for (const o of objs) { bgroup.remove(o); o.position.x -= ctr.x; o.position.z -= ctr.z; pivot.add(o); }
      const R = Math.max(size.x, size.z) * 0.62 + 6;
      const pedestal = new THREE.Group();
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 5, 72), new THREE.MeshStandardMaterial({ color: '#EDEBE4', roughness: 0.92 }));
      ped.position.y = -2.6; ped.castShadow = true; ped.receiveShadow = true;
      const edge = new THREE.Mesh(new THREE.TorusGeometry(R * 1.04, 0.35, 6, 96), new THREE.MeshBasicMaterial({ color: COL.scope, toneMapped: false }));
      edge.rotation.x = Math.PI / 2; edge.position.y = -5.1;
      pedestal.add(ped, edge);
      pedestal.visible = false;
      pivot.add(pedestal);
      const mats = new Set();
      for (const o of objs) o.traverse((q) => { if (q.isMesh) (Array.isArray(q.material) ? q.material : [q.material]).forEach((mt) => mats.add(mt)); });
      pivot.traverse((q) => q.layers.enable(1));   // 第 1 层：选择性聚焦时单独再画一遍，不虚
      heroObj.set(p.id, { pivot, pedestal, zone: z.id, base: pivot.position.clone(), size, R, lift: 0, spin: 0, mats, h: size.y });
    }
    group.add(bgroup);

    scene.add(group);
    const c = { x: m(z.c[0]), y: m(z.c[1]) };
    zoneObj.set(z.id, { group, tile, tints, bldMat, edgeMat, poolMat, bgroup, lift: 0, c,
      tall: Math.max(...bs.map((b) => (b.n === '体育馆' ? b.h * EX + 6 : b.h * EX))),
      rise: reduced ? 1 : 0 });
  });
}
// —— 钉点：一根针上叠着这个地点的声片，一张声片一片小盘（最下面是最早的）；我的盘是示波黄 ——
const MAXD = 14, PIN_STEP = 2.2;
let landing = null;                    // { pid, t0 }：刚刻好的那张从上面落到针上
function buildPins() {
  const needleMat = new THREE.MeshStandardMaterial({ color: COL.ink, metalness: 0.6, roughness: 0.35 });
  const discGeo = new THREE.CylinderGeometry(6.5, 6.5, 1.4, 40);
  const needleGeo = new THREE.CylinderGeometry(0.6, 0.6, 1, 8);
  for (const p of campus.places) {
    const group = new THREE.Group();
    const top = p.h * EX + 26;
    group.position.set(m(p.x), TILE_TOP, -m(p.y));
    const needle = new THREE.Mesh(needleGeo, needleMat);
    needle.castShadow = true;
    needle.userData.place = p.id;
    group.add(needle);
    pickables.push(needle);
    const discs = [];
    for (let i = 0; i < MAXD; i++) {
      const d = new THREE.Mesh(discGeo, new THREE.MeshStandardMaterial({ color: COL.ink, metalness: 0.2, roughness: 0.45 }));
      d.castShadow = true;
      d.userData.place = p.id;
      group.add(d);
      discs.push(d);
      pickables.push(d);
    }
    const head = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.8, 24), new THREE.MeshStandardMaterial({ color: COL.paper, roughness: 0.4 }));
    head.userData.place = p.id;
    group.add(head);
    pickables.push(head);
    // 社区的光柱：一根从地面升起的细光，高度是这里的张数（stage.js 每帧往目标高度靠）。平时高度为 0，看不见
    const column = new THREE.Mesh(COLUMN_GEO, new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    column.scale.set(1, 0.001, 1);
    column.renderOrder = 4;
    group.add(column);
    const halo = new THREE.Mesh(new THREE.RingGeometry(18, 22, 64), new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.4; halo.renderOrder = 4;
    group.add(halo);
    scene.add(group);
    pinObj.set(p.id, { group, needle, discs, head, top, zone: p.z, n: 0, column, halo, h: 0 });
  }
  // 正在放的地点：地面上一圈圈往外走的刻纹
  const rmat = new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96), rmat.clone());
    r.rotation.x = -Math.PI / 2;
    r.visible = false;
    r.renderOrder = 2;
    r.layers.enable(1);
    scene.add(r);
    ripples.push(r);
  }
}
const COLUMN_GEO = (() => { const g = new THREE.CylinderGeometry(9, 15, 1, 32, 1, true); g.translate(0, 0.5, 0); return g; })();
// —— 唱臂：右后方一根枢轴唱臂（直管 + 偏角唱头），针尖落在正在放的那一带上 ——
// 几何按真唱臂做：枢轴固定，唱臂是刚体，只绕枢轴转；在中间半径上让唱头与刻纹相切，换半径时解一次两圆相交求转角。
// 抬针 / 落针 = 绕枢轴的水平轴抬起几度（armLift 米 ≈ 针尖抬高）。
const ARM = { P: new THREE.Vector3(RP + 230, 0, -(RP * 0.62)), h: 64, head: 170, tube: 0, off: 0, L: 0, tipLocal: new THREE.Vector3(), r: (RIN + ROUT) / 2, psi: 0, pivot: null, yaw: null, pitch: null };
function armSolve(r) {
  // 针尖 T：|T| = r，|T − P| = L。取靠北（z 更小）的那个交点
  const P = ARM.P, d = Math.hypot(P.x, P.z), L = ARM.L;
  const a = (r * r - L * L + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = P.x / d, uz = P.z / d;
  const c1 = { x: ux * a - uz * h, z: uz * a + ux * h }, c2 = { x: ux * a + uz * h, z: uz * a - ux * h };
  return c1.z < c2.z ? c1 : c2;
}
function buildCarriage() {
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#E6E9EC', metalness: 1, roughness: 0.12, anisotropy: 0.6, clearcoat: 0.4 });
  const satin = new THREE.MeshStandardMaterial({ color: '#B9BEC4', metalness: 1, roughness: 0.32 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#0D0E11', metalness: 0.3, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1A1B1E', roughness: 0.9 });
  const scope = new THREE.MeshStandardMaterial({ color: COL.scope, emissive: COL.scope, emissiveIntensity: 0.25, roughness: 0.4 });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  // 在中间半径上定唱臂的形：唱头沿刻纹切线，针尖朝外端
  const rm = ARM.r, P = ARM.P;
  const Tm = (() => { const ang = 0.05; return new THREE.Vector3(Math.sin(ang) * rm, 0, -Math.cos(ang) * rm); })();
  const tan = new THREE.Vector3(-Tm.z, 0, Tm.x).normalize();          // 切线（逆时针方向）
  if (tan.dot(P.clone().sub(Tm)) < 0) tan.negate();                  // 朝枢轴那一侧
  const Hm = Tm.clone().addScaledVector(tan, ARM.head);               // 唱头后端 = 臂管前端
  const yaw0 = Math.atan2(-(Hm.z - P.z), Hm.x - P.x);                 // 臂管方向（绕 y）
  ARM.tube = Math.hypot(Hm.x - P.x, Hm.z - P.z);
  // 枢轴局部坐标：臂管沿 +x；针尖在局部里的位置
  const toLocal = (v) => { const dx = v.x - P.x, dz = v.z - P.z, c = Math.cos(yaw0), s = Math.sin(yaw0); return new THREE.Vector3(dx * c - dz * s, 0, dx * s + dz * c); };
  ARM.tipLocal = toLocal(Tm);
  ARM.L = Math.hypot(ARM.tipLocal.x, ARM.tipLocal.z);
  const Hl = toLocal(Hm);

  // 底座：抛光圆台 + 黑色轴承座
  const base = new THREE.Group();
  base.position.set(P.x, PLINTH.top, P.z);
  scene.add(base);
  add(base, new THREE.CylinderGeometry(150, 158, 16, 96), satin, 0, 8);
  add(base, new THREE.CylinderGeometry(118, 118, 4, 96), chrome, 0, 18);
  add(base, new THREE.CylinderGeometry(52, 60, ARM.h - 26 - PLINTH.top, 64), black, 0, (ARM.h - 26 - PLINTH.top) / 2 + 18);
  // 搁臂架 + 升降杆
  const restAng = yaw0 + 0.62, rest = new THREE.Vector3(Math.cos(restAng) * 330, 0, -Math.sin(restAng) * 330);
  add(base, new THREE.CylinderGeometry(9, 12, ARM.h - PLINTH.top + 6, 24), satin, rest.x, (ARM.h - PLINTH.top + 6) / 2, rest.z);
  add(base, new THREE.BoxGeometry(46, 8, 24), rubber, rest.x, ARM.h - PLINTH.top + 6, rest.z).rotation.y = restAng;
  const lever = add(base, new THREE.BoxGeometry(80, 6, 14), chrome, -70, 30, 120);
  lever.rotation.y = 0.4;
  add(base, new THREE.SphereGeometry(10, 16, 12), black, -104, 30, 134);

  // 唱臂：绕 y（ARM.yaw）转、绕局部 z（ARM.pitch）抬
  const yawG = new THREE.Group(), pitchG = new THREE.Group();
  yawG.position.set(P.x, ARM.h, P.z);
  yawG.rotation.y = yaw0;
  yawG.add(pitchG);
  scene.add(yawG);
  ARM.yaw = yawG; ARM.pitch = pitchG; ARM.yaw0 = yaw0;
  // 万向环
  const gimbal = add(pitchG, new THREE.TorusGeometry(46, 7, 16, 64), chrome);
  gimbal.rotation.x = Math.PI / 2;
  add(pitchG, new THREE.CylinderGeometry(30, 30, 52, 48), black).rotation.z = Math.PI / 2;
  // 臂管：从枢轴往前，一路略降到唱头高度
  const headY = 30, tube = ARM.tube;
  const tubeGeo = new THREE.CylinderGeometry(11, 13, tube, 48, 1, false);
  tubeGeo.rotateZ(-Math.PI / 2);
  tubeGeo.translate(tube / 2, 0, 0);
  const tubeM = add(pitchG, tubeGeo, chrome);
  tubeM.rotation.z = -Math.atan2(ARM.h - headY - 40, tube);
  // 后端：短管 + 配重（滚花的两道环）
  const stub = new THREE.CylinderGeometry(10, 10, 210, 32);
  stub.rotateZ(Math.PI / 2);
  add(pitchG, stub, chrome, -105, 0, 0);
  add(pitchG, new THREE.CylinderGeometry(52, 52, 120, 64).rotateZ(Math.PI / 2), black, -190, 0, 0);
  for (const x of [-142, -238]) add(pitchG, new THREE.CylinderGeometry(54, 54, 8, 64).rotateZ(Math.PI / 2), chrome, x, 0, 0);
  // 唱头：一块黑壳，沿刻纹切线；前端是唱头盒（盒侧一道示波黄）与指钩
  const shellG = new THREE.Group();
  const endY = -(Math.tan(Math.atan2(ARM.h - headY - 40, tube)) * tube);
  shellG.position.set(Hl.x, endY, Hl.z);
  const tipL = ARM.tipLocal.clone();
  const dir = new THREE.Vector3(tipL.x - Hl.x, 0, tipL.z - Hl.z);
  shellG.rotation.y = Math.atan2(-dir.z, dir.x);
  pitchG.add(shellG);
  const hl = dir.length();
  add(shellG, new THREE.BoxGeometry(hl + 20, 7, 62), black, hl / 2, -4, 0);
  add(shellG, new THREE.CylinderGeometry(15, 15, 40, 32).rotateZ(Math.PI / 2), chrome, 0, 0, 0);
  const cart = add(shellG, new THREE.BoxGeometry(70, 34, 44), black, hl - 20, -25, 0);
  add(shellG, new THREE.BoxGeometry(70.5, 4, 44.5), scope, hl - 20, -20, 0);
  const finger = add(shellG, new THREE.CylinderGeometry(3.2, 3.2, 90, 12), chrome, hl + 30, 4, 34);
  finger.rotation.set(0, 0, Math.PI / 2 - 0.35);
  // 针杆与针尖：针尖正好在局部 tipLocal，高度从唱头盒底落到盘面
  const tipY = -ARM.h;                                  // 枢轴高 ARM.h，盘面 y = 0
  const cant = new THREE.CylinderGeometry(1.2, 2.2, 28, 10);
  const cantM = add(shellG, cant, satin, hl - 4, (-42 + (tipY - endY)) / 2 + 0, 0);
  cantM.scale.y = Math.max(0.2, (-42 - (tipY - endY)) / 28);
  needleTip = add(shellG, new THREE.ConeGeometry(3.4, 8, 16), new THREE.MeshStandardMaterial({ color: COL.lathe, roughness: 0.4 }), hl, tipY - endY + 4, 0);
  needleTip.rotation.x = Math.PI;
  arm = pitchG;
  carriage = yawG;
  // 针尖落在刻纹上的那一点：放的时候亮，跟着声音的响度
  contact = new THREE.Mesh(new THREE.CircleGeometry(7, 32),
    new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.6;
  contact.renderOrder = 3;
  scene.add(contact);
  armTo(ARM.r);
}
/** 把唱臂转到针尖落在半径 r 上；返回针尖的世界坐标与方位角 psi（从正北顺时针）。 */
function armTo(r) {
  ARM.r = r;
  const T = armSolve(r), P = ARM.P;
  const want = Math.atan2(-(T.z - P.z), T.x - P.x), have = Math.atan2(-ARM.tipLocal.z, ARM.tipLocal.x);
  ARM.yaw.rotation.y = want - have;
  ARM.psi = Math.atan2(T.x, -T.z);
  contact.position.x = T.x;
  contact.position.z = T.z;
  return T;
}

/** 搭起整台唱机。返回舞台要用的全部句柄。tier = 画质档（见 TIERS）。
 *  分几步搭，每步之间让出主线程（pause），屏风上的盘和按钮在搭的时候照常动。 */
export async function build(canvas, campusData, { tier: tn = 'mid', pause = async () => {} } = {}) {
  canvasEl = canvas;
  campus = campusData;
  tierNow = TIERS[tn] ? tn : 'mid';
  const t = TIERS[tierNow];
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dprOf(t));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  await pause();
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = studioEnv(pmrem);
  await pause();
  hemi = new THREE.HemisphereLight(0xf2f4f3, 0x24304a, 0.55);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfffcf4, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(t.shadow, t.shadow);
  Object.assign(sun.shadow.camera, { left: -1450, right: 1450, top: 1450, bottom: -1450, near: 100, far: 4200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.2;
  scene.add(sun, sun.target);
  sun.layers.enable(1); hemi.layers.enable(1);   // 第 1 层（地点楼）也要被同一套光照着
  buildBackdrop();
  buildPlatter();
  await pause();
  buildCampus();
  await pause();
  buildPins();
  buildCarriage();
  buildComposer(t);
  return {
    THREE, scene, camera, renderer, composer, gtao, bloom, tiltH, tiltV, sun, hemi, pmrem, labelMat, platterMat, grooveTex, waveTex, inscTex, inscCanvas,
    zoneObj, pinObj, heroObj, pickables, ripples, nightMats, forest, seasonal, snowU, U, rim, arm, contact, needleTip, ARM, STUDIO, PLINTH,
    armTo, studioEnv, paintBackdrop, get powerLed() { return powerLed; }, get shadowDisc() { return shadowDisc; }, campus,
  };
}
