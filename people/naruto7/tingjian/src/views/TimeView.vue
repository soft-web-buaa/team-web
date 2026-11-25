<script setup>
// 年轮（何时）：声音怎么随时间叠起来。三个尺度：一天、一学年、一代人。
// 舞台上俯看整张盘：外圈的刻纹就是年轮，一个学期一带。拖「一天」的时针，整站在一秒里渐变到那个钟点的天色（DESIGN.md §3）。
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import RingWood from '../components/RingWood.vue';
import { L, isPublic, play, entryById, ERA, semesterLabel } from '../lib/library.js';
import { clock, goHour, backToNow, fmtHour, cnHour, slotOfHour } from '../lib/clock.js';
import { hourColor } from '../lib/wave.js';
import { bj } from '../lib/when.js';
import * as stage from '../stage/stage.js';

const scale = ref('day');
const pub = computed(() => { void L.version; return L.entries.filter((e) => isPublic(e)); });

// —— 一天 ——
const h = ref(clock.source === 'now' ? clock.now : clock.target);
const dragging = ref(false);
function onDrag(v) { h.value = Number(v); goHour(h.value, { source: 'pick', label: `${fmtHour(h.value)} 的学院路`, dur: dragging.value ? 0 : 900 }); }
const near = computed(() => {
  const d = (e) => { const x = Math.abs(e.hour - h.value); return Math.min(x, 24 - x); };
  return pub.value.filter((e) => e.hour != null && d(e) < 0.6).sort((a, b) => d(a) - d(b)).slice(0, 6);
});
const hist = computed(() => {   // 一天的声音曲线：每半小时多少张（显示 n）
  const b = new Array(48).fill(0);
  for (const e of pub.value) if (e.hour != null) b[Math.floor(e.hour * 2) % 48]++;
  return b;
});
const histMax = computed(() => Math.max(1, ...hist.value));
let dayTimer = 0;
const touring = ref(false);
// 播放一天：90 秒走完 24 小时，整站跟着变色；每到一个有声音的钟点放一张
function tour() {
  if (touring.value) { stopTour(); return; }
  touring.value = true;
  let t = 5, lastSlot = '';
  const t0 = performance.now();
  const step = () => {
    t = 5 + ((performance.now() - t0) / 90000) * 24;
    if (t >= 29) { stopTour(); return; }
    h.value = t % 24;
    goHour(h.value, { source: 'pick', label: '播放一天', dur: 0 });
    const s = slotOfHour(h.value);
    if (s !== lastSlot) { lastSlot = s; const e = near.value.find((x) => x.tier !== 'archival'); if (e) play(e, { hour: false }); }
    dayTimer = requestAnimationFrame(step);
  };
  dayTimer = requestAnimationFrame(step);
}
function stopTour() { touring.value = false; cancelAnimationFrame(dayTimer); }

// —— 一学年 ——
const sems = computed(() => { void L.version; return stage.bands().slice().reverse(); });
const sem = ref(null);
watch(sem, (s) => stage.focusSemester(s));
const semList = computed(() => (sem.value ? pub.value.filter((e) => e.semester === sem.value).slice().reverse() : []));
const today = new Date();
const otd = computed(() => {   // 往年今日：前后三天
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  return pub.value.filter((e) => { const b = e.at && bj(e.at); if (!b || b.y === today.getFullYear()) return false; return Math.abs(b.mo * 100 + b.d - md) <= 3; }).slice(-5).reverse();
});

// —— 一代人 ——
const era = computed(() => ERA.map((x) => ({ ...x, e: x.audio ? entryById(x.audio) : null })));
const span = computed(() => today.getFullYear() - 1952);

onBeforeUnmount(() => { stopTour(); stage.focusSemester(null); });
</script>

<template>
  <Paper label="年轮">
    <p class="kicker">何时 · 声音一年一圈地长</p>
    <h1 class="h1">声音怎么叠起来</h1>
    <div class="row" role="tablist" aria-label="三个尺度">
      <button v-for="s in [['day', '一天'], ['year', '一学年'], ['gen', '一代人']]" :key="s[0]" type="button" role="tab" class="chip" :class="{ on: scale === s[0] }" :aria-selected="scale === s[0]" @click="scale = s[0]">{{ s[1] }}</button>
    </div>

    <section v-if="scale === 'day'" class="sec">
      <p class="lede" style="margin-top: 16px">拖动时针，整个网站跟着变成那个钟点的天色。曲线是一天里每半小时有多少张。</p>
      <div class="dayline">
        <svg viewBox="0 0 480 64" preserveAspectRatio="none" aria-hidden="true">
          <rect v-for="(n, i) in hist" :key="i" :x="i * 10 + 1" :y="60 - (n / histMax) * 52" width="8" :height="Math.max(1, (n / histMax) * 52)" :fill="hourColor(i / 2 + 0.25)" />
          <line :x1="(h / 24) * 480" :x2="(h / 24) * 480" y1="0" y2="64" stroke="#E6BE3A" stroke-width="2" />
        </svg>
        <input type="range" min="0" max="23.99" step="0.05" :value="h" aria-label="一天里的钟点" @pointerdown="dragging = true" @pointerup="dragging = false; onDrag(h)" @input="onDrag($event.target.value)">
        <div class="ticks" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
      </div>
      <p class="big show">{{ cnHour(h) }} <span>{{ fmtHour(h) }} · {{ slotOfHour(h) }}</span></p>
      <div class="row">
        <button type="button" class="btn small" :class="{ on: touring }" @click="tour">{{ touring ? '停下' : '播放一天 · 90 秒' }}</button>
        <button type="button" class="btn small ghost" @click="stopTour(); backToNow(); h = clock.now">回到此刻</button>
      </div>
      <p class="h3">这个钟点前后 · {{ near.length }} 张</p>
      <ol class="discs"><DiscRow v-for="e in near" :key="e.id" :e="e" /></ol>
      <p v-if="!near.length" class="fine">这个钟点还没有声音。</p>
    </section>

    <section v-else-if="scale === 'year'" class="sec">
      <p class="lede" style="margin-top: 16px">纸上的年轮像树：最里一圈最早，往外一圈一个学年。舞台上的唱片反过来，从外往里放：最外一带是最早的学期。点一个学期，唱片上那一带亮起来，其余的暗下去。</p>
      <RingWood :list="pub.filter((e) => e.tier !== 'archival')" :size="320" :playing-id="L.playing && L.playing.id" @pick="play" />
      <div class="sems">
        <button v-for="b in sems" :key="b.semester" type="button" class="sem" :class="{ on: sem === b.semester, now: b.semester === L.nowSem }" @click="sem = sem === b.semester ? null : b.semester">
          <span class="show">{{ b.label }}</span><i>{{ b.n }}</i>
        </button>
      </div>
      <template v-if="sem">
        <p class="h3">{{ semesterLabel(sem) }} · {{ semList.length }} 张</p>
        <ol class="discs"><DiscRow v-for="e in semList.slice(0, 40)" :key="e.id" :e="e" /></ol>
      </template>
      <template v-if="otd.length">
        <p class="h3">往年今日</p>
        <ol class="discs"><DiscRow v-for="e in otd" :key="e.id" :e="e" /></ol>
      </template>
    </section>

    <section v-else class="sec">
      <p class="lede" style="margin-top: 16px">从 1952 年到今天，{{ span }} 年。有声音的几处可以点开听；每一条都写了出处。</p>
      <ol class="era">
        <li v-for="x in era" :key="x.y + x.text" :class="{ sound: x.e }">
          <span class="y show">{{ x.y }}</span>
          <div>
            <p class="w">{{ x.when }}</p>
            <p class="t">{{ x.text }}</p>
            <p class="s">
              <button v-if="x.e" type="button" class="btn small" @click="play(x.e)">听这十秒</button>
              <a v-if="x.src" :href="x.src" target="_blank" rel="noreferrer">{{ x.srcName }}</a><span v-else>{{ x.srcName }} · 史料</span>
            </p>
          </div>
        </li>
        <li class="sound now">
          <span class="y show">{{ today.getFullYear() }}</span>
          <div><p class="w">此刻</p><p class="t">你在这里。按住下面那颗钮，把这一刻也刻进去。</p></div>
        </li>
      </ol>
    </section>
  </Paper>
</template>

<style scoped>
.sec { margin-top: 4px; }
.dayline { position: relative; margin: 10px 0 4px; }
.dayline svg { width: 100%; height: 64px; display: block; }
.dayline input { position: absolute; left: 0; right: 0; top: 0; height: 64px; width: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
.dayline input:focus-visible + .ticks { outline: 2px solid var(--scope); }
.ticks { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-2); margin-top: 4px; }
.big { font-size: 34px; margin: 12px 0 12px; }
.big span { font: 14px var(--f-ui); color: var(--ink-2); margin-left: 8px; }
.sems { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 14px; }
.sem { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 10px; border-radius: 3px; border: 1px solid var(--hair); background: none; }
.sem i { font-style: normal; font-size: 12px; color: var(--ink-2); }
.sem.now { border-style: dashed; border-color: var(--line); }
.sem.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.sem.on i { color: var(--paper); }
.era { list-style: none; padding: 0; margin: 18px 0 0; position: relative; }
.era::before { content: ''; position: absolute; left: 27px; top: 8px; bottom: 8px; width: 1px; background: var(--line); }
.era li { position: relative; display: grid; grid-template-columns: 56px 1fr; gap: 14px; padding: 0 0 20px; }
.era .y { font-size: 15px; background: var(--paper); position: relative; z-index: 1; text-align: center; padding: 2px 0; height: fit-content; }
.era li.sound .y::after { content: ''; position: absolute; right: -10px; top: 9px; width: 7px; height: 7px; border-radius: 50%; background: var(--scope); }
.era p { margin: 0; }
.era .w { font-size: 12px; color: var(--ink-2); }
.era .t { font: 16px/1.6 var(--f-show); margin: 2px 0 6px; }
.era .s { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--ink-2); }
.era .s a { color: var(--ink-2); }
</style>
