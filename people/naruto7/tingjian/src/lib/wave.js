// 听见校园 · 几样到处都用的小图：包络波形、一个钟点的颜色。
import { tokensAt, css } from './clock.js';

/** 包络（每 20 毫秒一格）→ 对称的波形轮廓 path。只画真实声音的长度，不画补齐的静音。 */
export function wavePath(env, seconds, N = 160, H = 56) {
  if (!env || !env.length) return '';
  const frames = Math.max(1, Math.min(env.length, Math.floor(seconds * 50)));
  let mx = 1e-6;
  for (let i = 0; i < frames; i++) mx = Math.max(mx, env[i]);
  const mid = H / 2, hs = [];
  for (let c = 0; c < N; c++) {
    const a = Math.floor((c * frames) / N), b = Math.max(a + 1, Math.floor(((c + 1) * frames) / N));
    let v = 0;
    for (let i = a; i < b && i < frames; i++) v = Math.max(v, env[i]);
    hs.push(1 + Math.pow(v / mx, 0.62) * (mid - 2));
  }
  const top = hs.map((h, c) => `${c},${(mid - h).toFixed(1)}`), bot = hs.map((h, c) => `${c},${(mid + h).toFixed(1)}`).reverse();
  return `M${top.join('L')}L${bot.join('L')}Z`;
}

const cache = new Map();
/** 一个钟点的颜色：就是整站在那个钟点的天色。盘的纸签用它，所以一张盘的颜色告诉你它是几点录的。 */
export function hourColor(h) {
  if (h == null) return 'var(--ink)';
  const k = Math.round(h * 4) / 4;
  if (!cache.has(k)) { const t = tokensAt(k); cache.set(k, css(t.bg0.map((v, i) => v * 0.72 + t.bg1[i] * 0.28))); }
  return cache.get(k);
}
