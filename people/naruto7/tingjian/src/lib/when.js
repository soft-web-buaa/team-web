// 听见校园 · 时间口径：浏览器与服务端共用（纯函数）。
// 北航在东八区：钟点、时段、学期、教学周一律按北京时间算，不按设备时区。
import { weekOf } from '../kesheng/web/calendar.js';

const BJ = 8 * 3600000;
/** 一个时刻在北京时间里的 { y, mo(1–12), d, h(小数) }。 */
export function bj(at) {
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const x = new Date(t + BJ);
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours() + x.getUTCMinutes() / 60 };
}
export const hourOf = (at) => { const b = bj(at); return b ? b.h : null; };
export function slotOfHour(h) {
  return h < 5 ? '夜' : h < 9 ? '晨' : h < 12 ? '上午' : h < 14 ? '午' : h < 18 ? '下午' : h < 22 ? '晚' : '夜';
}
/** 学期：校历里有就用校历；没有就按月份推（9–1 月秋季、2–6 月春季、7–8 月夏季），学期编码同刻声 YYYY-YYYY-N。 */
export function semesterOf(at, cal) {
  const b = bj(at);
  if (!b) return null;
  const local = new Date(Date.UTC(b.y, b.mo - 1, b.d, 12));
  const w = cal ? weekOf(new Date(b.y, b.mo - 1, b.d), cal) : null;
  if (w) return { key: w.key, week: w.week };
  void local;
  if (b.mo >= 9) return { key: `${b.y}-${b.y + 1}-1`, week: null };
  if (b.mo === 1) return { key: `${b.y - 1}-${b.y}-1`, week: null };
  if (b.mo <= 6) return { key: `${b.y - 1}-${b.y}-2`, week: null };
  return { key: `${b.y - 1}-${b.y}-3`, week: null };
}
export const dayKey = (at) => { const b = bj(at); return b ? `${String(b.mo).padStart(2, '0')}-${String(b.d).padStart(2, '0')}` : null; };
export function dayText(at) {
  const b = bj(at);
  return b ? `${b.y} 年 ${b.mo} 月 ${b.d} 日` : '';
}
