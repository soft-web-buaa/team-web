<script setup>
// 年轮（新排法，src/lib/ringlayout.js）：角度是一天里的钟点，从里往外一圈一个学年。
//   点：数据少时每张一颗，挤的钟点往外堆，所以每一圈自己就是一天的直方图
//   纹：数据多时每一圈的厚度随钟点变，叠出整个校园的一天；每张声音是圈里一道细纹
// mode = 'auto' 时按数据自己选。组长 2026-11-25：圆盘形式不改，布局要跟着数据走。
import { computed, ref } from 'vue';
import { pickMode, dotLayout, grainLayout, at, ringLine, yearLabel, K } from '../lib/ringlayout.js';
import { hourColor } from '../lib/wave.js';
import { clock } from '../lib/clock.js';

const p = defineProps({
  list: Array, size: { type: Number, default: 300 }, mode: { type: String, default: 'auto' },
  hand: { type: Boolean, default: true }, caption: { type: String, default: '' }, playingId: { type: String, default: null },
});
const emit = defineEmits(['pick']);
const C = 150, rIn = 22, rOut = 132;
const TAU = Math.PI * 2;
const items = computed(() => (p.list || []).filter((e) => e.hour != null && e.semester));
const chosen = computed(() => (p.mode === 'auto' ? pickMode(items.value, { rIn, rOut, cx: C, cy: C }).mode : p.mode));
const dots = computed(() => (chosen.value === 'dots' ? dotLayout(items.value, { rIn, rOut, cx: C, cy: C }) : null));
const grain = computed(() => (chosen.value === 'grain' ? grainLayout(items.value, { rIn, rOut }) : null));

const pt = (a, r) => `${(C + Math.sin(a) * r).toFixed(2)},${(C - Math.cos(a) * r).toFixed(2)}`;
function band(inner, outer) {
  let d = '';
  for (let k = 0; k <= K; k++) { const a = (k / K) * TAU; d += `${k ? 'L' : 'M'}${pt(a, at(outer, a))}`; }
  for (let k = K; k >= 0; k--) { const a = (k / K) * TAU; d += `L${pt(a, at(inner, a))}`; }
  return d + 'Z';
}
const rings = computed(() => {
  if (!grain.value) return [];
  return grain.value.rings.map((g, i) => ({
    ...g, i,
    early: band(g.inner, g.split), late: band(g.split, g.outer),
    // 细纹：每张一道，从这一圈的内沿画到外沿，角度是它的钟点
    fibres: g.items.map((e) => { const a = (e.hour / 24) * TAU; return { e, a, d: `M${pt(a, at(g.inner, a) + 0.4)}L${pt(a, at(g.outer, a) - 0.4)}` }; }),
  }));
});
const hover = ref(null);
const handA = computed(() => (clock.shown / 24) * TAU);
const total = computed(() => items.value.length);
const yearsN = computed(() => (dots.value ? dots.value.rings : grain.value ? grain.value.rings : []).filter((r) => !r.empty).length);
const firstLast = computed(() => { const R = (dots.value ? dots.value.rings : grain.value ? grain.value.rings : []); return R.length ? [R[0].year, R.at(-1).year] : null; });
function ringAt(ev) {
  if (!grain.value) return;
  const s = ev.currentTarget.getBoundingClientRect(), k = 320 / s.width;
  const x = (ev.clientX - s.left) * k - 10 - C, y = (ev.clientY - s.top) * k - 10 - C;
  const a = (Math.atan2(x, -y) + TAU) % TAU, r = Math.hypot(x, y);
  hover.value = grain.value.rings.find((g) => r >= at(g.inner, a) && r <= at(g.outer, a)) || null;
  hoverA = a;
}
// 纹：点一圈里的某个位置，放这一圈里钟点离那儿最近的一张
let hoverA = 0;
function pickGrain() {
  if (!hover.value || !hover.value.items.length) return;
  const d = (e) => { const x = Math.abs((e.hour / 24) * TAU - hoverA); return Math.min(x, TAU - x); };
  emit('pick', hover.value.items.reduce((a, b) => (d(b) < d(a) ? b : a)));
}
</script>

<template>
  <figure class="wood" :class="chosen">
    <svg :width="size" :height="size" viewBox="-10 -10 320 320" role="img" :aria-label="caption || `年轮：${total} 张，${yearsN} 个学年`" @pointermove="ringAt" @pointerleave="hover = null" @click="pickGrain">
      <!-- 钟面：四个钟点，二十四道很短的刻度 -->
      <g class="face" aria-hidden="true">
        <line v-for="h in 24" :key="h" :x1="C + Math.sin(((h - 1) / 24) * TAU) * (rOut + 6)" :y1="C - Math.cos(((h - 1) / 24) * TAU) * (rOut + 6)" :x2="C + Math.sin(((h - 1) / 24) * TAU) * (rOut + ((h - 1) % 6 ? 9 : 13))" :y2="C - Math.cos(((h - 1) / 24) * TAU) * (rOut + ((h - 1) % 6 ? 9 : 13))" />
        <text :x="C" y="-1" text-anchor="middle">子夜</text><text x="309" :y="C + 4" text-anchor="end">六时</text>
        <text :x="C" y="309" text-anchor="middle">正午</text><text x="-9" :y="C + 4">十八时</text>
      </g>
      <!-- 纹 -->
      <g v-if="grain">
        <g v-for="g in rings" :key="g.year" :class="{ hot: hover && hover.year === g.year }">
          <template v-if="!g.empty">
            <path :d="g.early" class="early" />
            <path :d="g.late" class="late" />
            <path v-for="f in g.fibres" :key="f.e.id" :d="f.d" class="fibre" :class="{ on: f.e.id === playingId, mine: f.e.mine }" />
          </template>
          <path v-else :d="g.early" class="scar" />
        </g>
      </g>
      <!-- 点 -->
      <g v-if="dots">
        <circle v-for="g in dots.rings" :key="g.year" :cx="C" :cy="C" :r="g.r1 + 1" class="ring" :class="{ scar: g.empty }" />
        <circle v-for="d in dots.dots" :key="d.e.id" :cx="d.x" :cy="d.y" :r="d.e.id === playingId ? dots.r + 1.6 : dots.r" :fill="hourColor(d.e.hour)" class="dot" :class="{ mine: d.e.mine, on: d.e.id === playingId }" @click="emit('pick', d.e)">
          <title>{{ d.e.note || d.e.place }} · {{ Math.floor(d.e.hour) }} 时</title>
        </circle>
      </g>
      <line v-if="hand" :x1="C" :y1="C" :x2="C + Math.sin(handA) * (rOut + 4)" :y2="C - Math.cos(handA) * (rOut + 4)" class="hand" />
      <circle :cx="C" :cy="C" :r="rIn - 6" class="pith" />
      <circle :cx="C" :cy="C" r="3" fill="#E6BE3A" />
    </svg>
    <figcaption class="fine">
      <template v-if="hover">{{ ringLine(hover) }}<template v-if="chosen === 'grain'"> · 点一下放离这个钟点最近的一张</template></template>
      <template v-else-if="firstLast">{{ caption }}{{ caption ? ' ' : '' }}{{ total }} 张，最里一圈是 {{ yearLabel(firstLast[0]) }}，最外一圈是 {{ yearLabel(firstLast[1]) }}。角度是一天里的钟点，{{ chosen === 'grain' ? '哪个钟点声音多，那一段就厚；每一道细纹是一张。每一圈里浅的是秋季学期、深的是春季学期。' : '一颗点是一张，同一个钟点的往外堆。' }}</template>
      <template v-else>还没有一圈。</template>
    </figcaption>
  </figure>
</template>

<style scoped>
.wood { margin: 8px 0 0; }
.wood svg { display: block; max-width: 100%; height: auto; touch-action: manipulation; }
.face line { stroke: var(--line); stroke-width: 1; }
.face text { font: 10px var(--f-ui); fill: var(--ink-2); }
.early { fill: var(--wash); stroke: var(--hair); stroke-width: .6; }
.late { fill: var(--hair); }
.hot .early, .hot .late { stroke: var(--ink); stroke-width: .8; }
.grain svg { cursor: pointer; }
.scar { fill: none; stroke: var(--line); stroke-width: .8; stroke-dasharray: 1 2.5; }
.fibre { stroke: var(--ink); stroke-width: .8; opacity: .38; stroke-linecap: round; }
.fibre.mine { stroke: #E6BE3A; opacity: 1; stroke-width: 1.4; }
.fibre.on { stroke: var(--ink); opacity: 1; stroke-width: 2; }
.ring { fill: none; stroke: var(--hair); stroke-width: 1; }
.ring.scar { stroke: var(--line); stroke-dasharray: 1 2.5; }
.dot { stroke: var(--paper); stroke-width: .8; cursor: pointer; }
.dot.mine { stroke: #E6BE3A; stroke-width: 1.8; }
.dot.on { stroke: var(--ink); stroke-width: 1.8; }
.hand { stroke: #E6BE3A; stroke-width: 1.4; }
.pith { fill: var(--paper); stroke: var(--line); stroke-width: 1; }
</style>
