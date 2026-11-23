<script setup>
// 声音的轮廓。播放时，已经播过的部分染成强调色。只是装饰，播放和停止靠旁边的按钮。
import { ref, watch, computed } from 'vue';
import { getPeaks, player } from '../lib/audio.js';

const props = defineProps({ sound: { type: Object, required: true } });
const N = 48;

const peaks = ref(null);

watch(
  () => props.sound.id,
  async () => {
    peaks.value = null;
    try {
      peaks.value = await getPeaks(props.sound, N);
    } catch {
      peaks.value = new Float32Array(N).fill(0.3);
    }
  },
  { immediate: true },
);

const ratio = computed(() =>
  player.id === props.sound.id && player.dur ? Math.min(1, player.t / player.dur) : 0,
);

const bars = computed(() => {
  const p = peaks.value;
  return Array.from({ length: N }, (_, i) => {
    const h = p ? 3 + p[i] * 34 : 4;
    return { x: i * 4 + 0.6, y: 20 - h / 2, h, on: (i + 0.5) / N <= ratio.value };
  });
});
</script>

<template>
  <svg class="wave" viewBox="0 0 192 40" preserveAspectRatio="none" aria-hidden="true">
    <rect v-for="(b, i) in bars" :key="i" :x="b.x" :y="b.y" width="2.6" :height="b.h" rx="1.2" :class="{ on: b.on }" />
  </svg>
</template>

<style scoped>
.wave {
  display: block;
  width: 100%;
  height: 40px;
}

rect {
  fill: var(--line-strong);
}

rect.on {
  fill: var(--accent);
}
</style>
