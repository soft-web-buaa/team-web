// 刻声 · 外圈的学期带（第九轮）。
// 一张唱片从外往里放：最外一带是最早的学期，挨着盘心（校园）的是最近的学期。一个学期一带，带与带之间是一道没刻纹的光面。
// 带宽按这一学期的藏片张数开方分配（张数只从 tier.js 的 counts() 出）；隔着空学期的地方，光面加宽——那几年确实没有声音。
// 正在放的那张所在的学期，那一带展开到外圈的 share，别的带让出位置；唱针落在展开的那一带里。纯函数，页面和单测共用。
import { semesterSeq, semesterLabel } from '../semester.js';
import { counts } from '../tier.js';

/** 按学期分带：只收编码认得的学期；从早到晚排（下标 0 = 最外一带）。 */
export function semesterBands(list) {
  const by = new Map();
  for (const e of list || []) {
    if (semesterSeq(e && e.semester) == null) continue;
    if (!by.has(e.semester)) by.set(e.semester, []);
    by.get(e.semester).push(e);
  }
  return [...by.entries()]
    .map(([semester, items]) => ({ semester, seq: semesterSeq(semester), label: semesterLabel(semester), items, n: counts(items).total }))
    .filter((b) => b.n > 0)
    .sort((a, b) => a.seq - b.seq);
}

/**
 * 半径布局：从 rOut（外）排到 rIn（内）。返回每一带的 { r0: 外沿, r1: 内沿 }。
 * open[i] ∈ [0, 1]：第 i 带展开的进度（动画里逐帧走）；几带同时在收放时，进度之和超过 1 就按比例压回 1。
 */
export function bandLayout(bands, rIn, rOut, open = [], { share = 0.42, land = 1.6, gapLand = 7, minW = 1.5 } = {}) {
  const n = bands.length;
  if (!n) return [];
  const lands = [];
  for (let i = 0; i < n - 1; i++) lands.push(bands[i + 1].seq - bands[i].seq > 1 ? gapLand : land);
  const A = Math.max(0, rOut - rIn - lands.reduce((s, x) => s + x, 0));
  const raw = bands.map((b) => Math.sqrt(Math.max(1, b.n)));
  const sum = raw.reduce((s, x) => s + x, 0);
  // 每带至少 minW：先给保底，剩下的再按开方分
  const floor = Math.min(minW, A / n);
  const base = raw.map((x) => floor / A + ((A - floor * n) / A) * (x / sum));
  let X = 0;
  const x = bands.map((_, i) => { const v = Math.min(1, Math.max(0, open[i] || 0)); X += v; return v; });
  const norm = X > 1 ? 1 / X : 1;
  const XX = Math.min(1, X);
  const out = [];
  let r = rOut;
  for (let i = 0; i < n; i++) {
    const w = A * (base[i] * (1 - share * XX) + share * x[i] * norm);
    out.push({ r0: r, r1: r - w });
    r -= w + (lands[i] || 0);
  }
  return out;
}

/** 半径落在哪一带：返回下标；落在光面或带外就是 -1。 */
export function bandAt(layout, rho) {
  for (let i = 0; i < layout.length; i++) if (rho <= layout[i].r0 && rho >= layout[i].r1) return i;
  return -1;
}
