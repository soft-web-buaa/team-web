<script setup>
// 一天轨道：整站最核心的控件。拖动它，天色、地图上亮着的点、首页的声音都跟着变。
// 底下是一个原生的 range 输入，键盘左右键、读屏都能用。
import { computed } from 'vue';
import { hour, live, setHour, goLive, period } from '../lib/clock.js';
import { fmt, spoken, isLit } from '../lib/time.js';
import { trackGradient } from '../lib/sky.js';
import { allSounds } from '../lib/store.js';

defineProps({ compact: { type: Boolean, default: false } });

const gradient = trackGradient();

const ticks = computed(() =>
  allSounds.value.map((s) => ({
    id: s.id,
    left: (s.hour / 24) * 100,
    lit: isLit(s, hour.value),
  })),
);

function onInput(e) {
  setHour(parseFloat(e.target.value));
}
</script>

<template>
  <div class="track" :class="{ compact }">
    <div class="head">
      <span class="num clock">{{ fmt(hour) }}</span>
      <span class="period">{{ period.name }}</span>
      <button v-if="!live" class="link back" type="button" @click="goLive">回到此刻</button>
      <span v-else class="muted small">正在跟着此刻走</span>
    </div>
    <div class="rail" :style="{ background: gradient }">
      <span
        v-for="t in ticks"
        :key="t.id"
        class="tick"
        :class="{ lit: t.lit }"
        :style="{ left: t.left + '%' }"
        aria-hidden="true"
      ></span>
      <input
        type="range"
        min="0"
        max="24"
        step="0.05"
        :value="hour"
        :aria-label="'拖动选择一天中的时刻，现在是' + spoken(hour)"
        :aria-valuetext="spoken(hour) + '，' + period.name"
        @input="onInput"
      />
    </div>
    <div class="scale num" aria-hidden="true">
      <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
    </div>
    <p class="legend muted small">轨道上的竖线是各段声音通常出现的钟点，亮色的是此刻前后一个多小时内的。</p>
  </div>
</template>

<style scoped>
.track {
  display: grid;
  gap: 0.35rem;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.9rem;
}

.clock {
  font-size: var(--t-3);
  line-height: 1;
}

.period {
  font-size: var(--t-1);
}

.back {
  margin-left: auto;
}

.rail {
  position: relative;
  height: 3.1rem;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
}

.tick {
  position: absolute;
  bottom: 6px;
  width: 4px;
  height: 36%;
  margin-left: -2px;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.55);
  pointer-events: none;
}

.tick.lit {
  height: 62%;
  width: 6px;
  margin-left: -3px;
  background: var(--accent);
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgb(0 0 0 / 0.55);
}

input[type='range'] {
  position: absolute;
  inset: -6px 0;
  width: 100%;
  height: calc(100% + 12px);
  margin: 0;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  cursor: ew-resize;
  touch-action: pan-y;
}

input[type='range']::-webkit-slider-runnable-track {
  height: 100%;
  background: transparent;
}

input[type='range']::-moz-range-track {
  height: 100%;
  background: transparent;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 100%;
  border: 3px solid #fff;
  border-radius: 7px;
  background: var(--ink);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6);
}

input[type='range']::-moz-range-thumb {
  width: 8px;
  height: 100%;
  border: 3px solid #fff;
  border-radius: 7px;
  background: var(--ink);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.6);
}

input[type='range']:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
  border-radius: 14px;
}

.scale {
  display: flex;
  justify-content: space-between;
  color: var(--ink-2);
  font-size: var(--t-s);
  line-height: 1.2;
}

.compact .legend {
  display: none;
}
</style>
