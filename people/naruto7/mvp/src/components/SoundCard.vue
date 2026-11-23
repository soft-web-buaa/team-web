<script setup>
// 一段声音的卡片：播放在上，故事在下。图片以后放在最底下，缺图时页面照常。
import { computed } from 'vue';
import Wave from './Wave.vue';
import PlayButton from './PlayButton.vue';
import CardSocial from './CardSocial.vue';
import { echoesOf } from '../lib/store.js';
import { fmt } from '../lib/time.js';
import { blockById } from '../data/campus.js';

const props = defineProps({
  sound: { type: Object, required: true },
  plain: { type: Boolean, default: false },
  social: { type: String, default: 'summary' }, // none | summary | full
});
const marks = computed(() => {
  const d = props.sound.duration || 10;
  return props.social === 'full' ? echoesOf(props.sound.id).map((e) => e.t / d) : [];
});
const where = computed(() => {
  const b = blockById(props.sound.block);
  return props.sound.place && b && props.sound.place !== b.name ? `${props.sound.place}，${b.name}` : props.sound.place || (b && b.name) || '';
});
</script>

<template>
  <article class="card" :class="{ plain }">
    <header>
      <h3>{{ sound.title }}</h3>
      <span class="tag" :class="sound.demo ? 'demo' : 'real'">{{ sound.demo ? '示例' : '真实录音' }}</span>
    </header>
    <p class="meta muted small">
      <span>{{ where }}</span>
      <span>通常在 <span class="num">{{ fmt(sound.hour) }}</span></span>
      <span>心情：{{ sound.mood }}</span>
    </p>
    <div class="player">
      <PlayButton :sound="sound" />
      <Wave :sound="sound" :marks="marks" class="w" />
    </div>
    <p v-if="sound.story" class="story">{{ sound.story }}</p>
    <CardSocial v-if="social !== 'none'" :sound="sound" :mode="social" />
  </article>
</template>

<style scoped>
.card {
  display: grid;
  gap: 0.7rem;
  padding: 1.1rem 1.2rem 1.2rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-panel);
  background: var(--panel);
}

.card.plain {
  padding: 0;
  border: 0;
  background: transparent;
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

h3 {
  font-size: var(--t-1);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 1.2rem;
}

.player {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 1rem;
}

.w {
  min-width: 0;
}

.story {
  max-width: 34em;
}
</style>
