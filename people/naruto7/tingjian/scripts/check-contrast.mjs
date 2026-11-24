// 全天对比度自检：按 0.05 小时一步扫完 24 小时，核对 clock.js 里写的保底。
// 正文墨对纸 ≥ 7，次级文字 ≥ 4.5，细线 ≥ 3；示波黄只做图形，不在这里查。
import { tokensAt, contrast, fmtHour } from '../src/lib/clock.js';
let worst = { ink: 99, ink2: 99, line: 99 }, at = {};
for (let h = 0; h < 24; h += 0.05) {
  const t = tokensAt(h);
  for (const k of ['ink', 'ink2', 'line']) {
    const c = contrast(t[k], t.paper);
    if (c < worst[k]) { worst[k] = c; at[k] = fmtHour(h); }
  }
}
const need = { ink: 7, ink2: 4.5, line: 3 };
let bad = 0;
for (const k of Object.keys(need)) {
  const okk = worst[k] >= need[k];
  if (!okk) bad++;
  console.log(`${okk ? '通过' : '不通过'}  ${k.padEnd(5)} 全天最低 ${worst[k].toFixed(2)}（${at[k]}），要求 ≥ ${need[k]}`);
}
process.exit(bad ? 1 : 0);
