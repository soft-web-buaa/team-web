// 听见校园 · 数据地图的「地面」：一张画在校园地面上的图（一块画布贴图，铺在区块地面上方一点）。
// 热力、等高线、地上的年轮、地上的钟面都画在这里。三维的四种在 datafx.js。
// 只管画；画什么由 src/lib/datamap.js 算好传进来。
import { grainLayout, at, K } from '../lib/ringlayout.js';
import { valueOf, MOOD_COL } from '../lib/datamap.js';

const TAU = Math.PI * 2;
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * @param {HTMLCanvasElement} cv 正方形画布，覆盖世界坐标 x、z ∈ [-E, E]（米）
 * @param {object} o { E, places:[{id,x,z}], stats:Map, metric, form, dark, ink:[r,g,b], hour, playingPid }
 */
export function paintGround(cv, o) {
  const g = cv.getContext('2d'), W = cv.width, E = o.E;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, W);
  if (!o.form || o.form === 'rings' || o.form === 'clock') return false;
  const px = W / (2 * E);
  g.setTransform(px, 0, 0, px, E * px, E * px);        // 之后都用世界坐标（米）画：x 向右，z 向下
  const vals = o.places.map((p) => ({ p, s: o.stats.get(p.id), v: valueOf(o.stats.get(p.id), o.metric) }));
  const vmax = Math.max(1e-6, ...vals.map((x) => x.v));
  // 张数用印泥红（白天）/ 暖光（夜里）；安静用青；心情各一色。示波黄留给「此刻 / 我的 / 正在放」，这里不用
  const baseC = o.metric === 'quiet' ? (o.dark ? hex('#9FDEDD') : hex('#1F5F6B')) : o.dark ? hex('#F2B38A') : hex('#B23A2B');
  const colOf = (x) => (o.metric === 'mood' && x.s.mood ? hex(MOOD_COL[x.s.mood]) : baseC);
  const k = (x) => Math.sqrt(x.v / vmax);
  if (o.form === 'heat') heat(g, vals, k, colOf, o);
  else if (o.form === 'contour') contour(g, vals, k, colOf, o, E);
  return true;
}

function heat(g, vals, k, colOf, o) {
  g.globalCompositeOperation = o.dark ? 'lighter' : 'source-over';
  for (const x of vals) {
    if (!x.v) continue;
    const R = 50 + 110 * k(x), c = colOf(x), a = (o.dark ? 0.55 : 0.78) * (0.35 + 0.65 * k(x));
    const gr = g.createRadialGradient(x.p.x, x.p.z, 0, x.p.x, x.p.z, R);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.5, rgba(c, a * 0.6)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x.p.x, x.p.z, R, 0, TAU); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

// 等高线：各处的量是一座座高斯的山，加起来是一片地形。先铺一层层台地（像卡纸一张张叠起来），再描等高线
function contour(g, vals, k, colOf, o, E) {
  const N = 180, step = (2 * E) / N, sig = 85, f = new Float32Array((N + 1) * (N + 1));
  const live = vals.filter((x) => x.v);
  let fmax = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const X = -E + i * step, Z = -E + j * step;
    let s = 0;
    for (const x of live) { const d2 = (X - x.p.x) ** 2 + (Z - x.p.z) ** 2; if (d2 < 9 * sig * sig) s += k(x) * Math.exp(-d2 / (2 * sig * sig)); }
    f[j * (N + 1) + i] = s; fmax = Math.max(fmax, s);
  }
  if (!fmax) return;
  const LV = 7, levels = Array.from({ length: LV }, (_, i) => fmax * (0.08 + (0.9 * i) / LV));
  // 台地：小画布上按落在第几层填色，放大时平滑
  const c0 = o.metric === 'mood' ? null : colOf(live[0] || vals[0]);
  const sm = document.createElement('canvas'); sm.width = sm.height = N + 1;
  const sg = sm.getContext('2d'), img = sg.createImageData(N + 1, N + 1);
  // 心情：每一格取离它最近（权重最大）的那个地方的颜色
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const v = f[j * (N + 1) + i];
    let L = 0; while (L < LV && v >= levels[L]) L++;
    let c = c0;
    if (!c) { const X = -E + i * step, Z = -E + j * step; let best = 0, bx = null; for (const x of live) { const w = k(x) * Math.exp(-((X - x.p.x) ** 2 + (Z - x.p.z) ** 2) / (2 * sig * sig)); if (w > best) { best = w; bx = x; } } c = bx ? colOf(bx) : [0, 0, 0]; }
    const q = (j * (N + 1) + i) * 4;
    img.data[q] = c[0]; img.data[q + 1] = c[1]; img.data[q + 2] = c[2]; img.data[q + 3] = L ? Math.round(255 * Math.min(0.78, 0.12 + L * 0.095)) : 0;
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(sm, -E, -E, 2 * E + step, 2 * E + step);
  // 等高线：行进方格
  const ink = o.dark ? [236, 240, 246] : o.ink;
  g.lineJoin = 'round';
  levels.forEach((lv, li) => {
    g.strokeStyle = rgba(ink, li % 2 ? 0.5 : 0.85);
    g.lineWidth = li % 2 ? 2.2 : 4;
    g.beginPath();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = f[j * (N + 1) + i], b = f[j * (N + 1) + i + 1], c = f[(j + 1) * (N + 1) + i + 1], d = f[(j + 1) * (N + 1) + i];
      const idx = (a >= lv) | ((b >= lv) << 1) | ((c >= lv) << 2) | ((d >= lv) << 3);
      if (idx === 0 || idx === 15) continue;
      const X = -E + i * step, Z = -E + j * step;
      const lerp = (p, q) => (lv - p) / (q - p || 1e-9);
      const T = [X + step * lerp(a, b), Z], R = [X + step, Z + step * lerp(b, c)], B = [X + step * lerp(d, c), Z + step], Lf = [X, Z + step * lerp(a, d)];
      const seg = { 1: [Lf, T], 2: [T, R], 3: [Lf, R], 4: [R, B], 5: [Lf, T, R, B], 6: [T, B], 7: [Lf, B], 8: [B, Lf], 9: [B, T], 10: [T, R, B, Lf], 11: [B, R], 12: [R, Lf], 13: [R, T], 14: [T, Lf] }[idx];
      for (let s = 0; s < seg.length; s += 2) { g.moveTo(seg[s][0], seg[s][1]); g.lineTo(seg[s + 1][0], seg[s + 1][1]); }
    }
    g.stroke();
  });
}

// —— 悬在每个地方上空的小盘：年轮、钟面（画在地上会被楼挡住，所以浮在楼顶上方，像每栋楼上悬着一张唱片）——
/** 一张小盘：在 256×256 的画布上画一个地方的年轮或钟面。c = 主色 [r,g,b]，cmax = 全校同一把尺子（钟面用）。 */
export function paintMedal(cv, form, items, { c, dark, hour = null, cmax = 1, name = '', n = 0 }) {
  const g = cv.getContext('2d'), S = cv.width, R = S / 2 - 6;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  const paper = dark ? [18, 24, 40] : [246, 245, 240], line = dark ? [236, 240, 246] : [36, 48, 74];
  g.fillStyle = rgba(paper, 0.94);
  g.beginPath(); g.arc(0, 0, R + 4, 0, TAU); g.fill();
  g.strokeStyle = rgba(line, 0.5); g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, R + 3, 0, TAU); g.stroke();
  if (form === 'rings') {
    const L = grainLayout(items.filter((e) => e.hour != null && e.semester), { rIn: R * 0.16, rOut: R - 4 });
    for (const ring of L.rings) {
      if (ring.empty) continue;
      for (const [inner, outer, a] of [[ring.inner, ring.split, 0.28], [ring.split, ring.outer, 0.62]]) {
        g.beginPath();
        for (let i = 0; i <= K; i++) { const t = (i / K) * TAU, r = at(outer, t); i ? g.lineTo(Math.sin(t) * r, -Math.cos(t) * r) : g.moveTo(Math.sin(t) * r, -Math.cos(t) * r); }
        for (let i = K; i >= 0; i--) { const t = (i / K) * TAU, r = at(inner, t); g.lineTo(Math.sin(t) * r, -Math.cos(t) * r); }
        g.closePath(); g.fillStyle = rgba(c, a); g.fill();
      }
      g.beginPath();
      for (let i = 0; i <= K; i++) { const t = (i / K) * TAU, r = at(ring.outer, t); i ? g.lineTo(Math.sin(t) * r, -Math.cos(t) * r) : g.moveTo(Math.sin(t) * r, -Math.cos(t) * r); }
      g.strokeStyle = rgba(line, 0.75); g.lineWidth = 1.4; g.stroke();
    }
  } else {
    const cnt = new Array(24).fill(0);
    for (const e of items) if (e.hour != null) cnt[Math.floor(e.hour) % 24]++;
    const r0 = R * 0.3, Lm = R - r0 - 4;
    g.strokeStyle = rgba(line, 0.35); g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, r0, 0, TAU); g.stroke();
    for (let h = 0; h < 24; h += 6) { const t = (h / 24) * TAU; g.beginPath(); g.moveTo(Math.sin(t) * (r0 - 8), -Math.cos(t) * (r0 - 8)); g.lineTo(Math.sin(t) * (r0 - 2), -Math.cos(t) * (r0 - 2)); g.stroke(); }
    for (let h = 0; h < 24; h++) {
      const n = cnt[h]; if (!n) continue;
      const t = ((h + 0.5) / 24) * TAU, L = 6 + Lm * Math.sqrt(n / cmax), w = (TAU / 24) * 0.72;
      const on = hour != null && Math.floor(hour) % 24 === h;
      g.fillStyle = on ? '#E6BE3A' : rgba(c, 0.88);
      g.beginPath(); g.arc(0, 0, r0 + L, t - w / 2 - Math.PI / 2, t + w / 2 - Math.PI / 2); g.arc(0, 0, r0 + 1, t + w / 2 - Math.PI / 2, t - w / 2 - Math.PI / 2, true); g.closePath(); g.fill();
    }
  }
  if (hour != null && form === 'rings') { const t = (hour / 24) * TAU; g.strokeStyle = '#E6BE3A'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(t) * (R + 2), -Math.cos(t) * (R + 2)); g.stroke(); }
  g.fillStyle = '#E6BE3A'; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
  // 地名和张数：写在盘的下沿，盖一条纸
  if (name) {
    g.font = `${Math.round(S * 0.1)}px Zhuque, "Noto Serif CJK SC", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const label = n ? `${name} ${n}` : name, w = g.measureText(label).width + S * 0.08, y = R * 0.66;
    g.fillStyle = rgba(paper, 0.92);
    g.beginPath(); g.roundRect(-w / 2, y - S * 0.07, w, S * 0.14, S * 0.02); g.fill();
    g.fillStyle = rgba(line, 0.95);
    g.fillText(label, 0, y + 1);
  }
}

/** 小盘的主色与大小（全校同一把尺子）。 */
export function medalSpec(stats, metric, places, dark) {
  const vals = places.map((p) => ({ p, s: stats.get(p.id), v: valueOf(stats.get(p.id), metric) }));
  const vmax = Math.max(1e-6, ...vals.map((x) => x.v));
  const cnt = vals.map((x) => { const a = new Array(24).fill(0); for (const e of x.s.items) if (e.hour != null) a[Math.floor(e.hour) % 24]++; return Math.max(...a); });
  const baseC = metric === 'quiet' ? (dark ? hex('#9FDEDD') : hex('#1F5F6B')) : dark ? hex('#F2B38A') : hex('#B23A2B');
  return { cmax: Math.max(1, ...cnt), list: vals.map((x) => ({ id: x.p.id, name: x.p.name, items: x.s.items, k: Math.sqrt(x.v / vmax), c: metric === 'mood' && x.s.mood ? hex(MOOD_COL[x.s.mood]) : baseC })) };
}
