<script setup lang="ts">
import { useTimeStore } from '@/stores/time'
import { engine } from '@/audio/engine'

const time = useTimeStore()

const ticks = [
  { start: 330, label: '05:30' },
  { start: 420, label: '07:00' },
  { start: 660, label: '11:00' },
  { start: 840, label: '14:00' },
  { start: 1020, label: '17:00' },
  { start: 1140, label: '19:00' },
].map((t) => ({ ...t, pct: (t.start / 1440) * 100 }))

function onInput(event: Event) {
  engine.unlock()
  time.jumpTo(Number((event.target as HTMLInputElement).value))
}

function onChange() {
  time.previewSlot()
}

function startDay() {
  time.startDay()
}
</script>

<template>
  <section class="dock" aria-label="一天的时间轴">
    <button class="playday" type="button" @click="startDay">
      <span class="playday__icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
        </svg>
      </span>
      <span class="playday__text">
        <strong>播放一天</strong>
        <em>90 秒</em>
      </span>
    </button>

    <div class="timeline">
      <div class="readout">
        <strong>{{ time.label }}</strong>
        <span class="slot">{{ time.theme.name }}</span>
        <span class="range">{{ time.theme.range }}</span>
      </div>

      <div class="track">
        <input
          class="slider"
          type="range"
          min="0"
          max="1439"
          step="1"
          :value="time.minute"
          aria-label="拖动选择一天中的时间"
          @input="onInput"
          @change="onChange"
        />
        <div class="ticks" aria-hidden="true">
          <span v-for="t in ticks" :key="t.start" :style="{ left: `${t.pct}%` }">
            <i />
            <em>{{ t.label }}</em>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dock {
  position: absolute;
  left: 50%;
  bottom: max(22px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 22;
  width: min(820px, calc(100% - 44px));
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 18px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--glass);
  backdrop-filter: blur(20px) saturate(1.25);
  box-shadow: 0 24px 60px -34px rgba(10, 18, 20, 0.55);
}

.playday {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 10px 10px;
  border: none;
  border-radius: 999px;
  background: var(--ink);
  color: #f6f2e8;
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease;
}

.playday:hover {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--ink) 88%, var(--accent));
}

.playday__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent);
  color: #17211f;
}

.playday__icon svg {
  width: 17px;
  height: 17px;
}

.playday__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
}

.playday__text strong {
  font-size: 13px;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.playday__text em {
  font-style: normal;
  font-size: 10px;
  opacity: 0.62;
  letter-spacing: 0.12em;
  margin-top: 2px;
}

.timeline {
  flex: 1;
  min-width: 0;
}

.readout {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 2px;
}

.readout strong {
  font-family: var(--font-serif);
  font-size: 26px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: var(--ink);
  line-height: 1;
}

.readout .slot {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--accent);
}

.readout .range {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  margin-left: auto;
}

.track {
  position: relative;
  padding-bottom: 18px;
}

.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  margin: 0;
  border-radius: 999px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    90deg,
    #0f1b2d 0%,
    #14263c 18%,
    #2e3a59 22%,
    #e8a87c 24%,
    #cfe0e8 30%,
    #f5f1e8 38%,
    #fff8e7 47%,
    #f3e2c7 58%,
    #f08a5d 70%,
    #6b4c7a 74%,
    #3e6b8f 79%,
    #0f1b2d 86%,
    #0f1b2d 100%
  );
  box-shadow: inset 0 0 0 1px rgba(20, 35, 40, 0.18);
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fbf8f0;
  border: 2px solid var(--accent);
  box-shadow: 0 2px 10px rgba(12, 22, 26, 0.28);
  transition: transform 0.15s ease;
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.08);
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fbf8f0;
  border: 2px solid var(--accent);
}

.ticks {
  position: absolute;
  left: 0;
  right: 0;
  top: 14px;
  height: 16px;
  pointer-events: none;
}

.ticks span {
  position: absolute;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.ticks i {
  width: 1px;
  height: 4px;
  background: color-mix(in srgb, var(--ink) 22%, transparent);
}

.ticks em {
  font-style: normal;
  font-size: 9px;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--ink) 72%, transparent);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .dock {
    bottom: max(12px, env(safe-area-inset-bottom));
    width: calc(100% - 24px);
    gap: 12px;
    padding: 12px;
    border-radius: 18px;
  }

  .playday {
    padding: 8px;
    border-radius: 50%;
  }

  .playday__text {
    display: none;
  }

  .readout strong {
    font-size: 21px;
  }

  .readout .range {
    display: none;
  }

  .ticks em {
    display: none;
  }

  .track {
    padding-bottom: 8px;
  }

  .ticks {
    display: none;
  }
}
</style>
