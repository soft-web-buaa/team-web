<script setup>
// 年轮：一个学期一圈，最里是最早的学期；圈上的点按一天里的钟点排（子夜在顶上）。点的颜色就是那个钟点的天色，我的点外面一圈示波黄。
// 这一张图和三维盘面是同一件事的两种画法：外圈的刻纹也是一个学期一带。
import { computed } from 'vue';
import { semesterLabel } from '../kesheng/web/semester.js';
import { L, play, title, whenText } from '../lib/library.js';
import { hourColor } from '../lib/wave.js';
import { clock } from '../lib/clock.js';

const p = defineProps({ list: Array, size: { type: Number, default: 300 }, hand: { type: Boolean, default: true }, caption: { type: String, default: '' } });
const rings = computed(() => {
  const by = new Map();
  for (const e of p.list) if (e.semester && e.hour != null) { if (!by.has(e.semester)) by.set(e.semester, []); by.get(e.semester).push(e); }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([s, items]) => ({ s, items }));
});
const C = 150, rIn = 34, rOut = 128;
const rr = (i, n) => (n > 1 ? rIn + ((rOut - rIn) * i) / (n - 1) : rOut);
const dots = computed(() => rings.value.flatMap((g, i) => g.items.map((e) => {
  const a = (e.hour / 24) * Math.PI * 2, r = rr(i, rings.value.length);
  return { e, x: C + Math.sin(a) * r, y: C - Math.cos(a) * r, c: e.tier === 'archival' ? 'var(--ink)' : hourColor(e.hour), on: L.playing && L.playing.id === e.id };
})));
const handA = computed(() => (clock.shown / 24) * Math.PI * 2);
const first = computed(() => rings.value[0]), last = computed(() => rings.value.at(-1));
</script>

<template>
  <figure class="ring">
    <svg :width="size" :height="size" viewBox="-10 -10 320 320" role="img" :aria-label="caption || '年轮'">
      <circle v-for="(g, i) in rings" :key="g.s" :cx="C" :cy="C" :r="rr(i, rings.length)" class="r" :class="{ now: g.s === L.nowSem }" />
      <g class="marks">
        <text :x="C" y="8" text-anchor="middle">子夜</text><text x="298" :y="C + 4" text-anchor="end">六时</text>
        <text :x="C" y="306" text-anchor="middle">正午</text><text x="2" :y="C + 4">十八时</text>
      </g>
      <line v-if="hand" :x1="C" :y1="C" :x2="C + Math.sin(handA) * 140" :y2="C - Math.cos(handA) * 140" class="hand" />
      <circle v-for="d in dots" :key="d.e.id" :cx="d.x" :cy="d.y" :r="d.on ? 6.5 : d.e.mine ? 5.2 : 4" :fill="d.c" class="dot" :class="{ mine: d.e.mine, on: d.on }" @click="play(d.e)">
        <title>{{ title(d.e) }} · {{ whenText(d.e) }}</title>
      </circle>
      <circle :cx="C" :cy="C" r="4" fill="#E6BE3A" />
    </svg>
    <figcaption v-if="rings.length" class="fine">{{ caption }}{{ caption ? ' ' : '' }}最里一圈是 {{ semesterLabel(first.s) }}，最外一圈是 {{ semesterLabel(last.s) }}。一个点是一张，角度是一天里的钟点，颜色是那个钟点的天色。</figcaption>
    <figcaption v-else class="fine">还没有一圈。</figcaption>
  </figure>
</template>

<style scoped>
.ring { margin: 8px 0 0; }
.ring svg { display: block; max-width: 100%; height: auto; }
.r { fill: none; stroke: var(--hair); stroke-width: 1; }
.r.now { stroke: var(--line); stroke-dasharray: 2 3; }
.marks text { font: 10px var(--f-ui); fill: var(--ink-2); }
.hand { stroke: var(--scope); stroke-width: 1.4; }
.dot { stroke: var(--paper); stroke-width: 1; cursor: pointer; transition: r .2s; }
.dot.mine { stroke: #E6BE3A; stroke-width: 2; }
.dot.on { stroke: var(--ink); stroke-width: 2; }
</style>
