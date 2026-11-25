<script setup>
// 样张：同一份数据，几种画法并排，给组长挑。不进导航，网址 #/lab 打开。
// 数据：馆藏里公开的盘（现在是 231 张示意），加三种加压：翻 4 倍、全挤到晚上、只有 10 张。
import { computed, ref } from 'vue';
import RingDial from '../components/RingDial.vue';
import RingWood from '../components/RingWood.vue';
import { L, isPublic, play } from '../lib/library.js';

const base = computed(() => { void L.version; return L.entries.filter((e) => isPublic(e) && e.tier !== 'archival' && e.hour != null); });
const SETS = [
  { id: 'now', name: '现在的馆藏', make: (b) => b },
  { id: 'x4', name: '翻 4 倍', make: (b) => [0, 1, 2, 3].flatMap((j) => b.map((e) => ({ ...e, id: `${e.id}-${j}`, hour: (e.hour + j * 0.37) % 24 }))) },
  { id: 'night', name: '全挤在晚上（x4）', make: (b) => [0, 1, 2, 3].flatMap((j) => b.map((e) => ({ ...e, id: `${e.id}-n${j}`, hour: (19 + ((e.hour * 7.3 + j) % 4)) % 24 }))) },
  { id: 'few', name: '只有 10 张', make: (b) => b.slice(-10) },
];
const set = ref('now');
const list = computed(() => SETS.find((s) => s.id === set.value).make(base.value));
</script>

<template>
  <section class="lab" aria-label="年轮样张">
    <header>
      <div>
        <p class="kicker">样张 · 年轮的排法 · 给组长挑</p>
        <h1 class="h1">同一份数据，三种画法</h1>
      </div>
      <div class="row" role="radiogroup" aria-label="数据">
        <button v-for="s in SETS" :key="s.id" type="button" role="radio" class="chip" :class="{ on: set === s.id }" :aria-checked="set === s.id" @click="set = s.id">{{ s.name }}</button>
        <RouterLink to="/" class="chip">回到唱机</RouterLink>
      </div>
    </header>
    <p class="fine">{{ list.length }} 张。加压的几组是把现有的示意盘复制、挪了钟点，只用来看排法撑不撑得住，不是数据。</p>
    <div class="grid">
      <article>
        <h2 class="h3">现在的（旧）</h2>
        <RingDial :list="list" :size="360" />
        <p class="fine">一个学期一圈、圈等宽、点一样大。点多了叠成一团。</p>
      </article>
      <article>
        <h2 class="h3">A · 点（堆叠）</h2>
        <RingWood :list="list" :size="360" mode="dots" :playing-id="L.playing && L.playing.id" @pick="play" />
        <p class="fine">一圈一个学年。同一个钟点的点往外堆，每一圈自己就是一天的直方图；圈宽跟着最挤的地方走，放不下就把点缩小。</p>
      </article>
      <article>
        <h2 class="h3">B · 纹（厚度随钟点变）</h2>
        <RingWood :list="list" :size="360" mode="grain" :playing-id="L.playing && L.playing.id" />
        <p class="fine">一圈一个学年，哪个钟点声音多那一段就厚，一圈一圈叠出校园的一天，外轮廓就是整个校园一天的样子。每张是一道细纹；我的是示波黄。不管多少张，圆的大小不变。</p>
      </article>
      <article>
        <h2 class="h3">C · 自动</h2>
        <RingWood :list="list" :size="360" mode="auto" :playing-id="L.playing && L.playing.id" @pick="play" />
        <p class="fine">点放得下（不小于 2.4 像素）就用 A，放不下就长成 B。我推荐这个。</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.lab { position: fixed; inset: 0; z-index: 25; overflow-y: auto; background: var(--paper); color: var(--ink); padding: 32px 40px 80px; }
header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 28px; margin-top: 18px; }
article { border-top: 1px solid var(--hair); padding-top: 4px; }
.chip { text-decoration: none; }
</style>
