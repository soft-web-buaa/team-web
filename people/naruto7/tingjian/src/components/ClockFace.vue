<script setup>
// 右上角的钟：全站颜色来自这里。在看别的钟点时写明在看什么，并给一颗「回到此刻」。
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { clock, fmtHour, backToNow } from '../lib/clock.js';
import { hourColor } from '../lib/wave.js';

const router = useRouter();
const notNow = computed(() => clock.source !== 'now' && Math.abs(clock.target - clock.now) > 0.02);
const a = computed(() => (clock.shown / 24) * Math.PI * 2);
const segs = Array.from({ length: 48 }, (_, i) => {
  const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2, r = 13;
  return { d: `M${15 + Math.sin(a0) * r},${15 - Math.cos(a0) * r}A${r},${r} 0 0 1 ${15 + Math.sin(a1) * r},${15 - Math.cos(a1) * r}`, c: hourColor(i / 2) };
});
</script>

<template>
  <div class="clock">
    <button v-if="notNow" type="button" class="back" @click="backToNow()">回到此刻</button>
    <button type="button" class="face" :aria-label="`现在显示的是 ${fmtHour(clock.shown)} 的天色。去年轮看一天`" @click="router.push('/time')">
      <svg class="dial" viewBox="0 0 30 30" aria-hidden="true">
        <path v-for="(s, i) in segs" :key="i" :d="s.d" :stroke="s.c" stroke-width="3.2" fill="none" />
        <line x1="15" y1="15" :x2="15 + Math.sin(a) * 10" :y2="15 - Math.cos(a) * 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        <circle cx="15" cy="15" r="2" fill="#E6BE3A" />
      </svg>
      <span class="t">{{ fmtHour(clock.shown) }}</span>
      <span class="w">{{ notNow ? `在看 · ${clock.label || clock.tokens.name}` : `此刻 · ${clock.tokens.name}` }}</span>
    </button>
  </div>
</template>
