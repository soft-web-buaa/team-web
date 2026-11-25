<script setup>
// 年轮的另外三种画法（只在样张 #/lab 里，给组里比，没进正式页面）。角度都是一天里的钟点（子夜在顶上，顺时针）。
//   cells   格子：一圈一个学年、一格一小时，格子越深这一格的声音越多。点一格放这一格里最新的一张
//   groove  刻纹：一圈一个学年，每圈是一道沟，哪个钟点声音多沟就往外鼓得多（像唱片的刻纹），每张是沟上一根短刺
//   spiral  不分圈：半径就是日期（最里最早），一张一颗点，学年只画成虚线
import { computed, ref } from 'vue';
import { groupYears, yearLabel } from '../lib/ringlayout.js';
import { hourColor } from '../lib/wave.js';

const p = defineProps({ list: Array, size: { type: Number, default: 300 }, mode: { type: String, default: 'cells' }, playingId: { type: String, default: null } });
const emit = defineEmits(['pick']);
const C = 150, rIn = 22, rOut = 132, TAU = Math.PI * 2;
const items = computed(() => (p.list || []).filter((e) => e.hour != null && e.semester));
const years = computed(() => groupYears(items.value));
const pt = (a, r) => `${(C + Math.sin(a) * r).toFixed(2)},${(C - Math.cos(a) * r).toFixed(2)}`;
const newest = (L) => L.reduce((a, b) => (!a || Date.parse(b.at) > Date.parse(a.at) ? b : a), null);

// 格子
const cells = computed(() => {
  const Y = years.value, w = (rOut - rIn) / (Y.length || 1);
  const out = [];
  let max = 1;
  Y.forEach((g, i) => {
    const by = Array.from({ length: 24 }, () => []);
    for (const e of g.items) by[Math.floor(e.hour) % 24].push(e);
    by.forEach((L, h) => {
      max = Math.max(max, L.length);
      const r0 = rIn + i * w + 0.6, r1 = rIn + (i + 1) * w - 0.6, a0 = (h / 24) * TAU + 0.006, a1 = ((h + 1) / 24) * TAU - 0.006;
      out.push({ key: `${g.year}-${h}`, year: g.year, h, L, d: `M${pt(a0, r0)}L${pt(a0, r1)}A${r1},${r1} 0 0 1 ${pt(a1, r1)}L${pt(a1, r0)}A${r0},${r0} 0 0 0 ${pt(a0, r0)}Z` });
    });
  });
  return { out, max };
});

// 刻纹：每一圈的基线等距，鼓出的高度按各圈共用的同一把尺（看得出哪一年多）
const grooves = computed(() => {
  const Y = years.value, w = (rOut - rIn) / (Y.length || 1), K = 144, kappa = 16;
  const f = Y.map((g) => {
    const v = new Float64Array(K);
    for (const e of g.items) { const a = (e.hour / 24) * TAU; for (let k = 0; k < K; k++) v[k] += Math.exp(kappa * (Math.cos((k / K) * TAU - a) - 1)); }
    return v;
  });
  let max = 1e-9;
  for (const v of f) for (const x of v) max = Math.max(max, x);
  const amp = w * 0.92;
  return Y.map((g, i) => {
    const base = rIn + i * w, R = (k) => base + amp * (f[i][((k % K) + K) % K] / max);
    let d = '';
    for (let k = 0; k <= K; k++) d += `${k ? 'L' : 'M'}${pt((k / K) * TAU, R(k))}`;
    const ticks = g.items.map((e) => { const a = (e.hour / 24) * TAU, kk = Math.round((e.hour / 24) * K); return { e, d: `M${pt(a, base)}L${pt(a, R(kk))}` }; });
    return { year: g.year, empty: !!g.empty, base, d: d + 'Z', ticks };
  });
});

// 不分圈：半径按日期线性
const spiral = computed(() => {
  const L = items.value.filter((e) => e.at);
  if (!L.length) return { dots: [], bounds: [] };
  const T = L.map((e) => Date.parse(e.at)), t0 = Math.min(...T), t1 = Math.max(...T), span = t1 - t0 || 1;
  const R = (t) => rIn + 4 + ((t - t0) / span) * (rOut - rIn - 8);
  const dots = L.map((e, i) => { const a = (e.hour / 24) * TAU, r = R(T[i]); return { e, x: C + Math.sin(a) * r, y: C - Math.cos(a) * r }; });
  const bounds = years.value.slice(1).map((g) => ({ year: g.year, r: R(Date.UTC(g.year, 7, 31)) })).filter((b) => b.r > rIn && b.r < rOut);
  return { dots, bounds };
});

const hover = ref('');
const handFor = (e) => e && e.id === p.playingId;
</script>

<template>
  <figure class="alt">
    <svg :width="size" :height="size" viewBox="-10 -10 320 320" role="img" :aria-label="`年轮样张：${items.length} 张`" @pointerleave="hover = ''">
      <g class="face" aria-hidden="true">
        <text :x="C" y="-1" text-anchor="middle">子夜</text><text x="309" :y="C + 4" text-anchor="end">六时</text>
        <text :x="C" y="309" text-anchor="middle">正午</text><text x="-9" :y="C + 4">十八时</text>
      </g>
      <g v-if="mode === 'cells'">
        <path v-for="c in cells.out" :key="c.key" :d="c.d" class="cell" :class="{ has: c.L.length, on: c.L.some(handFor) }"
          :style="c.L.length ? { fillOpacity: 0.12 + 0.88 * Math.sqrt(c.L.length / cells.max) } : null"
          @pointerenter="hover = `${yearLabel(c.year)} · ${c.h}–${c.h + 1} 时 · ${c.L.length} 张`" @click="c.L.length && emit('pick', newest(c.L))" />
      </g>
      <g v-else-if="mode === 'groove'">
        <g v-for="g in grooves" :key="g.year" @pointerenter="hover = `${yearLabel(g.year)} · ${g.ticks.length} 张`">
          <circle :cx="C" :cy="C" :r="g.base" class="base" :class="{ scar: g.empty }" />
          <path v-if="!g.empty" :d="g.d" class="groove" />
          <path v-for="t in g.ticks" :key="t.e.id" :d="t.d" class="tick" :class="{ on: handFor(t.e) }" @click="emit('pick', t.e)" />
        </g>
      </g>
      <g v-else>
        <circle v-for="b in spiral.bounds" :key="b.year" :cx="C" :cy="C" :r="b.r" class="base scar" />
        <circle v-for="d in spiral.dots" :key="d.e.id" :cx="d.x" :cy="d.y" :r="handFor(d.e) ? 4 : 2.6" :fill="hourColor(d.e.hour)" class="dot" :class="{ on: handFor(d.e) }" @click="emit('pick', d.e)" />
      </g>
      <circle :cx="C" :cy="C" :r="rIn - 6" class="pith" />
    </svg>
    <figcaption class="fine">{{ hover || `${items.length} 张，${years.length} 个学年，最里最早。` }}</figcaption>
  </figure>
</template>

<style scoped>
.alt { margin: 8px 0 0; }
.alt svg { display: block; max-width: 100%; height: auto; }
.face text { font: 10px var(--f-ui); fill: var(--ink-2); }
.cell { fill: var(--wash); stroke: none; }
.cell.has { fill: var(--ink); cursor: pointer; }
.cell.on { fill: #E6BE3A; fill-opacity: 1 !important; }
.base { fill: none; stroke: var(--hair); stroke-width: .7; }
.base.scar { stroke: var(--line); stroke-dasharray: 1 2.5; }
.groove { fill: none; stroke: var(--ink); stroke-width: 1.1; }
.tick { stroke: var(--ink); stroke-width: 2.4; stroke-opacity: .22; cursor: pointer; }
.tick:hover, .tick.on { stroke: #E6BE3A; stroke-opacity: 1; }
.dot { stroke: var(--paper); stroke-width: .6; cursor: pointer; }
.dot.on { stroke: var(--ink); stroke-width: 1.6; }
.pith { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
</style>
