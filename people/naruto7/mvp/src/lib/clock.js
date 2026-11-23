// 全站共用的"此刻"：默认跟着真实时间走；拖动时间轴后变成手动，点"回到此刻"再跟回真实时间。
// 页面的天色由 sky.js 根据这里的 hour 写进 CSS 变量。
// 演示时想固定在某个钟点：网址后面加 ?h=7.5（清晨 7:30），例如 http://localhost:5173/?h=7.5
import { ref, computed, watchEffect } from 'vue';
import { nowHour, periodOf, wrap } from './time.js';
import { applySky } from './sky.js';

export const hour = ref(nowHour());
export const live = ref(true);
export const period = computed(() => periodOf(hour.value));

let timer = 0;
function startClock() {
  if (timer) return;
  timer = setInterval(() => {
    if (live.value) hour.value = nowHour();
  }, 20000);
}

export function setHour(h) {
  hour.value = Math.min(23.99, Math.max(0, h));
  live.value = false;
}

export function goLive() {
  live.value = true;
  hour.value = nowHour();
}

/** 挂载前调用：读 ?h= 参数、开始走时、让天色跟着 hour 变 */
export function initClock() {
  const q = new URLSearchParams(window.location.search).get('h');
  const v = q === null || q === '' ? NaN : Number(q);
  if (Number.isFinite(v)) {
    hour.value = Math.min(23.99, Math.max(0, v));
    live.value = false;
  }
  startClock();
  watchEffect(() => applySky(hour.value));
}

let swept = false;

/** 开场只演一次：天色从清晨一路走到此刻。系统设了"减少动态效果"或固定了钟点就跳过。 */
export function sweepIntro() {
  if (swept || !live.value) return;
  swept = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = nowHour();
  const start = 5;
  const end = target < start ? target + 24 : target;
  const t0 = performance.now();
  const dur = 1600;
  const step = (now) => {
    if (!live.value) return; // 用户中途拖了时间轴，就不再接管
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    hour.value = wrap(start + (end - start) * e);
    if (p < 1) requestAnimationFrame(step);
    else hour.value = nowHour();
  };
  requestAnimationFrame(step);
}
