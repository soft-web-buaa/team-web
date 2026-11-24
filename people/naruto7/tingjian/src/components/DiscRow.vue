<script setup>
// 列表里的一张盘：小图、标题、何时何人、右边一个数（听过 / 回声）。点它就放。
import { computed } from 'vue';
import DiscMini from './DiscMini.vue';
import { L, play, title, whenText, byline } from '../lib/library.js';

const p = defineProps({ e: Object, showPlace: { type: Boolean, default: true }, meta: { type: String, default: '' } });
const on = computed(() => L.playing && L.playing.id === p.e.id);
const right = computed(() => {
  const e = p.e;
  if (e.local === 'pending') return '待发出';
  if (e.local === 'rejected') return '被退回';
  if (e.locked) return `${e.capsuleUntil ? e.capsuleUntil.slice(0, 10) : ''} 开封`;
  const n = [];
  if (e.heard) n.push(`${e.heard} 人听过`);
  if (e.echoN) n.push(`${e.echoN} 句`);
  return n.join(' · ');
});
</script>

<template>
  <li>
    <button type="button" class="disc-row" :class="{ on }" :aria-pressed="on" @click="play(e)">
      <DiscMini :e="e" />
      <span>
        <span class="t">{{ title(e) }}</span>
        <span class="m">{{ meta || [showPlace ? e.place : '', whenText(e), byline(e)].filter(Boolean).join(' · ') }}</span>
      </span>
      <span class="r">{{ right }}</span>
    </button>
  </li>
</template>
