// 听见校园 · 重点楼的 splat 特写（2026-11-26）。
// 组长从 World Labs Atlas 导出 SPZ、用 SuperSplat 裁掉杂点，丢进 public/splats/ 并在 index.json 里登记，
// 进楼时这栋楼就从纸模换成真实点云；清单里没有的地点照旧用纸模，什么都不做。
// 这块文件很小、直接跟着主包走；真正的渲染库 @sparkjsdev/spark 在第一次要用时才动态 import，首屏不下载。
import * as THREE from 'three';

let spark = null;                 // SparkRenderer：整站只建一个，挂在 scene 上，只在第 1 层（特写那一遍）里画
let mesh = null;                  // 当前地点的 SplatMesh
let paper = [];                  // 纸模楼的部件（pivot 的直接子节点，台座除外）：splat 亮起来后藏掉
let mats = [];                    // 这些部件用到的材质：淡出用
let pidCur = null, rid = 0;       // 当前地点、请求代号（异步回来时对不上就丢掉）
let k = 0, fading = false, loaded = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FADE = 420;                 // 毫秒：纸模淡出、splat 淡入

const urlOf = (p) => new URL(p, document.baseURI).href;
async function manifest() {
  try {
    const r = await fetch(urlOf(`${import.meta.env.BASE_URL}splats/index.json`), { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch { return null; }        // 没清单、没网：当没有 splat
}
// 清单里一项 → SplatMesh 的位姿。Atlas/OpenCV 到 three 的 OpenGL 先翻一次 X（quaternion.set(1,0,0,0)），
// 再叠清单里的 rot（欧拉角，度）；pos 是相对楼的枢轴（楼中心、地面 y=0），scale 是均匀缩放或 [x,y,z]。
function apply(m, it) {
  m.quaternion.set(1, 0, 0, 0);
  const r = it.rot || [0, 0, 0];
  m.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * Math.PI / 180, r[1] * Math.PI / 180, r[2] * Math.PI / 180)));
  if (Array.isArray(it.scale)) m.scale.fromArray(it.scale); else m.scale.setScalar(it.scale ?? 1);
  m.position.fromArray(it.pos || [0, 0, 0]);
  m.opacity = 0;                  // 加载好之前是透明的，避免纸模还在时突然冒出一块
}

// 纸模的材质在 scene.js 里是每栋楼单独一份，改透明度不会波及别的楼。
// 只在开始淡出时改一次 transparent/depthWrite（改这两个会重编着色器，不能每帧改），之后每帧只推 opacity。
function paperFadeStart() {
  for (const o of paper) o.traverse((q) => {
    if (!q.isMesh) return;
    for (const m of (Array.isArray(q.material) ? q.material : [q.material])) {
      if (!m || mats.some((x) => x.m === m)) continue;
      mats.push({ m, t: m.transparent, o: m.opacity, d: m.depthWrite });
      m.transparent = true;
      m.depthWrite = false;       // 淡出期间不挡 splat
      m.needsUpdate = true;
    }
  });
}
function setFade(v) {
  k = v;
  if (mesh) mesh.opacity = v;
  for (const x of mats) x.m.opacity = x.o * (1 - v);
  for (const o of paper) o.visible = v < 0.999;
}

/** 进这个地点：清单里有就挂 splat，没有就什么都不做。parent 是 heroObj 的 pivot。 */
export function attachSplat(pid, parent, c) {
  detachSplat();
  pidCur = pid;
  if (!pid || !parent || !c) return;
  const pedestal = c.pedestal || null;
  paper = parent.children.filter((o) => o !== pedestal);
  const my = ++rid;
  (async () => {
    const list = await manifest();
    const it = list && list[pid];
    if (!it || !it.file || my !== rid) return;
    let M;
    try { M = await import('@sparkjsdev/spark'); } catch (e) { console.warn('[splat] spark 加载失败', e); return; }
    if (my !== rid) return;
    if (!spark) {
      spark = new M.SparkRenderer({ renderer: c.renderer });
      spark.layers.set(1);        // 只在特写那一遍（4× 缓冲、清过深度）里画：不受背景移轴模糊，和纸模的糊画面对得上
      c.scene.add(spark);
    }
    const m = new M.SplatMesh({ url: urlOf(`${import.meta.env.BASE_URL}splats/${it.file}`) });
    m.layers.set(1);
    apply(m, it);
    parent.add(m);
    mesh = m;
    m.initialized.then(() => {
      if (my !== rid) return;
      loaded = true;
      if (reduced) setFade(1); else { paperFadeStart(); fading = true; }
    }).catch((e) => console.warn('[splat] 解析失败', it.file, e));
  })();
}

/** 离开地点：卸载、dispose，纸模恢复原样。 */
export function detachSplat() {
  rid++;
  if (mesh) {
    if (mesh.parent) mesh.parent.remove(mesh);
    try { mesh.dispose(); } catch { /* 还没加载完就 dispose */ }
    mesh = null;
  }
  if (spark) {
    if (spark.parent) spark.parent.remove(spark);
    try { spark.dispose(); } catch { /* 同上 */ }
    spark = null;
  }
  for (const x of mats) { x.m.transparent = x.t; x.m.opacity = x.o; x.m.depthWrite = x.d; x.m.needsUpdate = true; }
  for (const o of paper) o.visible = true;
  paper = []; mats = [];
  pidCur = null; k = 0; fading = false; loaded = false;
}

/** 每帧：把淡入淡出往前推（stage.js 的 frame 里调）。 */
export function stepSplat(dt) {
  if (!fading) return;
  setFade(Math.min(1, k + (dt * 1000) / FADE));
  if (k >= 1) fading = false;
}

/** 调试用：现在挂着哪个地点、几个点、淡到几成。 */
export const splatState = () => {
  const o = { pid: pidCur, loaded, k: +k.toFixed(2), n: mesh ? mesh.numSplats : 0 };
  if (mesh && loaded) { const b = mesh.getBoundingBox(true), s = b.getSize(new THREE.Vector3()); o.size = [s.x, s.y, s.z].map((v) => +v.toFixed(2)); o.min = b.min.toArray().map((v) => +v.toFixed(2)); }
  return o;
};

