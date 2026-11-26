<script setup>
// 留声机（何处）：舞台是主角，纸只留一小张。写的是这台唱机此刻在说什么：
// 「这个钟点，别的年份的人听见过什么」——同一个钟点，不同年份，就是这个网站的那一句话。
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import EchoBand from '../components/EchoBand.vue';
import { L, shuffle, siteCounts, tallyText, isPublic } from '../lib/library.js';
import { clock, fmtHour, cnHour } from '../lib/clock.js';
import * as stage from '../stage/stage.js';
import { ref } from 'vue';

const close = ref(false);
const sameHour = computed(() => {
  void L.version;
  const h = clock.now, d = (e) => { const x = Math.abs(e.hour - h); return Math.min(x, 24 - x); };
  const near = L.entries.filter((e) => e.hour != null && isPublic(e) && d(e) < 0.75);
  const bySem = new Map();
  for (const e of near.sort((a, b) => d(a) - d(b))) if (!bySem.has(e.semester)) bySem.set(e.semester, e);
  return [...bySem.values()].sort((a, b) => String(b.semester).localeCompare(String(a.semester))).slice(0, 5);
});
const c = computed(() => { void L.version; return siteCounts(); });
function zoom() { close.value = !close.value; stage.zoomGroove(close.value); }
</script>

<template>
  <Paper slim label="留声机">
    <p class="kicker">学院路 · 此刻 {{ fmtHour(clock.now) }}</p>
    <h1 class="h1" style="font-size: 30px">{{ cnHour(clock.now) }}，<br>这里放过这些声音</h1>
    <p class="lede">同一个钟点，不同年份的人在同一个地方听见的十秒。点一栋楼进去，或者按住外圈的刻纹搓一搓。</p>
    <ol class="discs">
      <DiscRow v-for="e in sameHour" :key="e.id" :e="e" />
    </ol>
    <p v-if="!sameHour.length" class="fine">这个钟点还没有人留下声音。按住下面那颗钮，你就是第一张。</p>
    <EchoBand />
    <div class="row" style="margin-top: 18px">
      <button type="button" class="btn small ghost" @click="shuffle()">随手放一张</button>
      <button type="button" class="btn small ghost" :aria-pressed="close" @click="zoom">{{ close ? '退回来' : '凑近看刻槽' }}</button>
    </div>
    <hr class="rule">
    <p class="fine">{{ tallyText(c) }}：{{ c.real }} 张真实录音，{{ c.archival }} 段史料，{{ c.concept }} 张示意（页面合成的声音，不算人数）。<RouterLink to="/about">数据从哪来</RouterLink></p>
  </Paper>
</template>

<style scoped>
</style>
