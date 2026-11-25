<script setup>
// 合辑的封面：一张黑漆盘，每一段是一道刻纹（从外往里按放进来的先后），纹的颜色是那一段录下那个钟点的天色。
// 共建的意思一眼看得到：几个人的声音刻在同一张盘上。我放的那几道描一圈示波黄；正在放的那一道亮起来。
import { computed } from 'vue';
import { hourColor } from '../lib/wave.js';

const p = defineProps({ items: Array, size: { type: Number, default: 64 }, playingId: { type: String, default: null }, name: { type: String, default: '' } });
const R0 = 9.5, R1 = 20.5;
const bands = computed(() => {
  const L = (p.items || []).slice(0, 24);
  const n = Math.max(1, L.length), w = (R1 - R0) / n;
  return L.map((x, i) => ({ id: x.id, r: R1 - w * (i + 0.5), w: Math.max(0.5, w - 0.35), c: x.e.tier === 'archival' ? '#3A3D44' : hourColor(x.e.hour), mine: !!(x.t && x.t.mine) || !!x.e.mine, on: x.e.id === p.playingId }));
});
</script>

<template>
  <svg class="album-disc" :width="size" :height="size" viewBox="-22 -22 44 44" role="img" :aria-label="`${name}：${(items || []).length} 段刻在一张盘上`">
    <circle r="21.4" fill="#0E0F12" />
    <circle v-for="b in bands" :key="b.id" :r="b.r" fill="none" :stroke="b.c" :stroke-width="b.w" :stroke-opacity="b.on ? 1 : 0.78" />
    <circle v-for="b in bands.filter((x) => x.mine)" :key="`m${b.id}`" :r="b.r" fill="none" stroke="#E6BE3A" stroke-width=".45" />
    <path d="M-17,-9 A19,19 0 0 1 -6,-18" stroke="rgb(255 255 255 / .2)" stroke-width="1.4" fill="none" stroke-linecap="round" />
    <circle r="8.6" fill="#E9E4D8" />
    <text y="2.6" text-anchor="middle" font-size="6.4" fill="#2A2C31" font-family="Zhuque, serif">{{ (items || []).length }}</text>
    <circle r="1" cy="-5" fill="#2A2C31" />
  </svg>
</template>

<style scoped>
.album-disc { display: block; flex: none; }
</style>
