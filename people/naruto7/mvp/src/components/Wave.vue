<script setup>
// 声音的轮廓。播放时，已经播过的部分染成强调色；marks 是回声被钉住的位置（0 到 1），画在轮廓上方。
// 只是装饰，播放和停止靠旁边的按钮。
import { ref, watch, computed } from 'vue';
import { getPeaks, player } from '../lib/audio.js';

const props = defineProps({
  sound: { type: Object, required: true },
  marks: { type: Array, default: () => [] },
});
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
    const h = p ? 3 + p[i] * 28 : 4;
    return { x: i * 4 + 0.6, y: 28 - h / 2, h, on: (i + 0.5) / N <= ratio.value };
  });
});

const pins = computed(() => props.marks.map((m) => ({ x: Math.min(188.6, Math.max(0.6, m * 192 - 1.3)), on: m <= ratio.value })));
</script>

<template>
  <svg class="wave" viewBox="0 0 192 46" preserveAspectRatio="none" aria-hidden="true">
    <rect v-for="(b, i) in bars" :key="i" :x="b.x" :y="b.y" width="2.6" :height="b.h" rx="1.2" :class="{ on: b.on }" />
    <rect v-for="(m, i) in pins" :key="'m' + i" class="pin" :class="{ on: m.on }" :x="m.x" y="1" width="2.6" height="7" rx="1.3" />
  </svg>
</template>

<style scoped>
.wave {
  display: block;
  width: 100%;
  height: 46px;
}

rect {
  fill: var(--line-strong);
}

rect.on {
  fill: var(--accent);
}

rect.pin {
  fill: var(--ink);
}

rect.pin.on {
  fill: var(--accent);
}
</style>
