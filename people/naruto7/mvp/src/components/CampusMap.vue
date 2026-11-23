<script setup>
// 校园示意图：分区加声音点。此刻亮着的点会慢慢泛一圈涟漪，其余的是空心点。
// 点既能用鼠标点，也能用键盘 Tab 到再按回车或空格。
import { computed } from 'vue';
import { BLOCKS, VIEWBOX, absPos, CAMPUS_NAME } from '../data/campus.js';
import { isLit, spoken } from '../lib/time.js';

const props = defineProps({
  sounds: { type: Array, required: true },
  hour: { type: Number, required: true },
  selectedId: { type: String, default: null },
  matchIds: { type: Object, default: null }, // Set；null 表示都匹配
});
const emit = defineEmits(['select']);

const dots = computed(() =>
  props.sounds
    .map((s) => ({
      id: s.id,
      title: s.title,
      pos: absPos(s),
      lit: isLit(s, props.hour),
      match: !props.matchIds || props.matchIds.has(s.id),
      label: `${s.title}，${s.place}，通常在${spoken(s.hour)}${isLit(s, props.hour) ? '，此刻能听到' : ''}`,
    }))
    .filter((d) => d.pos),
);
</script>

<template>
  <svg class="map" :viewBox="VIEWBOX" role="group" :aria-label="CAMPUS_NAME + '，共 ' + dots.length + ' 个声音点'">
    <g class="blocks">
      <g v-for="b in BLOCKS" :key="b.id">
        <rect :x="b.x * 1000" :y="b.y * 760" :width="b.w * 1000" :height="b.h * 760" rx="16" />
        <text :x="b.x * 1000 + 14" :y="b.y * 760 + 34">{{ b.name }}</text>
      </g>
    </g>
    <g
      v-for="d in dots"
      :key="d.id"
      class="dot"
      :class="{ lit: d.lit, sel: d.id === selectedId, off: !d.match }"
      :transform="`translate(${d.pos.x} ${d.pos.y})`"
      role="button"
      tabindex="0"
      :aria-label="d.label"
      :aria-pressed="d.id === selectedId"
      @click="emit('select', d.id)"
      @keydown.enter.prevent="emit('select', d.id)"
      @keydown.space.prevent="emit('select', d.id)"
    >
      <circle v-if="d.lit" class="ring" r="11" />
      <circle class="sel-ring" r="20" />
      <circle class="focus-ring" r="25" />
      <circle class="core" r="10" />
      <circle class="hit" r="28" />
    </g>
  </svg>
</template>

<style scoped>
.map {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-panel);
  background: var(--bg);
}

.blocks rect {
  fill: var(--panel);
  stroke: var(--line-strong);
  stroke-width: 1.5;
}

.blocks text {
  fill: var(--ink-2);
  font-size: 27px;
  font-family: var(--font-body);
}

.dot {
  cursor: pointer;
  outline: none;
}

.core {
  fill: var(--bg);
  stroke: var(--ink);
  stroke-width: 3;
}

.lit .core {
  fill: var(--accent);
  stroke: var(--ink);
}

.hit {
  fill: transparent;
}

.sel-ring,
.focus-ring {
  fill: none;
  opacity: 0;
}

.sel-ring {
  stroke: var(--ink);
  stroke-width: 3;
}

.sel .sel-ring {
  opacity: 1;
}

.focus-ring {
  stroke: var(--accent);
  stroke-width: 5;
}

.dot:focus-visible .focus-ring {
  opacity: 1;
}

.off {
  opacity: 0.25;
}

.ring {
  fill: none;
  stroke: var(--accent);
  stroke-width: 3;
  transform-box: fill-box;
  transform-origin: center;
  animation: ping 2.8s ease-out infinite;
}

@keyframes ping {
  from {
    transform: scale(1);
    opacity: 0.8;
  }
  to {
    transform: scale(3.4);
    opacity: 0;
  }
}
</style>
