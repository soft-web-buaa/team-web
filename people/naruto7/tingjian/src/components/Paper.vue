<script setup>
// 板块的纸：桌面浮在舞台右侧；手机变成底部抽屉（拖把手在三档之间换：一点 / 一半 / 全开）。
import { watch, onBeforeUnmount } from 'vue';
import { ui } from '../lib/ui.js';

defineProps({ slim: Boolean, label: String });
const order = ['min', 'half', 'full'];
function cycle() { ui.sheet = order[(order.indexOf(ui.sheet) + 1) % 3]; }
watch(() => ui.sheet, (s) => { document.body.classList.toggle('sheet-min', s === 'min'); document.body.classList.toggle('sheet-full', s === 'full'); }, { immediate: true });
onBeforeUnmount(() => { document.body.classList.remove('sheet-min', 'sheet-full'); });
</script>

<template>
  <aside class="paper" :class="{ 'is-slim': slim, 'is-min': ui.narrow && ui.sheet === 'min', 'is-full': ui.narrow && ui.sheet === 'full' }" :aria-label="label">
    <button type="button" class="grip" :aria-label="ui.sheet === 'full' ? '收起' : '展开'" @click="cycle"></button>
    <div class="paper-scroll"><slot /></div>
  </aside>
</template>
