<script setup>
// 那一晚：一个人在一个晚上接连录下的几处，按录下的顺序重走一遍。
// 舞台上一颗示波黄的光点从一处走到下一处，地上留一道虚线；走到哪处放哪处，整站钟点跟着拨到那一刻（天一点点黑下去）。
// 数据只认真实录音（library.evenings）：同一位采集人或我自己、同一晚两小时内、至少三段两处。没有就不出现。
import { computed, onBeforeUnmount } from 'vue';
import { L, evenings, title } from '../lib/library.js';
import { Q, playQueue, stopQueue, skipQueue } from '../lib/albums.js';
import { backToNow, fmtHour } from '../lib/clock.js';
import * as stage from '../stage/stage.js';
import { walkBegin, walkStep, walkFinish } from '../lib/walk.js';

const NAME = '那一晚';
const ev = computed(() => { void L.version; return evenings()[0] || null; });
const on = computed(() => Q.name === NAME && Q.list.length > 0);
// 录在哪几块场地：用采集清单里的 spot（她站的那块地方，比馆藏的十六个地点细）；没有就退回地点名
const spot = (e) => (e.src && e.src.spot) || e.place;
const places = computed(() => (ev.value ? [...new Set(ev.value.items.map(spot))] : []));
const span = computed(() => (ev.value ? Math.max(1, Math.round((Date.parse(ev.value.items.at(-1).at) - Date.parse(ev.value.items[0].at)) / 60000)) : 0));
// 路线缩略：十六处地点画成淡点，这一晚走过的几处连成一笔（平面坐标 x 东 y 北，米）
const map = computed(() => {
  if (!ev.value) return null;
  const all = L.places;
  if (!all || !all.length) return null;
  // 取景框按这条路线定（外扩一圈），不按全校：路线占满画面，周围的地点作底、出框的裁掉
  const on = ev.value.items.map((e) => all.find((p) => p.id === e.placeId)).filter(Boolean);
  const xs = on.map((p) => p.x), ys = on.map((p) => p.y);
  const m = Math.max(90, (Math.max(...xs) - Math.min(...xs)) * 0.18, (Math.max(...ys) - Math.min(...ys)) * 0.18);
  xs.push(Math.min(...xs) - m, Math.max(...xs) + m); ys.push(Math.min(...ys) - m, Math.max(...ys) + m);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 300, H = 120, pad = 12, k = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
  const at = (p) => [pad + (p.x - x0) * k + ((W - 2 * pad) - (x1 - x0) * k) / 2, H - pad - (p.y - y0) * k - ((H - 2 * pad) - (y1 - y0) * k) / 2];
  const by = new Map(all.map((p) => [p.id, at(p)]));
  const route = ev.value.items.map((e) => by.get(e.placeId)).filter(Boolean).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  return { W, H, dots: [...by.values()].filter(([x, y]) => x > -4 && x < W + 4 && y > -4 && y < H + 4), route, line: route.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ') };
});
const dayText = computed(() => { if (!ev.value) return ''; const [m, d] = ev.value.day.split('-').map(Number); return `${m} 月 ${d} 日`; });

function start() {
  const items = ev.value.items;
  walkBegin(ev.value);
  stage.setWalk(items.map((e) => ({ pid: e.placeId })));
  playQueue(items, NAME, {
    hourEach: true,
    onStep: (i) => { walkStep(i); stage.walkTo(i, i === 0 ? 1 : 1700); },
    onEnd: (done) => { walkFinish(done); stage.endWalk(); backToNow(1600); },
  });
}
function stop() { stopQueue(); }
onBeforeUnmount(() => { if (on.value) stopQueue(); });
</script>

<template>
  <section v-if="ev" class="evening" :class="{ on }" aria-label="那一晚">
    <p class="kicker">那一晚 · {{ dayText }} {{ fmtHour(ev.from) }}–{{ fmtHour(ev.to) }}</p>
    <p class="say"><b>{{ ev.who === '我' ? '你' : ev.who.replace(' 采集', '') }}</b> 在 {{ span }} 分钟里录下 {{ ev.items.length }} 段</p>
    <svg v-if="map" class="map" :viewBox="`0 0 ${map.W} ${map.H}`" aria-hidden="true">
      <circle v-for="(d, i) in map.dots" :key="i" :cx="d[0]" :cy="d[1]" r="1.6" class="dot" />
      <polyline :points="map.line" class="route" pathLength="1" />
      <circle v-for="(d, i) in map.route" :key="'r' + i" :cx="d[0]" :cy="d[1]" r="3.2" class="stop" />
    </svg>
    <p class="spots">{{ places.join(' · ') }}</p>
    <ol v-if="on" class="steps">
      <li v-for="(e, i) in ev.items" :key="e.id" :class="{ now: Q.i === i, done: Q.i > i }">
        <span class="t">{{ fmtHour(e.hour) }}</span><span class="n">{{ title(e) }}</span><span class="p">{{ spot(e) }}</span>
      </li>
    </ol>
    <div class="row">
      <button v-if="!on" type="button" class="btn go" @click="start"><span class="play" aria-hidden="true"></span>跟着走一遍</button>
      <template v-else>
        <button type="button" class="btn small ghost" @click="skipQueue">下一处</button>
        <button type="button" class="btn small ghost" @click="stop">停下</button>
      </template>
      <span v-if="!on" class="fine">真实录音 · 戴上耳机</span>
    </div>
  </section>
</template>

<style scoped>
.evening {
  position: relative; margin: 20px 0 6px; padding: 16px 16px 14px; border-radius: 12px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--scope) 14%, var(--paper)), color-mix(in srgb, var(--scope) 4%, var(--paper)));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--scope) 38%, transparent), var(--lift);
}
.kicker { margin: 0; }
.say { margin: 6px 0 0; color: var(--ink); font-size: 15px; line-height: 1.5; }
.say b { font: 400 18px/1.3 var(--f-show); letter-spacing: .04em; }
.spots { margin: 8px 0 12px; font-size: 13px; line-height: 1.7; color: var(--ink-2); }
.map { display: block; width: 100%; height: auto; margin: 10px 0 2px; }
.map .dot { fill: color-mix(in srgb, var(--ink) 22%, transparent); }
.map .route { fill: none; stroke: var(--scope); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 2.4s var(--ease) .4s forwards; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--scope) 70%, transparent)); }
.map .stop { fill: var(--paper); stroke: var(--scope); stroke-width: 1.6; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.btn.go { display: inline-flex; align-items: center; gap: 8px; }
.play { width: 0; height: 0; border-left: 8px solid currentColor; border-top: 5px solid transparent; border-bottom: 5px solid transparent; }
.steps { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 2px; max-height: 220px; overflow: auto; }
.steps li { display: grid; grid-template-columns: 44px 1fr auto; gap: 8px; align-items: baseline; padding: 4px 6px; border-radius: 6px; color: var(--ink-2); font-size: 13px; transition: color .3s, background-color .3s; }
.steps li .t { font: 600 12px/1 var(--f-ui); font-variant-numeric: tabular-nums; }
.steps li .p { font-size: 12px; }
.steps li.done { color: var(--ink-2); opacity: .7; }
.steps li.now { color: var(--ink); background: var(--wash); }
.steps li.now .t { color: var(--ink); box-shadow: inset 3px 0 0 var(--scope); padding-left: 6px; }
@media (prefers-reduced-motion: reduce) { .steps li { transition: none; } .map .route { animation: none; stroke-dashoffset: 0; } }
</style>
