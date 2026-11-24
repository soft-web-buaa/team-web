// 刻声 · 一套灯，一个色温（第十轮）。
// 毛病（r9）：太阳的色温跟着时段走，三盏软箱却写死（主光中性、侧光暖橙、背光冷蓝），半球光也不换色；
// 黑胶是镜面，同一张盘上同时出现三套颜色。右栏的纸、地名标签是 CSS 颜色，不受 3D 光照影响，和画面不在同一个钟点里。
// 改法：每个时段只有一个「光色」（= 太阳 / 月光那一盏的色度）。软箱、半球光、环境贴图里的灯都取同一个色度，只靠亮度分主次；
// 纸色按同一个光色做一部分色适应（30%），白天几乎不变，傍晚偏暖、夜里偏冷一点点，墨色对比度始终 ≥ 7:1。
// 判据（单测 test/unit/light-rig.test.js 量）：同一时段里任意两盏灯的色度差 Δuv ≤ 0.003（CIE 1976 u'v'）。r9 是 0.026–0.075。
// 纯函数，不依赖 three.js：页面与单测共用。

export const PAPER = '#F2F4F3';
export const INK = '#24304A';
export const ADAPT = 0.3;           // 纸对光色的跟随程度（0 = 不跟，1 = 完全照着光色染）
// 每个时段的光色（太阳；夜里是月光）。r9 写在 plan3d.js 的 LIGHT 里，挪到这里是为了单测能量它
export const SLOT_LIGHT = { 夜: '#9DB2DA', 晨: '#FFDDBA', 上午: '#FFF6E8', 午: '#FFFFFF', 下午: '#FFF1DE', 晚: '#FFB27A' };
// r9 写死的三盏软箱（线性色）：只留给单测当「改前」对照
export const R9_BOXES = [[1.0, 0.97, 0.92], [1.0, 0.84, 0.68], [0.72, 0.84, 1.0]];

export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);
export const rgbToHex = (rgb) => '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0').toUpperCase()).join('');
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** 线性 sRGB → CIE 1976 u'v'。 */
export function uv([r, g, b]) {
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const d = X + 15 * Y + 3 * Z || 1;
  return [(4 * X) / d, (9 * Y) / d];
}
export const duv = (a, b) => { const p = uv(a), q = uv(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };

/** 光色：一个 sRGB 十六进制色 → 线性、最大分量归一到 1 的色度（只要「什么颜色」，亮度另给）。 */
export function chroma(hex) {
  const l = hexToRgb(hex).map(toLin), mx = Math.max(...l) || 1;
  return l.map((c) => c / mx);
}

/** WCAG 对比度。 */
export function contrast(hexA, hexB) {
  const L = (h) => lum(hexToRgb(h).map(toLin));
  const a = L(hexA), b = L(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 纸色：底色按光色做 ADAPT 的色适应（逐通道乘），再把亮度拉回原来的亮度——只换色相，不让纸变暗。 */
export function paperUnder(lightHex, base = PAPER, k = ADAPT) {
  const c = chroma(lightHex), p = hexToRgb(base).map(toLin);
  const m = c.map((x) => 1 + (x - 1) * k);
  const q = p.map((x, i) => x * m[i]);
  const s = lum(p) / (lum(q) || 1);
  return rgbToHex(q.map((x) => toSrgb(Math.min(1, x * s))));
}

/**
 * 一个时段的整套灯色。lightHex = 这一时段太阳（夜里是月光）的颜色。
 * 返回：boxes（三盏软箱，线性色度，同一个）、sky / ground（半球光上下两色）、paper（CSS 纸色）、ink（不变）。
 * 软箱的主次只在亮度上（STUDIO 里的 i），这里不给颜色上的差别。
 */
export function rigFor(lightHex, n = 3) {
  const c = chroma(lightHex);
  return {
    light: c,
    boxes: Array.from({ length: n }, () => c.slice()),
    sky: c.slice(),
    // 地面反上来的光：同一个色度，压暗到 9%（r9 的地面色是固定的石墨蓝，也是一套另外的颜色）
    ground: c.map((x) => x * 0.09),
    paper: paperUnder(lightHex),
    ink: INK,
  };
}
