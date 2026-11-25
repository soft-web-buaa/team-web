<script setup>
// 社区 · 数据地图（学黄泰霖原型社区的「原始地图 / 数据地图」）：看什么 × 怎么画 × 只看这个钟点。
// 画在舞台的校园上（stage.setData）；纸上是图例、口径、按量排的地点。每一个数都写 n 和口径。
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { L, isPublic } from '../lib/library.js';
import { allPosts, C } from '../lib/community.js';
import { METRICS, FORMS, MOOD_COL, MOOD_NAME, placeStats, valueOf, legendLine } from '../lib/datamap.js';
import { clock, cnHour, goHour, backToNow } from '../lib/clock.js';
import { bj } from '../lib/when.js';
import * as stage from '../stage/stage.js';

const router = useRouter();
const metric = ref('count'), form = ref('contour'), byHour = ref(false);
const entries = computed(() => { void L.version; return L.entries.filter((e) => isPublic(e) && e.tier !== 'archival' && e.placeId); });
const posts = computed(() => { void C.version; return allPosts().filter((p) => p.placeId).map((p) => ({ ...p, hour: p.at ? bj(p.at).h : null })); });
const hourQ = computed(() => (byHour.value ? Math.round(clock.shown * 4) / 4 : null));
const stats = computed(() => placeStats(L.places, entries.value, posts.value, { hour: hourQ.value }));
const values = computed(() => new Map([...stats.value].map(([k, s]) => [k, Math.round(valueOf(s, metric.value) * (metric.value === 'quiet' ? 100 : 1))])));
const ranked = computed(() => L.places.map((p) => ({ p, s: stats.value.get(p.id), v: values.value.get(p.id) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v));
const vmax = computed(() => Math.max(1, ...ranked.value.map((x) => x.v)));
const demoMood = computed(() => posts.value.filter((p) => p.demo && p.mood).length);
const legend = computed(() => legendLine(stats.value, metric.value, { hour: hourQ.value, demo: demoMood.value }));

function paint() { stage.setData({ form: form.value, metric: metric.value, stats: stats.value, values: values.value, hour: hourQ.value ?? (form.value === 'clock' || form.value === 'rings' ? clock.shown : null) }); }
watch([form, metric, stats, () => clock.tokens.dark, () => (form.value === 'clock' || form.value === 'rings' ? Math.round(clock.shown * 4) : 0)], paint, { immediate: true });
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
      <button v-for="f in FORMS" :key="f.id" type="button" role="radio" class="form" :class="{ on: form === f.id }" :aria-checked="form === f.id" @click="form = f.id">
        <svg viewBox="0 0 40 28" aria-hidden="true">
          <template v-if="f.id === 'columns'"><path d="M8 26 L10 10 L14 10 L16 26Z M19 26 L21 4 L25 4 L27 26Z M30 26 L31.5 16 L34.5 16 L36 26Z" /></template>
          <template v-else-if="f.id === 'heat'"><circle cx="15" cy="14" r="10" class="soft" /><circle cx="27" cy="16" r="7" class="soft" /><circle cx="15" cy="14" r="4" /></template>
          <template v-else-if="f.id === 'contour'"><ellipse cx="20" cy="14" rx="17" ry="11" class="ln" /><ellipse cx="18" cy="14" rx="11" ry="7" class="ln" /><ellipse cx="17" cy="14" rx="5" ry="3.2" class="ln" /></template>
          <template v-else-if="f.id === 'rings'"><circle cx="20" cy="14" r="12" class="ln" /><circle cx="20" cy="14" r="8.5" class="ln" /><circle cx="20" cy="14" r="5" class="ln" /><circle cx="20" cy="14" r="1.6" /></template>
          <template v-else><g class="tk"><line v-for="h in 24" :key="h" :x1="20 + Math.sin(h / 24 * 6.283) * 5" :y1="14 - Math.cos(h / 24 * 6.283) * 5" :x2="20 + Math.sin(h / 24 * 6.283) * (6 + ((h * 7) % 5) * 1.6)" :y2="14 - Math.cos(h / 24 * 6.283) * (6 + ((h * 7) % 5) * 1.6)" /></g></template>
        </svg>
        <span>{{ f.name }}</span>
      </button>
    </div>
    <p class="fine">{{ FORMS.find((f) => f.id === form).say }}</p>

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
.forms { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.form { display: grid; justify-items: center; gap: 4px; padding: 8px 2px 7px; border-radius: 3px; border: 1px solid var(--hair); background: none; font-size: 12px; color: var(--ink-2); }
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
.rk { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px; align-items: center; width: 100%; padding: 6px 0; border: 0; border-top: 1px solid var(--hair); background: none; text-align: left; }
.rk .nm { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rk .bar { height: 8px; border-radius: 2px; background: var(--hair); overflow: hidden; }
.rk .bar i { display: block; height: 100%; background: var(--ink); }
.rk .n { font-size: 12px; color: var(--ink-2); }
</style>
