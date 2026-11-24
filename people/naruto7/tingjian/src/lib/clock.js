// 听见校园 · 钟点：全站唯一的颜色来源（DESIGN.md §3）。
// 一个钟点 h（0–24，小数）给出两样东西：页面的颜色（底、纸、墨、细线）和三维里的光（太阳方位、高度、色温、入夜程度、亮窗）。
// CSS 变量、三维舞台、屏风的四扇屏都只读这里。关键帧之间平滑插值；明暗翻转压在半小时内，墨色不插值（插值会得到中灰字）。
// 对比度保底：正文对纸 ≥ 7:1，次级文字 ≥ 4.5:1，细线 ≥ 3:1（scripts/check-contrast.mjs 按 0.05 小时一步扫全天）。
import { reactive } from 'vue';

// —— 关键帧 ——  bg0 / bg1：舞台背景的上、下两色；paper：纸；ink：墨；dark：这一帧是不是暗底
// 光：az 太阳方位（从正北顺时针，度）、el 高度角、i 强度、col 光色、hemi 天光、night 入夜程度、lit 亮窗比例、plat 唱片亮度
const KF = [
  { h: 0, name: '夜', bg0: '#18223C', bg1: '#04060C', paper: '#111A2D', ink: '#E7EBF3', dark: true, az: 40, el: 40, i: 0.5, col: '#9DB2DA', hemi: 0.35, night: 1, lit: 0.3, plat: 0.34 },
  { h: 4.7, name: '夜', bg0: '#272845', bg1: '#06060E', paper: '#15172B', ink: '#E7E5EF', dark: true, az: 62, el: 26, i: 0.55, col: '#A9B2D8', hemi: 0.4, night: 0.95, lit: 0.16, plat: 0.4 },
  { h: 5.3, name: '晨', bg0: '#E9D4CB', bg1: '#80829A', paper: '#F4EDE9', ink: '#2A2433', az: 78, el: 4, i: 1.4, col: '#FFC6A6', hemi: 0.72, night: 0.5, lit: 0.22, plat: 0.72 },
  { h: 7, name: '晨', bg0: '#E2E3DF', bg1: '#93A0AD', paper: '#F2F3F0', ink: '#1F2A36', az: 92, el: 11, i: 2.1, col: '#FFDDBA', hemi: 0.92, night: 0.2, lit: 0.16, plat: 0.86 },
  { h: 10, name: '上午', bg0: '#E3E9EA', bg1: '#9AA8B3', paper: '#F3F5F4', ink: '#1C2833', az: 132, el: 36, i: 2.6, col: '#FFF6E8', hemi: 1.21, night: 0, lit: 0, plat: 1 },
  { h: 12.5, name: '午', bg0: '#EEEFEC', bg1: '#ABB3B7', paper: '#F7F7F4', ink: '#1B2430', az: 180, el: 63, i: 2.8, col: '#FFFFFF', hemi: 1.36, night: 0, lit: 0, plat: 1.04 },
  { h: 15.8, name: '下午', bg0: '#EEE6D6', bg1: '#A69D8D', paper: '#F7F2E9', ink: '#2A251E', az: 232, el: 30, i: 2.6, col: '#FFF1DE', hemi: 1.21, night: 0, lit: 0, plat: 1 },
  { h: 18.2, name: '晚', bg0: '#F1C79E', bg1: '#7B4C50', paper: '#F8EBDD', ink: '#3A2224', az: 262, el: 12, i: 3.0, col: '#FFB27A', hemi: 0.92, night: 0.36, lit: 0.42, plat: 0.78 },
  { h: 18.8, name: '晚', bg0: '#3C4A78', bg1: '#0B1021', paper: '#172038', ink: '#EAE8F2', dark: true, az: 276, el: 5, i: 1.2, col: '#B9A6D0', hemi: 0.6, night: 0.78, lit: 0.55, plat: 0.5 },
  { h: 22, name: '夜', bg0: '#1A2442', bg1: '#05070E', paper: '#121B30', ink: '#E7EBF3', dark: true, az: 20, el: 38, i: 0.55, col: '#9DB2DA', hemi: 0.38, night: 1, lit: 0.42, plat: 0.36 },
  { h: 24, name: '夜', bg0: '#18223C', bg1: '#04060C', paper: '#111A2D', ink: '#E7EBF3', dark: true, az: 40, el: 40, i: 0.5, col: '#9DB2DA', hemi: 0.35, night: 1, lit: 0.3, plat: 0.34 },
];
const LIGHT_KEYS = ['el', 'i', 'hemi', 'night', 'lit', 'plat'];

export const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const FR = KF.map((k) => ({ ...k, bg0: hex(k.bg0), bg1: hex(k.bg1), paper: hex(k.paper), ink: hex(k.ink), col: hex(k.col), dark: !!k.dark }));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (t) => t * t * (3 - 2 * t);
export const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
export const toHex = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

function lum([r, g, b]) {
  const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** 把 fg 朝黑或白推，直到对 bg 的对比度达到 min。 */
function fit(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const target = contrast([0, 0, 0], bg) >= contrast([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) { const c = lerp(fg, target, t); if (contrast(c, bg) >= min) return c; }
  return target;
}
/** 从 bg 往 ink 走，取第一个对比度达到 min 的混合点。 */
function mixFit(bg, ink, t0, min) {
  for (let t = t0; t <= 1.0001; t += 0.02) { const c = lerp(bg, ink, t); if (contrast(c, bg) >= min) return c; }
  return ink;
}

export const wrap = (h) => ((h % 24) + 24) % 24;

/** 钟点 h 的全部颜色与光（数组是 0–255 的 [r,g,b]）。 */
export function tokensAt(h) {
  const x = wrap(h);
  let i = 0;
  while (i < FR.length - 2 && x >= FR[i + 1].h) i++;
  const a = FR[i], b = FR[i + 1];
  const t = smooth((x - a.h) / (b.h - a.h || 1));
  const bg0 = lerp(a.bg0, b.bg0, t), bg1 = lerp(a.bg1, b.bg1, t);
  let paper = lerp(a.paper, b.paper, t);
  // 明暗不同的两帧之间，纸不停在中灰上：亮度落进 (0.076, 0.37) 这一段时，哪一种墨都到不了 7:1。
  // 落进去了就往离得近的那一端（亮帧或暗帧的纸）推出去。舞台背景照常连续地变，只有纸在中点翻一次面。
  if (a.dark !== b.dark) {
    const L = lum(paper);
    if (L > 0.076 && L < 0.37) {
      const lightEnd = a.dark ? b.paper : a.paper, darkEnd = a.dark ? a.paper : b.paper;
      const goLight = (L - 0.076) / (0.37 - 0.076) > 0.5;
      const end = goLight ? lightEnd : darkEnd;
      for (let k = 0.02; k <= 1.0001; k += 0.02) {
        const c = lerp(paper, end, k), l = lum(c);
        if (goLight ? l >= 0.37 : l <= 0.076) { paper = c; break; }
        if (k > 0.99) paper = end;
      }
    }
  }
  // 明暗不同的两帧之间，墨色取对比度更高的那一边
  let ink = a.dark === b.dark ? lerp(a.ink, b.ink, t) : contrast(a.ink, paper) >= contrast(b.ink, paper) ? a.ink : b.ink;
  ink = fit(ink, paper, 7);
  const dark = lum(paper) < 0.18;
  let daz = ((b.az - a.az + 540) % 360) - 180;
  const light = { az: (a.az + daz * t + 360) % 360, col: lerp(a.col, b.col, t) };
  for (const k of LIGHT_KEYS) light[k] = a[k] + (b[k] - a[k]) * t;
  return {
    h: x, name: t < 0.5 ? a.name : b.name, dark,
    bg0, bg1, paper, ink,
    ink2: mixFit(paper, ink, 0.66, 4.6),
    line: mixFit(paper, ink, 0.4, 3),
    hair: lerp(paper, ink, 0.16),
    wash: lerp(paper, ink, 0.05),
    light,
  };
}

/** 一天里的时段名（和刻声 slot.js 同一套分档）。 */
export function slotOfHour(h) {
  const x = wrap(h);
  return x < 5 ? '夜' : x < 9 ? '晨' : x < 12 ? '上午' : x < 14 ? '午' : x < 18 ? '下午' : x < 22 ? '晚' : '夜';
}
export const SLOT_HOUR = { 夜: 23, 晨: 7, 上午: 10, 午: 12.5, 下午: 16, 晚: 19.3 };

export function fmtHour(h) {
  const x = wrap(h), hh = Math.floor(x), mm = Math.floor((x - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
const CN = '〇一二三四五六七八九';
export function cnHour(h) {
  const n = Math.floor(wrap(h));
  return n < 10 ? `${CN[n]}时` : n === 10 ? '十时' : n < 20 ? `十${CN[n - 10]}时` : n === 20 ? '二十时' : `二十${CN[n - 20]}时`;
}

// —— 全站的钟 ——
// source：'now' 此刻 / 'pick' 用户选的钟点（年轮的时针、一天里的某一刻）/ 'clip' 正在放的那张盘录下的钟点
const nowHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
const fixed = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('h')) : NaN;
const FIXED = Number.isFinite(fixed) && fixed >= 0 && fixed < 24 ? fixed : null;
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clock = reactive({
  now: FIXED ?? nowHour(),     // 此刻（演示时可用 ?h= 固定）
  source: 'now',
  target: FIXED ?? nowHour(),  // 要去的钟点
  shown: FIXED ?? nowHour(),   // 正在显示的钟点（渐变中）
  label: '',                   // 非此刻时写明在看什么
  tokens: tokensAt(FIXED ?? nowHour()),
  fixed: FIXED != null,
});

let anim = null;
/** 去一个钟点。dur 毫秒；拖动时间轴时用 0（跟手）。 */
export function goHour(h, { source = 'pick', label = '', dur = 1200 } = {}) {
  clock.source = source;
  clock.label = label;
  clock.target = wrap(h);
  if (!dur || reduced) { anim = null; clock.shown = clock.target; paint(); return; }
  const from = clock.shown;
  let d = clock.target - from;
  if (d > 12) d -= 24; if (d < -12) d += 24;   // 走最短的那一边
  anim = { t0: performance.now(), dur, from, d };
}
export function backToNow(dur = 1200) { goHour(clock.now, { source: 'now', label: '', dur }); }

let painted = -1;
function paint() {
  const t = tokensAt(clock.shown);
  clock.tokens = t;
  if (typeof document === 'undefined') return;
  const s = document.documentElement.style;
  s.setProperty('--bg0', css(t.bg0));
  s.setProperty('--bg1', css(t.bg1));
  s.setProperty('--paper', css(t.paper));
  s.setProperty('--paper-a', `rgb(${t.paper.map(Math.round).join(' ')} / 0.9)`);
  s.setProperty('--ink', css(t.ink));
  s.setProperty('--ink-2', css(t.ink2));
  s.setProperty('--line', css(t.line));
  s.setProperty('--hair', css(t.hair));
  s.setProperty('--wash', css(t.wash));
  s.setProperty('--sun', css(t.light.col));
  document.documentElement.dataset.dark = t.dark ? '1' : '0';
  document.documentElement.style.colorScheme = t.dark ? 'dark' : 'light';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = toHex(t.bg0);
}

function tick(now) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    clock.shown = wrap(anim.from + anim.d * e);
    if (k >= 1) { anim = null; clock.shown = clock.target; }
    paint();
  } else if (Math.abs(clock.shown - painted) > 1e-4) { paint(); }
  painted = clock.shown;
  requestAnimationFrame(tick);
}

if (typeof window !== 'undefined') {
  paint();
  requestAnimationFrame(tick);
  // 此刻每二十秒走一次；在看别的钟点时，此刻也照走，只是不显示
  setInterval(() => {
    if (clock.fixed) return;
    clock.now = nowHour();
    if (clock.source === 'now' && !anim) { clock.target = clock.now; clock.shown = clock.now; }
  }, 20000);
}
