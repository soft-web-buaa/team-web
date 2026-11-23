<script setup>
import { computed } from 'vue';
import { toggle, player } from '../lib/audio.js';
import { say } from '../lib/toast.js';

const props = defineProps({ sound: { type: Object, required: true } });
const playing = computed(() => player.id === props.sound.id);

async function go() {
  await toggle(props.sound);
  if (player.error) say(player.error, 'warn');
}
</script>

<template>
  <button
    class="play"
    :class="{ on: playing }"
    type="button"
    :aria-pressed="playing"
    :aria-label="(playing ? '停止播放：' : '播放：') + sound.title"
    @click="go"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path v-if="!playing" d="M8 5.5v13l11-6.5z" />
      <rect v-else x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
    <span>{{ playing ? '停止' : '播放' }}</span>
  </button>
</template>

<style scoped>
.play {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 48px;
  padding: 0 1.3rem 0 1rem;
  border: 2px solid var(--accent);
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  font: inherit;
  cursor: pointer;
}

.play svg {
  width: 22px;
  height: 22px;
  fill: currentColor;
}

.play.on {
  background: transparent;
  color: var(--accent);
}

.play:active {
  transform: translateY(1px);
}
</style>
