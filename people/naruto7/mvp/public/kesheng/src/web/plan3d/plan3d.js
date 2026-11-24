// 刻声 · 学院路馆藏分区图（三维）。
// 构图：整张图是一张盘。学院路是盘心的标签，正在放的那张声片刻在外圈，导轨上的唱针在 12 点（正北）读它。
// 手势：按在外圈刻纹上拖 = 搓盘；按在别处拖 = 转动视角；点一下 = 选区块 / 选钉点。两种拖动按落点分流，不会打架。
// 光：校园的天光跟着时段走。选了时段就照那个时段；没选时段就照正在放的那张声片录下的时段。
// 时间：点一个地点，看到的是它的年轮——同一个地点，一个学期一圈，谁在什么时候留下了声音。
// 刻：在地点上按住「在这里刻」，十秒刻进外圈，松手就落到那个地点的针上，并告诉你上一位是谁。
// 数据（第八轮，SPEC-DIGEST-1 §2）：真实馆藏 + 概念盘（demo-catalog.json，合成声，不挂角标、不显示落款、不算人数）+ 史料 + 这台设备上的柜子，
//   四份各自来、在视图里并排。张数与人数只从 tier.js 的 counts() 出；谁算哪一种只由 tierOf() 定。
// 史料：条目与音频都以 ../archive/catalog.json 为准（唯一真相源）；../history/index.json 只补选单里的事件、日期与出处事实。
//   史料不进年轮、不进听声寻片，只算「藏片」，不算「参与者」。
// 听一段示例：不开麦克风，页面按配方做一段声音交给听声寻片去认（shelf-worker.js，判定与主页同一段 find.js）。
// 第七轮：唱机的暗示（抬针落针、频闪点、针尖亮点）、年份筛选与新旧着色、钉点展签、人的柜子（我的 / 别人的）、随手放、往年今日。
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { mergeGeometries } from '../vendor/three/BufferGeometryUtils.js';
import { EffectComposer } from '../vendor/three/EffectComposer.js';
import { RenderPass } from '../vendor/three/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/three/ShaderPass.js';
import { OutputPass } from '../vendor/three/OutputPass.js';
import { GTAOPass } from '../vendor/three/GTAOPass.js';
import { HorizontalTiltShiftShader } from '../vendor/three/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from '../vendor/three/VerticalTiltShiftShader.js';
import { GrooveCutter, cutWhole, padToTurns, TURN, TEX_W, BANDS, R0, R1, PITCH, MAX_SEC } from '../groove.js';
import { weekTag } from '../calendar.js';
import { slotOf } from '../slot.js';
import { semesterLabel, semesterSeq, currentSemester, SLOT_WORD } from '../semester.js';
import { signature, snapshot, cardFile, importIdentity, authorKey } from '../identity.js';
import { ringsOf, ringsOfList, landingLine, placeLine, campusLine, mineLine, personLine, onThisDay, when as whenOf, hourAngle, byTime, dayText } from '../rings.js';
import * as lib from '../library.js';
import { buildSubmission, download } from '../submit.js';
import { discFace } from '../receipt.js';
import { synthClip } from './sounds.js';
import { semesterBands, bandLayout, bandAt } from './bands.js';
import { tierOf, counts, tallyText } from '../tier.js';
import { SLOT_LIGHT, rigFor } from './light-rig.js';
import { FUNC_CARD, ERA, ROOF_PAPER, POOL_STONE, STYLE, tintOf, facadeOf, offsetRing, ringArea, obbOf, seasonOf, seasonOfDay, SCENERY, crownPick } from './model.js';
import { resumeAt, words, MAX_LISTEN } from '../find.js';
import { guessRecord, confirmRecord, noneRecord } from '../place-guess.js';
import { attach as attachQuick, ensureCtx as quickCtx, status as quickStatus } from './quick.js';
import * as echo from '../community.js';

const SLOTS = ['夜', '晨', '上午', '午', '下午', '晚'];
const EX = 1.6;                       // 竖向放大（楼高是作者估算，放大只为看得清体量；r10 从 2.2 降到 1.6：模型要矮墩墩的才像摆在桌上的东西）
const BASE_TOP = 6, TILE_TOP = 10;    // 校园底座、区块地块的顶面高度（米）
const RIN = 775, ROUT = 935, RP = 965; // 刻纹带内外半径、盘半径（米）
const LABEL_R = RIN - 40;               // 盘心标签：校园坐在上面（r10 从 RIN−14 收到 RIN−40：标签和最后一圈之间留出 31 米的「死蜡」，刻字在那里）
const WAVE_FS = 8000, WAVE_W = 1024, WAVE_H = 80;   // 刻槽里的波形：8 kHz、10 秒 = 80000 个点，排成 1024 × 80 的贴图
const TAU = Math.PI * 2;
const FS = 48000;
const COL = { paper: '#F2F4F3', alu: '#D3D7DA', lathe: '#515C6A', ink: '#24304A', scope: '#E6BE3A' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// 画质：默认自动——开场落定后量 45 帧，中位帧时长超过 40 ms 就关掉环境光遮蔽、像素比降到 1。?q=full 强制全开，?q=lite 直接用省电档
const Q = new URLSearchParams(location.search).get('q');
// ?embed=1：嵌在听见校园首页里。没有"回到刻声盘"，卡片的标题换成首页的话（样式见 plan3d.css 的 .is-embed）
const EMBED = new URLSearchParams(location.search).has('embed');
if (EMBED) document.documentElement.classList.add('is-embed');
const HOME_LINE = '有些声音，比我们在这里待得久。';
const quality = { mode: Q === 'lite' ? 'lite' : 'full', auto: Q !== 'full' && Q !== 'lite', samples: [], last: 0 };

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), canvas: $('gl'), labels: $('labels'), card: $('card-body'), player: $('player'),
  no: $('clip-no'), note: $('clip-note'), meta: $('clip-meta'), play: $('btn-play'), rewind: $('btn-rewind'),
  status: $('status'), hint: $('hint'), nogl: $('nogl'), hour: $('hour'),
  who: $('btn-who'), shuffle: $('btn-shuffle'), cab: $('cab-link'),
};
const say = (t) => { els.status.textContent = t; };

// 旧链接 ?concept=1：概念盘现在默认就在，去掉参数、别的照旧（不跳转，不重载）
if (new URLSearchParams(location.search).has('concept')) {
  const u = new URL(location.href);
  u.searchParams.delete('concept');
  window.history.replaceState(null, '', u);   // 本文件下面有个叫 history 的 const（史料），这里必须写全
}
const [campus, cal, pub, localRecs, demo, archivalRaw, hist, echoLoad, sleeveData] = await Promise.all([
  fetch('./campus-xy.json').then((r) => r.json()),
  fetch('../data/calendar.json').then((r) => r.json()).catch(() => null),
  lib.fetchCatalog('../'),
  lib.localDiscs(),                    // null = 本机库打不开（隐私模式等），这次刻的只在内存里
  fetch('./demo-catalog.json').then((r) => r.json()).catch(() => ({ entries: [] })),
  lib.fetchArchival('../'),            // 史料：取不到（--public 构建、没入藏）就是没有
  lib.fetchHistory('../'),
  echo.load('./echo-seed.json'),       // 回声：示例回声 + 这台设备上留的。取不到就是没有，页面照常
  fetch('./sleeves.json').then((r) => (r.ok ? r.json() : { places: {} })).catch(() => ({ places: {} })),   // 唱片套子的照片：纸模型照，或团队的实拍
]);
const zoneById = new Map(campus.zones.map((z) => [z.id, z]));
const placeById = new Map(campus.places.map((p) => [p.id, p]));
const m = (v) => v / 10;              // 分米 → 米
const NOW_SEM = currentSemester(new Date(), cal);
let myKey = lib.me() ? await authorKey(lib.me().uid) : null;

// —— 视图里的声片：真实馆藏 + 概念盘 + 我柜子里的。几份数据各自来，只在视图里并排 ——
// 已入馆的那张如果还在我柜子里（id 相同），只留馆藏那条，放的时候用柜子里的原声（离线也能放）。
// 概念盘进来时就去掉落款：虚构的署名不进页面的任何一处（人数、展签、「看 TA 的柜子」都无从谈起）。
const entries = [];
const pubIds = new Set(pub.entries.map((e) => e.id));
const localById = new Map((localRecs || []).map((r) => [r.id, r]));
for (const e of pub.entries) {
  const r = localById.get(e.id);
  entries.push({ ...e, source: 'archive', mine: !!r || !!(myKey && e.author && e.author.key === myKey), rec: r || null });
}
for (const e of demo.entries || []) {
  if (e.status !== 'accessioned' || tierOf(e) !== 'synthetic' || pubIds.has(e.id) || !placeById.has(e.placeId)) continue;
  entries.push({ ...e, author: null, source: 'concept', mine: false, rec: null });
}
const localItem = (r, disc = null) => ({
  id: r.id, no: r.no, placeId: r.placeId, zoneId: r.zoneId, place: r.place, slot: r.slot, week: r.week, semester: r.semester,
  at: r.at, note: r.note || '', seconds: r.seconds, kind: r.kind, submittedAt: r.submittedAt || null,
  author: r.author ? { grade: r.author.grade, dept: r.author.dept, name: r.author.name, key: myKey } : null,
  mine: true, source: 'local', rec: disc ? null : r, disc,
});
for (const r of localRecs || []) if (!pubIds.has(r.id)) entries.push(localItem(r));
entries.sort(byTime);
let seq = lib.nextLocalSeq(localRecs);

// —— 史料：永远不进 entries（年轮、钉点上的盘、「上一位」、寻片都只从 entries 来）——
// archival：馆藏目录里的全部史料（总览卡「史料」一栏，算藏片）。
// history：选单（history/index.json）里、馆藏目录也收了的那几段——地点卡「这里以前的声音」，带事件日期与出处事实。
//   地点以馆藏目录为准；选单里地点和目录对不上的，不放到地点卡上（只在史料一栏里）。
const archival = archivalRaw.map((e) => ({ ...e, arc: e, source: 'archival' }));
const history = hist.items.map((h) => {
  const a = lib.archivalOf(h, archival);
  return a && a.placeId === h.placeId && placeById.has(h.placeId) ? { ...h, src: h.source, source: 'archival', file: a.file, no: a.no, arc: a } : null;
}).filter(Boolean).sort((a, b) => String(a.date).localeCompare(String(b.date)));
const pastAt = (pid) => history.filter((h) => h.placeId === pid);
const placeFacts = (pid) => (hist.places[pid] && hist.places[pid].facts) || [];
/** 这一处（或全馆）屏幕上能看到的全部条目：张数一律交给 counts()，页面不自己数。 */
const allAt = (pid) => [...entries.filter((e) => e.placeId === pid), ...pastAt(pid)];
const allShown = () => [...entries, ...archival];
// 页脚只留一句必要的话（用户 10-22：减少免责式文字；出处、许可、建模依据都在 docs/CREDITS.md）
{
  const c = counts(allShown());
  document.getElementById('credit-data').textContent = c.concept ? '没有落款的盘是页面合成的声音；楼和分区是示意。' : '楼和分区是示意。';
}

// —— 状态 ——  view: campus 全部分区 / zone 一个分区 / place 一个地点的年轮 / mine 我的
// time：null 全部 / 'now' 本学期 / 年份（数字）。person：'me' 或作者摘要，只在 mine / person 视图里有值
// find：正在听 / 听完的那段示例；guess：「是这里吗」的猜与答；pickPlace：「都不是」之后等用户在地图上点；flash：要亮出展签的针
const state = { view: 'campus', zone: null, place: null, hover: null, hoverPlace: null, slot: null, time: null, person: null, clip: null, landed: null,
  find: null, guess: null, pickPlace: false, flash: [], flashKind: null, placing: null };

// ====================================================================================
// 三维场景
// ====================================================================================
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  els.nogl.hidden = false;
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 20, 12000);
let controls = null;
const zoneObj = new Map();            // id → { group, tileMat, bldMat, edgeMat, lift, bld }
const pinObj = new Map();             // placeId → { group, discs:[], head, top }
const pickables = [];
let waveTex = null, inscTex = null, inscCanvas = null;
let platterMat = null, grooveTex = null, carriage = null, needleTip = null, ripples = [];
let arm = null, armLift = 14, contact = null, rim = null, seekT = 0;   // seekT：换盘 / 从头放的时刻，之后 450 ms 滑块在找位置、针抬着   // 唱臂（只抬针杆，滑块留在导轨上）、针尖落点的亮点、带频闪点的盘沿
let pmrem = null, envFor = null;
let composer = null, gtao = null, bloom = null, tiltH = null, tiltV = null, sun = null, hemi = null, labelMat = null;
const U = { uNight: { value: 0 }, uLit: { value: 0 } };   // 窗灯：入夜程度、亮着的窗占比
const nightMats = [];                  // 随入夜发光的材质：{ mat, k }（emissiveIntensity = night × k）
const forest = [];                     // 每个区块的树冠：{ crowns, seeds, mtx }——换季时重刷颜色、冬天藏起落叶树
const seasonal = [];                   // 每个区块的地面材质（换季时改「平常」那一档颜色）
const snowU = { value: 0 };            // 屋面积雪（0..1），卡纸楼的着色器读它
const pools = [];                      // 路灯下的光斑

// —— 时段的天光：太阳方位（从正北顺时针）、高度角、强度、色温、入夜程度、亮窗占比、背景 ——
const LIGHT = {
  夜: { az: 40, el: 40, i: 0.5, col: SLOT_LIGHT['夜'], hemi: 0.35, night: 1, lit: 0.27, bg: ['#141A28', '#030406'], plat: 0.34, hour: '二十三时' },
  晨: { az: 92, el: 11, i: 2.1, col: SLOT_LIGHT['晨'], hemi: 0.92, night: 0.22, lit: 0.18, bg: ['#3A3440', '#07080B'], plat: 0.86, hour: '七时' },
  上午: { az: 132, el: 36, i: 2.6, col: SLOT_LIGHT['上午'], hemi: 1.21, night: 0, lit: 0, bg: ['#2B303A', '#060709'], plat: 1, hour: '十时' },
  午: { az: 180, el: 63, i: 2.8, col: SLOT_LIGHT['午'], hemi: 1.36, night: 0, lit: 0, bg: ['#30343C', '#07080A'], plat: 1.04, hour: '十二时' },
  下午: { az: 232, el: 30, i: 2.6, col: SLOT_LIGHT['下午'], hemi: 1.21, night: 0, lit: 0, bg: ['#33302E', '#070708'], plat: 1, hour: '十六时' },
  晚: { az: 262, el: 15, i: 3.0, col: SLOT_LIGHT['晚'], hemi: 0.92, night: 0.36, lit: 0.42, bg: ['#3D2E2C', '#080607'], plat: 0.78, hour: '十九时' },
};
for (const k in LIGHT) { LIGHT[k].col = new THREE.Color(LIGHT[k].col); LIGHT[k].bg = LIGHT[k].bg.map((c) => new THREE.Color(c)); }
const light = { cur: null, from: null, to: null, t0: 0, dur: 1, queue: [], slot: null };

const HOME = { target: new THREE.Vector3(60, -60, 60), polar: 0.80, azim: -0.30, get dist() {
  const aspect = Math.max(0.4, ((els.canvas.clientWidth || 1) - (viewShift > 0 ? viewShift : 0)) / (els.canvas.clientHeight || 1));
  return Math.max(3000, (RP + 250) * 1.08 / (Math.tan((camera.fov * Math.PI) / 360) * aspect));
} };
let fly = null, zoom = null;          // zoom：Powers of Ten 式的指数推拉（距离按对数走，一镜到底）
let lastZone = null;

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

function buildScene() {
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;   // ACES 会把用途色洗成粉灰；Neutral 保住色相
  renderer.toneMappingExposure = 1.05;
  pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = studioEnv(pmrem);
  scene.environmentIntensity = 1;

  // 光：一盏「太阳」（入夜就是月光）+ 天光；方位、高度、色温都跟时段走（见 LIGHT）
  hemi = new THREE.HemisphereLight(0xf2f4f3, 0x24304a, 0.55);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfffcf4, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -1450, right: 1450, top: 1450, bottom: -1450, near: 100, far: 4200 });   // 盖住整块机座和右后方的唱臂
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.2;
  scene.add(sun, sun.target);

  buildBackdrop();
  buildPlatter();
  rebuildBands();
  buildCampus();
  buildPins();
  buildEchoMarks();
  buildCarriage();
  buildComposer();

  controls = new OrbitControls(camera, els.canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.32;
  controls.maxPolarAngle = 1.18;
  controls.minDistance = 18;           // r10：可以一直推到刻槽里（近裁面跟着距离走，见 frame）
  controls.maxDistance = 7000;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.7;
  resize();
  setView(HOME, true);
}

// —— 展柜底：屏幕空间的径向渐变（颜色跟天光走），盘下一圈软影 ——
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
  scene.add(disc);
}

// —— 后期：环境光遮蔽（楼脚、树下、天井压暗，体量才立得住）→ 泛光（只让窗灯、路灯、示波黄发亮）
//      → 移轴（只在拉近时明显，总览几乎不虚）→ 色调 → 纸纹与暗角。场景先画进 4× 多重采样的缓冲，边线不起锯齿。
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0.022 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = (vUv - vec2(0.48, 0.5)) * vec2(uRes.x / uRes.y, 1.0);
      c.rgb *= mix(0.74, 1.0, smoothstep(1.05, 0.32, length(q)));
      c.rgb += (h(floor(vUv * uRes)) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};
function buildComposer() {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, 1, 1, undefined,
    { radius: 14, distanceExponent: 1.4, thickness: 12, scale: 1.25, samples: 16, screenSpaceRadius: false },
    { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.35, 1.6);
  composer.addPass(bloom);
  tiltH = new ShaderPass(HorizontalTiltShiftShader);
  tiltV = new ShaderPass(VerticalTiltShiftShader);
  composer.addPass(tiltH);
  composer.addPass(tiltV);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GrainShader));
  if (quality.mode === 'lite') goLite();
}
function goLite() {
  quality.mode = 'lite';
  gtao.enabled = false;
  renderer.setPixelRatio(1);
  composer.setPixelRatio(1);
  composer.passes.at(-1).uniforms.uRes.value.set(els.canvas.clientWidth, els.canvas.clientHeight);
}
/** 自动画质：只在开场动画、天光过渡都结束后量帧时长，量一次就定。 */
function watchFrames(now) {
  if (!quality.auto || quality.mode === 'lite' || quality.samples.length >= 45) { quality.last = now; return; }
  const calm = !fly && !light.to && !light.queue.length && [...zoneObj.values()].every((o) => o.rise >= 1);
  if (calm && quality.last) quality.samples.push(now - quality.last);
  quality.last = now;
  if (quality.samples.length === 45) {
    const med = [...quality.samples].sort((a, b) => a - b)[22];
    quality.median = Math.round(med);
    if (med > 40) goLite();
  }
}

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
const MAXB = 32;
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
  x2.font = `${46 * k}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  x2.fillText('刻 声', px, py);
  x2.font = `${15 * k}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  x2.fillText('学院路馆藏 · 十秒声片柜', px, py + 30 * k);
  // 右前角：转速。刻声的盘一圈两秒，就是每分钟三十转（只有这一档，不画 45：没有的档位不印）
  [px, py] = P(half - 330, half - 150);
  x2.font = `${15 * k}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  x2.fillText('转速', px, py - 48 * k);
  x2.font = `${30 * k}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  x2.fillStyle = 'rgba(230,190,58,0.95)';
  x2.fillText('30', px, py);
  x2.font = `${12 * k}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
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
  g.font = `${size}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
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
  g.font = `${size}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
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
  g.font = `${weight}${fs}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  const tw = g.measureText(text).width;
  if (tw > c.width * 0.94) { fs *= (c.width * 0.94) / tw; g.font = `${weight}${fs}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`; }
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
    const plain = bs.filter((b) => b.n !== '体育馆');
    const bldGeo = mergeGeometries(plain.flatMap((b) => cardBuilding(b, zi)));
    const bld = new THREE.Mesh(bldGeo, bldMat);
    bld.castShadow = true;
    bld.receiveShadow = true;
    bld.userData.zone = z.id;
    const bgroup = new THREE.Group();
    bgroup.position.y = TILE_TOP;
    bgroup.add(bld);
    pickables.push(bld);
    const lmHere = [];
    for (const b of bs) if (b.n === '主楼') { const f = zhulouFront({ ...b, zone: z.id }); bgroup.add(f); f.traverse((o) => { if (o.isMesh) pickables.push(o); }); }
    // 主楼屋顶那一排红字（照片：中青网 2022-10-17「一栋老主楼，一生北航情」）：立在东侧檐口上，朝学院路
    for (const b of bs) {
      if (b.n !== '主楼') continue;
      const xs = ringM(b.r[0]).map((p) => p[0]), ys = ringM(b.r[0]).map((p) => p[1]);
      const sign = plate('北京航空航天大学', 62, 7.5, { color: '#B8343C', flat: false, size: 0.9 });
      sign.rotation.y = Math.PI / 2;
      sign.position.set(Math.max(...xs) - 1.5, b.h * EX + 1.2 + 3.75, -(Math.min(...ys) + Math.max(...ys)) / 2);
      bgroup.add(sign);
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
    group.add(bgroup);

    scene.add(group);
    const c = { x: m(z.c[0]), y: m(z.c[1]) };
    zoneObj.set(z.id, { group, tile, tints, bldMat, edgeMat, poolMat, bgroup, lift: 0, c,
      tall: Math.max(...bs.map((b) => (b.n === '体育馆' ? b.h * EX + 6 : b.h * EX))),
      count: entries.filter((e) => e.zoneId === z.id).length, rise: reduced ? 1 : 0 });
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
    scene.add(group);
    pinObj.set(p.id, { group, needle, discs, head, top, zone: p.z, n: 0 });
  }
  // 正在放的地点：地面上一圈圈往外走的刻纹
  const rmat = new THREE.MeshBasicMaterial({ color: COL.scope, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96), rmat.clone());
    r.rotation.x = -Math.PI / 2;
    r.visible = false;
    r.renderOrder = 2;
    scene.add(r);
    ripples.push(r);
  }
  updatePins();
}

const yearOf = (e) => new Date(e.at).getFullYear();
const inTime = (e) => state.time == null || (state.time === 'now' ? e.semester === NOW_SEM : yearOf(e) === state.time);
const inView = (e) => (!state.slot || e.slot === state.slot) && inTime(e);
const personOf = (e) => (e.mine ? 'me' : e.author && e.author.key) || null;
const atPlace = (pid) => entries.filter((e) => e.placeId === pid && inView(e));
function pinCount(pid) { return counts(atPlace(pid)).total; }
// 针上的盘按新旧着色：本学期是深石墨蓝，越早越浅（五年褪到底）；我的是示波黄。看一个人的柜子时，只有 TA 的盘亮成黄色
const INKC = new THREE.Color(COL.ink), AGED = new THREE.Color('#A9B1BE'), SCOPEC = new THREE.Color(COL.scope), FADED = new THREE.Color('#6B7584');
const NOW_SEQ = semesterSeq(NOW_SEM);
function discColor(it, out) {
  if (state.person) return out.copy(personOf(it) === state.person ? SCOPEC : FADED);
  if (it.mine) return out.copy(SCOPEC);
  const sq = semesterSeq(it.semester);
  const d = NOW_SEQ != null && sq != null ? Math.max(0, NOW_SEQ - sq) : 0;
  return out.copy(INKC).lerp(AGED, Math.min(1, d / 15));
}

function updatePins() {
  for (const [pid, o] of pinObj) {
    const list = atPlace(pid).slice(-MAXD);
    const n = list.length;
    o.n = n;
    const top = o.top;
    o.needle.scale.y = top - 4;
    o.needle.position.y = (top - 4) / 2;
    o.discs.forEach((d, i) => {
      const it = list[i];
      d.visible = i < n;
      d.position.y = top - 4 + i * PIN_STEP;
      const on = it && state.clip && state.clip.id === it.id;
      if (on) d.material.color.set(COL.scope); else if (it) discColor(it, d.material.color);
      d.material.emissive.set(on ? COL.scope : '#000000');
      d.material.emissiveIntensity = on ? 0.35 : 0;
    });
    o.head.position.y = top - 4 + n * PIN_STEP + 0.4;
    o.head.material.color.set(n ? COL.paper : COL.alu);
    o.group.userData.empty = n === 0;
  }
}

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

/** 播放位置（秒）→ 唱针所在的半径（米）：与刻声盘的导轨同一公式。 */
function stylusRadius(sec) {
  const rn = R0 - (PITCH * Math.min(sec, MAX_SEC)) / TURN;
  const [a0, a1] = activeSpan();
  return a1 + ((rn - R1) / (R0 - R1)) * (a0 - a1);
}

// —— 学期带：外圈一个学期一带（bands.js）。正在放的那张所在的学期展开，刻的是这张声片的频谱螺旋 ——
// 带的张数口径与总览句同一个（counts()）：满盘时 16 带 = 「16 个学期」。没有学期的史料（34 段）不进带。
const ring = { bands: [], open: [], layout: [], hover: -1, active: -1, at: 0 };
function rebuildBands() {
  ring.bands = semesterBands(allShown());
  ring.open = ring.bands.map((_, i) => ring.open[i] || 0);
  if (ring.bands.length > MAXB) ring.bands = ring.bands.slice(-MAXB);
}
/** 正在放的那张落在哪一带：示例、正在刻、没有学期的史料都不落带——整圈刻纹就是这一段声音。 */
function activeBand() {
  if (rec || listen || !current) return -1;
  const sem = current.e.semester;
  return sem ? ring.bands.findIndex((b) => b.semester === sem) : -1;
}
/** 螺旋刻在哪一段半径上：[外, 内]。 */
function activeSpan() {
  const i = ring.active;
  if (i >= 0 && ring.layout[i] && ring.open[i] > 0.02) return [ring.layout[i].r0, ring.layout[i].r1];
  return [ROUT, RIN];
}
const bandSeen = (b) => b.items.some((e) => (e.source === 'archival' || inView(e)) && (!state.zone || e.zoneId === state.zone || placeById.get(e.placeId)?.z === state.zone)
  && (!state.place || e.placeId === state.place) && (!state.person || personOf(e) === state.person));
function stepBands(dt) {
  const act = activeBand();
  ring.active = act;
  for (let i = 0; i < ring.bands.length; i++) {
    const goal = i === act ? 1 : 0;
    ring.open[i] += (goal - ring.open[i]) * (reduced ? 1 : 1 - Math.exp(-dt / 0.22));
    if (Math.abs(goal - ring.open[i]) < 1e-3) ring.open[i] = goal;
  }
  ring.layout = bandLayout(ring.bands, RIN, ROUT, ring.open);
  const u = platterMat.uniforms;
  u.uNB.value = ring.layout.length;
  ring.layout.forEach((L, i) => {
    const b = ring.bands[i];
    const flags = (bandSeen(b) ? 0 : 1) + (ring.hover === i ? 2 : 0) + (i === act ? 4 : 0);
    u.uB.value[i].set(L.r0, L.r1, Math.min(b.n, 40), flags);
  });
  const sp = activeSpan();
  u.uAct.value.set(sp[0], sp[1]);
  u.uActOn.value = act >= 0 && ring.open[act] > 0.02 ? 1 : 0;
}

// ====================================================================================
// 视角
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

/** 针尖前面一小段刻槽上的一点（世界坐标）：凑近时看的就是这里——刚被针读过的那一段。 */
function grooveSpot() {
  // 停着的时候针在第 0 秒（最外沿，那里还没刻纹）：看第 1.5 秒往后那一段；在放就看针前面刚要读到的那一段
  const now = playSeconds();
  const sec = Math.min(Math.max(0.5, current.seconds - 0.4), Math.max(1.5, (now % current.dur) + 0.3));
  // 盘面着色器：方位 psi 处这一圈是第 g = (uAngle − psi) / 2π 圈，uAngle = 播放角 + 针尖方位。第 sec 秒那一点在 psi = 针尖 + 2π(现在 − sec)/一圈
  const r = stylusRadius(sec), psi = ARM.psi + (TAU * (now - sec)) / TURN;
  return new THREE.Vector3(Math.sin(psi) * r, 0, -Math.cos(psi) * r);
}
/**
 * Powers of Ten：校园 → 整张盘 → 刻槽 → 刻槽里的波形，一镜到底。距离按对数插值（每秒走过同样多个「十倍」），视点在前三成就落到针尖。
 * dir = 'in'（从当前位置推到波形）/ 'out'（从波形拉回整台唱机）。推近时电机停下来：盘一转，十毫秒的波形一闪就过去了。
 */
function powersOfTen(dir = 'in', dur = 5200) {
  if (!current) return;
  const spot = grooveSpot();
  const az = Math.atan2(spot.x, spot.z) + 0.9;      // 顺着刻槽的切线方向斜看，波形是横着走的
  const from = { t: controls.target.clone(), d: camera.position.distanceTo(controls.target), polar: controls.getPolarAngle(), az: controls.getAzimuthalAngle() };
  const close = { t: spot, d: 26, polar: 0.62, az };
  const home = { t: HOME.target.clone(), d: HOME.dist, polar: HOME.polar, az: HOME.azim };
  const [A, B] = dir === 'in' ? [from, close] : [dir === 'open' ? close : from, home];
  if (dir === 'in') { zoom = { wasOn: motorOn }; setMotor(false, true); }
  controls.enabled = false;
  fly = null;
  zoom = { ...(zoom || {}), t0: performance.now(), dur: reduced ? 1 : dur, A, B, dir };
}
function zoneView(id) {
  const o = zoneObj.get(id);
  return { target: new THREE.Vector3(o.c.x, TILE_TOP, -o.c.y), dist: 1350, polar: Math.min(controls.getPolarAngle(), 0.95) };
}

// ====================================================================================
// 声音：搓盘 worklet（与刻声盘同一个）
// ====================================================================================
let ctx = null, player = null, report = { pos: 0, rate: 0, t: 0 }, motorOn = false;
let current = null;                    // { e, pcm, fs, dur, seconds, env }
let rec = null;                        // 正在刻：{ mic, cutter, chunks, n, fs, pid, mode, released }

async function ensureAudio() {
  if (ctx) { if (ctx.state !== 'running') await ctx.resume(); return; }
  ctx = await quickCtx();               // 和「按住 刻十秒」同一个 AudioContext（手机上开两个会互相抢）
  await ctx.audioWorklet.addModule(new URL('../../worklets/scratch.js', import.meta.url));
  player = new AudioWorkletNode(ctx, 'kesheng-scratch', { numberOfInputs: 0, outputChannelCount: [2] });
  player.port.onmessage = (ev) => { report = ev.data; };
  player.connect(ctx.destination);
  if (current) player.port.postMessage({ buffer: current.pcm, sampleRate: current.fs });
}

function playSeconds() {
  if (!current || !ctx) return 0;
  const n = current.pcm.length;
  let p = report.pos + report.rate * current.fs * Math.max(0, ctx.currentTime - report.t);
  p = ((p % n) + n) % n;
  return p / current.fs;
}

/** 落针：电机从停到转时一声很轻的「嗒」——短噪声脉冲过低通，和刻纹的声音分开走，不进任何录音。 */
function dropClick() {
  if (!ctx) return;
  const fs = ctx.sampleRate, n = Math.round(fs * 0.09), b = ctx.createBuffer(1, n, fs), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (fs * 0.012)) * (i < fs * 0.001 ? 1 : 0.45);
  const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 2200; g.gain.value = 0.07;
  src.buffer = b;
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start();
}

function setMotor(on, quiet = false) {
  if (on && !motorOn && !quiet) dropClick();
  motorOn = on;
  if (player) player.port.postMessage({ motor: on ? 1 : 0 });
  els.play.textContent = on ? '停' : '放';
  els.play.setAttribute('aria-label', on ? '停下这张声片' : '放这张声片');
}

/** 取一张声片的声音：概念盘现场合成 / 我柜子里的原声 / 馆藏音频（含史料 mp3，都在 archive/ 下）。返回 { pcm, fs } 或抛错。 */
async function soundOf(e) {
  if (e.disc) return { pcm: e.disc.pcm, fs: e.disc.fs };
  if (e.rec) { const d = await lib.discFromRecord(e.rec); e.disc = d; return { pcm: d.pcm, fs: d.fs }; }
  if (e.synth) return { pcm: padToTurns(synthClip(e.synth.v, e.synth.seed, e.seconds, FS), FS), fs: FS };
  await ensureAudio();
  const buf = await ctx.decodeAudioData(await lib.archiveAudio('../', e));
  return { pcm: padToTurns(buf.getChannelData(0).slice(0, Math.round(MAX_SEC * buf.sampleRate)), buf.sampleRate), fs: buf.sampleRate };
}

/** 选一张声片：取声 → 刻进外圈 → 交给搓盘。autoplay=false 时只刻不放（页面刚打开，还没有用户手势）。
 *  pre = 事先备好的 { pcm, fs, tex }（「听一段示例」认出之后要立刻接上，等不起现场合成）。 */
async function loadClip(e, autoplay = true, pre = null) {
  let snd = pre;
  if (!snd) { try { snd = await soundOf(e); } catch (err) { say(`${clipName(e)} 放不出来：${err.message || err}`); return; } }
  const { pcm, fs } = snd;
  const tex = snd.tex || (e.disc && e.disc.tex ? e.disc.tex : cutWhole(pcm, fs).tex);
  grooveTex.image.data.set(tex);
  grooveTex.needsUpdate = true;
  const hop = Math.round(fs / 50), env = new Float32Array(Math.ceil(pcm.length / hop));
  for (let i = 0; i < env.length; i++) {
    let q = 0;
    for (let j = i * hop; j < Math.min(pcm.length, (i + 1) * hop); j++) q += pcm[j] * pcm[j];
    env[i] = Math.sqrt(q / hop);
  }
  current = { e, pcm, fs, dur: pcm.length / fs, seconds: Math.min(e.seconds, MAX_SEC), env, tex };
  fillWave(pcm, fs);
  inscribe(e);
  seekT = performance.now();
  state.clip = e;
  platterMat.uniforms.uHas.value = 1;
  platterMat.uniforms.uCut.value = current.seconds;
  platterMat.uniforms.uDur.value = current.dur;
  showPlayer(e);
  renderEchoes();
  updatePins();
  renderCard();
  if (autoplay) {
    await ensureAudio();
    player.port.postMessage({ buffer: pcm, sampleRate: fs });
    report = { pos: 0, rate: 0, t: ctx.currentTime };
    setMotor(true);
    say(`在放 ${clipName(e)}。按住外圈刻纹拖动可以搓。`);
  }
}

/** 刻槽里的波形：整段 PCM 抽到 8 kHz（每格取平均），按峰值归一，写进 waveTex。 */
function fillWave(pcm, fs) {
  const d = waveTex.image.data, step = fs / WAVE_FS, n = Math.min(WAVE_W * WAVE_H, Math.floor(pcm.length / step));
  let pk = 1e-4;
  for (let i = 0; i < pcm.length; i++) pk = Math.max(pk, Math.abs(pcm[i]));
  d.fill(128);
  for (let k = 0; k < n; k++) {
    let a = 0, c = 0;
    for (let j = Math.floor(k * step); j < Math.floor((k + 1) * step); j++) { a += pcm[j]; c++; }
    d[k] = 128 + Math.round(127 * Math.max(-1, Math.min(1, (a / (c || 1)) / pk)));
  }
  waveTex.needsUpdate = true;
}
/** 正在刻：每进来一块就往后接（还不知道峰值，按固定增益）。 */
function feedWave(x, n0, fs) {
  const d = waveTex.image.data, step = fs / WAVE_FS;
  for (let k = Math.ceil(n0 / step); k * step < n0 + x.length && k < d.length; k++) d[k] = 128 + Math.round(127 * Math.max(-1, Math.min(1, x[Math.floor(k * step - n0)] * 4)));
  waveTex.needsUpdate = true;
}
/** 死蜡刻字：这张盘自己的号与学期。真实盘写「档案号　某年秋 刻于学院路」；概念盘不编来历，只写学期与地点；史料写史料号。 */
function inscribe(e) {
  const t = e.source === 'archival' ? `史料　${e.no || ''}`
    : e.source === 'concept' ? `${semesterLabel(e.semester)}　${e.place}`
      : e.source === 'example' ? '一段示例'
        : `${e.no}　${semesterLabel(e.semester)} 刻于学院路`;
  if (inscCanvas.dataset.t === t) return;
  inscCanvas.dataset.t = t;
  const g = inscCanvas.getContext('2d'), W = inscCanvas.width, H = inscCanvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // 贴图 x 是方位角（一整圈 8192 px，约 1.7 px/米），y 是半径（64 px ≈ 29 米）：横向压一半，字才是方的
  const rMid = LABEL_R + 15, kx = W / (TAU * rMid), ky = H / 29;
  g.scale(kx / ky, 1);
  g.fillStyle = '#fff';
  g.font = `${Math.round(H * 0.62)}px "KS Fangsong Plan", "Noto Serif CJK SC", serif`;
  g.textBaseline = 'middle';
  // 手刻：每个字抖一点、粗细不一
  let x = 40;
  [...t].forEach((ch, i) => {
    const j = Math.sin(i * 12.9898) * 43758.5453 % 1;
    g.save(); g.translate(x, H / 2 + j * 3); g.rotate(j * 0.05); g.fillText(ch, 0, 0); g.restore();
    x += g.measureText(ch).width * 1.08;
  });
  inscTex.needsUpdate = true;
}

// 史料两种来路：选单里的（有事件日期、上传者）/ 馆藏目录里的（有集名与出处）。文案只取数据里有的，不补写（SPEC-DIGEST-1 §2）
// 概念盘不给档案号、不给周次与时段：只说「哪一季 · 哪里」（SPEC-DIGEST-1 §2 ②，不给演示盘编来历）
const clipName = (e) => (e.source === 'archival' ? `史料 · ${e.title || e.note}` : e.source === 'concept' ? `${e.place} · ${semesterLabel(e.semester)}` : e.source === 'example' ? '一段示例' : e.no);
function archivalMeta(e) {
  if (e.src) return `${placeById.get(e.placeId).name} · ${e.dateKind === 'event' ? dayText(e.date) : `${e.date.slice(0, 4)} 年发布`} · 史料 · 取自 ${e.src.site}（${e.src.uploader}，${e.src.kind}），${e.cut}。`;
  const s = (e.arc && e.arc.source) || {};
  const pl = placeById.get(e.placeId);
  return [pl ? pl.name : e.place, s.dateHint, `史料 · 取自 ${s.url || '出处未记'}${s.excerptFrom ? `（${s.excerptFrom} 起十秒）` : ''}`].filter(Boolean).join(' · ') + '。';
}

function showPlayer(e) {
  els.player.hidden = false;
  els.no.textContent = clipName(e);
  if (e.source === 'archival') {
    els.who.hidden = true;
    els.note.textContent = (e.arc && e.arc.copy) || e.what || '';
    els.meta.textContent = archivalMeta(e);
    return;
  }
  els.note.textContent = e.note || e.place;
  const pk = personOf(e);
  els.who.hidden = !pk || state.person === pk;
  if (pk) { els.who.dataset.person = pk; els.who.textContent = pk === 'me' ? '看我的柜子' : `看 ${e.author.name || signature(e.author)} 的柜子`; }
  if (e.source === 'concept') { els.meta.textContent = `合成的声音 · ${e.place} · ${semesterLabel(e.semester)}`; return; }
  if (e.source === 'example') { els.note.textContent = e.note; els.meta.textContent = '一段示例 · 页面现场做的'; return; }
  const src = e.source === 'local' ? '在你的柜子里，还没入馆。' : '';
  els.meta.textContent = `${[e.place, when(e), who(e)].filter(Boolean).join(' · ')}。${src}`;
}

// —— 盘面上的回声针：钉在某一秒的话，同时也立在盘面刻纹上那一秒的位置，跟着盘一起转 ——
// 位置和针尖读到的是同一公式：半径用 stylusRadius(秒)，方位是「盘面固定角」−2π·(秒/一圈) 再随盘转（和 rim 同一个旋转）。
// 针走到那一秒，针头亮起来；这样声音、波形、盘面三处指的是同一个瞬间。
const echoMarks = { group: null, items: [] };
const MARK_GEO = { needle: null, head: null };
function buildEchoMarks() {
  MARK_GEO.needle = new THREE.CylinderGeometry(1.1, 1.1, 1, 8);
  MARK_GEO.head = new THREE.SphereGeometry(11, 16, 12);
  echoMarks.group = new THREE.Group();
  echoMarks.group.position.y = 0.6;
  echoMarks.group.visible = false;
  scene.add(echoMarks.group);
}
function syncEchoMarks() {
  const g = echoMarks.group;
  if (!g) return;
  for (const m of echoMarks.items) g.remove(m.obj);
  echoMarks.items = [];
  if (!current || !echoState.list.length) return;
  echoState.list.forEach((x, i) => {
    const obj = new THREE.Group();
    const col = x.mine ? COL.scope : '#F2F4F3';
    const mat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.92 });
    const needle = new THREE.Mesh(MARK_GEO.needle, mat);
    needle.scale.y = 46; needle.position.y = 23;
    const head = new THREE.Mesh(MARK_GEO.head, mat);
    head.position.y = 48;
    obj.add(needle, head);
    obj.userData = { t: x.t, i, head, mat };
    g.add(obj);
    echoMarks.items.push({ obj, t: x.t, i });
  });
}
/** 每帧：盘转多少，针组跟着转多少；每根针按它那一秒落在刻纹上的半径和方位站好。 */
function stepEchoMarks() {
  const g = echoMarks.group;
  if (!g) return;
  const show = !!current && !rec && !listen && echoMarks.items.length > 0 && !(zoom && zoom.at === 'close');
  g.visible = show;
  if (!show) return;
  g.rotation.y = -platterMat.uniforms.uAngle.value;
  for (const m of echoMarks.items) {
    const r = stylusRadius(Math.min(m.t, current.seconds));
    const psi = -TAU * ((m.t / TURN) % 1);
    m.obj.position.set(Math.sin(psi) * r, 0, -Math.cos(psi) * r);
    const on = m.i === echoState.active;
    const k = on ? 1.7 : 1;
    m.obj.userData.head.scale.setScalar(k);
    m.obj.userData.mat.opacity = on ? 1 : 0.8;
  }
}

// —— 回声带：这张声片的包络线，加上钉在某一秒的话。针走到哪一秒，那一秒的话就浮上来 ——
// 数据与规则在 ../community.js（示例回声标「示例」，你留的只存在这台设备上）。点一根钉或一行字，声音跳到那一秒前面一点接着放。
const EL = { box: $('echoes'), wave: $('echo-wave'), waveOn: $('echo-wave-on'), head: $('echo-head'), pins: $('echo-pins'), now: $('echo-now'), list: $('echo-list'),
  sum: $('echo-sum'), all: $('echo-all'), open: $('echo-open'), form: $('echo-form'), at: $('echo-at'), atV: $('echo-at-v'), text: $('echo-text'), count: $('echo-count'), err: $('echo-err'), cancel: $('echo-cancel') };
const echoState = { id: null, list: [], sec: 1, active: -2 };

/** 包络（每 20 毫秒一格）→ 对称的波形轮廓（160 列，纵向 56）。只画真实声音的长度，不画补齐的静音。 */
function wavePath(env, seconds) {
  const N = 160, frames = Math.max(1, Math.min(env.length, Math.floor(seconds * 50)));
  let mx = 1e-6;
  for (let i = 0; i < frames; i++) mx = Math.max(mx, env[i]);
  const hs = [];
  for (let c = 0; c < N; c++) {
    const a = Math.floor((c * frames) / N), b = Math.max(a + 1, Math.floor(((c + 1) * frames) / N));
    let v = 0;
    for (let i = a; i < b && i < frames; i++) v = Math.max(v, env[i]);
    hs.push(1.5 + Math.pow(v / mx, 0.62) * 25);
  }
  const top = hs.map((h, c) => `${c},${(28 - h).toFixed(1)}`), bot = hs.map((h, c) => `${c},${(28 + h).toFixed(1)}`).reverse();
  return `M${top.join('L')}L${bot.join('L')}Z`;
}

function echoOff() { if (EL.box) EL.box.hidden = true; echoState.id = null; echoState.list = []; syncEchoMarks(); }

function renderEchoes() {
  if (!EL.box) return;
  const e = current && current.e;
  if (!e || e.source === 'example') { echoOff(); return; }
  EL.box.hidden = false;
  echoState.id = e.id; echoState.sec = current.seconds; echoState.active = -2;
  const d = wavePath(current.env, current.seconds);
  EL.wave.innerHTML = `<path d="${d}"/>`;
  EL.waveOn.innerHTML = `<path d="${d}"/>`;
  EL.at.max = String(current.seconds);
  drawEchoes();
  closeEchoForm();
}

function drawEchoes() {
  const list = echo.echoesOf(echoState.id);
  echoState.list = list; echoState.active = -2;
  const s = echoState.sec;
  EL.pins.innerHTML = list.map((x, i) => `<button type="button" class="echo-pin${x.mine ? ' is-mine' : ''}" data-i="${i}" style="left:${((x.t / s) * 100).toFixed(2)}%" aria-label="${x.t.toFixed(1)} 秒：${esc(x.text)}"></button>`).join('') + '<i class="echo-ghost" id="echo-ghost" hidden></i>';
  EL.list.innerHTML = list.length
    ? list.map((x, i) => `<li data-i="${i}"><button type="button" class="echo-line" data-i="${i}"><span class="s">${x.t.toFixed(1)} 秒</span><span class="w">${esc(x.text)}</span><span class="b">${esc(echo.byline(x))}</span></button><button type="button" class="echo-del" data-id="${esc(x.id)}" aria-label="${x.mine ? '删掉' : '举报'}这条：${esc(x.text)}">${x.mine ? '删掉' : '举报'}</button></li>`).join('')
    : '<li class="echo-empty">这张声片上还没有话。点「钉一句话」，把想说的钉在某一秒。</li>';
  EL.now.textContent = '';
  EL.sum.textContent = list.length ? `这张声片上的话 · ${list.length} 条` : '这张声片上还没有话';
  syncEchoMarks();
}

/** 每帧：针头跟着播放位置走，已经放过的一段亮起来；走到一句话的那一秒，它浮上来。 */
function echoLive(play) {
  if (!echoState.id || EL.box.hidden) return;
  const p = Math.min(1, Math.max(0, play / echoState.sec));
  EL.head.style.left = `${(p * 100).toFixed(2)}%`;
  EL.waveOn.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
  let k = -1;
  const list = echoState.list;
  for (let i = 0; i < list.length; i++) if (list[i].t <= play + 0.15 && play - list[i].t < 1.8) k = i;
  if (k === echoState.active) return;
  echoState.active = k;
  EL.pins.querySelectorAll('.echo-pin').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.i) === k));
  EL.list.querySelectorAll('li[data-i]').forEach((li) => li.classList.toggle('is-on', Number(li.dataset.i) === k));
  EL.now.textContent = k >= 0 ? `「${list[k].text}」${echo.byline(list[k]) ? ' ' + echo.byline(list[k]) : ''}` : '';
}

async function seekEcho(i) {
  const x = echoState.list[i];
  if (!x || !current) return;
  await ensureAudio();
  if (!report.t && report.pos === 0) player.port.postMessage({ buffer: current.pcm, sampleRate: current.fs });
  const t = Math.max(0, x.t - 0.4);
  player.port.postMessage({ seek: t / current.dur, rate: 1 });
  report = { pos: t * current.fs, rate: 1, t: ctx.currentTime };
  seekT = performance.now();
  setMotor(true);
  say(`从第 ${t.toFixed(1)} 秒放，第 ${x.t.toFixed(1)} 秒有一句话。`);
}

function openEchoForm() {
  if (!current) return;
  const p = ctx && motorOn ? Math.round(Math.min(current.seconds, playSeconds()) * 10) / 10 : 0;
  EL.at.max = String(current.seconds);
  EL.at.value = String(p);
  EL.atV.textContent = p.toFixed(1);
  EL.text.value = ''; EL.count.textContent = `0/${echo.ECHO_MAX}`; EL.err.textContent = '';
  EL.form.hidden = false; EL.open.hidden = true; EL.open.setAttribute('aria-expanded', 'true');
  ghostAt(p);
  EL.text.focus();
}
function closeEchoForm() {
  if (!EL.form) return;
  EL.form.hidden = true; EL.open.hidden = false; EL.open.setAttribute('aria-expanded', 'false');
  const g = document.getElementById('echo-ghost');
  if (g) g.hidden = true;
}
function ghostAt(t) {
  const g = document.getElementById('echo-ghost');
  if (!g) return;
  g.hidden = false;
  g.style.left = `${((t / echoState.sec) * 100).toFixed(2)}%`;
}

if (EL.box) {
  EL.pins.addEventListener('click', (ev) => { const b = ev.target.closest('.echo-pin'); if (b) seekEcho(Number(b.dataset.i)); });
  EL.list.addEventListener('click', (ev) => {
    const del = ev.target.closest('.echo-del');
    if (del) { echo.hideEcho(del.dataset.id); drawEchoes(); say('这一条收起来了。'); return; }
    const ln = ev.target.closest('.echo-line');
    if (ln) seekEcho(Number(ln.dataset.i));
  });
  EL.open.addEventListener('click', openEchoForm);
  EL.cancel.addEventListener('click', () => { closeEchoForm(); EL.open.focus(); });
  EL.at.addEventListener('input', () => { EL.atV.textContent = Number(EL.at.value).toFixed(1); ghostAt(Number(EL.at.value)); });
  EL.text.addEventListener('input', () => { EL.count.textContent = `${EL.text.value.length}/${echo.ECHO_MAX}`; EL.err.textContent = ''; });
  EL.form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    try {
      const id = lib.me();
      const e = echo.addEcho({ discId: echoState.id, t: Number(EL.at.value), text: EL.text.value, dur: current.seconds,
        author: id ? { grade: id.grade, dept: id.dept, name: id.name, key: myKey } : null });
      drawEchoes();
      closeEchoForm();
      EL.open.focus();
      say(`钉在第 ${e.t.toFixed(1)} 秒了。只在这台设备上，别人暂时看不到。`);
    } catch (err) {
      EL.err.textContent = err.message || '没有钉上，再试一次。';
    }
  });
}

els.play.addEventListener('click', async () => {
  if (!current) return;
  await ensureAudio();
  if (!report.t && report.pos === 0) player.port.postMessage({ buffer: current.pcm, sampleRate: current.fs });
  setMotor(!motorOn);
});
els.who.addEventListener('click', () => { const k = els.who.dataset.person; if (k === 'me') openMine(); else if (k) openPerson(k); });
// 随手换一张：从眼下这一视图能看到的盘里抽（看一个人的柜子时只在 TA 的盘里抽）
els.shuffle.addEventListener('click', () => {
  const pool = entries.filter((e) => inView(e) && (!state.person || personOf(e) === state.person) && (!current || e.id !== current.e.id));
  if (!pool.length) { say('这一视图里没有别的盘可换了。'); return; }
  const e = pool[Math.floor(Math.random() * pool.length)];
  loadClip(e).then(() => say(`随手换了一张：${[e.place, when(e), who(e)].filter(Boolean).join('，')}。`));
});
/** 点外圈的一带：从那个学期里抽一张放（眼下这一视图能看到的优先）。 */
function playBand(i) {
  const b = ring.bands[i];
  if (!b) return;
  const pool = b.items.filter((e) => e.source !== 'archival' && bandSeen({ items: [e] }));
  const from = pool.length ? pool : b.items;
  const e = from[Math.floor(Math.random() * from.length)];
  loadClip(e).then(() => say(`放 ${b.label} 的一张：${clipName(e)}。`));
}
const zoomBtn = document.getElementById('btn-zoom');
if (zoomBtn) zoomBtn.addEventListener('click', () => {
  const close = zoom && zoom.at === 'close';
  powersOfTen(close ? 'out' : 'in');
  zoomBtn.textContent = close ? '凑近看刻槽' : '退回来';
  zoomBtn.setAttribute('aria-pressed', String(!close));
});
els.rewind.addEventListener('click', async () => {
  if (!current) return;
  await ensureAudio();
  player.port.postMessage({ seek: 0 });
  seekT = performance.now();
  setMotor(true);
});

// —— 在这里刻：麦克风只在按住时打开；刻纹实时出现在外圈，唱针跟着往里走 ——
const MIC = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } };
function micError(err) {
  if (err && err.name === 'NotAllowedError') return '浏览器没有允许使用麦克风。点地址栏左侧的图标，把麦克风改成允许，再按一次。';
  if (err && err.name === 'NotFoundError') return '这台设备没有找到麦克风。';
  if (!window.isSecureContext) return '麦克风只能在 https 或 localhost 页面上使用。';
  return `麦克风打不开：${(err && err.message) || '未知原因'}。`;
}

async function startRec(pid, mode, btn) {
  if (rec) { if (rec.mode === 'toggle') stopRec(); return; }
  rec = { pid, mode, btn, chunks: [], n: 0, mic: null, released: false };
  btn.classList.add('is-rec');
  btn.querySelector('span').textContent = '正在打开麦克风…';
  try {
    await ensureAudio();
    const stream = await navigator.mediaDevices.getUserMedia(MIC);
    if (!rec) { stream.getTracks().forEach((t) => t.stop()); return; }
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'kesheng-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(node).connect(sink).connect(ctx.destination);
    rec.mic = { node, close() { node.port.postMessage('stop'); node.port.onmessage = null; src.disconnect(); node.disconnect(); sink.disconnect(); stream.getTracks().forEach((t) => t.stop()); } };
    // 权限弹窗会吞掉「按住」：开麦前已经松手的，改成「再按一次停」
    if (rec.mode === 'hold' && rec.released) rec.mode = 'toggle';
    rec.fs = ctx.sampleRate;
    prepCut();
    btn.querySelector('span').textContent = rec.mode === 'toggle' ? '再按一次停' : '松手就停';
    // 镜头退到能同时看见这根针和北边的唱针：刻纹在外圈一圈圈出现，唱针跟着往里走
    const pin = pinObj.get(pid).group.position, tip = new THREE.Vector3(0, TILE_TOP, -ROUT);
    setView({ target: pin.clone().setY(TILE_TOP).lerp(tip, 0.45), dist: Math.max(1700, pin.distanceTo(tip) * 1.5 + 650), polar: 0.78 });
    say(`正在刻 ${placeById.get(pid).name}。`);
    const max = Math.round(MAX_SEC * rec.fs);
    node.port.onmessage = ({ data }) => {
      if (!rec || !rec.mic) return;
      const x = data.samples.subarray(0, Math.max(0, Math.min(data.samples.length, max - rec.n)));
      if (x.length) feedCut(x);
      if (rec.n >= max) stopRec();
    };
  } catch (err) {
    say(micError(err));
    resetRecBtn(btn);
    rec = null;
  }
}

function resetRecBtn(btn) {
  btn.classList.remove('is-rec');
  btn.querySelector('span').textContent = '按住，在这里刻十秒';
}

/** 刻刀就位：外圈清空、电机停、唱针回到外沿。两条路（地点卡上的「在这里刻」、画面上的「按住 刻十秒」）共用。 */
function prepCut() {
  rec.cutter = new GrooveCutter(rec.fs);
  waveTex.image.data.fill(128);
  inscribe({ source: 'local', no: `学院路-${slotOf(new Date())}-${weekTag(new Date(), cal).tag}-${String(seq).padStart(2, '0')}`, semester: weekTag(new Date(), cal).key || NOW_SEM });
  setMotor(false);
  current = null;
  state.clip = null;
  echoOff();
  grooveTex.image.data.fill(0);
  grooveTex.needsUpdate = true;
  platterMat.uniforms.uHas.value = 1;
  platterMat.uniforms.uCut.value = 0;
  platterMat.uniforms.uDur.value = MAX_SEC;
}
/** 一小块声音进来：刻进外圈（唱针跟着刻刀往里走）。 */
function feedCut(x) {
  feedWave(x, rec.n, rec.fs);
  rec.chunks.push(x);
  rec.n += x.length;
  rec.cutter.push(x, (i, col) => {
    for (let k = 0; k < BANDS; k++) grooveTex.image.data[k * TEX_W + i] = col[k];
    grooveTex.needsUpdate = true;
  });
  platterMat.uniforms.uCut.value = rec.n / rec.fs;
}

async function stopRec() {
  if (!rec) return;
  const r = rec;
  if (!r.mic) { r.released = true; return; }   // 麦克风还没开：开了以后按「再按一次停」
  rec = null;
  r.mic.close();
  resetRecBtn(r.btn);
  await finishCut(r, new Date());
}

/** 刻完：入柜、落盘。r.pid 为空（「按住 刻十秒」）时，盘先进我的柜子，地点等你点一根针再补。 */
async function finishCut(r, at) {
  const secs = r.n / r.fs;
  if (secs < 1) { say('录得太短了，按住至少一秒。'); if (state.clip) loadClip(state.clip, false); else platterMat.uniforms.uHas.value = 0; return; }
  const raw = new Float32Array(r.n);
  let o = 0;
  for (const c of r.chunks) { raw.set(c, o); o += c.length; }
  const { tex, prints } = r.cutter.finish();
  const pcm = padToTurns(raw, r.fs);
  const p = r.pid ? placeById.get(r.pid) : null;
  const wt = weekTag(at, cal);                 // 校历查不到就是 W--，不猜周次
  const id = lib.ensureMe();
  myKey = await authorKey(id.uid);
  const before = counts(allShown()).people;
  const d = {
    id: crypto.randomUUID(), pcm, fs: r.fs, tex: new Uint8Array(tex), prints, dur: pcm.length / r.fs, seconds: Math.min(secs, MAX_SEC),
    place: p ? p.name : '', placeId: p ? p.id : null, zoneId: p ? p.z : null, campus: '学院路', note: '', at: at.toISOString(),
    slot: slotOf(at), week: wt.week, semester: wt.key || NOW_SEM, kind: null, status: 'local', archive: null,
    author: snapshot(id),
    no: `学院路-${slotOf(at)}-${wt.tag}-${String(seq++).padStart(2, '0')}`,
  };
  d.date = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  d.meta = metaOf(d);
  let stored = true;
  try { await lib.saveDisc(d); } catch { stored = false; }
  const e = localItem(d, d);
  e.author = d.author.grade || d.author.dept || d.author.name ? { ...d.author, key: myKey } : null;
  entries.push(e);
  entries.sort(byTime);
  rebuildBands();
  updateCab();
  if (p) {
    land(e, stored);
  } else {
    // 没有地点：盘先进柜子；校园上的针都亮出名字，点哪根就落到哪根（不点也行）
    state.landed = { id: e.id, line: '', stored, unplaced: true };
    state.placing = e.id;
    if (state.view !== 'campus') selectZone(null); else renderCard();
  }
  await loadClip(e, false);
  await ensureAudio();
  player.port.postMessage({ buffer: pcm, sampleRate: r.fs });
  report = { pos: 0, rate: 0, t: ctx.currentTime };
  setMotor(true);
  say(stored ? `刻好了，${d.seconds.toFixed(1)} 秒，存在这台设备上。${p ? '' : '它是在哪儿录的？在校园里点一根针；不点也行，先放在柜子里。'}` : '刻好了，但本机库写不进去：这张只在内存里，刷新就没了。');
  window.__plan.lastRec = { id: e.id, seconds: d.seconds, place: p ? p.id : null, stored, no: d.no };
  if (!before && counts(allShown()).people) firstParticipant(e);
}
/** 参与者从 0 变 1 的那一刻（只数真实落款，counts() 出数）：盘心标签上压一行字，画面上停两秒。不是庆祝动画，是一次盖章。 */
function firstParticipant(e) {
  const a = e.author || lib.me();
  const who = a && (a.name || signature(a));
  const el = document.getElementById('first');
  if (!el) return;
  el.querySelector('b').textContent = '1';
  el.querySelector('span').textContent = who ? `第一位留下落款的人：${who}` : '第一位留下落款的人';
  el.hidden = false;
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
  stampLabel(`第一位落款　${who || ''}　${dayText(e.at.slice(0, 10))}`);
  setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 900); }, reduced ? 2600 : 4200);
  window.__plan.first = { who: who || null, at: e.at };
}
const metaOf = (d) => { const t = new Date(d.at); return `${d.place ? `${d.place}，` : ''}${t.getMonth() + 1} 月 ${t.getDate()} 日${d.slot}，${d.seconds.toFixed(1)} 秒`; };

/** 落到针上：从高处落下、轻轻一弹，卡片说它是这里的第几张、上一位是谁。 */
function land(e, stored) {
  const p = placeById.get(e.placeId);
  const mineCount = entries.filter((x) => x.mine).length;
  state.landed = { id: e.id, line: landingLine(entries, e, p.name, { mineCount, history }), stored };
  state.placing = null;
  landing = { pid: p.id, t0: performance.now() };
  state.view = 'place'; state.place = p.id; state.zone = p.z; state.person = null;
  updatePins();
  const pg = pinObj.get(p.id).group.position;  // 推回这根针：看刚刻的那张落下来
  setView({ target: new THREE.Vector3(pg.x, TILE_TOP, pg.z), dist: 980, polar: 0.86 });
  renderCard();
}

/** 事后补地点：把柜子里一张没地点的盘放到 pid 那根针上（只改这台设备上的记录；已投稿的不改）。 */
async function placeDisc(id, pid) {
  const e = entries.find((x) => x.id === id), p = placeById.get(pid);
  if (!e || !p || e.source !== 'local' || e.submittedAt) return;
  const d = e.disc || (await lib.discFromRecord(e.rec));
  Object.assign(d, { place: p.name, placeId: p.id, zoneId: p.z });
  d.meta = metaOf(d);
  let stored = true;
  try { await lib.saveDisc(d); } catch { stored = false; }
  Object.assign(e, { place: p.name, placeId: p.id, zoneId: p.z, disc: d, rec: null });
  land(e, stored);
  if (state.clip && state.clip.id === e.id) showPlayer(e);
  say(`放到「${p.name}」了。`);
}

// 「按住 刻十秒」（quick.js）：三维摆好之后接手。摆好之前就录完的那一段，这时交过来，照样刻、照样入柜
attachQuick({
  start: ({ fs, chunks = [] }) => {
    if (rec) return;
    if (listen) stopListen();
    rec = { pid: null, mode: 'quick', btn: null, chunks: [], n: 0, fs, mic: { close() {} }, quick: true };
    prepCut();
    for (const c of chunks) feedCut(c);
    say('在刻。松手就停，最长十秒。');
  },
  chunk: ({ x }) => { if (rec && rec.quick) feedCut(x); },
  stop: async (take) => {
    if (!(rec && rec.quick)) {                  // 三维摆好之前录完的：整段补刻
      rec = { pid: null, mode: 'quick', btn: null, chunks: [], n: 0, fs: take.fs, mic: { close() {} }, quick: true };
      prepCut();
      feedCut(take.pcm);
    }
    const r = rec;
    rec = null;
    await finishCut(r, take.at || new Date());
  },
  error: (msg) => say(msg),
});

// ====================================================================================
// 指针：搓盘 / 转视角 / 点选
// ====================================================================================
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let grab = null, down = null;

function toNdc(ev) {
  const r = els.canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}

function platterPoint(ev) {
  toNdc(ev);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, p)) return null;
  const x = p.x, yN = -p.z;
  return { rho: Math.hypot(x, yN), psi: Math.atan2(x, yN) };
}

function pick(ev) {
  toNdc(ev);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (!hit) return null;
  return hit.object.userData.place ? { place: hit.object.userData.place } : hit.object.userData.zone ? { zone: hit.object.userData.zone } : null;
}

if (renderer) {
  // 先于 OrbitControls 拿到按下：落在刻纹带上就截下来做搓盘
  els.canvas.addEventListener('pointerdown', async (ev) => {
    down = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp };   // 用事件自己的时间戳：一帧很长时，处理时刻会晚好几秒，不能拿它判断是不是点击
    const pp = platterPoint(ev);
    const onGroove = pp && pp.rho > RIN - 20 && pp.rho < ROUT + 20 && current && !pick(ev);
    if (!onGroove) return;
    ev.stopImmediatePropagation();
    ev.preventDefault();
    els.canvas.setPointerCapture(ev.pointerId);
    els.canvas.classList.add('is-scratching');
    const first = !ctx;
    await ensureAudio();
    if (first) player.port.postMessage({ buffer: current.pcm, sampleRate: FS });
    const pos0 = first ? 0 : playSeconds() * FS;
    grab = { band: bandAt(ring.layout, pp.rho), id: ev.pointerId, last: pp.psi, turn: 0, pos0, target: pos0, vel: 0, lastT: performance.now(), moved: 0, x: ev.clientX, y: ev.clientY, start: ev.timeStamp };
    player.port.postMessage({ hold: { target: pos0, vel: 0, t: ctx.currentTime } });
  }, { capture: true });

  els.canvas.addEventListener('pointermove', (ev) => {
    if (grab && ev.pointerId === grab.id) {
      const pp = platterPoint(ev);
      if (!pp) return;
      let d = pp.psi - grab.last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      grab.last = pp.psi;
      grab.turn += d;
      grab.moved = Math.max(grab.moved, Math.hypot(ev.clientX - grab.x, ev.clientY - grab.y));
      const now = performance.now();
      const target = grab.pos0 + (grab.turn / (2 * Math.PI)) * TURN * FS;
      const dt = Math.max(1, now - grab.lastT) / 1000;
      grab.vel = grab.vel * 0.4 + ((target - grab.target) / dt) * 0.6;
      grab.target = target;
      grab.lastT = now;
      player.port.postMessage({ hold: { target, vel: grab.vel, t: ctx.currentTime } });
      return;
    }
    if (ev.buttons) return;
    hoverAt(ev);
  });

  const release = (ev) => {
    if (grab && ev.pointerId === grab.id) {
      const click = grab.moved < 5 && ev.timeStamp - grab.start < 300;
      const bi = grab.band;
      grab = null;
      els.canvas.classList.remove('is-scratching');
      player.port.postMessage({ hold: null });
      if (click && bi >= 0 && bi !== ring.active) playBand(bi);
      else if (click) setMotor(!motorOn);
      down = null;
      return;
    }
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    if (moved < 5 && ev.timeStamp - down.t < 500) clickAt(ev);
    down = null;
  };
  els.canvas.addEventListener('pointerup', release);
  els.canvas.addEventListener('pointercancel', release);
  els.canvas.addEventListener('pointerleave', () => { setHover(null); state.hoverPlace = null; ring.hover = -1; });   // 指针离开画布：悬停的展签也收起

  // 键盘：方向键转视角，加减号缩放，空格放 / 停
  els.canvas.addEventListener('keydown', async (ev) => {
    const az = controls.getAzimuthalAngle(), polar = controls.getPolarAngle(), dist = camera.position.distanceTo(controls.target);
    const step = { ArrowLeft: [-0.2, 0, 1], ArrowRight: [0.2, 0, 1], ArrowUp: [0, -0.1, 1], ArrowDown: [0, 0.1, 1], '+': [0, 0, 0.85], '=': [0, 0, 0.85], '-': [0, 0, 1.18] }[ev.key];
    if (step) {
      ev.preventDefault();
      const p = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, polar + step[1]));
      const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, dist * step[2]));
      setView({ target: controls.target, dist: d, polar: p, azim: az + step[0] });
    } else if (ev.key === ' ' && current) {
      ev.preventDefault();
      await ensureAudio();
      setMotor(!motorOn);
    } else if (ev.key === 'Escape' && state.view !== 'campus') {
      goBack();
    }
  });
}

function hoverAt(ev) {
  const pp = platterPoint(ev);
  const h = pick(ev);
  const onGroove = pp && pp.rho > RIN - 20 && pp.rho < ROUT + 20 && current && !h;
  els.canvas.classList.toggle('is-pointing', !!h || !!onGroove);
  ring.hover = pp && !h && pp.rho > RIN - 2 && pp.rho < ROUT + 2 ? bandAt(ring.layout, pp.rho) : -1;
  ring.hoverPsi = pp ? pp.psi : 0;
  setHover(h ? (h.zone || placeById.get(h.place).z) : null);
  state.hoverPlace = h && h.place ? h.place : null;
}

function setHover(id) {
  if (state.hover === id) return;
  state.hover = id;
  document.querySelectorAll('.zones button').forEach((b) => b.classList.toggle('is-hover', b.dataset.zone === id));
}

function clickAt(ev) {
  if (rec) return;
  const h = pick(ev);
  if (state.placing) { if (h && h.place) placeDisc(state.placing, h.place); return; }
  if (state.pickPlace) { if (h && h.place) answerPlace(h.place); return; }
  if (!h) { if (state.view !== 'campus') goBack(); return; }
  if (h.place) { openPlace(h.place); return; }
  if (state.view === 'place' && h.zone === state.zone) { selectZone(h.zone); return; }
  selectZone(h.zone === state.zone && state.view === 'zone' ? null : h.zone);
}

function focusCard(sel) {
  const b = els.card.querySelector(sel);
  if (b && document.activeElement !== els.canvas) b.focus();
}

function selectZone(id) {
  state.view = id ? 'zone' : 'campus';
  state.zone = id;
  state.place = null;
  state.person = null;
  updatePins();
  setView(id ? zoneView(id) : HOME);
  renderCard();
  focusCard(id ? '.back' : `.zones button[data-zone="${lastZone}"]`);
  if (id) lastZone = id;
}

function openPlace(pid) {
  const p = placeById.get(pid);
  state.view = 'place';
  state.place = pid;
  state.zone = p.z;
  state.person = null;
  updatePins();
  if (!state.landed || entries.find((e) => e.id === state.landed.id)?.placeId !== pid) state.landed = null;
  const o = pinObj.get(pid);
  setView({ target: new THREE.Vector3(o.group.position.x, TILE_TOP, o.group.position.z), dist: 980, polar: Math.min(controls.getPolarAngle(), 0.92) });
  renderCard();
  focusCard('.back');
}

function openMine(fly = true) {
  state.view = 'mine';
  state.place = null;
  state.zone = null;
  state.person = 'me';
  updatePins();
  if (fly) setView(HOME); else setView(HOME, false, 1400);
  renderCard();
  focusCard('.back');
  openShelf();
}

/** 一个人的柜子：TA 在北航一个学期一个学期留下的声音；三维里 TA 的盘亮成黄色，标出 TA 去过的地点。 */
function openPerson(key) {
  if (key === 'me') { openMine(); return; }
  state.view = 'person';
  state.place = null;
  state.zone = null;
  state.person = key;
  updatePins();
  setView(HOME);
  renderCard();
  focusCard('.back');
}

function goBack() {
  if (rec) return;
  if (state.view === 'place') selectZone(state.zone);
  else selectZone(null);
}

// ====================================================================================
// 听一段示例：不开麦克风。页面按配方现场做一段声音（examples.js），交给听声寻片去认（shelf-worker.js → find.js，判定与主页同一段）。
// 认出来：镜头飞到那根针，外圈从示例换成原盘，接着认出的那一秒往下放——声音不断。
// 只给候选：两根针一起亮，不自动放。没认出：说原因，再按声音的整体样子猜两处地方，问「是这里吗」。
// 示例是「一段示例」：不入库、不计数、没有地点（SPEC-DIGEST-1 §2 模拟查询样本）；猜和答都只留在这一页（state.guess）。
// ====================================================================================
const EXAMPLES = [
  ['wall', '隔着一堵墙', '柜里一张盘的一段，隔墙听：有回声、发闷、带底噪'],
  ['mix', '两张叠在一起', '柜里两处地方的两张，一样响地叠着放'],
  ['fresh', '柜里没有的一段', '同一类声音新做的一段，柜里没有这一张'],
];
let shelfWorker = null, shelfReady = null, listen = null;
const rejectedPlaces = new Set();      // 这一页里说过「都不是」的地点：同一页里不再拿来问

function shelfCall(msg, want) {
  return new Promise((resolve, reject) => {
    const on = ({ data }) => {
      if (data.type !== want && data.type !== 'error') return;
      shelfWorker.removeEventListener('message', on);
      if (data.type === 'error') reject(new Error(data.message)); else resolve(data);
    };
    shelfWorker.addEventListener('message', on);
    shelfWorker.postMessage(msg);
  });
}
/** 第一次点示例时才摆柜（1 MB 声纹 + 重建索引在后台线程里，约一两秒）；之后复用。 */
function loadShelf() {
  if (shelfReady) return shelfReady;
  shelfWorker = new Worker(new URL('./shelf-worker.js', import.meta.url), { type: 'module' });
  const discs = entries.filter((e) => e.source === 'concept').map((e) => ({ id: e.id, placeId: e.placeId, seconds: e.seconds, synth: e.synth }));
  shelfReady = shelfCall({ type: 'load', base: new URL('./derived/', import.meta.url).href, discs }, 'loaded')
    .catch((err) => { shelfReady = null; shelfWorker.terminate(); shelfWorker = null; throw err; });
  return shelfReady;
}

const placeName = (pid) => (placeById.get(pid) || {}).name || pid;
const discPlace = (id) => (entries.find((e) => e.id === id) || {}).placeId;
function liveSay(t) { const el = els.card.querySelector('.ex-say'); if (el) el.textContent = t; say(t); }

async function runExample(which) {
  if (!renderer || rec || !EXAMPLES.some((x) => x[0] === which)) return null;
  if (listen) stopListen();
  const tok = { which, phase: 'load' };
  state.find = tok; state.guess = null; state.pickPlace = false; state.flash = [];
  if (state.view !== 'campus') selectZone(null); else renderCard();
  say('在摆示例柜，第一次要几秒…');
  try {
    await ensureAudio();
    await loadShelf();
    if (state.find !== tok) return null;
    const out = await shelfCall({ type: 'run', which, exclude: [...rejectedPlaces] }, 'result');
    if (state.find !== tok) return null;
    const label = EXAMPLES.find((x) => x[0] === which);
    const ex = { id: `example-${which}`, source: 'example', note: label[1], seconds: out.len, placeId: null, slot: null };
    tok.out = out; tok.phase = 'listen';
    listen = { tok, end: out.seconds, shown: 0, done: false, at: 0 };
    await loadClip(ex, false, { pcm: out.exPcm, fs: out.fs, tex: out.exTex });
    platterMat.uniforms.uCut.value = 0;            // 刻纹随放到的秒数一圈圈露出来（frame 里跟着走）
    player.port.postMessage({ buffer: out.exPcm, sampleRate: out.fs });
    report = { pos: 0, rate: 0, t: ctx.currentTime };
    setMotor(true);
    setView(HOME);
    liveSay(words.listening(MAX_LISTEN));
    return findSummary();
  } catch (err) {
    if (state.find === tok) { tok.phase = 'error'; tok.msg = String(err.message || err); renderCard(); say(`示例没做出来：${tok.msg}`); }
    return null;
  }
}

/** 听示例时的「放到第几秒」：示例自己的时间，只增不减（盘一圈圈绕回时 playSeconds 会回到 0，这里不跟着回）；没在听就是 null。 */
function listenSec() {
  if (!listen || listen.done || !current || current.e.source !== 'example') return null;
  const p = playSeconds();
  listen.at = p + 0.5 < listen.at ? listen.end : Math.max(listen.at, p);
  return Math.min(listen.at, listen.end);
}

/** 每帧：放到第 L 秒，才揭晓第 L 秒那次判读（它只用了前 L 秒的声音）。 */
function stepListen(sec) {
  const L = listen;
  const looks = L.tok.out.looks;
  while (L.shown < looks.length && looks[L.shown].at <= sec + 1e-3) {
    const lk = looks[L.shown++];
    if (lk.at < L.end - 1e-3) liveSay(words.look(lk.at));
  }
  const clock = els.card.querySelector('.ex-clock');
  if (clock) clock.textContent = `${sec.toFixed(1)} 秒`;
  if (sec >= L.end - 1e-3) { L.done = true; finishListen(); }
}

function stopListen(msg) {
  if (!listen) return;
  const tok = listen.tok;
  listen = null;
  tok.phase = 'stopped';
  setMotor(false, true);
  if (msg) say(msg);
}

function finishListen() {
  const tok = listen.tok, out = tok.out;
  const heard = playSeconds();                   // 实际放到的这一秒（软渲染一帧很长时会比判读点多出不少，接上的位置跟着实际的走，声音才不跳）
  listen = null;
  tok.phase = 'done';
  if (out.tier === 'match') {
    const d = entries.find((e) => e.id === out.match.id);
    const dur = out.disc.pcm.length / out.fs;
    const pos = resumeAt(out.match, heard, dur);
    tok.pos = pos;
    tok.line = words.match(placeName(d.placeId), out.seconds, pos);
    state.flash = [d.placeId];
    state.flashKind = 'fix';                       // 海图记号：回放层对上了原盘 = 定位圈（fix）
    loadClip(d, false, { pcm: out.disc.pcm, fs: out.fs, tex: out.disc.tex });
    // 换盘不换声：worklet 换缓冲后直接跳到对上的位置、按原速走（不起转、不落针，针一直在纹里）
    player.port.postMessage({ buffer: out.disc.pcm, sampleRate: out.fs });
    player.port.postMessage({ seek: pos / dur, rate: 1 });
    report = { pos: pos * out.fs, rate: 1, t: ctx.currentTime };
    setMotor(true, true);
    seekT = 0;
    const pg = pinObj.get(d.placeId).group.position;
    setView({ target: new THREE.Vector3(pg.x, TILE_TOP, pg.z).lerp(new THREE.Vector3(0, TILE_TOP, -ROUT), 0.35), dist: 1900, polar: 0.82 });
  } else {
    setMotor(false, true);
    if (out.tier === 'candidate') {
      tok.line = words.candidate(out.candidates.map((id) => placeName(discPlace(id))));
      state.flash = out.candidates.map(discPlace);
      state.flashKind = 'ep';                      // 两张都像、分不开 = 推算位置（estimated position，方框）
    } else {
      tok.line = out.why;
      if (out.places.places.length) { tok.ask = out.places; state.guess = guessRecord(out.places); state.flash = out.places.places.slice(); state.flashKind = 'dr'; }   // 只按声音的样子猜 = 航迹推算（dead reckoning，半圆）
    }
  }
  updatePins();
  renderCard();
  say(tok.line);
}

/** 「是这里吗」的回答。pid = 用户点的那一处（候选里的，或「都不是」之后在地图上点的）。 */
function answerPlace(pid) {
  if (!state.guess || !placeById.has(pid)) return;
  state.guess = confirmRecord(state.guess, pid);
  state.pickPlace = false;
  state.flash = [pid];
  state.flashKind = 'user';
  updatePins();
  renderCard();
  say(`记下了：你说是「${placeName(pid)}」。`);
}
function noneOfThese() {
  if (!state.guess) return;
  for (const p of state.find.ask.places) rejectedPlaces.add(p);
  state.guess = noneRecord(state.guess);
  state.pickPlace = true;            // 不自动填最近的那处：等用户自己指
  state.flash = [];
  renderCard();
  say('那是哪里？在左边的校园里点一根针；不知道就点「不填了」。');
}

function findSummary() {
  const f = state.find;
  if (!f) return null;
  const o = f.out;
  return { which: f.which, phase: f.phase, line: f.line || null, pos: f.pos ?? null,
    tier: o ? o.tier : null, seconds: o ? o.seconds : null, match: o && o.match ? o.match.id : null, matchPlace: o && o.match ? discPlace(o.match.id) : null,
    candidates: o ? o.candidates : [], candidatePlaces: o ? o.candidates.map(discPlace) : [], places: o ? o.places : null,
    threshold: o ? o.threshold : null, N: o ? o.N : null, same: o ? o.same : null, looks: o ? o.looks.map((l) => l.at) : [] };
}

/** 错开曲线：示例和盘错开多少秒（横）→ 那个错法上对上的特征（竖）。口径与判定同一个（shelf.js offsetCurve）。不标数字。 */
function curveSVG(out) {
  const cs = out.curves.filter((c) => c.bins.length);
  if (!cs.length) return '';
  const W = 300, H = 76;
  const lo = Math.min(...cs.map((c) => c.from)), hi = Math.max(...cs.map((c) => c.from + c.bins.length * c.step));
  const top = Math.max(out.threshold * 1.25, ...cs.map((c) => c.best));
  const x = (f) => (((f - lo) / Math.max(1, hi - lo)) * W).toFixed(1), y = (v) => (H - 3 - (v / top) * (H - 8)).toFixed(1);
  const lines = cs.map((c, i) => `<polyline class="c${i}" points="${c.bins.map((v, k) => `${x(c.from + k * c.step)},${y(v)}`).join(' ')}"/>`).join('');
  const off = cs[0].bestOff / 100;
  const cap = out.tier === 'match'
    ? `示例和柜里每张盘逐一错开比对。和「${placeName(discPlace(cs[0].id))}」那张错开 ${off.toFixed(2)} 秒时，特征成片对上，竖起来的就是那一下；别的错法都贴着底。虚线是认定的门槛。`
    : out.tier === 'candidate'
      ? '两张都在同一个错法上竖起来、都过了虚线，可谁也没比另一张高出一半，所以只给候选，不替你挑。'
      : '最像的那张也一直贴着底走，没有哪个错法竖起来过虚线：柜里没有这段声音。';
  return `<figure class="ex-curve"><svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <line class="th" x1="0" x2="${W}" y1="${y(out.threshold)}" y2="${y(out.threshold)}"/>${lines}</svg>
    <figcaption>${esc(cap)}</figcaption></figure>`;
}

function askHTML(f) {
  if (!f.ask || !state.guess) return '';
  const g = state.guess, guessed = f.ask.places.map((p) => `「${placeName(p)}」`).join('、');
  if (g.placeFrom === 'user') return `<p class="ex-ask">记下了：你说是「${esc(placeName(g.userPlaceId))}」（猜的是 ${esc(guessed)}）。示例不入库，这一条只留在这一页。</p>`;
  if (state.pickPlace) return `<p class="ex-ask">那是哪里？在左边的校园里点一根针。</p><div class="row"><button type="button" class="act ghost" data-ask="skip">不填了</button></div>`;
  if (f.skipped) return '<p class="ex-ask">地点空着。没人指认的地方，它不替你填。</p>';
  return `<p class="ex-ask">${f.ask.weak ? '最接近的一处，可能也不对。' : '听起来像这'}${f.ask.weak ? '' : `${f.ask.places.length === 1 ? '一' : '两'}处地方。`}是这里吗？</p>
    <div class="row">${f.ask.places.map((p) => `<button type="button" class="act" data-ask="${esc(p)}">是「${esc(placeName(p))}」</button>`).join('')}<button type="button" class="act ghost" data-ask="none">都不是</button></div>
    <p class="fine">这是按声音的整体样子猜的（地点层），常常不对；它只出候选，地点由你定。</p>`;
}

function exampleHTML() {
  if (!renderer) return '';
  const f = state.find;
  const btns = EXAMPLES.map(([k, t, d]) => `<li><button type="button" class="ex-btn" data-ex="${k}" aria-pressed="${!!(f && f.which === k)}"><span class="t">${esc(t)}</span><span class="d">${esc(d)}</span></button></li>`).join('');
  let body = '';
  if (f && f.phase === 'load') body = '<p class="ex-live"><span class="ex-say">在摆示例柜，第一次要几秒…</span></p>';
  else if (f && f.phase === 'listen') body = `<p class="ex-live"><span class="ex-clock">0.0 秒</span><span class="ex-say">${esc(words.listening(MAX_LISTEN))}</span></p>`;
  else if (f && f.phase === 'done') {
    const cands = f.out.tier === 'candidate' ? `<div class="row">${f.out.candidates.map((id) => `<button type="button" class="act ghost" data-cand="${esc(id)}">听「${esc(placeName(discPlace(id)))}」那张</button>`).join('')}</div>` : '';
    body = `<p class="ex-result is-${f.out.tier}">${esc(f.line)}</p>${curveSVG(f.out)}${cands}${askHTML(f)}`;
  } else if (f && f.phase === 'error') body = `<p class="ex-result">示例没做出来：${esc(f.msg)}</p>`;
  return `<section class="examples" aria-labelledby="ex-h">
    <h3 class="sub" id="ex-h">听一段示例</h3>
    <p class="fine">不开麦克风；判定和主页寻片是同一套。</p>
    <ul class="ex-list">${btns}</ul>${body}
  </section>`;
}

function wireExamples() {
  els.card.querySelectorAll('.ex-btn').forEach((b) => b.addEventListener('click', () => runExample(b.dataset.ex)));
  els.card.querySelectorAll('[data-cand]').forEach((b) => b.addEventListener('click', () => { const e = entries.find((x) => x.id === b.dataset.cand); if (e) loadClip(e); }));
  els.card.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.ask;
    if (v === 'none') noneOfThese();
    else if (v === 'skip') { state.pickPlace = false; state.find.skipped = true; renderCard(); say('地点空着。'); }
    else answerPlace(v);
  }));
}

// ====================================================================================
// 馆藏卡
// ====================================================================================
function slotBar() {
  const fs = document.createElement('fieldset');
  fs.className = 'slots';
  fs.innerHTML = '<legend>时段</legend>';
  for (const s of [null, ...SLOTS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s || '全天';
    b.setAttribute('aria-pressed', String(state.slot === s));
    b.addEventListener('click', () => {
      state.slot = s;
      fs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      updatePins();
      renderCard();
      say(s ? `只看「${s}」的声片。` : '看全天的声片。');
    });
    fs.appendChild(b);
  }
  els.stage.appendChild(fs);
}
slotBar();
function updateCab() {
  if (!els.cab) return;
  const n = entries.filter((e) => e.mine).length;
  els.cab.querySelector('.n').textContent = n ? `${n} 张` : '';
}
if (els.cab) { els.cab.addEventListener('click', () => openMine()); updateCab(); }

/** 句子里的数字排成大号的数（只换字形，不改字）：总览那句「16 个学期 · 16 个地点 · 272 张藏片」。 */
const numerals = (text) => String(text).split(/(\d+)/).map((x, i) => (i % 2 ? `<b class="num">${x}</b>` : esc(x))).join('');   // 先切再转义：实体（&#39;）里的数字不会被拆开
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
// 落款：只有真实的盘才说「谁」；概念盘没有人，不说「没落款」（那等于说有个人没签名）
const who = (e) => (tierOf(e) !== 'real' ? '' : e.author && signature(e.author) !== '未落款' ? signature(e.author) : '没落款');
const status = (e) => (e.source === 'archive' ? '已入馆' : e.submittedAt ? '已投稿，等馆员' : '在我的柜子里');
const titled = (...xs) => xs.filter(Boolean).join(' · ');
const when = (e) => (e.source === 'concept' ? semesterLabel(e.semester) : whenOf(e));

/** 年轮：一个学期一圈，最里是最早的学期；圈上的点按一天里的钟点排（子夜在顶上）。我的点是示波黄。
 *  rings 可以是一个地点的（ringsOf），也可以是一个人的（ringsOfList）。 */
function ringSVG(rings, tail = '一个点是一张声片，按一天里的钟点排；黄色的是你的。') {
  rings = rings.slice();
  if (NOW_SEM && (!rings.length || rings.at(-1).semester !== NOW_SEM)) rings.push({ semester: NOW_SEM, items: [], empty: true });
  const n = rings.length, C = 130, rIn = n > 1 ? 30 : 70, rOut = 112;
  const rr = (i) => (n > 1 ? rIn + ((rOut - rIn) * i) / (n - 1) : rOut);
  const parts = [];
  rings.forEach((g, i) => {
    parts.push(`<circle class="ring${g.empty ? ' is-empty' : ''}${g.semester === NOW_SEM ? ' is-now' : ''}" cx="${C}" cy="${C}" r="${rr(i).toFixed(1)}"/>`);
  });
  // 钟点刻度
  for (const [h, t] of [[0, '子夜'], [6, '六时'], [12, '正午'], [18, '十八时']]) {
    const a = (h / 24) * Math.PI * 2, x = C + Math.sin(a) * 124, y = C - Math.cos(a) * 124;
    parts.push(`<text class="hour-mark" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${t}</text>`);
  }
  rings.forEach((g, i) => {
    for (const e of g.items) {
      const a = (hourAngle(e.at) * Math.PI) / 180, r = rr(i);
      const on = state.clip && state.clip.id === e.id;
      const cls = ['dot', e.mine ? 'is-mine' : '', on ? 'is-on' : '', inView(e) ? '' : 'is-off', state.landed && state.landed.id === e.id ? 'is-new' : ''].filter(Boolean).join(' ');
      parts.push(`<circle class="${cls}" data-id="${e.id}" cx="${(C + Math.sin(a) * r).toFixed(1)}" cy="${(C - Math.cos(a) * r).toFixed(1)}" r="${on || e.mine ? 5.2 : 4.2}"><title>${esc(titled(when(e), who(e)))}</title></circle>`);
    }
  });
  const first = rings[0], last = rings.at(-1);
  const legend = n > 1 ? `最里一圈是 ${semesterLabel(first.semester)}，最外一圈是 ${semesterLabel(last.semester)}${last.empty ? '（还空着）' : ''}。` : `这一圈是 ${semesterLabel(last.semester)}${last.empty ? '，还空着' : ''}。`;
  return `<figure class="rings"><svg viewBox="-24 -6 308 272" aria-hidden="true">${parts.join('')}</svg>
    <figcaption>${legend}${tail}</figcaption></figure>`;
}

function landedHTML(pid) {
  const L = state.landed;
  if (!L || entries.find((e) => e.id === L.id)?.placeId !== pid) return '';
  const meId = lib.me();
  const signed = meId && (meId.grade || meId.dept || meId.name);
  return `<section class="landed" aria-labelledby="landed-h">
    <h3 id="landed-h">落在这里了</h3>
    <p>${esc(L.line)}</p>
    ${signed ? `<p class="sig">落款：${esc(signature(meId))}</p>` : sigForm('给这张落个款')}
    <div class="row"><button type="button" class="act" data-act="submit" data-id="${L.id}">投稿入馆</button><button type="button" class="act ghost" data-act="mine">看我的</button></div>
    ${L.stored ? '' : '<p class="warn">这台设备的本地库写不进去：这张只在内存里，刷新就没了。</p>'}
  </section>`;
}

/** 这个地点以前的声音（史料）：单独一栏，标「史料」，不进年轮、不算张数。没有就整栏不出。 */
function pastHTML(pid) {
  const past = pastAt(pid), facts = placeFacts(pid);
  if (!past.length) return '';
  const li = past.map((h) => {
    const on = state.clip && state.clip.id === h.id;
    const d = h.dateKind === 'event' ? dayText(h.date) : `${h.date.slice(0, 4)} 年发布`;
    return `<li><button type="button" class="voice past" data-past="${h.id}" aria-pressed="${on}">
      <span class="w"><b class="tier">史料</b>${esc(d)}</span><span class="a">${esc(h.src.uploader)}</span><span class="t">${esc(h.what)}</span></button></li>`;
  }).join('');
  const fx = facts.map((f) => `<li>${esc(f.text)}<a href="${esc(f.src)}" rel="noreferrer" target="_blank">出处</a></li>`).join('');
  return `<section class="past-wrap" aria-labelledby="past-h">
    <h3 class="sub" id="past-h">这里以前的声音</h3>
    ${fx ? `<ul class="facts">${fx}</ul>` : ''}
    <ol class="voices">${li}</ol>
  </section>`;
}

function sigForm(title) {
  const id = lib.me() || {};
  return `<form class="sig-form" aria-label="${esc(title)}">
    <p class="sig-title">${esc(title)}</p>
    <div class="sig-fields">
      <label>年级<input name="grade" maxlength="12" placeholder="2024级" value="${esc(id.grade || '')}" autocomplete="off"></label>
      <label>院系<input name="dept" maxlength="24" placeholder="宇航学院" value="${esc(id.dept || '')}" autocomplete="off"></label>
      <label>名字<input name="name" maxlength="16" placeholder="可以是昵称" value="${esc(id.name || '')}" autocomplete="off"></label>
    </div>
    <p class="fine">卡号不公开。</p>
    <button type="submit" class="act">落款</button>
  </form>`;
}

function renderCard() {
  const v = state.view;
  if (v !== 'campus') { if (listen) stopListen('换了视图，示例停了。'); state.flash = []; state.pickPlace = false; }
  if (v !== 'mine') closeShelf();
  if (v === 'campus') return renderCampus();
  if (v === 'zone') return renderZone();
  if (v === 'place') return renderPlace();
  if (v === 'person') return renderPerson();
  return renderMine();
}

/** 年份：全部 / 本学期 / 有声片的每一年。筛的是钉点上的盘、分区张数和列表；年轮里筛掉的点变淡，不消失。 */
function timeBar() {
  const years = [...new Set(entries.map(yearOf))].filter(Number.isFinite).sort((a, b) => b - a);
  if (years.length < 2) return '';
  const opts = [[null, '全部年份'], ...(NOW_SEM ? [['now', `本学期 ${semesterLabel(NOW_SEM)}`]] : []), ...years.map((y) => [y, `${y}`])];
  return `<div class="years" role="group" aria-label="按年份看">${opts.map(([v, t]) => `<button type="button" data-time="${v ?? ''}" aria-pressed="${state.time === v}">${esc(t)}</button>`).join('')}</div>
    <p class="fine ages"><i class="sw now"></i>本学期<i class="sw old"></i>越早越浅<i class="sw me"></i>你的</p>`;
}
const timeWord = () => (state.time == null ? '' : state.time === 'now' ? '本学期' : `${state.time} 年`);
function wireTime() {
  els.card.querySelectorAll('.years button').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.time;
    state.time = v === '' ? null : v === 'now' ? 'now' : Number(v);
    updatePins();
    renderCard();
    focusCard(`.years button[data-time="${v}"]`);
    say(state.time == null ? '看全部年份的声片。' : `只看${timeWord()}留下的声片。`);
  }));
}
/** 一行声片（地点卡、分区卡、柜子共用）。head 是左上那格的字。 */
function voiceRow(e, head, extra = '') {
  const on = state.clip && state.clip.id === e.id;
  return `<li><button type="button" class="voice${e.mine ? ' is-mine' : ''}${inView(e) ? '' : ' is-off'}" data-id="${e.id}" aria-pressed="${on}">
    <span class="w">${esc(head)}</span><span class="a">${esc(who(e))}${e.mine ? '（你）' : ''}</span>${e.note ? `<span class="t">${esc(e.note)}</span>` : ''}</button>${extra}</li>`;
}
function wireVoices() {
  els.card.querySelectorAll('.voice:not(.past)').forEach((b) => b.addEventListener('click', () => { const e = entries.find((x) => x.id === b.dataset.id); if (e) loadClip(e); }));
  els.card.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => openPerson(b.dataset.person)));
}
const md = (e) => { const d = new Date(e.at); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

function renderPerson() {
  const key = state.person;
  const list = entries.filter((e) => personOf(e) === key);
  const a = (list.find((e) => e.author) || {}).author;
  const name = a ? signature(a) : '没落款的人';
  const rings = ringsOfList(list);
  const groups = rings.slice().reverse().map((g) => `<h3 class="sub">${esc(semesterLabel(g.semester))}<span class="n">${g.items.length} 张</span></h3>
    <ol class="voices">${g.items.slice().reverse().map((e) => voiceRow(e, `${e.place} · ${when(e).split(' · ').slice(1).join(' · ')}`)).join('')}</ol>`).join('');
  els.card.innerHTML = `
    <button type="button" class="back">全部分区</button>
    <p class="kicker">柜子</p>
    <h2>${esc(a && a.name ? a.name : name)}</h2>
    <p class="lede">${esc(personLine(list, name))}左边的校园里，黄色的盘是 TA 的。</p>
    ${ringSVG(rings, '一个点是 TA 的一张，按一天里的钟点排。')}
    ${groups}`;
  els.card.querySelector('.back').addEventListener('click', goBack);
  wireVoices();
}

function renderCampus() {
  const list = entries.filter(inView);
  const mineN = entries.filter((e) => e.mine).length;
  els.card.innerHTML = `
    <h1>${EMBED ? HOME_LINE : '学院路馆藏'}</h1>
    ${placingHTML()}
    <p class="lede">${numerals(campusLine(allShown(), NOW_SEM, (id) => placeById.has(id)))}${state.slot ? `这会儿只看「${esc(state.slot)}」的。` : ''}点一个地点，看那里一个学期一个学期的声音；也可以在那里刻一张。</p>
    ${exampleHTML()}
    <button type="button" class="mine-link"><span>我的柜子</span><span class="n">${mineN ? `${mineN} 张` : '还没刻过'}</span></button>
    ${timeBar()}
    <ul class="zones">${campus.zones.map((z) => {
      const c = counts(list.filter((e) => e.zoneId === z.id)).total;
      return `<li><button type="button" data-zone="${z.id}"><span>${esc(z.name)}</span><span class="n">${c ? `${c} 张` : '还空着'}</span></button></li>`;
    }).join('')}</ul>
    ${otdHTML(entries.filter((e) => tierOf(e) === 'real'))}
    ${peopleHTML(entries.filter((e) => tierOf(e) === 'real'))}
    ${archivalHTML()}`;
  els.card.querySelector('.mine-link').addEventListener('click', () => openMine());
  const skip = els.card.querySelector('[data-act="unplaced"]');
  if (skip) skip.addEventListener('click', () => { state.placing = null; renderCard(); say('先放在柜子里了。以后在柜子里还能补地点。'); });
  wireActs();
  wireTime();
  wireVoices();
  wireExamples();
  wireArchival();
  els.card.querySelectorAll('.zones button').forEach((b) => {
    b.addEventListener('click', () => selectZone(b.dataset.zone));
    b.addEventListener('mouseenter', () => setHover(b.dataset.zone));
    b.addEventListener('mouseleave', () => setHover(null));
    b.addEventListener('focus', () => setHover(b.dataset.zone));
    b.addEventListener('blur', () => setHover(null));
  });
}

/** 刚刻好、还没地点的那张：问一句在哪儿录的。不问也行——盘已经在柜子里了。 */
function placingHTML() {
  const e = state.placing && entries.find((x) => x.id === state.placing);
  if (!e) return '';
  const meId = lib.me(), signed = meId && (meId.grade || meId.dept || meId.name);
  return `<section class="landed is-unplaced" aria-labelledby="placing-h">
    <h3 id="placing-h">刻好了 · ${esc(e.seconds.toFixed(1))} 秒</h3>
    <p>在哪儿录的？在校园里点一根针，它就落到那里。</p>
    ${signed ? '' : sigForm('顺手落个款（可以不填）')}
    <div class="row"><button type="button" class="act ghost" data-act="unplaced">先放进柜子</button></div>
    ${state.landed && state.landed.id === e.id && !state.landed.stored ? '<p class="warn">这台设备的本地库写不进去：这张只在内存里，刷新就没了。</p>' : ''}
  </section>`;
}
/** 往年的这几天（前后 7 天）：只列真实的盘——概念盘没有「哪一天」。没有就整栏不出。 */
function otdHTML(real) {
  const list = onThisDay(real, new Date(), 7).slice(0, 3);
  if (!list.length) return '';
  return `<h3 class="sub">往年的这几天</h3><ol class="voices">${list.map((e) => voiceRow(e, `${md(e)} · ${e.place}`)).join('')}</ol>`;
}
/** 留下声音最多的几个人：只数真实的盘，点名字进 TA 的柜子。没落款的不列。 */
function peopleHTML(real) {
  const by = new Map();
  for (const e of real) { const k = personOf(e); if (!k || k === 'me') continue; if (!by.has(k)) by.set(k, { a: e.author, n: 0, sems: new Set() }); const o = by.get(k); o.n++; o.sems.add(e.semester); }
  const top = [...by.entries()].sort((x, y) => y[1].sems.size - x[1].sems.size || y[1].n - x[1].n).slice(0, 6);
  if (!top.length) return '';
  return `<h3 class="sub">打开一个人的柜子</h3>
    <ul class="people">${top.map(([k, o]) => `<li><button type="button" data-person="${esc(k)}"><span>${esc(o.a.name || signature(o.a))}</span><span class="n">${esc([o.a.grade, o.a.dept].filter(Boolean).join(' · '))}</span><span class="n">${o.sems.size} 个学期 · ${o.n} 张</span></button></li>`).join('')}</ul>`;
}
/** 史料一栏：馆藏目录里的全部史料，按集分组、默认收起。有文案（copy）的写文案，没有的只写事实层（集名 @ 时间点 + 出处）。 */
function archivalHTML() {
  if (!archival.length) return '';
  const groups = new Map();
  for (const e of archival) { const g = String(e.note || '').split(' · ')[0] || '史料'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); }
  const body = [...groups.entries()].map(([g, items]) => `<details class="arc-group" data-group="${esc(g)}"${arcOpen.has(g) ? ' open' : ''}><summary>${esc(g)}<span class="n">${counts(items).total} 段</span></summary>
    <ol class="voices">${items.map((e) => {
      const on = state.clip && state.clip.id === e.id;
      const at = String(e.note || '').split(' · ').slice(1).join(' · ');
      return `<li><button type="button" class="voice past" data-arc="${esc(e.id)}" aria-pressed="${on}"><span class="w"><b class="tier">史料</b>${esc(at || e.no)}</span><span class="a">${esc(e.no)}</span>${e.copy ? `<span class="t">${esc(e.copy)}</span>` : ''}</button></li>`;
    }).join('')}</ol></details>`).join('');
  return `<section class="arc-wrap" aria-labelledby="arc-h">
    <h3 class="sub" id="arc-h">史料<span class="n">${counts(archival).total} 段</span></h3>
    ${body}
  </section>`;
}
const arcOpen = new Set();             // 史料一栏里展开着的集：卡片重画（换盘时）不收起
function wireArchival() {
  els.card.querySelectorAll('.arc-group').forEach((d) => d.addEventListener('toggle', () => { if (d.open) arcOpen.add(d.dataset.group); else arcOpen.delete(d.dataset.group); }));
  els.card.querySelectorAll('[data-arc]').forEach((b) => b.addEventListener('click', () => {
    const e = archival.find((x) => x.id === b.dataset.arc);
    if (e) loadClip(e).then(() => { const nb = els.card.querySelector(`[data-arc="${e.id}"]`); if (nb) nb.focus(); });
  }));
}

function renderZone() {
  const z = zoneById.get(state.zone);
  const list = entries.filter((e) => e.zoneId === z.id);
  const places = campus.places.filter((p) => p.z === z.id);
  const recent = list.filter(inView).slice(-6).reverse();
  const rows = places.map((p) => {
    const cells = SLOTS.map((s) => {
      const es = list.filter((e) => e.placeId === p.id && e.slot === s).slice(-4);
      const btns = es.map((e) => {
        const on = state.clip && state.clip.id === e.id;
        const off = !inView(e);
        return `<button type="button" class="clip${off ? ' is-off' : ''}${e.mine ? ' is-mine' : ''}" data-id="${e.id}" aria-pressed="${on}" aria-label="${esc([p.name, when(e), who(e), e.note].filter(Boolean).join('，'))}" title="${esc(titled(when(e), who(e)))}"></button>`;
      }).join('');
      return `<td class="${state.slot === s ? 'is-slot' : ''}"><div class="cell">${btns}</div></td>`;
    }).join('');
    const past = pastAt(p.id).length;
    return `<tr><th scope="row"><button type="button" class="place-link" data-place="${p.id}">${esc(p.name)}</button>${past ? ` <span class="tier" title="这里存着 ${past} 段史料">史料</span>` : ''}</th>${cells}</tr>`;
  }).join('');
  els.card.innerHTML = `
    <button type="button" class="back">全部分区</button>
    <h2>${esc(z.name)}</h2>
    <p class="lede">${places.length ? `${esc(tallyText(counts(list.filter(inView))) || '还没有声片')}，${places.length} 个地点。点地点名看它的年轮、在那里刻；点格子里的小盘就放（每格只列最近四张）。` : '这一片还没有钉点。'}</p>
    ${places.length ? `<table class="grid"><caption>${esc(z.name)}：地点与时段</caption>
      <thead><tr><th scope="col">地点</th>${SLOTS.map((s) => `<th scope="col" class="${state.slot === s ? 'is-slot' : ''}">${s}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>` : ''}
    ${recent.length ? `<h3 class="sub">这一片最近留下的${timeWord() ? `（${timeWord()}）` : ''}</h3><ol class="voices">${recent.map((e) => voiceRow(e, `${e.place} · ${when(e)}`)).join('')}</ol>` : ''}
    ${timeBar()}`;
  els.card.querySelector('.back').addEventListener('click', () => selectZone(null));
  wireTime();
  wireVoices();
  els.card.querySelectorAll('.place-link').forEach((b) => b.addEventListener('click', () => openPlace(b.dataset.place)));
  els.card.querySelectorAll('.clip').forEach((b) => b.addEventListener('click', () => {
    const e = entries.find((x) => x.id === b.dataset.id);
    loadClip(e).then(() => { const nb = els.card.querySelector(`.clip[data-id="${e.id}"]`); if (nb) nb.focus(); });
  }));
}

/** 唱片套子的正面：这个地点的一张照片，右边露出半张盘。照片是辅：它只是套子，声音才是里面的唱片。
 *  kind 'model' = 留声机上那座纸模型的照片（scripts/make-sleeve-photos.mjs 拍的）；'photo' = 团队实拍，要写拍摄人和日期。 */
function coverHTML(p) {
  const s = (sleeveData.places || {})[p.id];
  if (!s || !s.photo) return '';
  const real = s.kind === 'photo';
  const cap = real ? `实拍${s.by ? ' · ' + esc(s.by) : ''}${s.date ? ' · ' + esc(s.date) : ''}` : '模型照 · 拍的是留声机上的纸模型，不是实景';
  return `<figure class="cover${real ? ' is-photo' : ''}">
    <div class="cover-disc" aria-hidden="true"></div>
    <img src="${esc(s.photo)}" alt="${esc(p.name)}${real ? '的实拍照片' : '的纸模型照片'}" width="800" height="600" decoding="async">
    <figcaption>${cap}</figcaption>
  </figure>`;
}

function renderPlace() {
  const p = placeById.get(state.place);
  const z = zoneById.get(p.z);
  const here = entries.filter((e) => e.placeId === p.id).slice().reverse();
  const items = here.slice(0, 40).map((e) => voiceRow(e, when(e))).join('');
  els.card.innerHTML = `
    <button type="button" class="back">${esc(z.name)}</button>
    ${coverHTML(p)}
    <h2>${esc(p.name)}</h2>
    <p class="lede">${esc(placeLine(allAt(p.id), p.id, NOW_SEM))}</p>
    ${landedHTML(p.id)}
    ${ringSVG(ringsOf(entries, p.id))}
    ${pastHTML(p.id)}
    <button type="button" class="rec" aria-describedby="rec-note"><i aria-hidden="true"></i><span>按住，在这里刻十秒</span></button>
    <p class="fine" id="rec-note">麦克风只在按住时打开；键盘按空格。</p>
    ${items ? `<h3 class="sub">这里的声音</h3><ol class="voices">${items}</ol>${here.length > 40 ? `<p class="fine">只列最近 40 张，共 ${counts(here).total} 张。</p>` : ''}` : ''}`;
  wirePlace(p.id);
}

function wirePlace(pid) {
  els.card.querySelector('.back').addEventListener('click', goBack);
  const play = (id) => { const e = entries.find((x) => x.id === id); if (e) loadClip(e); };
  els.card.querySelectorAll('.voice:not(.past)').forEach((b) => b.addEventListener('click', () => play(b.dataset.id)));
  els.card.querySelectorAll('.voice.past').forEach((b) => b.addEventListener('click', () => {
    const h = history.find((x) => x.id === b.dataset.past);
    if (h) loadClip(h).then(() => { const nb = els.card.querySelector(`.voice.past[data-past="${h.id}"]`); if (nb) nb.focus(); });
  }));
  els.card.querySelectorAll('.rings .dot').forEach((c) => c.addEventListener('click', () => play(c.dataset.id)));
  const btn = els.card.querySelector('.rec');
  btn.addEventListener('pointerdown', (ev) => { if (ev.button === 0) { ev.preventDefault(); startRec(pid, 'hold', btn); } });
  btn.addEventListener('pointerup', () => { if (rec && rec.mode === 'hold') stopRec(); else if (rec) rec.released = true; });
  btn.addEventListener('pointerleave', () => { if (rec && rec.mode === 'hold' && rec.mic) stopRec(); });
  btn.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ' && ev.key !== 'Enter') return;
    ev.preventDefault();
    if (ev.repeat) return;
    if (rec) stopRec(); else startRec(pid, 'toggle', btn);
  });
  btn.addEventListener('click', (ev) => ev.preventDefault());
  wireActs();
}

function wireActs() {
  els.card.querySelectorAll('.act[data-act="submit"]').forEach((b) => b.addEventListener('click', () => submitOne(b.dataset.id)));
  els.card.querySelectorAll('.act[data-act="mine"]').forEach((b) => b.addEventListener('click', openMine));
  const f = els.card.querySelector('.sig-form');
  if (f) f.addEventListener('submit', (ev) => { ev.preventDefault(); saveSignature(new FormData(f)); });
}

/** 落款：存进刻声卡，并补到我还没投稿、还没落款的盘上（已投稿的盘落款跟着投稿包走，不改）。 */
async function saveSignature(fd) {
  const before = counts(allShown()).people;
  const id = lib.setMe({ grade: fd.get('grade'), dept: fd.get('dept'), name: fd.get('name') });
  myKey = await authorKey(id.uid);
  let n = 0;
  for (const e of entries) {
    if (!e.mine || e.source !== 'local' || e.submittedAt || (e.author && signature(e.author) !== '未落款')) continue;
    const d = e.disc || (e.rec && (await lib.discFromRecord(e.rec)));
    if (!d) continue;
    d.author = snapshot(id);
    try { await lib.saveDisc(d); } catch { /* 内存模式 */ }
    e.disc = d; e.rec = null;
    e.author = { grade: id.grade, dept: id.dept, name: id.name, key: myKey };
    n++;
  }
  if (state.landed) {
    const e = entries.find((x) => x.id === state.landed.id);
    if (e) state.landed.line = landingLine(entries, e, e.place, { mineCount: entries.filter((x) => x.mine).length, history });
  }
  renderCard();
  if (state.clip) showPlayer(state.clip);
  say(`落款是「${signature(id)}」${n ? `，补到了 ${n} 张还没投稿的盘上` : ''}。`);
  if (!before && counts(allShown()).people) firstParticipant(entries.filter((x) => x.mine).at(-1) || { author: id, at: new Date().toISOString() });
}

async function submitOne(eid) {
  const e = entries.find((x) => x.id === eid);
  if (!e || e.source !== 'local') return;
  const d = e.disc || (await lib.discFromRecord(e.rec));
  e.disc = d; e.rec = null;
  if (!d.author) d.author = snapshot(lib.ensureMe());
  const pack = await buildSubmission(d);
  d.submittedAt = new Date().toISOString();
  try { await lib.saveDisc(d); } catch { /* 内存模式：投稿包照样能下 */ }
  e.submittedAt = d.submittedAt;
  download(pack.name, pack.blob);
  showReceipt(d, pack.name);
  renderCard();
}

const receiptDlg = document.getElementById('receipt');
function showReceipt(d, name) {
  if (!receiptDlg) return;
  import('../submit.js').then(({ submitReceipt }) => {
    receiptDlg.querySelector('.paper').innerHTML = submitReceipt(d);
    receiptDlg.querySelector('.receipt-note').textContent = `投稿包「${name}」已经下载：声音、同意书和这张回执都在里面。把它交给馆员，入馆后会收到档案号和撤回码。页面不上传任何东西。`;
    receiptDlg.showModal();
  });
}
if (receiptDlg) receiptDlg.querySelector('.close').addEventListener('click', () => receiptDlg.close());

// —— 柜子：点「我的柜子」，背后那张盘虚下去、往左让；一只柜子从右边推进来，你刻过的盘一张张立在搁板上 ——
// 只放你自己的盘（公开馆藏另有地方看）。套封上的纹是这张盘的单条能量包络（receipt.js discFace，第四轮验过：听不出内容），不是完整刻纹。
// 抽出一张：套封往上一抽、柜子退出去、盘回到唱机上落针。每张下面只写真的：哪天、哪个时段、在哪、几秒、在不在馆里。
const shelfEl = document.getElementById('shelf');
const faceCache = new Map();
async function texOf(e) {
  if (e.disc && e.disc.tex) return e.disc.tex;
  if (e.rec && e.rec.tex) return e.rec.tex instanceof Uint8Array ? e.rec.tex : new Uint8Array(e.rec.tex);
  return null;
}
async function openShelf() {
  if (!shelfEl) return;
  const mine = entries.filter((e) => e.mine).slice().reverse();
  const rows = [];
  const PER = matchMedia('(max-width: 880px)').matches ? 3 : 5;
  for (let i = 0; i < Math.max(2, Math.ceil((mine.length + 1) / PER)); i++) rows.push(mine.slice(i * PER, i * PER + PER));
  const sleeve = async (e) => {
    let face = faceCache.get(e.id);
    if (!face) { const t = await texOf(e); face = t ? discFace(t, e.seconds) : ''; faceCache.set(e.id, face); }
    const d = new Date(e.at);
    const day = `${d.getMonth() + 1} 月 ${d.getDate()} 日`, slot = SLOT_WORD[e.slot] || e.slot || '';
    return `<li><button type="button" class="sleeve" data-id="${esc(e.id)}" aria-label="${esc([e.place || '还没有地点', day, slot, `${(e.seconds || 0).toFixed(1)} 秒`].join('，'))}">
      <span class="disc"><svg viewBox="-1.05 -1.05 2.1 2.1" aria-hidden="true">${face}</svg></span>
      <span class="jacket"><b>${esc(e.place || '还没有地点')}</b><i>${esc(semesterLabel(e.semester))}</i></span></button>
      <p class="tag-line">${esc(day)} · ${esc(slot)} · ${(e.seconds || 0).toFixed(1)} 秒</p>
      <p class="tag-line dim">${esc(e.source === 'archive' ? '已入馆' : e.submittedAt ? '已投稿' : '在柜子里')}${e.note ? ` · ${esc(e.note)}` : ''}</p></li>`;
  };
  let html = '';
  for (const [ri, row] of rows.entries()) {
    const items = await Promise.all(row.map(sleeve));
    if (ri === Math.floor(mine.length / PER)) items.push(`<li class="empty"><span class="slot-hole" aria-hidden="true"></span><p class="tag-line dim">${mine.length ? '下一张放这里' : '第一张会放在这里'}</p></li>`);
    html += `<ol class="board">${items.join('')}</ol>`;
  }
  shelfEl.querySelector('.boards').innerHTML = html;
  shelfEl.querySelector('.count').textContent = mine.length ? `${mine.length} 张 · ${new Set(mine.map((e) => e.semester)).size} 个学期 · ${new Set(mine.map((e) => e.placeId).filter(Boolean)).size} 个地点` : '还是空的';
  shelfEl.hidden = false;
  document.body.classList.add('is-shelf');
  requestAnimationFrame(() => shelfEl.classList.add('is-in'));
  shelfEl.querySelectorAll('.sleeve').forEach((b) => b.addEventListener('click', () => pullOut(b)));
  window.__plan.shelf = { n: mine.length };
}
function closeShelf() {
  if (!shelfEl || shelfEl.hidden) return;
  shelfEl.classList.remove('is-in');
  document.body.classList.remove('is-shelf');
  setTimeout(() => { if (!shelfEl.classList.contains('is-in')) shelfEl.hidden = true; }, reduced ? 0 : 650);
}
/** 抽出一张：套封往上抽、柜子退出去、盘回到唱机上落针。 */
function pullOut(btn) {
  const e = entries.find((x) => x.id === btn.dataset.id);
  if (!e) return;
  btn.classList.add('is-out');
  setTimeout(() => { closeShelf(); loadClip(e); }, reduced ? 0 : 420);
}
if (shelfEl) {
  shelfEl.querySelector('.close').addEventListener('click', () => { closeShelf(); });
  shelfEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeShelf(); });
}

function renderMine() {
  const mine = entries.filter((e) => e.mine).slice().reverse();
  const id = lib.me();
  if (els.cab) els.cab.querySelector('.n').textContent = mine.length ? `${mine.length} 张` : '';
  const bySem = new Map();
  for (const e of mine) { const k = e.semester || '?'; if (!bySem.has(k)) bySem.set(k, []); bySem.get(k).push(e); }
  const groups = [...bySem.entries()].map(([k, list]) => `<h3 class="sub">${esc(semesterLabel(k))}</h3><ol class="voices">${list.map((e) => `
    <li><button type="button" class="voice is-mine" data-id="${e.id}" aria-pressed="${!!(state.clip && state.clip.id === e.id)}">
      <span class="w">${esc(e.place)} · ${esc(when(e).split(' · ').slice(1).join(' · '))}</span><span class="a">${esc(status(e))}</span></button>
      ${e.source === 'local' ? `<button type="button" class="act small" data-act="submit" data-id="${e.id}" aria-label="把 ${esc(e.place)} 这张投稿入馆">${e.submittedAt ? '再导出投稿包' : '投稿入馆'}</button>` : ''}</li>`).join('')}</ol>`).join('');
  els.card.innerHTML = `
    <button type="button" class="back">全部分区</button>
    <h2>我的柜子</h2>
    <p class="lede">${esc(mineLine(mine.map((e) => ({ ...e, archived: e.source === 'archive' }))))}${mine.length ? '左边的校园里，黄色的盘是你的。' : ''}</p>
    ${mine.length ? ringSVG(ringsOfList(mine), '一个点是你的一张，按一天里的钟点排。') : ''}
    <section class="card-id" aria-labelledby="id-h">
      <h3 id="id-h">刻声卡</h3>
      <p>${id ? (signature(id) === '未落款' ? '还没落款。' : `落款：${esc(signature(id))}`) : '还没有刻声卡：刻第一张时自动生成。'}</p>
      ${id ? `<p class="fine">卡号 ${esc(id.uid.slice(0, 8))}…，只在这台设备上。换设备时导出、在新设备上导入，你的盘就还认得你。</p>` : ''}
      ${sigForm(id && (id.grade || id.dept || id.name) ? '改落款（以后刻的盘用新落款，旧盘不变）' : '落款')}
      <div class="row">${id ? '<button type="button" class="act ghost" id="card-export">导出刻声卡</button>' : ''}<button type="button" class="act ghost" id="card-import">导入刻声卡</button><input type="file" id="card-file" accept=".json,application/json" hidden></div>
    </section>
    ${groups || '<p class="fine">选一个地点，按住「在这里刻十秒」。</p>'}`;
  els.card.querySelector('.back').addEventListener('click', goBack);
  els.card.querySelectorAll('.voice').forEach((b) => b.addEventListener('click', () => { const e = entries.find((x) => x.id === b.dataset.id); if (e) loadClip(e); }));
  const ex = els.card.querySelector('#card-export');
  if (ex) ex.addEventListener('click', () => download('刻声卡.json', new Blob([cardFile(lib.me())], { type: 'application/json' })));
  const file = els.card.querySelector('#card-file');
  els.card.querySelector('#card-import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try { importIdentity(await f.text()); say('刻声卡已导入，重新载入…'); location.reload(); } catch (err) { say(`没导入：${err.message}`); }
  });
  wireActs();
}

// ====================================================================================
// 标签（HTML 叠在画布上）
// ====================================================================================
const tags = new Map();
function tag(key, cls, html) {
  let t = tags.get(key);
  if (!t) {
    t = document.createElement('div');
    t.className = `tag ${cls}`;
    t.innerHTML = `<span>${html}</span>`;
    els.labels.appendChild(t);
    tags.set(key, t);
  }
  return t;
}
for (const z of campus.zones) tag(z.id, 'is-zone', esc(z.name));
// 外圈的学期标尺：最外一带（最早）、最里一带（最近）、正在放的那一带、指针下的那一带
for (const k of ['band-old', 'band-new', 'band-act', 'band-hov']) tag(k, `is-band ${k}`, '');
const BAND_PSI = (205 * Math.PI) / 180;   // 标尺落在盘的西南侧（总览时离观者最近的那一边）
function bandTag(key, i, psi, show) {
  const t = tags.get(key);
  const b = ring.bands[i], L = ring.layout[i];
  if (!show || !b || !L) { t.style.display = 'none'; return; }
  const r = (L.r0 + L.r1) / 2;
  const txt = `${b.label}<i>${b.n} ${b.items.every((e) => tierOf(e) === 'archival') ? '段' : '张'}</i>`;   // 史料一律叫「段」，和史料一栏同一个量词
  if (t.dataset.k !== `${i}`) { t.querySelector('span').innerHTML = txt; t.dataset.k = `${i}`; }
  placeTag(t, Math.sin(psi) * r, 0, -Math.cos(psi) * r, true);
}
for (const p of campus.places) tag(p.id, 'is-place', `<u class="mk" aria-hidden="true"></u>${esc(p.name)}<b></b><i></i>`);

const v3 = new THREE.Vector3();
function placeTag(t, x, y, z, show) {
  if (!show) { t.style.display = 'none'; return; }
  v3.set(x, y, z).project(camera);
  if (v3.z > 1) { t.style.display = 'none'; return; }
  const r = els.canvas.getBoundingClientRect();
  t.style.display = '';
  t.style.transform = `translate(${((v3.x + 1) / 2) * r.width}px, ${((1 - v3.y) / 2) * r.height}px) translate(-50%, -100%)`;
}

function updateBandTags() {
  const n = ring.bands.length, overview = state.view === 'campus' && !state.flash.length;
  const act = ring.active;
  bandTag('band-old', 0, BAND_PSI - 0.16, overview && n > 1 && act !== 0);
  bandTag('band-new', n - 1, BAND_PSI + 0.16, overview && n > 1 && act !== n - 1);
  bandTag('band-act', act, BAND_PSI, act >= 0 && ring.open[act] > 0.5);
  bandTag('band-hov', ring.hover, ring.hoverPsi || 0, ring.hover >= 0 && ring.hover !== act && !grab);
}
function updateTags() {
  updateBandTags();
  for (const z of campus.zones) {
    const o = zoneObj.get(z.id);
    const tall = o.tall;
    const narrow = els.canvas.clientWidth < 700;
    placeTag(tags.get(z.id), o.c.x, TILE_TOP + o.lift + Math.min(tall, 60) + 40, -o.c.y, state.view === 'campus' && o.rise > 0.9 && (!narrow || state.hover === z.id));
  }
  for (const p of campus.places) {
    const o = pinObj.get(p.id);
    const n = pinCount(p.id);
    const t = tags.get(p.id);
    // 展签：看一个人的柜子时只算 TA 在这里的盘；否则是这个地点眼下能看到的盘。分区 / 地点视图和悬停时再写上最新一张别人的盘
    const own = state.person ? entries.filter((e) => e.placeId === p.id && personOf(e) === state.person) : null;
    const cnt = own ? own.length : n;
    const near = (state.view === 'zone' || state.view === 'place') && state.zone === p.z;
    const flash = state.flash.includes(p.id);
    const show = near || flash || state.pickPlace || !!state.placing || state.hoverPlace === p.id || (own && own.length > 0);
    const shown = own || atPlace(p.id);
    const last = show ? (shown.filter((e) => !e.mine).at(-1) || shown.at(-1)) : null;
    const line = last ? `${last.note ? `「${last.note}」` : ''}${titled(who(last), semesterLabel(last.semester))}` : '';
    const ib = t.querySelector('i');
    if (ib.textContent !== line) ib.textContent = line;
    t.querySelector('b').textContent = cnt ? `${cnt}` : '';
    t.classList.toggle('is-playing', !!(state.clip && state.clip.placeId === p.id));
    t.classList.toggle('is-here', state.place === p.id);
    t.classList.toggle('is-empty', !n);
    t.classList.toggle('is-who', !!own);
    t.classList.toggle('is-flash', flash);
    for (const k of ['fix', 'ep', 'dr', 'user']) t.classList.toggle(`mk-${k}`, flash && state.flashKind === k);
    placeTag(t, o.group.position.x, o.group.position.y + o.head.position.y + 6, o.group.position.z, show);
  }
}

// ====================================================================================
// 每帧
// ====================================================================================
// —— 天光：从一个时段平滑过渡到另一个；开场先从夜里亮到天明，再落到当前时段 ——
let lightPaper = null;
const LKEYS = ['az', 'el', 'i', 'hemi', 'night', 'lit', 'plat'];
function snapLight(name) {
  const L = LIGHT[name];
  const o = { name };
  for (const k of LKEYS) o[k] = L[k];
  o.col = L.col.clone(); o.bg0 = L.bg[0].clone(); o.bg1 = L.bg[1].clone();
  return o;
}
function lightGoal() { return rec ? slotOf(new Date()) : state.slot || (state.clip && state.clip.slot) || '上午'; }   // 正在刻：天光落到此刻
/** 排一段过渡：to = 时段名；dur 毫秒。方位角走最短的那一边。 */
function lightTo(name, dur = 1400) {
  if (!light.cur) { light.cur = snapLight(name); return; }
  light.queue.push({ name, dur });
}
function stepLight(now) {
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
  const goal = lightGoal();
  if (!light.to && !light.queue.length && light.cur.name !== goal) lightTo(goal);
  const c = light.cur;
  const az = (c.az * Math.PI) / 180, el = (c.el * Math.PI) / 180;
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(2400);
  sun.intensity = c.i;
  sun.color.copy(c.col);
  platterMat.uniforms.uSunDir.value.copy(sun.position).normalize();
  platterMat.uniforms.uSunCol.value.set(c.col.r, c.col.g, c.col.b).multiplyScalar(c.i);
  // 一套灯一个色温：软箱、半球光、纸都取太阳这一刻的色度（light-rig.js）
  const rig = rigFor(`#${c.col.getHexString()}`);
  platterMat.uniforms.uBoxCol.value.forEach((v, i) => v.set(rig.boxes[i][0], rig.boxes[i][1], rig.boxes[i][2]).multiplyScalar(STUDIO[i].i));
  hemi.color.setRGB(rig.sky[0], rig.sky[1], rig.sky[2]);
  hemi.groundColor.setRGB(rig.ground[0], rig.ground[1], rig.ground[2]);
  if (rig.paper !== lightPaper) { lightPaper = rig.paper; document.documentElement.style.setProperty('--paper', rig.paper); }
  // 环境贴图（金属件、楼面上的软箱反射）：过渡走完才重烘一次，过渡中沿用上一张（PMREM 一次几十毫秒）
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
  labelMat.emissiveIntensity = 0.55 * c.night;
  platterMat.uniforms.uBright.value = c.plat;
  zoneObj.forEach((o) => { o.poolMat.opacity = 0.5 * c.night; });
  bloom.strength = 0.1 + 0.6 * c.night;
  bloom.threshold = 1.6;
  if (!c.bgDone || light.to) { paintBackdrop(c.bg0, c.bg1); c.bgDone = !light.to; }
  if (els.hour) els.hour.textContent = `天光　${light.to ? light.to.name : c.name}　${LIGHT[light.to ? light.to.name : c.name].hour}`;
}
// —— 四季景观：校园的景跟着正在放的那张声片录下的月份走（真实盘 / 概念盘按 at，史料按事件日，示例和正在刻的按今天）——
// 学期带管「哪一年哪一学期」，景观管「那天是什么季节」：两样都只读这张盘自己的数据，不需要另一套按钮。
const scene4 = { cur: null };
function seasonGoal() {
  const e = state.clip;
  if (rec || !e || e.source === 'example') return seasonOf(new Date()) || '秋';
  if (e.source === 'archival') return seasonOfDay(e.date) || (e.at && seasonOf(e.at)) || seasonOf(new Date()) || '秋';
  return seasonOf(e.at) || '秋';
}
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
function applySeason(name) {
  if (scene4.cur === name) return;
  scene4.cur = name;
  const S = SCENERY[name];
  const cols = S.crown.map(([c]) => new THREE.Color(c));
  for (const f of forest) {
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
  for (const z of seasonal) for (const t of z.tints) {
    if (t.mat === z.tileMat) t.on.set(S.tile); else if (t.mat === z.roadMat) t.on.set(S.road); else if (t.mat === z.greenMat) t.on.set(S.green);
  }
  snowU.value = S.snow;
}
const T0 = performance.now();
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** 馆藏卡压在画布上的宽度（宽屏时卡片浮在画布右侧；窄屏时卡片在画布下面，不压）。 */
function cardCover() {
  const c = els.canvas.getBoundingClientRect(), k = document.getElementById('card').getBoundingClientRect();
  return k.top < c.bottom && k.bottom > c.top && k.left < c.right ? Math.max(0, c.right - k.left + 16) : 0;
}
let viewShift = -1;
function resize() {
  const w = els.canvas.clientWidth, h = els.canvas.clientHeight;
  const cover = cardCover();
  if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio()) || cover !== viewShift) {
    viewShift = cover;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // 画面中心挪到卡片左边那块的中间：投影矩阵整体平移，拾取、展签、屏幕坐标都走同一个矩阵，不用另算
    if (cover) camera.setViewOffset(w, h, cover / 2, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    composer.passes.at(-1).uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  }
}

/** 时间标尺：凑近刻槽时，画面宽度对应多少秒的声音（一圈 = 2 秒，和半径无关）。是量出来的数，不是说明。 */
let scaleTxt = '';
function scaleTag(d) {
  const el = document.getElementById('scale');
  if (!el) return;
  const w = 2 * d * Math.tan((camera.fov * Math.PI) / 360) * Math.max(0.4, (els.canvas.clientWidth - Math.max(0, viewShift)) / (els.canvas.clientHeight || 1));
  const sec = (w * TURN) / (TAU * Math.max(RIN, ARM.r));
  const show = current && d < 260;          // 只在贴近刻槽时（Powers of Ten 的后半段）
  const t = !show ? '' : sec >= 1 ? `这一屏 ≈ ${sec.toFixed(1)} 秒的声音` : sec >= 0.1 ? `这一屏 ≈ ${(sec * 1000).toFixed(0)} 毫秒的声音` : `这一屏 ≈ ${(sec * 1000).toFixed(1)} 毫秒的声音`;
  if (t !== scaleTxt) { scaleTxt = t; el.textContent = t; el.hidden = !t; }
}
let frameCount = 0, lastNow = 0, spin = 0;   // spin：盘转过的角度（= 播放位置），不含针尖方位
function frame(now) {
  frameCount++;
  const dt = Math.min(1, lastNow ? (now - lastNow) / 1000 : 0.016);
  lastNow = now;
  resize();
  // 开场：区块从盘心往外依次立起来（唯一的一段自动动画）
  zoneObj.forEach((o) => {
    if (o.rise < 1) {
      const d = Math.hypot(o.c.x, o.c.y) / 700;
      o.rise = Math.min(1, Math.max(0, (now - T0 - 250 - d * 700) / 900));
      o.bgroup.scale.y = Math.max(0.001, easeOut(o.rise));
    }
  });
  // 选区块：选中的抬起来、更白；其余压暗
  zoneObj.forEach((o, id) => {
    const sel = state.zone === id, hov = state.hover === id;
    const goal = sel ? 22 : hov ? 6 : 0;
    o.lift += (goal - o.lift) * (reduced ? 1 : 0.14);
    o.group.position.y = o.lift;
    const dim = state.zone && !sel;
    const k = reduced ? 1 : 0.15;
    for (const t of o.tints) t.mat.color.lerp(dim ? t.dim : sel && t.sel ? t.sel : t.on, k);
    o.bldMat.userData.win.value += ((dim ? 0.25 : 1) - o.bldMat.userData.win.value) * k;
    o.edgeMat.opacity += ((dim ? 0.14 : sel ? 0.5 : 0.32) - o.edgeMat.opacity) * 0.15;
  });
  pinObj.forEach((o, pid) => {
    const z = zoneObj.get(o.zone);
    o.group.position.y = TILE_TOP + z.lift;
    o.group.scale.y = Math.max(0.001, easeOut(z.rise));
    o.group.visible = z.rise > 0.02;          // 空的针也立着：铝色针头 = 还没人刻过，等第一张
    // 正在这里刻：针头一呼一吸
    const breathe = rec && rec.pid === pid && !reduced ? 1 + 0.25 * Math.sin(now / 160) : 1;
    o.head.scale.set(breathe, 1, breathe);
    // 刚刻好的那张：从高处落到针上，落定时轻轻一弹
    if (landing && landing.pid === pid && o.n) {
      const t = reduced ? 1 : Math.min(1, (now - landing.t0) / 900);
      const k = t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.08;
      const d = o.discs[o.n - 1], y = o.top - 4 + (o.n - 1) * PIN_STEP;
      d.position.y = y + (1 - k) * 160;
      d.rotation.y = (1 - k) * 6;
      o.head.position.y = y + 3.5 + Math.max(0, (1 - k) * 160);
      if (t >= 1) { d.position.y = y; d.rotation.y = 0; o.head.position.y = y + 3.5; landing = null; }
    }
  });
  // Powers of Ten：距离按对数走，视点在前 35% 里落到目标上；方位、俯仰跟着慢慢转
  if (zoom && zoom.t0) {
    const t = Math.min(1, (now - zoom.t0) / zoom.dur), k = t * t * (3 - 2 * t);
    const { A, B } = zoom;
    const d = Math.exp(Math.log(A.d) + (Math.log(B.d) - Math.log(A.d)) * k);
    const lk = zoom.dir === 'in' ? Math.min(1, k / 0.35) : Math.max(0, (k - 0.65) / 0.35);
    const tgt = A.t.clone().lerp(B.t, zoom.dir === 'in' ? 1 - Math.pow(1 - lk, 3) : lk * lk * lk);
    let daz = B.az - A.az; daz = ((daz + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const pos = new THREE.Vector3().setFromSphericalCoords(d, A.polar + (B.polar - A.polar) * k, A.az + daz * k).add(tgt);
    controls.target.copy(tgt);
    camera.position.copy(pos);
    if (t >= 1) {
      const z = zoom;
      zoom = z.dir === 'in' ? { wasOn: z.wasOn, at: 'close' } : null;
      controls.enabled = true;
      if (z.dir !== 'in' && z.wasOn && current) setMotor(true, true);
    }
  } else if (fly) {
    const t = Math.min(1, (now - fly.t0) / fly.dur), k = fly.dur > 1500 ? t * t * t * (t * (t * 6 - 15) + 10) : 1 - Math.pow(1 - t, 3);
    controls.target.lerpVectors(fly.fromT, fly.toT, k);
    camera.position.lerpVectors(fly.fromP, fly.toP, k);
    if (t >= 1) fly = null;
  }
  controls.update();
  const camD = camera.position.distanceTo(controls.target);
  const nearGoal = Math.min(20, Math.max(0.25, camD * 0.02));
  if (Math.abs(camera.near - nearGoal) / nearGoal > 0.15) { camera.near = nearGoal; camera.updateProjectionMatrix(); }
  scaleTag(camD);
  // 盘面：角度 = 播放位置；高光随视角走
  let play = 0;
  if (current) {
    play = playSeconds();
    const u = platterMat.uniforms;
    spin = ((2 * Math.PI * play) / TURN) % (2 * Math.PI);
    u.uPlay.value = play;
    u.uTrail.value = ctx && (Math.abs(report.rate) > 0.02 || grab) ? 1 : 0;
  }
  platterMat.uniforms.uCam.value.copy(camera.position);
  if (rec && rec.mic) {                          // 刻的时候盘在转、唱针跟着刻刀往里走：最新刻下的那一点正在针下
    play = rec.n / rec.fs;
    spin = ((2 * Math.PI * play) / TURN) % (2 * Math.PI);
    platterMat.uniforms.uPlay.value = play;
    platterMat.uniforms.uTrail.value = 1;
  }
  const lsec = listenSec();                      // 听示例：示例一边放一边刻进外圈（和刻盘同一个样子），放到哪、针就在哪
  if (lsec != null) {
    play = lsec;
    const u = platterMat.uniforms;
    u.uCut.value = lsec;
    spin = ((2 * Math.PI * play) / TURN) % (2 * Math.PI);
    u.uPlay.value = play;
    u.uTrail.value = 1;
    stepListen(lsec);
  }
  if (current && !rec) echoLive(play);
  stepBands(dt);
  const r = stylusRadius(lsec != null || (rec && rec.mic) ? play : current ? Math.min(play, current.seconds) : 0);
  const seeking = !reduced && now - seekT < 450;
  // 找位置时滑块缓缓滑过去；落了针就严格跟着播放位置（帧率再低也不落后）
  armTo(seeking ? ARM.r + (r - ARM.r) * 0.2 : r);
  const live = ctx && current && Math.abs(report.rate) > 0.02;
  needleTip.material.color.set(live ? COL.scope : COL.lathe);
  // 抬针 / 落针：在放、在搓、在刻时落下；停着或者滑块还在找位置（换盘、从头放）时抬起
  const armDown = (live || grab || (rec && rec.mic) || lsec != null) && !seeking;
  // 按时间常数走（落针 0.08 s、抬针 0.12 s），软渲染一秒一帧时也照样落得下、抬得起
  armLift += ((armDown ? 0 : 14) - armLift) * (reduced ? 1 : 1 - Math.exp(-dt / (armDown ? 0.08 : 0.12)));
  arm.rotation.z = Math.atan2(armLift, ARM.L);         // 绕枢轴抬起：针尖抬高约 armLift 米
  // 刻纹的「正在放」那一点转到针尖下面（针不在正北）：上面几处算的是播放角，这里统一加上针尖的方位
  platterMat.uniforms.uAngle.value = spin + ARM.psi;
  rim.rotation.y = -platterMat.uniforms.uAngle.value;
  stepEchoMarks();
  powerLed.material.emissiveIntensity += ((motorOn || (rec && rec.mic) ? 2.4 : 0.15) - powerLed.material.emissiveIntensity) * 0.2;
  const lvlNow = live && current ? Math.min(1, current.env[Math.floor(play * 50)] * 5 || 0) : 0;
  contact.material.opacity = armLift < 1.5 && (live || (rec && rec.mic) || lsec != null) ? 0.35 + 0.65 * (lsec != null ? 0.5 : lvlNow) : 0;
  contact.scale.setScalar(1 + 0.6 * lvlNow);
  // 正在放的钉点：地面上的刻纹圈，振幅跟着声音走
  const pin = lsec == null && current && pinObj.get(current.e.placeId);
  if (pin) {
    const z = zoneObj.get(pin.zone);
    const lvl = live ? Math.min(1, current.env[Math.floor(play * 50)] * 5 || 0) : 0;
    ripples.forEach((rp, i) => {
      rp.visible = true;
      const phase = reduced ? (i + 1) / 5 : ((now / 1000) * 0.45 + i / ripples.length) % 1;
      const rad = 14 + phase * 70;
      rp.scale.set(rad, rad, 1);
      rp.position.set(pin.group.position.x, TILE_TOP + z.lift + 0.3, pin.group.position.z);
      rp.material.opacity = (live ? 0.25 + 0.75 * lvl : 0.18) * (1 - phase);
      rp.material.color.set(COL.scope).multiplyScalar(1 + 2.2 * U.uNight.value);
    });
  } else ripples.forEach((rp) => { rp.visible = false; });
  updateTags();
  stepLight(now);
  applySeason(seasonGoal());
  // 移轴：焦平面落在镜头看的那一点，离它越远越虚——像在桌上拍一座模型
  v3.copy(controls.target).project(camera);
  const focus = (v3.y + 1) / 2, dist = camera.position.distanceTo(controls.target);
  const blur = (dist < 2000 ? 2.4 : 0.5) / Math.max(1, els.canvas.clientWidth);
  tiltH.uniforms.h.value = blur;
  tiltV.uniforms.v.value = blur * els.canvas.clientWidth / Math.max(1, els.canvas.clientHeight);
  tiltH.uniforms.r.value = tiltV.uniforms.r.value = focus;
  composer.render();
  watchFrames(now);
  requestAnimationFrame(frame);
}

// 场景在所有顶层声明之后再建（buildScene 用到上面的 const）
// 建场景要占住主线程好几秒（软渲染十来秒）：先等浏览器把加载画面画出来，再动手——不白屏靠的是这两帧
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
if (renderer) { await document.fonts.load('30px "KS Fangsong Plan"').catch(() => {}); buildScene(); }
renderCard();
{ const b = document.getElementById('boot'); if (b) { b.classList.add('is-done'); setTimeout(() => b.remove(), 700); } }
if (renderer) {
  // 页面打开时把最新一张刻在外圈（不出声：浏览器要先有一次点击才允许放声音）；馆藏和柜子都空着就留一张空盘
  if (entries.length) {
    await loadClip(entries[entries.length - 1], false);
    say('外圈刻的是最新的一张。点「放」或按住刻纹拖动就能听。');
  } else {
    say(pub.ok ? '馆藏还是空的。点一个地点，刻下第一张。' : '这次没连上馆藏目录，只显示你柜子里的盘。');
  }
  // 开场：夜里的校园先亮着窗，区块立起来的时候天亮，最后落到这张声片录下的时段
  if (reduced) light.cur = snapLight(lightGoal());
  else {
    light.cur = snapLight('夜'); lightTo('晨', 1500); lightTo(lightGoal(), 1300);
    // 开场：Powers of Ten 倒着走——先在刻槽里看这张声片的波形，一镜拉到整台唱机（声音真的刻在里面，不用一个字解释）
    powersOfTen('open', 5600);
  }
  requestAnimationFrame(frame);
  window.__plan = { ready: true, state, zones: [...zoneObj.keys()], pins: pinObj.size,
    look: (polar, dist, azim = controls.getAzimuthalAngle()) => setView({ target: new THREE.Vector3(0, 0, 0), polar, dist, azim }, true),
    screen: (x, yNorth) => { const v = new THREE.Vector3(x, 0, -yNorth).project(camera); const r = els.canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    get pos() { return playSeconds(); },
    cam: () => ({ azim: controls.getAzimuthalAngle(), polar: controls.getPolarAngle() }),
    pinScreen: (pid) => { const o = pinObj.get(pid); const v = new THREE.Vector3(o.group.position.x, o.group.position.y + o.head.position.y - 2, o.group.position.z).project(camera); const r = els.canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    get pickPlace() { return state.pickPlace; },
    zoneScreen: (id) => { const o = zoneObj.get(id); const v = new THREE.Vector3(o.c.x, TILE_TOP, -o.c.y).project(camera); const r = els.canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; },
    get dur() { return current ? current.dur : 0; },
    get arm() { return armLift; }, get rim() { return rim.rotation.y; }, get contact() { return contact.material.opacity; },
    openPlace, openMine, openPerson, placeDisc: (pid) => placeDisc(state.placing, pid), get placing() { return state.placing; }, closeShelf, get entries() { return entries.length; }, get history() { return history.length; }, get archival() { return archival.length; }, get viewName() { return state.view; },
    counts: () => counts(allShown()), example: (which) => runExample(which), get lastFind() { return findSummary(); }, get lastGuess() { return state.guess; },
    home: () => setView(HOME, true),
    sceneStats: () => { let meshes = 0, tris = 0; scene.traverse((o) => { if (!o.isMesh || !o.visible) return; meshes++; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); }); return { meshes, tris: Math.round(tris) }; },
    get bands() { return ring.bands.map((b, i) => ({ semester: b.semester, n: b.n, r0: ring.layout[i] && ring.layout[i].r0, r1: ring.layout[i] && ring.layout[i].r1, open: ring.open[i] })); },
    get activeBand() { return ring.active; }, get stylusR() { return ARM.r; },
    bandScreen: (i, deg) => { const L = ring.layout[i], r = (L.r0 + L.r1) / 2, a = (deg * Math.PI) / 180; const v = new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r).project(camera); const R = els.canvas.getBoundingClientRect();
      return { x: R.left + ((v.x + 1) / 2) * R.width, y: R.top + ((1 - v.y) / 2) * R.height }; },
    view: (x, yNorth, dist, polar, azim) => setView({ target: new THREE.Vector3(x, TILE_TOP, -yNorth), dist, polar, azim }, true),
    risen: () => [...zoneObj.values()].every((o) => o.rise >= 1), get light() { return light.to ? light.to.name : light.cur.name; },
    settled: () => !light.to && !light.queue.length && light.cur.name === lightGoal(),
    marksScreen: () => { const R = els.canvas.getBoundingClientRect(); return echoMarks.items.map((m) => { const h = m.obj.userData.head; const v = new THREE.Vector3(); h.getWorldPosition(v); v.project(camera); return { i: m.i, t: m.t, x: R.left + ((v.x + 1) / 2) * R.width, y: R.top + ((1 - v.y) / 2) * R.height, mine: echoState.list[m.i] && echoState.list[m.i].mine }; }); },
    get echoMarks() { return { n: echoMarks.items.length, visible: !!(echoMarks.group && echoMarks.group.visible), active: echoState.active }; },
    get season() { return scene4.cur; }, get frames() { return frameCount; }, get quality() { return { mode: quality.mode, median: quality.median ?? null }; }, get flying() { return !!fly || !!(zoom && zoom.t0); }, zoomTo: (dir) => powersOfTen(dir, 1200), get zoomed() { return !!(zoom && zoom.at === 'close'); },
    dbg: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, name: light.cur.name, night: U.uNight.value, sun: sun.intensity, hemi: hemi.intensity, exp: renderer.toneMappingExposure, frames: frameCount }), get playing() { return current && current.e.no; }, get rate() { return report.rate; } };
} else {
  window.__plan = { ready: true, state, nogl: true };
}
