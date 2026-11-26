<script setup>
// 社区 · 数据地图（学黄泰霖原型社区的「原始地图 / 数据地图」）：看什么 × 怎么画 × 只看这个钟点。
// 画在舞台的校园上（stage.setData）；纸上是图例、口径、按量排的地点。每一个数都写 n 和口径。
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { L, isPublic } from '../lib/library.js';
import { allPosts, C } from '../lib/community.js';
import { METRICS, FORMS, OLD_FORMS, PALETTES, MOOD_COL, MOOD_NAME, placeStats, valueOf, legendLine } from '../lib/datamap.js';
import { clock, cnHour, goHour, backToNow } from '../lib/clock.js';
import { bj } from '../lib/when.js';
import * as stage from '../stage/stage.js';

const router = useRouter();
const metric = ref('count'), form = ref('nebula'), pal = ref('night'), byHour = ref(false), showOld = ref(false);
const ALL_FORMS = [...FORMS, ...OLD_FORMS];
const entries = computed(() => { void L.version; return L.entries.filter((e) => isPublic(e) && e.tier !== 'archival' && e.placeId); });
const posts = computed(() => { void C.version; return allPosts().filter((p) => p.placeId).map((p) => ({ ...p, hour: p.at ? bj(p.at).h : null })); });
const hourQ = computed(() => (byHour.value ? Math.round(clock.shown * 4) / 4 : null));
const stats = computed(() => placeStats(L.places, entries.value, posts.value, { hour: hourQ.value }));
const values = computed(() => new Map([...stats.value].map(([k, s]) => [k, Math.round(valueOf(s, metric.value) * (metric.value === 'quiet' ? 100 : 1))])));
const ranked = computed(() => L.places.map((p) => ({ p, s: stats.value.get(p.id), v: values.value.get(p.id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v));
const vmax = computed(() => Math.max(1, ...ranked.value.map((x) => x.v)));
const demoMood = computed(() => posts.value.filter((p) => p.demo && p.mood).length);
const legend = computed(() => legendLine(stats.value, metric.value, { hour: hourQ.value, demo: demoMood.value }));

const colors = computed(() => new Map([...stats.value].map(([k, s]) => [k, metric.value === 'mood' && s.mood ? MOOD_COL[s.mood] : null])));
function paint() { stage.setData({ form: form.value, pal: pal.value, metric: metric.value, stats: stats.value, values: values.value, colors: colors.value, hour: hourQ.value ?? (form.value === 'clock' || form.value === 'rings' ? clock.shown : null) }); }
watch([form, pal, metric, stats, () => clock.tokens.dark, () => (form.value === 'clock' || form.value === 'rings' ? Math.round(clock.shown * 4) : 0)], paint, { immediate: true });
onBeforeUnmount(() => stage.setData(null));
const unit = (x) => (metric.value === 'count' ? `${x.v} 张` : metric.value === 'quiet' ? `${x.s.db.toFixed(1)} dBFS · ${x.s.dbN} 张` : `${MOOD_NAME[x.s.mood]} · ${x.s.moodN} 帖`);
</script>

<template>
  <section class="dp">
    <p class="h3">看什么</p>
    <div class="row" role="radiogroup" aria-label="看什么">
      <button v-for="m in METRICS" :key="m.id" type="button" role="radio" class="chip" :class="{ on: metric === m.id }" :aria-checked="metric === m.id" @click="metric = m.id">{{ m.name }}</button>
    </div>
    <p class="fine">{{ METRICS.find((m) => m.id === metric).say }}</p>

    <p class="h3">怎么画</p>
    <div class="forms" role="radiogroup" aria-label="怎么画">
      <button v-for="f in (showOld ? ALL_FORMS : FORMS)" :key="f.id" type="button" role="radio" class="form" :class="{ on: form === f.id, old: !FORMS.includes(f) }" :aria-checked="form === f.id" @click="form = f.id">
        <svg viewBox="0 0 40 28" aria-hidden="true">
          <template v-if="f.id === 'nebula'"><circle v-for="i in 22" :key="i" :cx="14 + Math.cos(i * 2.4) * (i % 7) * 1.4" :cy="13 + Math.sin(i * 2.4) * (i % 7) * 1.1" :r="i % 3 ? 0.9 : 1.4" /><circle v-for="i in 10" :key="'b' + i" :cx="30 + Math.cos(i * 2.4) * (i % 5) * 1.1" :cy="17 + Math.sin(i * 2.4) * (i % 5) * 0.9" r="0.8" /></template>
          <template v-else-if="f.id === 'lights'"><circle v-for="i in 30" :key="i" :cx="3 + (i * 7.3) % 34" :cy="4 + ((i * 11) % 20) + (i % 2) * 1.5" :r="(i * 7.3) % 34 < 14 && (i * 11) % 20 < 12 ? 1.3 : 0.6" /></template>
          <template v-else-if="f.id === 'surface'"><g class="ln"><path d="M2 22 Q12 22 16 8 Q19 2 22 10 Q26 20 38 20" /><path d="M2 25 Q12 25 16 13 Q19 8 22 14 Q26 23 38 23" class="soft" /></g><line x1="19" y1="5" x2="19" y2="26" class="tkl" /></template>
          <template v-else-if="f.id === 'fill'"><rect x="5" y="8" width="9" height="18" class="ln" /><rect x="5" y="16" width="9" height="10" /><rect x="18" y="4" width="8" height="22" class="ln" /><rect x="18" y="8" width="8" height="18" /><rect x="30" y="12" width="7" height="14" class="ln" /><rect x="30" y="22" width="7" height="4" /></template>
          <template v-else-if="f.id === 'heat'"><circle cx="15" cy="14" r="10" class="soft" /><circle cx="27" cy="16" r="7" class="soft" /><circle cx="15" cy="14" r="4" /></template>
          <template v-else-if="f.id === 'contour'"><ellipse cx="20" cy="14" rx="17" ry="11" class="ln" /><ellipse cx="18" cy="14" rx="11" ry="7" class="ln" /><ellipse cx="17" cy="14" rx="5" ry="3.2" class="ln" /></template>
          <template v-else-if="f.id === 'rings'"><circle cx="20" cy="14" r="12" class="ln" /><circle cx="20" cy="14" r="8.5" class="ln" /><circle cx="20" cy="14" r="5" class="ln" /><circle cx="20" cy="14" r="1.6" /></template>
          <template v-else><g class="tk"><line v-for="h in 24" :key="h" :x1="20 + Math.sin(h / 24 * 6.283) * 5" :y1="14 - Math.cos(h / 24 * 6.283) * 5" :x2="20 + Math.sin(h / 24 * 6.283) * (6 + ((h * 7) % 5) * 1.6)" :y2="14 - Math.cos(h / 24 * 6.283) * (6 + ((h * 7) % 5) * 1.6)" /></g></template>
        </svg>
        <span>{{ f.name }}</span>
      </button>
    </div>
    <p class="fine">{{ ALL_FORMS.find((f) => f.id === form).say }} <button type="button" class="link fine" @click="showOld = !showOld">{{ showOld ? '收起旧画法' : '旧画法（热力、等高线…）' }}</button></p>

    <p class="h3">配色</p>
    <div class="row" role="radiogroup" aria-label="配色">
      <button v-for="c in PALETTES" :key="c.id" type="button" role="radio" class="chip" :class="{ on: pal === c.id }" :aria-checked="pal === c.id" @click="pal = c.id">{{ c.name }}</button>
    </div>
    <p class="fine">{{ PALETTES.find((c) => c.id === pal).say }}</p>

    <p class="h3">什么时候</p>
    <div class="row">
      <button type="button" class="chip" :class="{ on: !byHour }" @click="byHour = false">全天</button>
      <button type="button" class="chip" :class="{ on: byHour }" @click="byHour = true">只看{{ cnHour(clock.shown) }}前后</button>
      <button v-if="byHour" type="button" class="link fine" @click="goHour(clock.shown + 1, { label: '数据地图' })">往后一小时</button>
      <button v-if="byHour && clock.source !== 'now'" type="button" class="link fine" @click="backToNow()">回到此刻</button>
    </div>
    <p class="fine">只看一个钟点时，拖右上角的钟或年轮里的时针，地图跟着变（学黄泰霖原型的「时段声景变化」）。</p>

    <p class="h3">图例</p>
    <p class="legend">{{ legend }}</p>
    <div v-if="metric === 'mood'" class="moods">
      <span v-for="(c, id) in MOOD_COL" :key="id"><i :style="{ background: c }"></i>{{ MOOD_NAME[id] }}</span>
    </div>
    <ol class="rank">
      <li v-for="x in ranked.slice(0, 8)" :key="x.p.id">
        <button type="button" class="rk" @click="router.push(`/place/${x.p.id}`)">
          <span class="nm show">{{ x.p.name }}</span>
          <span class="bar"><i :style="{ width: `${(x.v / vmax) * 100}%`, background: metric === 'mood' && x.s.mood ? MOOD_COL[x.s.mood] : null }"></i></span>
          <span class="n">{{ unit(x) }}</span>
        </button>
      </li>
    </ol>
    <p v-if="!ranked.length" class="fine">{{ byHour ? '这个钟点前后还没有。' : '还没有。' }}</p>
    <p v-if="metric === 'mood'" class="fine">心情只有帖子上才有，现在大多是示例帖，n 很小：这一层要等真实的帖子多起来才有意思。</p>
  </section>
</template>

<style scoped>
.forms { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.form.old { border-style: dashed; }
.form .tkl { stroke: var(--ink-2); stroke-width: 0.8; stroke-dasharray: 1.5 1.5; }
.form { display: grid; justify-items: center; gap: 4px; padding: 8px 2px 7px; border-radius: 4px; border: 1px solid var(--hair); background: none; font-size: 12px; color: var(--ink-2); transition: border-color .16s, background-color .16s, color .16s; }
.form:hover { border-color: var(--ink-2); color: var(--ink); background: var(--wash); }
.form svg { width: 40px; height: 28px; fill: var(--ink-2); }
.form .soft { opacity: .3; }
.form .ln { fill: none; stroke: var(--ink-2); stroke-width: 1.2; }
.form .tk line { stroke: var(--ink-2); stroke-width: 1.6; }
.form.on { border-color: var(--ink); color: var(--ink); box-shadow: inset 0 -3px 0 var(--scope); }
.form.on svg { fill: var(--ink); }
.form.on .ln, .form.on .tk line { stroke: var(--ink); }
.legend { font-size: 13px; margin: 0 0 8px; }
.moods { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--ink-2); margin: 0 0 8px; }
.moods i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.rank { list-style: none; padding: 0; margin: 4px 0 0; }
.rk { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px; align-items: center; width: 100%; padding: 6px 8px; margin: 0 -8px; border: 0; border-top: 1px solid var(--hair); border-radius: 0 0 4px 4px; background: none; text-align: left; transition: background-color .16s; }
.rk:hover { background: var(--wash); }
.rk .nm { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rk .bar { height: 8px; border-radius: 2px; background: var(--hair); overflow: hidden; }
.rk .bar i { display: block; height: 100%; background: var(--ink); }
.rk .n { font-size: 12px; color: var(--ink-2); }
</style>
