<script setup>
// 那一晚的字幕卡：跟着走的时候，舞台左下方一张一张换的大字——这一刻几点、站在哪块场地、听见了什么。
// 像纪录片的字幕条，不是表单：时刻用大号数字，场地用展示字体，标题是她自己写的那句话。
// 一处一张；换下一处时旧卡往上淡出、新卡从下面浮上来。走完留一句收尾，几秒后自己收走。
import { computed, watch, onBeforeUnmount } from 'vue';
import { walkNow, walkClear } from '../lib/walk.js';
import { title } from '../lib/library.js';
import { fmtHour } from '../lib/clock.js';

const cur = computed(() => (walkNow.at >= 0 ? walkNow.items[walkNow.at] : null));
const n = computed(() => walkNow.items.length);
const spot = (e) => (e.src && e.src.spot) || e.place;
const who = computed(() => (walkNow.who === '我' ? '你' : walkNow.who.replace(' 采集', '')));
// 和上一处隔了几分钟：「七分钟后」比一个时间戳更像在走路
const gap = computed(() => {
  if (!cur.value || walkNow.at < 1) return '';
  const m = Math.round((Date.parse(cur.value.at) - Date.parse(walkNow.items[walkNow.at - 1].at)) / 60000);
  if (m <= 0) return '紧接着';
  return m === 1 ? '一分钟后' : `${m} 分钟后`;
});
const spots = computed(() => new Set(walkNow.items.map(spot)).size);
const span = computed(() => (n.value ? Math.max(1, Math.round((Date.parse(walkNow.items.at(-1).at) - Date.parse(walkNow.items[0].at)) / 60000)) : 0));
const dayText = computed(() => { if (!walkNow.day) return ''; const [m, d] = walkNow.day.split('-').map(Number); return `${m} 月 ${d} 日`; });

let t = 0;
watch(() => walkNow.end, (v) => { clearTimeout(t); if (v) t = setTimeout(walkClear, 5200); });
onBeforeUnmount(() => clearTimeout(t));
</script>

<template>
  <div class="walk-cards" aria-live="polite">
    <Transition name="card" mode="out-in">
      <section v-if="cur && !walkNow.end" :key="cur.id" class="walk-card">
        <p class="k"><span>那一晚 · {{ dayText }}</span><b>{{ walkNow.at + 1 }} / {{ n }}</b></p>
        <p class="hr"><span class="h">{{ fmtHour(cur.hour) }}</span><span v-if="gap" class="gap">{{ gap }}</span></p>
        <h2 class="spot">{{ spot(cur) }}</h2>
        <p class="say">「{{ title(cur) }}」</p>
        <ol class="ticks" aria-hidden="true"><li v-for="(e, i) in walkNow.items" :key="e.id" :class="{ done: i < walkNow.at, now: i === walkNow.at }"></li></ol>
      </section>
      <section v-else-if="walkNow.end" key="end" class="walk-card end">
        <p class="k"><span>那一晚 · {{ dayText }}</span></p>
        <h2 class="spot">{{ span }} 分钟，{{ spots }} 处</h2>
        <p class="say">{{ who }}走过的这一晚，现在你也听过了。</p>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
/* 舞台左下：播放条上方、纸的左边。不挡唱臂，不挡纸 */
.walk-cards { position: fixed; left: 28px; bottom: 112px; z-index: 6; pointer-events: none; width: min(380px, calc(100vw - var(--paper-w) - 96px)); }
.walk-card {
  position: relative; padding: 18px 22px 16px; border-radius: 14px;
  color: #F6F1E4; background: linear-gradient(160deg, rgb(14 16 34 / .78), rgb(14 16 34 / .58));
  backdrop-filter: blur(10px) saturate(1.2); -webkit-backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: 0 1px 0 rgb(255 255 255 / .08) inset, 0 24px 60px -28px rgb(0 0 0 / .7), 0 0 0 1px rgb(255 255 255 / .06);
  overflow: hidden;
}
/* 左边一道示波黄：和舞台上那颗走动的光点同色，一眼对得上 */
.walk-card::before { content: ''; position: absolute; left: 0; top: 16px; bottom: 16px; width: 3px; border-radius: 0 3px 3px 0; background: var(--scope); box-shadow: 0 0 14px var(--scope); }
.k { display: flex; justify-content: space-between; margin: 0 0 8px; font: 500 12px/1 var(--f-ui); letter-spacing: .12em; color: rgb(246 241 228 / .62); }
.k b { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--scope); letter-spacing: .06em; }
.hr { display: flex; align-items: baseline; gap: 12px; margin: 0; }
.h { font: 300 46px/1 var(--f-ui); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.gap { font: 400 13px/1 var(--f-ui); color: rgb(246 241 228 / .6); }
.spot { margin: 6px 0 4px; font: 400 30px/1.2 var(--f-show); letter-spacing: .06em; }
.say { margin: 0; font-size: 15px; line-height: 1.6; color: rgb(246 241 228 / .82); }
.ticks { display: flex; gap: 5px; margin: 14px 0 0; padding: 0; list-style: none; }
.ticks li { flex: 1; height: 2px; border-radius: 2px; background: rgb(246 241 228 / .16); transition: background-color .5s var(--ease); }
.ticks li.done { background: rgb(230 190 58 / .55); }
.ticks li.now { background: var(--scope); box-shadow: 0 0 8px var(--scope); }
.end .spot { font-size: 34px; }

.card-enter-active { transition: opacity .7s var(--ease), transform .7s var(--ease), filter .7s var(--ease); }
.card-leave-active { transition: opacity .35s ease-in, transform .35s ease-in, filter .35s ease-in; }
.card-enter-from { opacity: 0; transform: translateY(18px); filter: blur(6px); }
.card-leave-to { opacity: 0; transform: translateY(-10px); filter: blur(4px); }

/* 手机：纸是底部抽屉，卡放到顶栏下面 */
@media (max-width: 760px) {
  .walk-cards { left: 12px; right: 12px; top: calc(var(--top) + 54px); bottom: auto; width: auto; }
  .walk-card { padding: 12px 16px 12px; }
  .h { font-size: 34px; }
  .spot { font-size: 22px; }
  .say { font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .card-enter-active, .card-leave-active { transition: opacity .2s; }
  .card-enter-from, .card-leave-to { transform: none; filter: none; }
}
</style>
