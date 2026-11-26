<script setup>
// 一张「后来」纸签：撕边的纸，作者很久以后在旧盘旁边补的一句话。原声不动，纸签一张张叠上去。
// 撕边用 clip-path 现画（每张按编号定，不随机）；纸色比页面暖一点，但夜里也是亮纸——黑底上的一张纸。
import { computed } from 'vue';
import { bj, slotOfHour } from '../lib/when.js';
import { hourColor } from '../lib/wave.js';

const p = defineProps({
  id: { type: String, default: '' },
  text: { type: String, default: '' },
  at: { type: String, default: '' },            // 写下的那一刻（服务端给的）
  daysAfter: { type: Number, default: null },   // 距这张盘刻下几天
  mine: { type: Boolean, default: false },
});
defineEmits(['remove']);

// 用编号算一个稳稳的数：同一张纸签每次的旋转、撕边都一样，不跳
const seed = (() => { let x = 2166136261; for (const c of String(p.id || p.text)) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; })();
const rnd = (i) => { const x = Math.imul(seed ^ (i * 374761393), 2246822519) >>> 0; return ((x >>> 8) % 1000) / 1000; };
const rot = `${((rnd(1) * 2 - 1) * 0.6).toFixed(2)}deg`;
const clip = (() => {
  const N = 24, pts = ['0% 0%', '100% 0%'];
  for (let i = 0; i <= N; i++) {
    const x = 100 - (i / N) * 100;
    const y = 95.8 - rnd(i + 7) * 4.2 - ([3, 12, 19].includes(i) ? 4.6 : 0);   // 几处撕得深一点，别太齐
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
})();
const when = computed(() => {
  const b = p.at ? bj(p.at) : null;
  return b ? { date: `${b.mo} 月 ${b.d} 日`, slot: slotOfHour(b.h), color: hourColor(b.h) } : null;
});
const days = computed(() => (p.daysAfter == null ? '' : p.daysAfter <= 0 ? '刻下当天' : `距刻下 ${p.daysAfter} 天`));
</script>

<template>
  <figure class="paper-slip" :style="{ '--rot': rot }">
    <div class="slip-paper" :style="{ clipPath: clip }">
      <p class="slip-text"><span class="lead">后来，</span>{{ text }}</p>
      <p class="slip-foot">
        <i class="dot" :style="{ background: when ? when.color : 'transparent' }" aria-hidden="true"></i>
        <template v-if="when"><span>{{ when.date }}</span><span class="sep">·</span><span>{{ when.slot }}</span></template>
        <template v-if="days"><span class="sep">·</span><span>{{ days }}</span></template>
        <button v-if="mine" type="button" class="del" @click="$emit('remove')">删掉</button>
        <button v-else type="button" class="rep" @click="$emit('report')">举报</button>
      </p>
    </div>
  </figure>
</template>

<style scoped>
/* 纸签本身不裁，裁的是里面那层：外面留一层 drop-shadow，阴影才跟着撕边 */
.paper-slip { margin: 0; transform: rotate(var(--rot)); filter: drop-shadow(0 1px 1px rgb(48 36 16 / .22)) drop-shadow(0 8px 14px rgb(48 36 16 / .18)); animation: slip-drop .5s var(--ease) both; }
.slip-paper {
  position: relative; padding: 14px 16px 20px; color: #2B2419;
  box-shadow: inset 0 -9px 10px -9px rgb(70 52 24 / .22);
  background-color: #F1E7D2;
  background-image:
    linear-gradient(180deg, color-mix(in srgb, var(--paper) 24%, transparent), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23f)' opacity='0.045'/%3E%3C/svg%3E");
  background-size: auto, 140px 140px;
}
.slip-text { margin: 0 0 10px; font: 17px/1.75 var(--f-show); text-align: left; word-break: break-word; }
.slip-text .lead { font-size: 13px; color: #54452F; letter-spacing: .06em; margin-right: 2px; }
.slip-foot { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 11.5px; line-height: 1; color: #54452F; }
.dot { flex: none; width: 7px; height: 7px; border-radius: 50%; box-shadow: 0 0 0 1px rgb(43 36 25 / .22); }
.sep { opacity: .55; }
.del, .rep { margin-left: auto; padding: 0 2px; border: 0; background: none; color: #54452F; font-size: 11.5px; text-decoration: underline; text-decoration-color: rgb(84 69 47 / .55); text-underline-offset: 2px; }
.rep { opacity: .8; }
@keyframes slip-drop { from { opacity: 0; transform: translateY(-6px) rotate(var(--rot)); } to { opacity: 1; transform: rotate(var(--rot)); } }
@media (prefers-reduced-motion: reduce) { .paper-slip { animation: none; } }
</style>
