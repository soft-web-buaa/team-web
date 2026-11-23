// 一天里的时刻：时段划分、格式化、环形距离。全站只在这里定义"几点算什么时段"。

export const PERIODS = [
  { id: 'dawn', name: '清晨', from: 5, to: 9 },
  { id: 'day', name: '白天', from: 9, to: 17 },
  { id: 'dusk', name: '傍晚', from: 17, to: 20 },
  { id: 'night', name: '夜里', from: 20, to: 29 },
];

/** 把任意小时数折进 [0, 24) */
export function wrap(h) {
  return ((h % 24) + 24) % 24;
}

export function periodOf(h) {
  const x = wrap(h);
  if (x >= 5 && x < 9) return PERIODS[0];
  if (x >= 9 && x < 17) return PERIODS[1];
  if (x >= 17 && x < 20) return PERIODS[2];
  return PERIODS[3];
}

/** 21.92 → "21:55" */
export function fmt(h) {
  let m = Math.round(wrap(h) * 60);
  if (m >= 1440) m = 0;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 朗读用："二十一点五十五分" 太长，读屏用 "21点55分" */
export function spoken(h) {
  const [hh, mm] = fmt(h).split(':').map(Number);
  return `${hh}点${mm}分`;
}

/** 两个时刻在 24 小时环上的最短距离（小时） */
export function circDist(a, b) {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 24 - d);
}

/** 离某个时刻 ±1.25 小时以内的声音，算"此刻亮着" */
export const LIT_RADIUS = 1.25;
export function isLit(sound, h) {
  return circDist(sound.hour, h) <= LIT_RADIUS;
}

export function nowHour(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60;
}
