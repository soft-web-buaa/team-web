// 刻声 · 学期编码与称呼（唯一的定义处）
// 编码 `YYYY-YYYY-N`，与 data/calendar.json 的键一致：N=1 秋季（学年第一学期）、2 春季、3 夏季（三学期制）。
// 称呼按学期实际所在的自然年：2026-2027-1 是「2026 秋」，2026-2027-2 是「2027 春」。
// 序号 seq = 起始年 × 3 + (N − 1)，可直接比较先后、求下一个学期。

const RE = /^(\d{4})-(\d{4})-([123])$/;
const SEASON = ['秋', '春', '夏'];

export function parseSemester(key) {
  const m = RE.exec(String(key || ''));
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  return { start: Number(m[1]), n: Number(m[3]) };
}

export function semesterSeq(key) {
  const p = parseSemester(key);
  return p ? p.start * 3 + (p.n - 1) : null;
}

export function semesterFromSeq(seq) {
  const start = Math.floor(seq / 3), n = (seq % 3) + 1;
  return `${start}-${start + 1}-${n}`;
}

/** 「2026 秋」；编码不认识时给「学期不详」（不猜）。long=true 时是「2026 秋季学期」。 */
export function semesterLabel(key, { long = false } = {}) {
  const p = parseSemester(key);
  if (!p) return '学期不详';
  const year = p.n === 1 ? p.start : p.start + 1;
  return `${year} ${SEASON[p.n - 1]}${long ? '季学期' : ''}`;
}

/** 今天所在的学期；假期里返回下一个要开始的学期；校历里都没有就返回 null。 */
export function currentSemester(now, cal) {
  if (!cal) return null;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sems = Object.entries(cal)
    .filter(([k, s]) => parseSemester(k) && s && s.week1Monday && s.weeks)
    .map(([k, s]) => ({ k, a: new Date(`${s.week1Monday}T00:00:00`).getTime(), w: s.weeks }))
    .sort((x, y) => x.a - y.a);
  for (const s of sems) if (t >= s.a && t < s.a + s.w * 7 * 86400000) return s.k;
  const next = sems.find((s) => s.a > t);
  return next ? next.k : null;
}

/** 时段 → 写进句子里的说法 */
export const SLOT_WORD = { 夜: '夜里', 晨: '清晨', 上午: '上午', 午: '中午', 下午: '下午', 晚: '晚上' };
