<script setup lang="ts">
import { computed } from 'vue'
import { useTimeStore } from '@/stores/time'
import { useSoundStore } from '@/stores/sound'

const time = useTimeStore()
const store = useSoundStore()
const current = computed(() => store.representative(time.slot))

function toggle() {
  if (time.finished) {
    time.startDay()
    return
  }
  if (time.playing) {
    time.pauseDay()
  } else {
    time.resumeDay()
  }
}

function replay() {
  time.startDay()
}
</script>

<template>
  <div class="immersive" role="dialog" aria-modal="true" aria-label="播放一天">
    <div class="immersive__wash" aria-hidden="true" />

    <header class="immersive__top">
      <span class="eyebrow">PLAY A DAY · 播放一天</span>
      <button type="button" @click="time.stopDay()">退出</button>
    </header>

    <main class="immersive__main">
      <p class="clock">{{ time.label }}</p>
      <p class="slot">
        {{ time.theme.name }}
        <em>{{ time.theme.range }}</em>
      </p>

      <h2>{{ current?.title ?? '校园的声音' }}</h2>
      <p class="place">{{ current?.place ?? '北京航空航天大学 · 学院路校区' }}</p>

      <div class="bar" aria-hidden="true">
        <i :style="{ width: `${Math.round(time.progress * 100)}%` }" />
      </div>

      <div class="controls">
        <button type="button" class="primary" @click="toggle">
          <svg v-if="time.playing" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6.5h3.2v11H8zM12.8 6.5H16v11h-3.2z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
          </svg>
          {{ time.finished ? '再听一天' : time.playing ? '暂停' : '继续' }}
        </button>
        <button type="button" class="ghost" @click="replay">从头播放</button>
      </div>

      <p v-if="time.finished" class="finished">这一天听完了。05:30，校园重新亮起来。</p>
    </main>

    <footer class="immersive__foot">
      <span>05:30 → 次日 05:30</span>
      <span>90 秒 · 演示合成音</span>
    </footer>
  </div>
</template>

<style scoped>
.immersive {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  padding: clamp(18px, 4vw, 40px);
  color: #f3efe4;
  background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--sky-bottom) 24%, transparent), transparent 55%),
    linear-gradient(180deg, rgba(6, 12, 20, 0.72) 0%, rgba(6, 12, 20, 0.84) 46%, rgba(6, 12, 20, 0.94) 100%);
  backdrop-filter: blur(2px) saturate(0.9);
  animation: fade 0.45s ease;
}

.immersive__wash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(90% 60% at 50% 110%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%);
  opacity: 0.8;
}

.immersive__top,
.immersive__foot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.eyebrow {
  font-size: 10px;
  letter-spacing: 0.3em;
  color: color-mix(in srgb, #f3efe4 62%, transparent);
}

.immersive__top button {
  border: 1px solid rgba(243, 239, 228, 0.22);
  border-radius: 999px;
  background: transparent;
  color: #f3efe4;
  padding: 7px 14px;
  font-size: 11px;
  letter-spacing: 0.14em;
  cursor: pointer;
}

.immersive__main {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  max-width: 860px;
  width: 100%;
  margin: 0 auto;
}

.clock {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(76px, 14vw, 168px);
  line-height: 0.9;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: #fbf7ec;
  text-shadow: 0 20px 80px color-mix(in srgb, var(--accent) 35%, transparent);
}

.slot {
  margin: 18px 0 0;
  font-size: 14px;
  letter-spacing: 0.42em;
  color: var(--accent);
}

.slot em {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: color-mix(in srgb, #f3efe4 50%, transparent);
  margin-left: 12px;
}

h2 {
  margin: 42px 0 0;
  font-family: var(--font-serif);
  font-size: clamp(22px, 3.4vw, 34px);
  font-weight: 500;
  letter-spacing: 0.12em;
  color: #f6f1e5;
}

.place {
  margin: 8px 0 0;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, #f3efe4 55%, transparent);
}

.bar {
  width: min(560px, 100%);
  height: 2px;
  margin-top: 34px;
  background: rgba(243, 239, 228, 0.16);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.1s linear;
}

.controls {
  display: flex;
  gap: 10px;
  margin-top: 26px;
}

.controls button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 12px;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: 0.2s ease;
}

.controls svg {
  width: 16px;
  height: 16px;
}

.primary {
  border: none;
  background: #f3efe4;
  color: #101a24;
}

.primary:hover {
  background: var(--accent);
}

.ghost {
  border: 1px solid rgba(243, 239, 228, 0.24);
  background: transparent;
  color: #f3efe4;
}

.ghost:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.finished {
  margin: 24px 0 0;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, #f3efe4 70%, transparent);
}

.immersive__foot {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: color-mix(in srgb, #f3efe4 42%, transparent);
}

@keyframes fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 720px) {
  .clock {
    font-size: clamp(64px, 22vw, 100px);
  }

  h2 {
    margin-top: 30px;
  }

  .immersive__foot {
    display: none;
  }
}
</style>
