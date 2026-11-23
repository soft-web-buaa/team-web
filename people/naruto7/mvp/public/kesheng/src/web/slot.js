// 刻声 · 时段分档（唯一的定义处）
// 六档：夜 / 晨 / 上午 / 午 / 下午 / 晚；「夜」覆盖 0–5 点与 22–24 点。
// 口径：`slot` 在归档时算一次并存进记录，以后改分档规则，旧盘不受影响（ARCHIVE-v1 §1）。
export const SLOTS = ['夜', '晨', '上午', '午', '下午', '晚'];

export function slotOf(date) {
  const h = date.getHours();
  return h < 5 ? '夜' : h < 9 ? '晨' : h < 12 ? '上午' : h < 14 ? '午' : h < 18 ? '下午' : h < 22 ? '晚' : '夜';
}
