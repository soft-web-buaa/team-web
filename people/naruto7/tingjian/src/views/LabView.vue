<script setup>
// 样张：同一份数据，几种画法并排，给组长挑。不进导航，网址 #/lab 打开。
// 数据：馆藏里公开的盘（现在是 231 张示意），加三种加压：翻 4 倍、全挤到晚上、只有 10 张。
import { computed, ref } from 'vue';
import RingDial from '../components/RingDial.vue';
import RingWood from '../components/RingWood.vue';
import RingAlt from '../components/RingAlt.vue';
import GalaxyCanvas from '../components/GalaxyCanvas.vue';
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
        <h1 class="h1">同一份数据，七种画法</h1>
      </div>
      <div class="row" role="radiogroup" aria-label="数据">
        <button v-for="s in SETS" :key="s.id" type="button" role="radio" class="chip" :class="{ on: set === s.id }" :aria-checked="set === s.id" @click="set = s.id">{{ s.name }}</button>
        <RouterLink to="/" class="chip">回到唱机</RouterLink>
      </div>
    </header>
    <p class="fine">{{ list.length }} 张。加压的几组是把现有的示意盘复制、挪了钟点，只用来看排法撑不撑得住，不是数据。</p>
    <div class="facts">
      <p class="h3" style="margin-top: 14px">现在各处用的是哪种（2026-11-26）</p>
      <ul class="fine">
        <li>年轮板块「一学年」：G 星系，左边整块星空或唱片变星系两种放法、按钟点或自转两种转法，都在年轮板块里切。</li>
        <li>地点页（每处 9 到 19 张）、我的：A 点，数据少，点都够用。</li>
        <li>B 到 F 留在这里对比。</li>
      </ul>
      <p class="fine">数据地图的五种画法（星云、夜景、曲面、注满、光柱）和旧的四种在 <RouterLink to="/community?map=data">社区 · 数据地图</RouterLink> 里切。</p>
    </div>
    <div class="grid">
      <article class="wide">
        <h2 class="h3">G · 星系（2026-11-26 的新画法，年轮板块「一学年」里用的就是它）</h2>
        <div class="gx2"><GalaxyCanvas :list="list" mode="clock" :hour="12" :playing-id="L.playing && L.playing.id" @pick="play" /><GalaxyCanvas :list="list" mode="free" :hour="12" :playing-id="L.playing && L.playing.id" @pick="play" /></div>
        <p class="fine">左：按钟点（角度是录下的钟点）。右：自转（不看钟点，内快外慢）。一条轨道一个学年，一颗星一张。挤的地方只留最重要的一两颗做星，其余化成星尘，所以切到「翻 4 倍」「全挤在晚上」时画面不会糊成一团；滚轮拉近，星尘分成星。</p>
      </article>
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
      <article>
        <h2 class="h3">D · 格子</h2>
        <RingAlt :list="list" :size="360" mode="cells" :playing-id="L.playing && L.playing.id" @pick="play" />
        <p class="fine">一圈一个学年、一格一小时，越深声音越多。多少张都不会叠，每一格都能点（放这一格里最新的一张）。像气象站的风玫瑰，最好读，也最不像树。</p>
      </article>
      <article>
        <h2 class="h3">E · 刻纹</h2>
        <RingAlt :list="list" :size="360" mode="groove" :playing-id="L.playing && L.playing.id" @pick="play" />
        <p class="fine">一圈一个学年，每圈是一道沟，哪个钟点声音多沟就往外鼓。各圈用同一把尺，看得出哪一年多。每张是沟上一根短刺，可以点。和唱机的刻纹是一个意象。</p>
      </article>
      <article>
        <h2 class="h3">F · 不分圈</h2>
        <RingAlt :list="list" :size="360" mode="spiral" :playing-id="L.playing && L.playing.id" @pick="play" />
        <p class="fine">半径就是日期，最里最早，一张一颗点；学年只是虚线。不会因为分圈而挤，但声音多了点还是会叠。</p>
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
.wide { grid-column: 1 / -1; }
.gx2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 1100px; }
.facts ul { margin: 0 0 6px; padding-left: 18px; max-width: 880px; }
.facts li { margin: 2px 0; }
</style>
