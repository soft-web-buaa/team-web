<script setup>
// 留声机（何处）：舞台是主角，纸只留一小张。写的是这台唱机此刻在说什么：
// 「这个钟点，别的年份的人听见过什么」——同一个钟点，不同年份，就是这个网站的那一句话。
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import EchoBand from '../components/EchoBand.vue';
import Evening from '../components/Evening.vue';
import { L, shuffle, siteCounts, isPublic, whenText, byline, evenings } from '../lib/library.js';
import { clock, fmtHour, cnHour } from '../lib/clock.js';
import * as stage from '../stage/stage.js';
import { ref } from 'vue';

const close = ref(false);
const sameHour = computed(() => {
  void L.version;
  const h = clock.now, d = (e) => { const x = Math.abs(e.hour - h); return Math.min(x, 24 - x); };
  const near = L.entries.filter((e) => e.hour != null && isPublic(e) && d(e) < 0.75);
  const bySem = new Map();
  // 同一学期只留一张：真实录音优先（有人真的在那儿听见过），其次史料，最后示意；同档里钟点近的先
  const rank = (e) => (e.tier === 'real' ? 0 : e.tier === 'archival' ? 1 : 2);
  for (const e of near.sort((a, b) => rank(a) - rank(b) || d(a) - d(b))) if (!bySem.has(e.semester)) bySem.set(e.semester, e);
  return [...bySem.values()].sort((a, b) => String(b.semester).localeCompare(String(a.semester))).slice(0, 5);
});
// 这个钟点附近没有真录音时（比如下午），把钟点最近的一张真录音钉在第一行：任何时候打开，第一张都是真的
const realPin = computed(() => {
  void L.version;
  if (sameHour.value.some((e) => e.tier === 'real')) return null;
  const h = clock.now, d = (e) => { const x = Math.abs(e.hour - h); return Math.min(x, 24 - x); };
  return L.entries.filter((e) => e.tier === 'real' && e.hour != null && isPublic(e)).sort((a, b) => d(a) - d(b))[0] || null;
});
const pinMeta = (e) => ['最近的真录音', e.place, whenText(e), byline(e)].filter(Boolean).join(' · ');
const c = computed(() => { void L.version; return siteCounts(); });
const hasEvening = computed(() => { void L.version; return evenings().length > 0; });
function zoom() { close.value = !close.value; stage.zoomGroove(close.value); }
</script>

<template>
  <Paper slim label="留声机">
    <!-- 首屏先给一个人走过的一晚（真录音）；没有这样的一晚时，钟点那一段顶上来当标题 -->
    <Evening hero />
    <p class="kicker" :style="{ marginTop: hasEvening ? '26px' : 0 }">学院路 · 此刻 {{ fmtHour(clock.now) }}</p>
    <component :is="hasEvening ? 'h2' : 'h1'" :class="hasEvening ? 'h3' : 'h1'" :style="hasEvening ? '' : 'font-size: 30px'">{{ cnHour(clock.now) }}，这里放过这些声音</component>
    <p class="lede">同一个钟点，不同年份的人在同一个地方听见的十秒。点一栋楼进去，或者按住外圈的刻纹搓一搓。</p>
    <ol class="discs">
      <DiscRow v-if="realPin" :key="realPin.id" :e="realPin" :meta="pinMeta(realPin)" />
      <DiscRow v-for="e in sameHour.slice(0, realPin ? 4 : 5)" :key="e.id" :e="e" />
    </ol>
    <p v-if="!sameHour.length" class="fine">这个钟点还没有人留下声音。按住下面那颗钮，你就是第一张。</p>
    <EchoBand />
    <div class="row" style="margin-top: 18px">
      <button type="button" class="btn small ghost" @click="shuffle()">随手放一张</button>
      <button type="button" class="btn small ghost" :aria-pressed="close" @click="zoom">{{ close ? '退回来' : '凑近看刻槽' }}</button>
    </div>
    <hr class="rule">
    <p class="fine">馆里 {{ c.total }} 张：{{ c.real }} 张真实录音，{{ c.archival }} 段史料，{{ c.concept }} 张示意（页面合成的声音，不算人数）。<RouterLink to="/about">数据从哪来</RouterLink></p>
  </Paper>
</template>

<style scoped>
</style>
