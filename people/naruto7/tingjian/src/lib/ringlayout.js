// 听见校园 · 年轮的排法（纯函数，页面和自检共用）。
// 一张圆：角度是一天里的钟点（子夜在顶上，顺时针），从里往外一圈是一个学年（最里是最早的，像树）。
// 一个学年里有秋、春两段，像树的早材和晚材：秋季学期在里、颜色浅，春季学期在外、颜色深。
//
// 旧排法的毛病（2026-11-25 组会）：圈是等宽的、点是一样大的。声音一多、又挤在晚上，点就叠成一团，圈线也密。
// 这里按实际的数据排，三种画法：
//   dots   点：每一张一颗点。圈宽按「这一圈最挤的那个钟点要叠几层」分，点放不下就先缩小，再在圈里往两边让（极坐标的蜂群排法）
//   grain  纹：每一圈的厚度随钟点变，哪个钟点声音多，那一段就厚。一圈一圈叠上去，外轮廓就是整个校园的一天。点变成圈里的细纹
//   auto   自动：点放得下（点不小于 MIN_DOT）就用点，放不下就长成纹
// 数据少时一颗颗点；多了长成年轮。不管多少张，圆的大小不变，画出来的不会叠成一团。

import { parseSemester, semesterLabel } from '../kesheng/web/semester.js';

const TAU = Math.PI * 2;
export const K = 144;                 // 一圈分 144 格（十分钟一格）
export const MIN_DOT = 2.4;           // 点的半径下限（像素）：再小就看不清、点不中，换成纹
const MAX_DOT = 4.2;

const ang = (h) => (h / 24) * TAU;
/** 学期编码 → { year: 学年起始年, part: 1 秋 / 2 春 / 3 夏 } */
function yearOf(sem) { const p = parseSemester(sem); return p ? { year: p.start, part: p.n } : null; }
export const yearLabel = (y) => `${y}–${String(y + 1).slice(2)} 学年`;

/** 按学年分圈。空着的学年也留一圈（很细的一道疤），时间是连续的。 */
export function groupYears(items) {
  const by = new Map();
  for (const e of items) {
    if (e.hour == null || !e.semester) continue;
    const y = yearOf(e.semester);
    if (!y) continue;
    if (!by.has(y.year)) by.set(y.year, { year: y.year, items: [], parts: { 1: [], 2: [], 3: [] } });
    const g = by.get(y.year);
    g.items.push(e);
    g.parts[y.part].push(e);
  }
  if (!by.size) return [];
  const ys = [...by.keys()].sort((a, b) => a - b);
  const out = [];
  for (let y = ys[0]; y <= ys.at(-1); y++) out.push(by.get(y) || { year: y, items: [], parts: { 1: [], 2: [], 3: [] }, empty: true });
  return out;
}

/** 一组钟点在一圈 K 格上的密度（冯·米塞斯核，kappa 越大越尖；12 ≈ 一个多小时宽），平均值归一为 1。 */
export function density(hours, kappa = 12) {
  const f = new Float64Array(K);
  if (!hours.length) return f;
  const norm = Math.exp(kappa);
  for (const h of hours) {
    const a = ang(h);
    for (let k = 0; k < K; k++) f[k] += Math.exp(kappa * Math.cos((k + 0.5) / K * TAU - a)) / norm;
  }
  let m = 0;
  for (let k = 0; k < K; k++) m += f[k];
  m /= K;
  for (let k = 0; k < K; k++) f[k] /= m || 1;
  return f;
}

// ====================================================================================
// 纹：每一圈的厚度随钟点变
// ====================================================================================
/**
 * @returns {{ rings: Array<{ year, n, empty, inner: Float64Array, split: Float64Array, outer: Float64Array, items }>, rIn, rOut, peak }}
 * inner / split / outer 是每一格的半径：inner 到 split 是秋季学期，split 到 outer 是春季学期（夏季并进春季）。
 */
export function grainLayout(items, { rIn, rOut, depth = 0.6, scar = 0.012 } = {}) {
  const years = groupYears(items);
  if (!years.length) return { rings: [], rIn, rOut };
  const base = years.map((g) => (g.empty ? 0 : Math.sqrt(g.items.length)));
  const thick = years.map((g, i) => {
    const t = new Float64Array(K), a = new Float64Array(K);
    if (g.empty) return { t, a };
    const all = density(g.items.map((e) => e.hour));
    const au = density(g.parts[1].map((e) => e.hour));
    const fa = g.parts[1].length / g.items.length;
    for (let k = 0; k < K; k++) {
      // 厚度对密度开 0.6 次方再封顶：声音全挤在一个钟点时圈也不会在别处细成一根线（那就又是一圈圈密线了）
      const v = Math.pow(Math.min(2.6, all[k]), 0.6);
      t[k] = base[i] * (1 - depth + depth * v);
      // 秋季学期占这一格的几成：按两段各自的密度分（某个钟点秋天多，那一段秋的纹就宽）
      const sa = fa * au[k], tot = all[k] || 1;
      a[k] = g.parts[1].length ? Math.min(1, sa / tot) : 0;
    }
    return { t, a };
  });
  // 疤：没有声音的学年留一道固定宽度的空，不随数据缩放
  const span = rOut - rIn, scarW = span * scar, nScar = years.filter((g) => g.empty).length;
  let peak = 0;
  for (let k = 0; k < K; k++) { let s = 0; for (const x of thick) s += x.t[k]; peak = Math.max(peak, s); }
  const scale = peak ? (span - scarW * nScar - span * 0.004 * years.length) / peak : 0;
  const cur = new Float64Array(K).fill(rIn);
  const rings = years.map((g, i) => {
    const inner = Float64Array.from(cur), split = new Float64Array(K), outer = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const w = g.empty ? scarW : thick[i].t[k] * scale;
      split[k] = cur[k] + w * thick[i].a[k];
      outer[k] = cur[k] + w;
      cur[k] = outer[k] + (g.empty ? 0 : span * 0.004);   // 圈与圈之间一道很细的缝
    }
    return { year: g.year, n: g.items.length, empty: !!g.empty, inner, split, outer, items: g.items, parts: g.parts };
  });
  return { rings, rIn, rOut, scale };
}

/** 一圈在某个角度（弧度，从顶上顺时针）的半径：在 K 格之间线性插值。 */
export function at(arr, a) {
  const x = (((a / TAU) * K - 0.5) % K + K) % K, i = Math.floor(x), f = x - i;
  return arr[i] * (1 - f) + arr[(i + 1) % K] * f;
}

// ====================================================================================
// 点：极坐标的蜂群排法
// ====================================================================================
/**
 * 每张一颗点，角度不动（就是录下的钟点），只在自己那一圈里往外让开。
 * 圈宽是这一圈堆得最高的地方；全部加起来放不下，就把点缩小，直到 MIN_DOT。
 * @returns {{ fits, r, rings: Array<{ year, r0, r1, n, empty }>, dots: Array<{ e, x, y, a, rr, ring }> }}
 */
export function dotLayout(items, { rIn, rOut, cx = 0, cy = 0, gap = 1.2 } = {}) {
  const years = groupYears(items);
  const span = rOut - rIn;
  if (!years.length) return { fits: true, r: MAX_DOT, rings: [], dots: [] };
  let r = MAX_DOT, plan = null;
  for (let tries = 0; tries < 12; tries++) {
    plan = tryDots(years, rIn, span, r, gap, cx, cy);
    if (plan.used <= span || r <= MIN_DOT) break;
    r = Math.max(MIN_DOT, r * Math.sqrt(span / plan.used) * 0.97);
  }
  const fits = plan.used <= span + 0.5;
  // 放不下（只有强制用点时才会到这里）：整体按比例压回圆里，点会叠上，这正是「点」这种画法的极限
  if (!fits) {
    const k = span / plan.used, sq = (v) => rIn + (v - rIn) * k;
    for (const d of plan.dots) { d.rr = sq(d.rr); d.x = cx + Math.sin(d.a) * d.rr; d.y = cy - Math.cos(d.a) * d.rr; }
    for (const g of plan.rings) { g.r0 = sq(g.r0); g.r1 = sq(g.r1); }
  }
  return { fits, r, rings: plan.rings, dots: plan.dots };
}

function tryDots(years, rIn, span, r, gap, cx, cy) {
  // 每一圈从内沿起往外堆：一颗点先落在内沿上，撞了就往外挪一层。最挤的钟点堆得最高，所以每一圈自己就是一张一天的直方图。
  // 碰撞用一张网格查（格宽 = 点距），跨过子夜也不用特判
  const pitch = r * 2 + gap, p2 = pitch * pitch * 0.94;
  const scarW = Math.max(3, pitch * 0.6);
  const grid = new Map(), cell = (x, y) => `${Math.floor(x / pitch)},${Math.floor(y / pitch)}`;
  const hit = (x, y) => {
    const gx = Math.floor(x / pitch), gy = Math.floor(y / pitch);
    for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) {
      const L = grid.get(`${gx + u},${gy + v}`);
      if (L) for (const q of L) if ((q.x - x) ** 2 + (q.y - y) ** 2 < p2) return true;
    }
    return false;
  };
  const rings = [], dots = [];
  let cur = rIn;
  years.forEach((g) => {
    if (g.empty) { rings.push({ year: g.year, r0: cur, r1: cur + scarW, n: 0, empty: true }); cur += scarW; return; }
    const r0 = cur;
    let top = r0 + r;
    const list = g.items.map((e) => ({ e, a: ang(e.hour) })).sort((p, q) => p.a - q.a);
    for (const p of list) {
      const sa = Math.sin(p.a), ca = Math.cos(p.a);
      let rr = r0 + r, x, y;
      for (let n = 0; n < 400; n++, rr += pitch * 0.5) {
        x = cx + sa * rr; y = cy - ca * rr;
        if (!hit(x, y)) break;
      }
      const d = { e: p.e, a: p.a, x, y, rr, ring: rings.length };
      const c = cell(x, y);
      if (!grid.has(c)) grid.set(c, []);
      grid.get(c).push(d);
      dots.push(d);
      top = Math.max(top, rr);
    }
    const r1 = top + r;
    rings.push({ year: g.year, r0, r1, n: g.items.length, empty: false });
    cur = r1 + gap * 2;
  });
  return { used: cur - rIn, rings, dots };
}

// ====================================================================================
// 选哪种
// ====================================================================================
/** auto：点放得下就用点，放不下用纹。 */
export function pickMode(items, opts) {
  const d = dotLayout(items, opts);
  return d.fits && d.r >= MIN_DOT ? { mode: 'dots', dots: d } : { mode: 'grain', dots: d };
}

/** 一圈的概括：「2024–25 学年 · 41 张 · 最多在 19 时前后」。 */
export function ringLine(ring) {
  if (ring.empty) return `${yearLabel(ring.year)} · 没有声音`;
  const f = density(ring.items.map((e) => e.hour));
  let k = 0;
  for (let i = 1; i < K; i++) if (f[i] > f[k]) k = i;
  const h = Math.floor(((k + 0.5) / K) * 24);
  const au = ring.parts ? ring.parts[1].length : 0, sp = ring.parts ? ring.parts[2].length + ring.parts[3].length : 0;
  return `${yearLabel(ring.year)} · ${ring.n} 张（秋 ${au}、春 ${sp}）· 最多在 ${h} 时前后`;
}

export { semesterLabel };
