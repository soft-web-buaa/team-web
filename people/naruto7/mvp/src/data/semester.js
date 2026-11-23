// 学期与周次。口径来自刻声的 data/calendar.json（北航 2026–2027 校历，刻声在 2026-10-19 核对过）。
// 称呼沿用刻声：2026-2027-1 叫"2026 秋"。第 1 周从 week1Monday 那天开始数。

export const SEMESTER = {
  code: '2026-2027-1',
  label: '2026 秋',
  week1Monday: '2026-09-07',
  weeks: 19,
};

const DAY = 86400000;

function midnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 今天是这学期第几周；不在学期内返回 null（不猜） */
export function weekOf(date = new Date()) {
  const start = midnight(new Date(`${SEMESTER.week1Monday}T00:00:00`));
  const w = Math.floor((midnight(date) - start) / DAY / 7) + 1;
  return w >= 1 && w <= SEMESTER.weeks ? w : null;
}

export function weekLabel(date = new Date()) {
  const w = weekOf(date);
  return w ? `${SEMESTER.label}学期，第 ${w} 周` : `${SEMESTER.label}学期之外`;
}
