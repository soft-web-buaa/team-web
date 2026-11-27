<script setup>
// 那一晚：一个人在一个晚上接连录下的几处，按录下的顺序重走一遍。
// 舞台上一颗示波黄的光点从一处走到下一处，地上留一道虚线；走到哪处放哪处，整站钟点跟着拨到那一刻（天一点点黑下去）。
// 数据只认真实录音（library.evenings）：同一位采集人或我自己、同一晚两小时内、至少三段两处。没有就不出现。
import { computed, onBeforeUnmount } from 'vue';
import { L, evenings, title } from '../lib/library.js';
import { Q, playQueue, stopQueue, skipQueue } from '../lib/albums.js';
import { backToNow, fmtHour } from '../lib/clock.js';
import * as stage from '../stage/stage.js';

const NAME = '那一晚';
const ev = computed(() => { void L.version; return evenings()[0] || null; });
const on = computed(() => Q.name === NAME && Q.list.length > 0);
// 录在哪几块场地：用采集清单里的 spot（她站的那块地方，比馆藏的十六个地点细）；没有就退回地点名
const spot = (e) => (e.src && e.src.spot) || e.place;
const places = computed(() => (ev.value ? [...new Set(ev.value.items.map(spot))] : []));
const span = computed(() => (ev.value ? Math.max(1, Math.round((Date.parse(ev.value.items.at(-1).at) - Date.parse(ev.value.items[0].at)) / 60000)) : 0));
const dayText = computed(() => { if (!ev.value) return ''; const [m, d] = ev.value.day.split('-').map(Number); return `${m} 月 ${d} 日`; });

function start() {
  const items = ev.value.items;
  stage.setWalk(items.map((e) => ({ pid: e.placeId })));
  playQueue(items, NAME, {
    hourEach: true,
    onStep: (i) => stage.walkTo(i, i === 0 ? 1 : 1700),
    onEnd: () => { stage.endWalk(); backToNow(1600); },
  });
}
function stop() { stopQueue(); }
onBeforeUnmount(() => { if (on.value) stopQueue(); });
</script>

<template>
  <section v-if="ev" class="evening" :class="{ on }" aria-label="那一晚">
    <p class="kicker">那一晚 · {{ dayText }} {{ fmtHour(ev.from) }}–{{ fmtHour(ev.to) }}</p>
    <p class="say">{{ ev.who === '我' ? '你' : ev.who.replace(' 采集', '') + ' ' }}在 {{ span }} 分钟里录下 {{ ev.items.length }} 段：{{ places.join('、') }}。</p>
    <ol v-if="on" class="steps">
      <li v-for="(e, i) in ev.items" :key="e.id" :class="{ now: Q.i === i, done: Q.i > i }">
        <span class="t">{{ fmtHour(e.hour) }}</span><span class="n">{{ title(e) }}</span><span class="p">{{ spot(e) }}</span>
      </li>
    </ol>
    <div class="row">
      <button v-if="!on" type="button" class="btn small" @click="start">跟着走一遍</button>
      <template v-else>
        <button type="button" class="btn small ghost" @click="skipQueue">下一处</button>
        <button type="button" class="btn small ghost" @click="stop">停下</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.evening { margin: 18px 0 4px; padding: 14px 0 0; border-top: 1px solid var(--hair); }
.say { margin: 6px 0 10px; color: var(--ink); line-height: 1.6; }
.steps { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 2px; max-height: 220px; overflow: auto; }
.steps li { display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; align-items: baseline; padding: 4px 6px; border-radius: 6px; color: var(--ink-2); font-size: 13px; transition: color .3s, background-color .3s; }
.steps li .t { font: 600 12px/1 var(--f-ui); font-variant-numeric: tabular-nums; }
.steps li .p { font-size: 12px; }
.steps li.done { color: var(--ink-2); opacity: .7; }
.steps li.now { color: var(--ink); background: var(--wash); }
.steps li.now .t { color: var(--ink); box-shadow: inset 3px 0 0 var(--scope); padding-left: 6px; }
@media (prefers-reduced-motion: reduce) { .steps li { transition: none; } }
</style>
