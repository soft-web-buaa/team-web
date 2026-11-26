// 听见校园 · 年轮的星系画法（2026-11-26，组长与组员：年轮做成动态的恒星系；星不要实心点，要有渐变；轨道若有若无；背景是星空、银河；
// 数据多了要靠动态和算法让它不臃肿；早晚的钟点可以取消，也可以设法保留）。参考了《涌现 · 无人指挥》的风格：深色底、成千细点、
// 只用一种强调色、细线标注。只学风格，不讲涌现。
//
// 一条轨道是一个学年（最里最早，像树的年轮）；一颗星是一张盘。星在轨道上的角度是它录下的钟点（子夜在顶上，顺时针），
// 同一个学年里秋季学期略靠里、春季学期略靠外。星的大小、亮度跟着它被听过几次、被回应过几次；我的星是金色的；越老的星越暗一点。
// 星的颜色是它那个钟点的天色：夜里蓝紫、黎明粉、正午近白、黄昏橙红。
//
// 防臃肿（resolve）：按屏幕上的最小间距把每条轨道切成很多小格，每一格只留最重要的一两颗做「星」，其余化成星尘（几颗很暗的小点）。
// 数据越多，轨道越像一条星云带；拉近（滚轮）时格子变小，星尘里的星一颗颗分出来。不管多少张，画面的密度大致不变。
//
// 两种转法：钟点（保留早晚，系统不动，只有星在闪、时针扫过时那一带亮起来）/ 自转（取消钟点，内圈转得快、外圈转得慢，像开普勒）。
import { groupYears, yearLabel } from './ringlayout.js';
import { parseSemester } from '../kesheng/web/semester.js';

const TAU = Math.PI * 2;
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h % 100000) / 100000;
}
// 星的颜色：钟点的天色，饱和度提上去（在深色底上要亮）
const TINT = [[0, [150, 140, 240]], [4.6, [165, 145, 235]], [5.6, [255, 165, 150]], [7.5, [255, 214, 175]], [10, [228, 238, 255]], [15.5, [255, 238, 212]], [17.6, [255, 160, 100]], [18.6, [255, 112, 92]], [19.6, [196, 150, 245]], [22, [162, 148, 240]], [24, [150, 140, 240]]];
export function hourTint(h) {
  const x = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < TINT.length - 2 && x >= TINT[i + 1][0]) i++;
  const [ha, a] = TINT[i], [hb, b] = TINT[i + 1], t = (x - ha) / (hb - ha || 1);
  return a.map((v, k) => Math.round(v + (b[k] - v) * t));
}
const GOLD = [255, 205, 90], SCOPE = '#E6BE3A';

/** 排：轨道与星的静止位置（单位圆里，半径 0..1）。 */
export function galaxyLayout(items, { r0 = 0.2, r1 = 0.93 } = {}) {
  const list = items.filter((e) => e.hour != null && e.semester);
  const years = groupYears(list);
  const nY = years.length;
  const orbits = years.map((g, i) => ({ year: g.year, empty: !!g.empty, n: g.items.length, r: nY < 2 ? (r0 + r1) / 2 : r0 + (i / (nY - 1)) * (r1 - r0), w: (r1 - r0) / Math.max(1, nY), dens: new Float32Array(72) }));
  const now = Date.now(), stars = [];
  years.forEach((g, i) => {
    const o = orbits[i];
    for (const e of g.items) {
      const h1 = hash(e.id), h2 = hash(e.id + 'b'), h3 = hash(e.id + 'c'), h4 = hash(e.id + 'd');
      const part = (parseSemester(e.semester) || { n: 2 }).n;
      const jit = (h1 + h2 + h3 - 1.5) * 0.5;                   // 近似高斯，±0.75
      const rr = o.r + o.w * ((part === 1 ? -0.16 : 0.16) + jit * 0.16);
      const a = (e.hour / 24) * TAU + (h4 - 0.5) * 0.035;
      const age = e.at ? Math.max(0, (now - Date.parse(e.at)) / (365 * 864e5)) : 0;
      const imp = 1 + (e.heard || 0) + 2 * (e.echoN || 0) + (e.tier === 'real' ? 3 : 0) + (e.mine ? 8 : 0) + h1 * 0.5;
      o.dens[Math.floor(((a / TAU) % 1 + 1) % 1 * 72) % 72]++;
      stars.push({ e, oi: i, a, rr, imp, ph: h3 * TAU, sp: 0.6 + h2 * 1.6, col: e.mine ? GOLD : hourTint(e.hour), mine: !!e.mine, age, star: true, idx: 0,
        later: Math.max(0, Math.min(9, e.laterN || 0)) });   // 刻下以后又补了几句「后来」，星外就多几圈
    }
  });
  for (const o of orbits) { let m = 1e-6; for (const v of o.dens) m = Math.max(m, v); for (let k = 0; k < 72; k++) o.dens[k] /= m; }
  // 出场的先后：按录下的时间（最早的先到）
  [...stars].sort((p, q) => Date.parse(p.e.at || 0) - Date.parse(q.e.at || 0)).forEach((s, k, arr) => { s.idx = arr.length > 1 ? k / (arr.length - 1) : 0; });
  return { orbits, stars };
}

/** 防臃肿：spacing 是单位半径里两颗星之间的最小间距。返回 { stars, dust } 的个数。 */
export function resolve(L, spacing) {
  const bins = new Map();
  for (const s of L.stars) {
    const o = L.orbits[s.oi], nb = Math.max(8, Math.floor((TAU * o.r) / spacing));
    const key = s.oi * 1e6 + Math.floor((((s.a / TAU) % 1) + 1) % 1 * nb);
    let b = bins.get(key);
    if (!b) bins.set(key, (b = []));
    b.push(s);
  }
  let nS = 0, nD = 0;
  for (const b of bins.values()) {
    b.sort((p, q) => q.imp - p.imp);
    b.forEach((s, k) => { s.star = k < 2 || s.mine; if (s.star) nS++; else nD++; });
  }
  return { stars: nS, dust: nD };
}

// ====================================================================================
// 画（Canvas 2D）。同一个画家两处用：年轮页左边整块（B），或贴在唱片的盘心上（A，stage.js 当贴图用）
// ====================================================================================
const spriteCache = new Map();
function sprite(col, core = 1) {
  const key = `${col}|${core}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), [r, gg, b] = col;
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, `rgba(255,255,255,${core})`);
  gr.addColorStop(0.1, `rgba(${Math.min(255, r + 60)},${Math.min(255, gg + 60)},${Math.min(255, b + 60)},0.95)`);
  gr.addColorStop(0.26, `rgba(${r},${gg},${b},0.5)`);
  gr.addColorStop(0.55, `rgba(${r},${gg},${b},0.12)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  spriteCache.set(key, c);
  return c;
}
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class GalaxyPainter {
  /** opts: { background: true 画星空与银河 / false 透明, round: 只画在圆里（贴到盘心上时） } */
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.opt = { background: true, round: false, k: 1, fill: 0.47, ...opts };
    this.k = this.opt.k;   // 字、星、线的放大倍数：贴到盘上当贴图时，贴图会被缩小，要画大一点
    this.L = { orbits: [], stars: [] };
    this.view = { mode: 'clock', hour: 12, playingId: null, focusYear: null, zoom: 1 };
    this.t = 0; this.born = -1; this.modeK = 0; this.spin = 0; this.zoomNow = 1; this.resolvedAt = 0;
    this.hover = null;
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.bg = null;
  }
  setData(items) {
    const keep = this.L.stars.length > 0;
    this.L = galaxyLayout(items);
    this.count = resolve(this.L, this.spacing());
    if (!keep) this.born = this.t;
  }
  replay() { this.born = this.t; }
  set(v) { Object.assign(this.view, v); }
  resize(w, h, dpr = 1) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.bg = null;
    this.count = resolve(this.L, this.spacing());
  }
  get R() { return Math.min(this.W, this.H) * this.opt.fill * this.zoomNow; }
  spacing() { return (12 * this.k) / Math.max(60, Math.min(this.W || 600, this.H || 600) * this.opt.fill * (this.zoomNow || 1)); }
  center() { return [this.W / 2, this.H / 2]; }
  /** 一颗星此刻在哪（CSS 像素）。 */
  pos(s) {
    const [cx, cy] = this.center(), R = this.R;
    const life = this.born < 0 ? 1 : (this.t - this.born) / 2.4;
    const q = this.reduced ? 1 : ease((life - s.idx * 0.45) / 0.55);
    const o = this.L.orbits[s.oi];
    // 自转：内快外慢；钟点：不转，只有一点点本轮（星在自己的位置附近慢慢绕小圈）
    const free = this.modeK * (this.spin * Math.pow(0.35 / Math.max(0.1, o.r), 1.5));
    const wob = 0.004 * Math.sin(this.t * 0.3 * s.sp + s.ph);
    const a = s.a + free + wob - (1 - q) * 2.6;
    const r = s.rr * (0.15 + 0.85 * q) + 0.003 * Math.cos(this.t * 0.25 * s.sp + s.ph);
    return [cx + Math.sin(a) * r * R, cy - Math.cos(a) * r * R, q, a];
  }
  paintBackground() {
    const c = document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    const g = c.getContext('2d'), W = c.width, H = c.height, D = Math.hypot(W, H);
    const gr = g.createRadialGradient(W * 0.42, H * 0.4, 0, W * 0.5, H * 0.5, D * 0.65);
    gr.addColorStop(0, '#171845'); gr.addColorStop(0.45, '#0B0C27'); gr.addColorStop(1, '#030310');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // 银河：一条斜的带，几团很淡的星云色 + 成千细点
    g.save();
    g.translate(W / 2, H / 2); g.rotate(-0.42);
    for (const [x, y, r, col, a] of [[-0.3, 0, 0.42, '120,90,200', 0.1], [0.15, 0.02, 0.36, '70,110,210', 0.09], [0.42, -0.03, 0.3, '210,110,150', 0.06], [-0.05, 0.01, 0.6, '150,140,230', 0.05]]) {
      const q = g.createRadialGradient(x * D, y * D, 0, x * D, y * D, r * D);
      q.addColorStop(0, `rgba(${col},${a})`); q.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = q; g.save(); g.scale(1, 0.32); g.beginPath(); g.arc(x * D, (y * D) / 0.32, r * D, 0, TAU); g.fill(); g.restore();
    }
    for (let i = 0; i < 2600; i++) {   // 银河只做底，不能和数据的星抢
      const u = (hash('mw' + i) - 0.5) * D * 1.1, v = (hash('mv' + i) + hash('mx' + i) + hash('my' + i) - 1.5) * D * 0.11;
      const a = 0.04 + 0.22 * Math.pow(hash('ma' + i), 3);
      g.fillStyle = `rgba(220,225,255,${a})`;
      g.fillRect(u, v, 1, 1);
    }
    g.restore();
    // 远处的星
    for (let i = 0; i < 240; i++) {
      const x = hash('sx' + i) * W, y = hash('sy' + i) * H, b = Math.pow(hash('sb' + i), 4), r = 0.5 + b * 1.6;
      g.fillStyle = `rgba(235,238,255,${0.1 + 0.4 * b})`;
      g.beginPath(); g.arc(x, y, r * this.dpr * 0.45, 0, TAU); g.fill();
    }
    this.bg = c;
  }
  /** 每帧。dt 秒。 */
  frame(dt) {
    const g = this.g, v = this.view, dpr = this.dpr;
    if (!this.W) return;
    this.t += this.reduced ? 0 : dt;
    this.modeK += ((v.mode === 'free' ? 1 : 0) - this.modeK) * (this.reduced ? 1 : 1 - Math.exp(-dt / 0.6));
    this.spin += dt * 0.05 * this.modeK;
    const z0 = this.zoomNow;
    this.zoomNow += (v.zoom - this.zoomNow) * (this.reduced ? 1 : 1 - Math.exp(-dt / 0.18));
    if (Math.abs(this.zoomNow - this.resolvedAt) / this.zoomNow > 0.08 || (z0 !== this.zoomNow && Math.abs(v.zoom - this.zoomNow) < 0.002)) { this.count = resolve(this.L, this.spacing()); this.resolvedAt = this.zoomNow; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = this.W, H = this.H, [cx, cy] = this.center(), R = this.R;
    if (this.opt.background) { if (!this.bg) this.paintBackground(); g.drawImage(this.bg, 0, 0, W, H); }
    else g.clearRect(0, 0, W, H);
    if (this.opt.round) { g.save(); g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, TAU); g.clip(); if (!this.opt.background) { g.fillStyle = '#080920'; g.fill(); } }
    g.globalCompositeOperation = 'lighter';
    const life = this.born < 0 ? 1 : (this.t - this.born) / 2.4;
    const clockK = 1 - this.modeK;
    // 核：学院路
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.16);
    core.addColorStop(0, 'rgba(255,236,190,0.55)'); core.addColorStop(0.25, 'rgba(230,190,120,0.18)'); core.addColorStop(1, 'rgba(120,100,200,0)');
    g.fillStyle = core; g.beginPath(); g.arc(cx, cy, R * 0.16, 0, TAU); g.fill();
    // 时针：此刻（或拖到的钟点）。扫过的那一带星会亮一点
    const ha = (v.hour / 24) * TAU;
    if (clockK > 0.01) {
      const hx = Math.sin(ha), hy = -Math.cos(ha);
      const lg = g.createLinearGradient(cx, cy, cx + hx * R * 1.02, cy + hy * R * 1.02);
      lg.addColorStop(0, 'rgba(230,190,58,0)'); lg.addColorStop(0.3, `rgba(230,190,58,${0.35 * clockK})`); lg.addColorStop(1, `rgba(230,190,58,${0.05 * clockK})`);
      g.strokeStyle = lg; g.lineWidth = 1.2 * this.k;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + hx * R * 1.02, cy + hy * R * 1.02); g.stroke();
    }
    // 轨道：一圈很多小段，越密的地方越亮，再叠一道慢慢走的微光；空的学年是一圈虚点（疤）
    const SEG = 144;
    this.L.orbits.forEach((o, i) => {
      const dim = v.focusYear != null && v.focusYear !== o.year ? 0.25 : 1;
      const rr = o.r * R * (0.15 + 0.85 * ease(life * 1.6 - 0.1));
      const off = this.modeK * this.spin * Math.pow(0.35 / Math.max(0.1, o.r), 1.5);
      g.lineWidth = (v.focusYear === o.year ? 2.2 : 1.5) * this.k;
      const fade = 0.85 + 0.15 * (1 - o.r);   // 越外圈越淡一点，但外圈也看得见
      for (let k = 0; k < SEG; k++) {
        const a0 = (k / SEG) * TAU, a1 = ((k + 0.78) / SEG) * TAU;
        const d = o.empty ? 0 : o.dens[Math.floor((k / SEG) * 72)];
        const shimmer = 0.8 + 0.2 * Math.sin(a0 * 3 - this.t * 0.35 + i * 1.7);
        let a = o.empty ? (k % 3 ? 0 : 0.3) : (0.3 + 0.28 * Math.sqrt(d)) * fade * shimmer;
        a *= dim * Math.min(1, life * 1.4);
        if (a < 0.006) continue;
        g.strokeStyle = `rgba(200,206,255,${a})`;
        g.beginPath(); g.arc(cx, cy, rr, a0 - Math.PI / 2 + off, a1 - Math.PI / 2 + off); g.stroke();
      }
      // 刻度：每 30 度一小段稍亮的短刻，让一圈圈轨道有节奏
      for (let t = 0; t < 12; t++) {
        const aa = (t / 12) * TAU - Math.PI / 2 + off;
        const at = (o.empty ? 0.2 : 0.42) * dim * Math.min(1, life * 1.4);
        g.strokeStyle = `rgba(214,220,255,${at})`;
        g.beginPath(); g.arc(cx, cy, rr, aa, aa + 0.02); g.stroke();
      }
    });
    // 星尘
    for (const s of this.L.stars) {
      if (s.star) continue;
      const [x, y, q] = this.pos(s);
      if (q <= 0) continue;
      const dim = v.focusYear != null && v.focusYear !== this.L.orbits[s.oi].year ? 0.25 : 1;
      const [r, gg, b] = s.col;
      for (let k = 0; k < 3; k++) {
        const ox = (hash(s.e.id + k) - 0.5) * 7 * this.k, oy = (hash(s.e.id + 'y' + k) - 0.5) * 7 * this.k;
        g.fillStyle = `rgba(${r},${gg},${b},${(0.4 + 0.18 * Math.sin(this.t * s.sp + s.ph + k)) * q * dim})`;
        g.fillRect(x + ox, y + oy, 1.3 * this.k, 1.3 * this.k);
      }
    }
    // 星
    const pl = v.playingId;
    let playing = null;
    for (const s of this.L.stars) {
      if (!s.star) continue;
      const [x, y, q, a] = this.pos(s);
      if (q <= 0) continue;
      const dim = v.focusYear != null && v.focusYear !== this.L.orbits[s.oi].year ? 0.22 : 1;
      let da = Math.abs(((a - ha) % TAU + TAU) % TAU); da = Math.min(da, TAU - da);
      const sweep = clockK * Math.max(0, 1 - da / 0.22) * 0.6;
      const tw = 0.78 + 0.22 * Math.sin(this.t * 1.3 * s.sp + s.ph);
      const bright = (0.72 + 0.4 * Math.min(1, Math.sqrt(s.imp / 12))) * (1 - 0.3 * Math.min(1, s.age / 6)) * tw * (1 + sweep);
      const size = (13 + 15 * Math.sqrt(Math.min(s.imp, 24) / 24)) * (s.mine ? 1.45 : 1) * Math.pow(this.zoomNow, 0.35) * (this.hover === s ? 1.5 : 1) * this.k;
      g.globalAlpha = Math.min(1, bright * q * dim);
      g.drawImage(sprite(s.col), x - size / 2, y - size / 2, size, size);
      // 「后来」：外面的细同心环，一圈一句，像树的年轮。颜色和这颗星一样，越外越淡。
      if (s.later) {
        const [cr, cg, cb] = s.col;
        g.globalAlpha = 1;
        for (let i = 0; i < s.later; i++) {
          const a = Math.min(0.6, (0.5 - 0.25 * (s.later === 1 ? 0 : i / (s.later - 1))) * bright * q * dim);
          g.strokeStyle = `rgba(${cr},${cg},${cb},${Math.max(0, a).toFixed(3)})`;
          g.lineWidth = Math.max(0.8, 1 * this.k);
          g.beginPath(); g.arc(x, y, size * 0.16 + (3 + 2 * i) * this.k, 0, TAU); g.stroke();
        }
      }
      if (s.e.id === pl) playing = [x, y];
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // 正在放的那一颗：示波黄的一圈，慢慢往外扩
    if (playing) {
      const ph = (this.t * 0.6) % 1;
      const k = this.k;
      g.strokeStyle = `rgba(230,190,58,${0.9 * (1 - ph)})`; g.lineWidth = 1.4 * k;
      g.beginPath(); g.arc(playing[0], playing[1], (6 + ph * 16) * k, 0, TAU); g.stroke();
      g.strokeStyle = SCOPE; g.lineWidth = 1.6 * k;
      g.beginPath(); g.arc(playing[0], playing[1], 5 * k, 0, TAU); g.stroke();
    }
    // 标注（细线、小字，像图注）：学年写在轨道左下；钟点写在外圈四个方向
    g.font = `${Math.round(11 * this.k)}px system-ui, "Microsoft YaHei", sans-serif`;
    g.textBaseline = 'middle';
    const lab = Math.min(1, Math.max(0, life * 1.5 - 0.6));
    this.L.orbits.forEach((o) => {
      if (o.empty && this.L.orbits.length > 6) return;
      const aL = 3.75, x = cx + Math.sin(aL) * o.r * R, y = cy - Math.cos(aL) * o.r * R;
      const dim = v.focusYear != null && v.focusYear !== o.year ? 0.35 : 1;
      g.fillStyle = `rgba(210,214,240,${0.55 * lab * dim})`;
      g.textAlign = 'right';
      g.fillText(`${yearLabel(o.year).replace(' 学年', '')}${o.empty ? ' · 空' : ` · ${o.n}`}`, x - 6 * this.k, y);
    });
    if (clockK > 0.02) {
      g.textAlign = 'center';
      g.fillStyle = `rgba(210,214,240,${0.6 * clockK * lab})`;
      const rr = R * 1.0 + 16 * this.k;
      [['子夜', 0], ['六时', 6], ['正午', 12], ['十八时', 18]].forEach(([t, h]) => { const a = (h / 24) * TAU; g.fillText(t, cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); });
      g.strokeStyle = `rgba(210,214,240,${0.25 * clockK * lab})`; g.lineWidth = this.k;
      for (let h = 0; h < 24; h++) { const a = (h / 24) * TAU, r0 = R * 0.985 + 4 * this.k, r1 = r0 + (h % 6 ? 3 : 6) * this.k; g.beginPath(); g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); g.stroke(); }
    }
    if (this.opt.round) g.restore();
  }
  /** (x, y) CSS 像素处最近的一颗（星优先，其次星尘），找不到返回 null。 */
  pick(x, y, rad = 14) {
    rad *= this.k;
    let best = null, bd = rad * rad;
    for (const s of this.L.stars) {
      const [px, py, q] = this.pos(s);
      if (q < 0.5) continue;
      const d = (px - x) ** 2 + (py - y) ** 2 - (s.star ? 40 * this.k * this.k : 0);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
