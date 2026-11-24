// 刻声 · 第几教学周
// 口径（docs/tickets/T-03）：只做「按日期查周次」，不做教务登录、不排课表。
// 数据在 data/calendar.json；查不到就返回 null，调用方走手填/`W--` 降级，不猜。
// 判据：每个学期的区间是 [week1Monday, week1Monday + weeks*7 天)，区间外一律 null（假期、换学期）。

const DAY = 86400000;

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * @param {Date|string} date
 * @param {object} cal 形如 {"2026-2027-1": {week1Monday, weeks, source, checked}}
 * @returns {{key: string, week: number} | null}
 */
export function weekOf(date, cal) {
  const t = startOfDay(date instanceof Date ? date : new Date(date));
  if (!Number.isFinite(t) || !cal) return null;
  for (const [key, sem] of Object.entries(cal)) {
    if (!sem || !sem.week1Monday || !sem.weeks) continue;
    const start = startOfDay(new Date(`${sem.week1Monday}T00:00:00`));
    const days = Math.floor((t - start) / DAY);
    if (days < 0) continue;
    const week = Math.floor(days / 7) + 1;
    if (week <= sem.weeks) return { key, week };
  }
  return null;
}

/** 档案号里的周段：「2026W07」；查不到学期时给「W--」。 */
export function weekTag(date, cal) {
  const w = weekOf(date, cal);
  if (!w) return { tag: 'W--', week: null, key: null, semester: null };
  const year = w.key.slice(0, 4);
  const sem = w.key.slice(-1);            // 学期位：否则一年里三个学期的第 7 周必然撞号（云端 2026-10-19 指出）
  return { tag: `${year}-${sem}W${String(w.week).padStart(2, '0')}`, week: w.week, key: w.key, semester: sem };
}
