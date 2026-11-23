// 对比度自检：npm run check:contrast
// 按 0.05 小时一步扫完全天，核对天色的保底对比度。直接用页面实际使用的取色函数。
import { tokensAt, contrast } from '../src/lib/sky.js';

const RULES = [
  { key: 'ink', label: '正文 对 底色', min: 4.5, aim: 7, pair: (t) => [t.ink, t.bg] },
  { key: 'ink2', label: '次级文字 对 底色', min: 4.5, pair: (t) => [t.ink2, t.bg] },
  { key: 'accent', label: '强调色 对 底色', min: 4.5, pair: (t) => [t.accent, t.bg] },
  { key: 'accentPanel', label: '强调色 对 卡片底', min: 4.5, pair: (t) => [t.accent, t.panel] },
  { key: 'inkPanel', label: '正文 对 卡片底', min: 4.5, pair: (t) => [t.ink, t.panel] },
  { key: 'line', label: '边框 对 底色（非文字，要求 3）', min: 3, pair: (t) => [t.line, t.bg] },
];

const worst = Object.fromEntries(RULES.map((r) => [r.key, { v: Infinity, h: 0 }]));
for (let h = 0; h < 24; h += 0.05) {
  const t = tokensAt(h);
  for (const r of RULES) {
    const v = contrast(...r.pair(t));
    if (v < worst[r.key].v) worst[r.key] = { v, h };
  }
}

let bad = 0;
for (const r of RULES) {
  const w = worst[r.key];
  const ok = w.v >= r.min - 0.005;
  if (!ok) bad++;
  const total = Math.round(w.h * 60);
  const hh = Math.floor(total / 60);
  const mm = String(total % 60).padStart(2, '0');
  console.log(`${ok ? '通过' : '不通过'}  ${r.label.padEnd(24, '　')} 最低 ${w.v.toFixed(2)}（${hh}:${mm}），要求 ≥ ${r.min}`);
}
if (bad) process.exit(1);
console.log('全天对比度检查通过。');
