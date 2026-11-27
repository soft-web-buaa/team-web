// 那一晚：正在跟着走的那一段。首页的「那一晚」写，舞台上的字幕卡（WalkCard）读。
// 没在走时 items 是空的；at 是第几处（从 0 起）；end 为真时是走完了、留一句收尾。
import { reactive } from 'vue';

export const walkNow = reactive({ who: '', day: '', items: [], at: -1, end: false });

export function walkBegin(ev) {
  walkNow.who = ev.who; walkNow.day = ev.day; walkNow.items = ev.items; walkNow.at = -1; walkNow.end = false;
}
export function walkStep(i) { walkNow.at = i; walkNow.end = false; }
/** 走完：done 为真时留一句收尾（几秒后自己收走）；被打断时直接收走 */
export function walkFinish(done) {
  if (done && walkNow.items.length) { walkNow.end = true; return; }
  walkNow.items = []; walkNow.at = -1; walkNow.end = false;
}
export function walkClear() { walkNow.items = []; walkNow.at = -1; walkNow.end = false; }
