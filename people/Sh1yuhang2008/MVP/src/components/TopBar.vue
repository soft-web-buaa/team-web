<script setup lang="ts">
import { engine } from '@/audio/engine'
import { useSoundStore } from '@/stores/sound'
import { useUiStore } from '@/stores/ui'
import type { CategoryId } from '@/types'

const store = useSoundStore()
const ui = useUiStore()

function select(id: CategoryId | 'all') {
  store.category = id
}

function toggleMute() {
  engine.unlock()
  engine.setMuted(!engine.muted.value)
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <svg class="brand__mark" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r="15.5" fill="none" stroke="currentColor" stroke-width="1" />
        <path
          d="M6 17h3l2.4-6 3.6 13 3.2-10 2.4 5H28"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div class="brand__text">
        <strong>听见校园</strong>
        <em>北航 · 学院路校区</em>
      </div>
    </div>

    <nav class="chips" aria-label="按类别筛选声音">
      <button
        class="chip"
        :class="{ 'is-active': store.category === 'all' }"
        type="button"
        @click="select('all')"
      >
        全部
      </button>
      <button
        v-for="c in store.categories"
        :key="c.id"
        class="chip"
        :class="{ 'is-active': store.category === c.id }"
        :style="{ '--c': c.color }"
        type="button"
        @click="select(c.id)"
      >
        <span class="chip__dot" />
        {{ c.name }}
      </button>
    </nav>

    <div class="actions">
      <span class="count">{{ store.filtered.length }} 段声音</span>
      <button
        class="icon-btn"
        type="button"
        :aria-label="engine.muted.value ? '打开声音' : '静音'"
        :title="engine.muted.value ? '打开声音' : '静音'"
        @click="toggleMute"
      >
        <svg v-if="!engine.muted.value" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          <path
            d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          <path
            d="M17 9l5 6M22 9l-5 6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <button class="icon-btn" type="button" aria-label="关于本项目" title="关于" @click="ui.aboutOpen = true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path
            d="M12 10.5v6M12 7.4v.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: max(18px, env(safe-area-inset-top));
  left: 22px;
  right: 22px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--glass);
  backdrop-filter: blur(18px) saturate(1.2);
  box-shadow: 0 18px 40px -28px rgba(12, 22, 24, 0.45);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.brand__mark {
  width: 34px;
  height: 34px;
  color: var(--accent);
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand__text strong {
  font-family: var(--font-serif);
  font-size: 19px;
  letter-spacing: 0.14em;
  color: var(--ink);
  font-weight: 600;
}

.brand__text em {
  font-style: normal;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--ink-soft);
  margin-top: 3px;
}

.chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  mask-image: linear-gradient(90deg, #000 0%, #000 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 88%, transparent 100%);
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 12.5px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: 0.25s ease;
}

.chip:hover {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 6%, transparent);
}

.chip.is-active {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--ink) 16%, transparent);
  background: color-mix(in srgb, var(--ink) 7%, transparent);
}

.chip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c, var(--ink-soft));
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.count {
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  padding-right: 4px;
}

.icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: color-mix(in srgb, #fff 55%, transparent);
  color: var(--ink);
  cursor: pointer;
  transition: 0.2s ease;
}

.icon-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  color: var(--accent);
}

.icon-btn svg {
  width: 18px;
  height: 18px;
}

@media (max-width: 860px) {
  .topbar {
    left: 12px;
    right: 12px;
    gap: 10px;
    padding: 10px 12px;
  }

  .brand__text em,
  .count {
    display: none;
  }

  .brand__text strong {
    font-size: 16px;
    letter-spacing: 0.1em;
  }

  .brand__mark {
    width: 28px;
    height: 28px;
  }

  .chip {
    padding: 6px 9px;
    font-size: 12px;
  }
}

@media (max-width: 560px) {
  .topbar {
    flex-wrap: wrap;
    gap: 6px 8px;
    padding: 10px 12px;
  }

  .brand {
    flex: 1;
  }

  .brand__text strong {
    font-size: 15px;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
  }

  .actions {
    gap: 5px;
  }

  .chips {
    order: 3;
    flex-basis: 100%;
    overflow: visible;
    gap: 4px;
    mask-image: none;
    -webkit-mask-image: none;
  }

  .chip {
    padding: 5px 8px;
    font-size: 11.5px;
  }
}
</style>
