<script setup>
// 一张盘的小图：黑漆盘面三道刻纹，中间的纸签是它录下那个钟点的天色（和整站同一套颜色）。
// 史料的纸签是黑的、写「史」；我的盘纸签外有一圈示波黄；封存的盘画一道封条。
import { computed } from 'vue';
import { hourColor } from '../lib/wave.js';

const p = defineProps({ e: Object, size: { type: Number, default: 44 } });
const label = computed(() => (p.e.tier === 'archival' ? '#111' : hourColor(p.e.hour)));
</script>

<template>
  <svg class="disc-mini" :width="size" :height="size" viewBox="-22 -22 44 44" aria-hidden="true">
    <circle r="21" fill="#0E0F12" />
    <circle r="18" fill="none" stroke="#2C2F36" stroke-width=".7" />
    <circle r="15.5" fill="none" stroke="#2C2F36" stroke-width=".7" />
    <circle r="13" fill="none" stroke="#2C2F36" stroke-width=".7" />
    <path d="M-17,-9 A19,19 0 0 1 -6,-18" stroke="rgb(255 255 255 / .22)" stroke-width="1.4" fill="none" stroke-linecap="round" />
    <circle r="9" :fill="label" />
    <circle v-if="e.mine" r="10.4" fill="none" stroke="#E6BE3A" stroke-width="1.6" />
    <text v-if="e.tier === 'archival'" y="3.6" text-anchor="middle" font-size="9.5" fill="#E9E4D8" font-family="Zhuque, serif">史</text>
    <circle v-else r="1.4" fill="#0E0F12" />
    <rect v-if="e.locked || e.visibility === 'private'" x="-21" y="-2.2" width="42" height="4.4" :fill="e.locked ? '#E6BE3A' : '#7A828E'" opacity=".92" />
  </svg>
</template>
