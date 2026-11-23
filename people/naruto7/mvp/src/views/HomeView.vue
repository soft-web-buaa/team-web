<script setup>
// 首页：一屏讲清这是什么，点一下就出声。
// 整站最醒目的东西是"此刻"：大号时刻、随时刻变化的天色、拖一下就换一段声音。
import { computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import DayTrack from '../components/DayTrack.vue';
import SoundCard from '../components/SoundCard.vue';
import { hour, period, sweepIntro } from '../lib/clock.js';
import { fmt, circDist, isLit } from '../lib/time.js';
import { allSounds, counts } from '../lib/store.js';
import { weekLabel } from '../data/semester.js';

const featured = computed(() => {
  const list = allSounds.value;
  return list.length ? [...list].sort((a, b) => circDist(a.hour, hour.value) - circDist(b.hour, hour.value))[0] : null;
});
const litCount = computed(() => allSounds.value.filter((s) => isLit(s, hour.value)).length);
const week = weekLabel();

onMounted(sweepIntro);
</script>

<template>
  <section class="hero">
    <p class="reading num" aria-hidden="true">{{ fmt(hour) }}</p>
    <h1 class="tagline">把校园里会消失的声音钉在地图上，并留给以后的人听。</h1>
    <p class="muted when">{{ period.name }}，{{ week }}。</p>
  </section>

  <section class="now" aria-labelledby="now-h">
    <h2 id="now-h" class="section-title">这个钟点，校园里能听到的</h2>
    <DayTrack />
    <div v-if="featured" class="card-slot">
      <SoundCard :key="featured.id" :sound="featured" />
    </div>
    <p v-else class="empty">还没有声音。<RouterLink class="link" to="/record">留下第一段</RouterLink></p>
  </section>

  <section class="doors" aria-labelledby="doors-h">
    <h2 id="doors-h" class="section-title">从哪里开始</h2>
    <ul>
      <li>
        <RouterLink to="/map">
          <strong>听</strong>
          <span>地图上此刻亮着 <span class="num">{{ litCount }}</span> 个点，点开就能听。</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/record">
          <strong>留</strong>
          <span>录一段你今天听到的声音，选个地点，写一句话。</span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/topics">
          <strong>应</strong>
          <span>每个话题是一个问题，听完别人的，回应一句。</span>
        </RouterLink>
      </li>
    </ul>
    <p class="muted small count">
      现在共 <span class="num">{{ counts.total }}</span> 段声音：<span class="num">{{ counts.real }}</span> 段真实录音，<span class="num">{{ counts.demo }}</span> 段示例。
    </p>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  gap: 0.6rem;
  padding-block: 1.2rem 0.5rem;
}

.reading {
  font-size: clamp(5.5rem, 24vw, 14rem);
  line-height: 0.82;
  letter-spacing: -0.015em;
  margin-left: -0.04em;
}

.tagline {
  max-width: 17em;
  font-size: var(--t-2);
  line-height: 1.5;
}

.when {
  font-size: var(--t-0);
}

.now {
  display: grid;
  gap: 1rem;
  max-width: 44rem;
  padding-block: 2rem 1rem;
}

.card-slot {
  margin-top: 0.4rem;
}

.doors {
  display: grid;
  gap: 0.6rem;
  max-width: 44rem;
  padding-block: 1.5rem 1rem;
}

.doors ul {
  border-top: 1px solid var(--line-strong);
}

.doors li {
  border-bottom: 1px solid var(--line-strong);
}

.doors a {
  display: grid;
  grid-template-columns: 3rem 1fr;
  align-items: baseline;
  gap: 0.5rem;
  padding: 1rem 0;
  text-decoration: none;
}

.doors strong {
  font-size: var(--t-3);
  font-weight: 400;
  line-height: 1;
}

.doors a:hover span:last-child {
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 0.25em;
}

.count {
  padding-top: 0.4rem;
}

@media (min-width: 900px) {
  .hero {
    padding-block: 2rem 1rem;
  }
}
</style>
