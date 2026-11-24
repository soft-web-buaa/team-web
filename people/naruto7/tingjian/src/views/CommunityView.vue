<script setup>
// 社区（众人）：别人听见了什么。结构学黄泰霖原型的社区（地图 + 随机遇见 + 主题合辑），加上回声流。
// 舞台上：每个地点升起一根光柱，高度是这里的张数；图层换口径（全部 / 本学期 / 这个钟点 / 被回应过的）。
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import { L, columns, isPublic, play, entryById, title, echoByline, refresh } from '../lib/library.js';
import { clock, cnHour } from '../lib/clock.js';
import * as stage from '../stage/stage.js';

const router = useRouter();
const LAYERS = [
  { id: 'all', name: '全部', test: () => true, say: '每根光柱是一个地方，高度是这里留下的张数。' },
  { id: 'sem', name: '本学期', test: (e) => e.semester === L.nowSem, say: '只数这个学期留下的。' },
  { id: 'hour', name: '这个钟点', test: (e) => e.hour != null && Math.min(Math.abs(e.hour - clock.shown), 24 - Math.abs(e.hour - clock.shown)) < 1.5, say: '只数前后一个半小时里录的：这个钟点，哪里最热闹。' },
  { id: 'echo', name: '被回应过的', test: (e) => (e.echoN || 0) > 0 || seededEcho.value.has(e.id), say: '有人在某一秒钉过话的盘。' },
];
const layer = ref('all');
const seededEcho = computed(() => new Set(L.feed.map((x) => x.discId)));
const pub = computed(() => { void L.version; return L.entries.filter((e) => isPublic(e) && e.tier !== 'archival'); });
function paint() {
  const L0 = LAYERS.find((x) => x.id === layer.value);
  stage.setColumns(columns((e) => isPublic(e) && e.tier !== 'archival' && L0.test(e)));
}
watch([layer, () => L.version, () => Math.round(clock.shown * 2)], paint, { immediate: true });
const top = computed(() => {
  const L0 = LAYERS.find((x) => x.id === layer.value);
  const m = columns((e) => isPublic(e) && e.tier !== 'archival' && L0.test(e));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pid, n]) => ({ p: L.placeById.get(pid), n }));
});

// 随机遇见：纯随机，没有算法（原型里的那一句）
const seed = ref(0);
const meet = computed(() => { void seed.value; const a = pub.value.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 4); });

// 合辑：按声音的种类和钟点归的（自动归，不是人编的）
const SETS = [
  { id: 'bell', name: '铃与叫号', say: '下课铃、闭馆广播、取餐叫号：学校用声音报时。', test: (e) => e.kind === 'signal' },
  { id: 'night', name: '夜里的', say: '二十二点以后、五点以前。', test: (e) => e.hour != null && (e.hour >= 22 || e.hour < 5) },
  { id: 'steps', name: '脚步与人流', say: '楼梯、连廊、拖着行李箱。', test: (e) => e.kind === 'move' },
  { id: 'rooms', name: '房间的回响', say: '同一下拍手，在不同的屋子里拖出不同长度的尾巴。', test: (e) => e.kind === 'space' },
  { id: 'sky', name: '风、雨、虫和鸟', say: '没有人声的十秒。', test: (e) => e.kind === 'nature' },
  { id: 'real', name: '真人录的', say: '同学亲手刻的，每一张都有人、有地方、有时刻。', test: (e) => e.tier === 'real' },
];
const set = ref(null);
const setList = computed(() => (set.value ? pub.value.filter(set.value.test).slice().reverse() : []));
const feed = computed(() => L.feed.map((x) => ({ x, e: entryById(x.discId) })).filter((y) => y.e).slice(0, 12));
const timer = setInterval(() => { if (!document.hidden) refresh(); }, 20000);
onBeforeUnmount(() => { clearInterval(timer); stage.setColumns(new Map()); });
</script>

<template>
  <Paper label="社区">
    <p class="kicker">众人 · {{ pub.length }} 张公开的盘</p>
    <h1 class="h1">别人听见了什么</h1>
    <div class="row" role="radiogroup" aria-label="光柱的口径">
      <button v-for="x in LAYERS" :key="x.id" type="button" role="radio" class="chip" :class="{ on: layer === x.id }" :aria-checked="layer === x.id" @click="layer = x.id">{{ x.id === 'hour' ? cnHour(clock.shown) : x.name }}</button>
    </div>
    <p class="fine" style="margin-top: 10px">{{ LAYERS.find((x) => x.id === layer).say }}
      <template v-if="top[0] && top[0].n">最高的三根：<template v-for="(t, i) in top" :key="t.p.id"><button type="button" class="link" @click="router.push(`/place/${t.p.id}`)">{{ t.p.name }}</button> {{ t.n }}<template v-if="i < top.length - 1">、</template></template>。</template>
    </p>

    <p class="h3">刚刚有人说</p>
    <ol v-if="feed.length" class="feed">
      <li v-for="y in feed" :key="y.x.id">
        <button type="button" class="say" @click="play(y.e, { seek: Math.max(0, y.x.t - 0.4) })">
          <span class="q">「{{ y.x.text }}」</span>
          <span class="m">钉在 {{ y.e.place }} · {{ title(y.e) }} 的第 {{ y.x.t.toFixed(1) }} 秒{{ echoByline(y.x) ? ` · ${echoByline(y.x)}` : '' }}</span>
        </button>
      </li>
    </ol>
    <p v-else class="fine">{{ L.online === false ? '连不上云，看不到别人刚说的话。' : '还没有人钉过话。放一张，在你想说话的那一秒钉一句。' }}</p>

    <p class="h3">随手遇见 <button type="button" class="link fine" @click="seed++">换一批</button></p>
    <p class="fine" style="margin-top: -4px">纯随机，没有推荐算法。</p>
    <ol class="discs"><DiscRow v-for="e in meet" :key="e.id" :e="e" /></ol>

    <p class="h3">合辑</p>
    <div class="sets">
      <button v-for="s in SETS" :key="s.id" type="button" class="set" :class="{ on: set && set.id === s.id }" @click="set = set && set.id === s.id ? null : s">
        <b class="show">{{ s.name }}</b><span>{{ pub.filter(s.test).length }} 张</span>
      </button>
    </div>
    <template v-if="set">
      <p class="fine" style="margin-top: 12px">{{ set.say }} 合辑是按声音的种类和钟点自动归的。</p>
      <ol class="discs"><DiscRow v-for="e in setList.slice(0, 30)" :key="e.id" :e="e" /></ol>
      <p v-if="!setList.length" class="fine">这一辑还空着。</p>
    </template>
  </Paper>
</template>

<style scoped>
.feed { list-style: none; padding: 0; margin: 0; }
.say { display: block; width: 100%; text-align: left; border: 0; border-top: 1px solid var(--hair); background: none; padding: 10px 0; }
.say .q { font: 17px/1.5 var(--f-show); display: block; }
.say .m { font-size: 12px; color: var(--ink-2); }
.sets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.set { display: flex; justify-content: space-between; align-items: baseline; padding: 12px; border-radius: 3px; border: 1px solid var(--hair); background: var(--wash); text-align: left; }
.set b { font-size: 16px; }
.set span { font-size: 12px; color: var(--ink-2); }
.set.on { border-color: var(--ink); background: var(--paper); box-shadow: inset 3px 0 0 var(--scope); }
</style>
