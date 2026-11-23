<script setup>
// 时间：声音在一天里怎么分布，在校园里怎么分布。只是数现有的声音，不做推断，并且标出 n。
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { hour, setHour } from '../lib/clock.js';
import { allSounds, counts } from '../lib/store.js';
import { BLOCKS } from '../data/campus.js';
import { fmt } from '../lib/time.js';
import { ARCHIVE } from '../data/archive.js';
import PlayButton from '../components/PlayButton.vue';
import Wave from '../components/Wave.vue';

const hours = computed(() => {
  const buckets = Array.from({ length: 24 }, () => 0);
  allSounds.value.forEach((s) => {
    buckets[Math.floor(s.hour) % 24] += 1;
  });
  const max = Math.max(1, ...buckets);
  return buckets.map((n, h) => ({ h, n, pct: (n / max) * 100, on: Math.floor(hour.value) === h }));
});

const byBlock = computed(() =>
  BLOCKS.map((b) => ({ ...b, items: allSounds.value.filter((s) => s.block === b.id) })).filter((b) => b.items.length),
);
</script>

<template>
  <h1 class="page-title">时间</h1>
  <p class="lead muted intro">
    这里数的是已经留下的 <span class="num">{{ counts.total }}</span> 段声音，其中 <span class="num">{{ counts.real }}</span> 段是真实录音。数据还少，看趋势要等声音多起来。
  </p>

  <section class="block" aria-labelledby="day-h">
    <h2 id="day-h" class="section-title">一天里的声音</h2>
    <p class="muted small">点一根柱子，把天色拨到那个钟点。</p>
    <div class="bars" role="group" aria-label="每个钟点的声音数量">
      <button
        v-for="b in hours"
        :key="b.h"
        class="bar"
        :class="{ on: b.on }"
        type="button"
        :aria-label="`${b.h} 点到 ${b.h + 1} 点，${b.n} 段`"
        :aria-pressed="b.on"
        @click="setHour(b.h + 0.5)"
      >
        <span class="fill" :style="{ height: b.n ? Math.max(10, b.pct) + '%' : '2px' }"></span>
      </button>
    </div>
    <div class="scale num" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    <p class="muted small">现在选在 <span class="num">{{ fmt(hour) }}</span>。</p>
  </section>

  <section class="block" aria-labelledby="place-h">
    <h2 id="place-h" class="section-title">校园里的声音</h2>
    <ul class="places">
      <li v-for="b in byBlock" :key="b.id">
        <h3>{{ b.name }}，<span class="num">{{ b.items.length }}</span> 段</h3>
        <p>
          <template v-for="(s, i) in b.items" :key="s.id">
            <RouterLink class="link" :to="{ path: '/map', query: { id: s.id } }">{{ s.title }}</RouterLink><span v-if="i < b.items.length - 1">、</span>
          </template>
        </p>
      </li>
    </ul>
  </section>

  <section class="block" aria-labelledby="arc-h">
    <h2 id="arc-h" class="section-title">校史里的声音</h2>
    <p class="muted">
      这 {{ ARCHIVE.length }} 段是从公开视频里截下的十秒，是史料，不是我们录的，也不计入上面的真实录音。点“出处”可以看原视频。
    </p>
    <ul class="archive">
      <li v-for="a in ARCHIVE" :key="a.id">
        <div class="arc-head">
          <h3>{{ a.title }}</h3>
          <span class="tag">史料</span>
        </div>
        <p class="muted small">{{ a.from }}</p>
        <div class="arc-player">
          <PlayButton :sound="a" />
          <Wave :sound="a" class="arc-wave" />
        </div>
        <p class="arc-copy">{{ a.copy }}</p>
        <p class="small">
          <a class="link" :href="a.url" target="_blank" rel="noopener noreferrer">出处（B 站）</a>
        </p>
      </li>
    </ul>
  </section>

  <section class="block soon" aria-labelledby="sem-h">
    <h2 id="sem-h" class="section-title">按学期对比</h2>
    <p class="muted">同一个地点，这学期和下学期听起来有什么不同。要等到有两个学期的声音才能比。</p>
    <button class="btn ghost" type="button" disabled aria-disabled="true">即将开放</button>
  </section>
</template>

<style scoped>
.intro {
  margin-top: 0.4rem;
}

.block {
  display: grid;
  gap: 0.7rem;
  max-width: 48rem;
  padding-top: 2rem;
}

.bars {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 3px;
  align-items: end;
  height: 9rem;
  padding: 0.5rem;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
}

.bar {
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.fill {
  display: block;
  width: 100%;
  border-radius: 3px 3px 0 0;
  background: var(--line-strong);
}

.bar.on .fill {
  background: var(--accent);
}

.bar:hover .fill {
  background: var(--ink);
}

.scale {
  display: flex;
  justify-content: space-between;
  color: var(--ink-2);
  font-size: var(--t-s);
  line-height: 1.2;
}

.places {
  display: grid;
  gap: 0.9rem;
}

.places h3 {
  font-size: var(--t-0);
}

.soon .btn {
  justify-self: start;
}

.archive {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--line-strong);
}

.archive li {
  display: grid;
  gap: 0.5rem;
  padding: 1.1rem 0 1.2rem;
  border-bottom: 1px solid var(--line-strong);
}

.arc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.arc-head h3 {
  font-size: var(--t-1);
}

.arc-player {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1rem;
}

.arc-wave {
  min-width: 0;
}

.arc-copy {
  max-width: 34em;
}
</style>
