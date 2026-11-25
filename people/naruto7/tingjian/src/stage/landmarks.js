// 听见校园 · 让人一眼认出是北航的几样东西（2026-11-26，组员：「地图有点看不出这是北航」）。
//   1. 航空航天博物馆门外的露天展机：三架低多边形模型（Poly Pizza，CC-BY 3.0，作者见关于页），换成卡纸的颜色。
//      馆外有展机是真的（北京日报、美篇等），但 OpenStreetMap 里没标每一架的位置：摆在馆南面那片空地上，机型是「像」，位置是示意。
//   2. 校门：南门、东门、新东门、北门、西门，坐标取自 OpenStreetMap（2026-11-25 的数据），做成两根门柱一道门楣的纸模型。
//   3. 盘心标签上，校园四边印上外面那四条路的名字：北四环中路、学院路、知春路、大运村路（OpenStreetMap）。
// 经纬度到模型坐标：campus-xy.json 是以博物馆为锚的等距投影（拿 OSM 的校区外接框核对过，四边差 2 米以内）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LAT0 = 39.980846, LON0 = 116.344507, X0 = 291.15, Y0 = 22.05;   // 博物馆中心：OSM way 190444425 ↔ 模型里博物馆外接框的中心（米）
export const toXY = (lat, lon) => [(lon - LON0) * 111320 * Math.cos((LAT0 * Math.PI) / 180) + X0, (lat - LAT0) * 110950 + Y0];

// 露天展机：文件、要多大（最长的一边，米；和单车、长椅一样放大 1.3 倍才看得清）、摆在哪（模型坐标，米）、朝向（弧度）
export const PLANES = [
  { file: 'jet.glb', name: '后掠翼喷气式飞机', size: 20, at: [312, -57], rot: 2.4, by: 'Poly by Google', src: 'https://poly.pizza/m/dukcCKsLDrS' },
  { file: 'prop.glb', name: '高单翼运输机（像运-5）', size: 23, at: [279, -59], rot: 2.1, by: 'Vojtěch Balák', src: 'https://poly.pizza/m/7cvx6ex-xfL' },
  { file: 'heli.glb', name: '直升机（像米-8）', size: 22, at: [246, -53], rot: 2.7, by: 'Zsky', src: 'https://poly.pizza/m/hG2Qr0A3zR' },
];
export const GATES = [
  { name: '南门', lat: 39.975837, lon: 116.342018, face: 's' },
  { name: '东门', lat: 39.982836, lon: 116.347066, face: 'e' },
  { name: '新东门', lat: 39.980092, lon: 116.347227, face: 'e' },
  { name: '北门', lat: 39.984857, lon: 116.341591, face: 'n' },
  { name: '西门', lat: 39.981678, lon: 116.334818, face: 'w' },
];
// 四条路：在盘心标签上画一道路、印路名（模型坐标，米）
export const STREETS = [
  { name: '北四环中路', a: [-560, 522], b: [560, 522] },
  { name: '学院路', a: [560, -560], b: [560, 522] },
  { name: '知春路', a: [-560, -572], b: [560, -572] },
  { name: '大运村路', a: [-575, -560], b: [-575, 522] },
];

/** 原模型的颜色 → 卡纸：暗的成炭灰、红的成砖红、蓝的（舷窗）成墨蓝、其余成纸白。 */
function paperize(c) {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (c.r > 0.25 && c.r > c.g * 2) return '#A9473C';
  if (c.b > c.r * 1.6 && c.b > 0.08) return '#2E3E56';
  if (l < 0.06) return '#5F6670';
  if (l < 0.25) return '#8D949B';
  return '#E3DFD5';
}

/** 搭展机和校门。zones：Map(zoneId → { bgroup, tints })；返回 Promise（模型加载完）。 */
export async function buildLandmarks({ base, zoneOf, plate, pickables, place, clearTrees = () => {} }) {
  const loader = new GLTFLoader();
  const mats = new Map();
  const matOf = (hex) => { if (!mats.has(hex)) mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.82, metalness: 0.05, flatShading: true })); return mats.get(hex); };
  const jobs = PLANES.map(async (p) => {
    const gl = await loader.loadAsync(`${base}models/${p.file}`).catch(() => null);
    if (!gl) return;
    const root = gl.scene;
    root.traverse((o) => { if (o.isMesh) { o.material = matOf(paperize(o.material.color || new THREE.Color(1, 1, 1))); o.castShadow = true; o.receiveShadow = true; o.userData.place = place; } });
    const box = new THREE.Box3().setFromObject(root), sz = box.getSize(new THREE.Vector3());
    const k = p.size / Math.max(sz.x, sz.z);
    const wrap = new THREE.Group();
    root.scale.setScalar(k);
    root.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k + 0.3, -(box.min.z + box.max.z) / 2 * k);
    wrap.add(root);
    // 一只矮的纸托（展机都停在一块水泥坪上）
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.size * 0.62, p.size * 0.64, 0.3, 40), matOf('#C9C4B8'));
    pad.position.y = 0.15; pad.receiveShadow = true;
    wrap.add(pad);
    const [x, y] = p.at;
    clearTrees(x, -y, p.size * 0.7 + 4);
    wrap.position.set(x, 0, -y);
    wrap.rotation.y = p.rot;
    const z = zoneOf(x, y);
    if (!z) return;
    z.bgroup.add(wrap);
    wrap.traverse((o) => { if (o.isMesh) { o.userData.zone = z.id; pickables.push(o); } });
  });
  // 露天展区的小纸牌
  const sign = new THREE.Group();
  const card = plate('露天展机 · 位置示意', 26, 4.6, { bg: '#F4F1EA', color: '#3B4452', flat: false, size: 0.62 });
  card.position.y = 6.2;
  sign.add(card);
  for (const dx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.35), matOf('#ECEDEA')); leg.position.set(dx * 12, 2.1, -0.05); sign.add(leg); }
  sign.position.set(336, 0, 50);
  sign.rotation.y = -0.5;
  const zs = zoneOf(336, -50);
  if (zs) { zs.bgroup.add(sign); sign.traverse((o) => { if (o.isMesh) o.castShadow = true; }); }

  // 校门：两根门柱、一道门楣、门楣上印门名；正面朝校外
  for (const gt of GATES) {
    const [x, y] = toXY(gt.lat, gt.lon);
    const z = zoneOf(x, y) || zoneOf(x + (gt.face === 'w' ? 8 : gt.face === 'e' ? -8 : 0), y + (gt.face === 's' ? 8 : gt.face === 'n' ? -8 : 0));
    if (!z) continue;
    const g = new THREE.Group(), W = gt.name === '南门' || gt.name === '东门' ? 22 : 16, H = 9;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, H, 2.4), matOf('#D9D4C8'));
      p.position.set(s * W / 2, H / 2, 0); p.castShadow = true; p.receiveShadow = true;
      g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 1.8, 2.8), matOf('#8E4F42'));
    beam.position.y = H + 0.9; beam.castShadow = true;
    g.add(beam);
    const name = plate(gt.name, gt.name.length * 2.6 + 1.6, 2.4, { bg: '#8E4F42', color: '#F2E7C9', flat: false, size: 0.74 });
    name.position.set(0, H + 0.9, 1.45);
    g.add(name);
    const back = name.clone(); back.position.z = -1.45; back.rotation.y = Math.PI; g.add(back);
    g.position.set(x, 0, -y);
    g.rotation.y = gt.face === 'e' || gt.face === 'w' ? Math.PI / 2 : 0;
    z.bgroup.add(g);
    g.traverse((o) => { if (o.isMesh) o.userData.zone = z.id; });
  }
  await Promise.all(jobs);
}

/** 盘心标签上画四条路和路名（在 buildLabel 的画布上，坐标已平移到中心，k = 像素 / 米）。 */
export function paintStreets(g, k, font) {
  g.save();
  for (const s of STREETS) {
    const [ax, ay] = s.a, [bx, by] = s.b;
    g.strokeStyle = 'rgba(211,215,218,0.22)';
    g.lineWidth = 9 * k;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(ax * k, -ay * k); g.lineTo(bx * k, -by * k); g.stroke();
    g.strokeStyle = 'rgba(211,215,218,0.4)';
    g.lineWidth = 0.8 * k;
    g.setLineDash([6 * k, 6 * k]);
    g.beginPath(); g.moveTo(ax * k, -ay * k); g.lineTo(bx * k, -by * k); g.stroke();
    g.setLineDash([]);
    const vertical = Math.abs(bx - ax) < 1;
    const mx = ((ax + bx) / 2) * k, my = (-(ay + by) / 2) * k;
    g.save();
    g.translate(vertical ? mx : mx + 210 * k, vertical ? my - 140 * k : my);
    if (vertical) g.rotate(ax > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.font = `${17 * k}px ${font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(16,22,40,0.85)';
    const w = g.measureText(s.name).width + 14 * k;
    g.fillRect(-w / 2, -11 * k, w, 22 * k);
    g.fillStyle = 'rgba(226,229,234,0.78)';
    g.fillText(s.name, 0, 1 * k);
    g.restore();
  }
  g.restore();
}
