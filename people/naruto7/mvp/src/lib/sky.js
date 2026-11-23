// 天色：整站颜色由"一天中的时刻"决定。关键帧之间连续插值，拖动时间轴时颜色跟着走。
//
// 对比度有保底（WCAG 2.2 AA）：
//   正文 ink、次级文字 ink-2、强调色 accent 对底色和卡片底全天 ≥ 4.5:1；边框 line-strong ≥ 3:1
//   正文平时 ≥ 7:1，只有两次明暗过渡的那半小时里会降到 5:1 左右（中灰底的上限）
// 从浅色到深色的两次过渡（傍晚到夜里、夜里到清晨）压在半小时内，避免长时间停在中灰底上。
// scripts/check-contrast.mjs 会按 0.05 小时一步扫完全天，核对上面这些数。
import { periodOf } from './time.js';

const KF = [
  { h: 4.75, bg: '#17233D', ink: '#E9EDF5', accent: '#F4C75A', dark: true }, // 夜里：深蓝底，路灯黄
  { h: 5.25, bg: '#D6E4DC', ink: '#16302A', accent: '#17664A' }, // 清晨：雾绿
  { h: 8, bg: '#D6E4DC', ink: '#16302A', accent: '#17664A' },
  { h: 10.5, bg: '#EBEEF0', ink: '#1B2733', accent: '#2447D6' }, // 白天：冷灰白，钴蓝
  { h: 15.5, bg: '#EBEEF0', ink: '#1B2733', accent: '#2447D6' },
  { h: 18, bg: '#E7D5D9', ink: '#3A2230', accent: '#9C2F63' }, // 傍晚：粉灰，洋红
  { h: 19.25, bg: '#E7D5D9', ink: '#3A2230', accent: '#9C2F63' },
  { h: 19.75, bg: '#17233D', ink: '#E9EDF5', accent: '#F4C75A', dark: true },
];

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const FR = KF.map((k) => ({ h: k.h, bg: hex(k.bg), ink: hex(k.ink), accent: hex(k.accent), dark: !!k.dark }));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (t) => t * t * (3 - 2 * t);
const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;

function lum([r, g, b]) {
  const f = (c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** 把 fg 朝黑或白推，直到对 bg 的对比度达到 min；推到头也不够，就取推到头的那一端 */
function fit(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const target = contrast([0, 0, 0], bg) >= contrast([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = lerp(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

/** 从 bg 往 ink 走，取第一个对比度达到 min 的混合点，t 从 t0 起 */
function mixFit(bg, ink, t0, min) {
  for (let t = t0; t <= 1.0001; t += 0.02) {
    const c = lerp(bg, ink, t);
    if (contrast(c, bg) >= min) return c;
  }
  return ink;
}

/** 某个时刻的全部颜色（数组 [r,g,b]） */
export function tokensAt(h) {
  const x = ((h % 24) + 24) % 24;
  const first = FR[0];
  const last = FR[FR.length - 1];
  let bg;
  let ink;
  let accent;
  if (x < first.h || x >= last.h) {
    ({ bg, ink, accent } = last);
  } else {
    let i = 0;
    while (i < FR.length - 2 && x >= FR[i + 1].h) i++;
    const a = FR[i];
    const b = FR[i + 1];
    const t = smooth((x - a.h) / (b.h - a.h));
    bg = lerp(a.bg, b.bg, t);
    accent = lerp(a.accent, b.accent, t);
    // 明暗不同的两帧之间，墨色取对比度更高的那一边，不做插值（插值会得到中灰字）
    ink = a.dark === b.dark ? lerp(a.ink, b.ink, t) : contrast(a.ink, bg) >= contrast(b.ink, bg) ? a.ink : b.ink;
  }
  ink = fit(ink, bg, 7);
  const panel = lerp(bg, ink, 0.06);
  return {
    bg,
    ink,
    // 强调色要同时在底色和卡片底（比底色略深或略浅）上达标
    accent: fit(fit(accent, bg, 5), panel, 4.6),
    ink2: mixFit(bg, ink, 0.76, 4.5),
    line: mixFit(bg, ink, 0.5, 3),
    panel,
    hairline: lerp(bg, ink, 0.2),
  };
}

/** 供外部取底色用（时间轴渐变等） */
export function skyAt(h) {
  const { bg, ink, accent } = tokensAt(h);
  return { bg, ink, accent };
}

/** 把天色写进 :root 的 CSS 变量 */
export function applySky(h, root = document.documentElement) {
  const t = tokensAt(h);
  const s = root.style;
  s.setProperty('--bg', css(t.bg));
  s.setProperty('--ink', css(t.ink));
  s.setProperty('--accent', css(t.accent));
  s.setProperty('--ink-2', css(t.ink2));
  s.setProperty('--panel', css(t.panel));
  s.setProperty('--line', css(t.hairline));
  s.setProperty('--line-strong', css(t.line));
  s.colorScheme = lum(t.bg) < 0.18 ? 'dark' : 'light';
  root.dataset.period = periodOf(h).id;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = css(t.bg);
}

/** 时间轴上那条"天色带"：从 0 点到 24 点每半小时取一次底色 */
export function trackGradient() {
  const stops = [];
  for (let i = 0; i <= 48; i++) {
    const h = i / 2;
    stops.push(`${css(tokensAt(h === 24 ? 23.99 : h).bg)} ${((h / 24) * 100).toFixed(2)}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
