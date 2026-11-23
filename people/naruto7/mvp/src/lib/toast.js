// 操作反馈：一句话，几秒后自己消失。App.vue 里用 role="status" 播报给读屏用户。
import { reactive } from 'vue';

export const toast = reactive({ msg: '', tone: 'ok' });
let timer = 0;

export function say(msg, tone = 'ok') {
  toast.msg = msg;
  toast.tone = tone;
  clearTimeout(timer);
  timer = setTimeout(() => {
    toast.msg = '';
  }, 4200);
}
