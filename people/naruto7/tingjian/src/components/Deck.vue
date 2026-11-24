<script setup>
// 左下：正在放的那张。放 / 停、标题、何时何人、包络波形（走过的一段亮起来）。点标题去它的地点。
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { L, title, whenText, byline } from '../lib/library.js';
import { ui } from '../lib/ui.js';
import { usePlayhead } from '../lib/playhead.js';
import { wavePath } from '../lib/wave.js';
import * as stage from '../stage/stage.js';
import DiscMini from './DiscMini.vue';

const router = useRouter();
const { pos, playing } = usePlayhead();
const e = computed(() => L.playing);
const d = computed(() => (ui.clip ? wavePath(ui.clip.env, ui.clip.seconds, 150, 18) : ''));
const p = computed(() => (ui.clip ? Math.min(1, pos.value / ui.clip.seconds) : 0));
function go() { if (e.value && e.value.placeId) router.push(`/place/${e.value.placeId}`); }
</script>

<template>
  <section v-if="e" class="deck" aria-label="正在放">
    <button type="button" class="play" :aria-label="playing ? '停' : '放'" @click="stage.toggle()">
      <svg v-if="playing" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.6" height="12" fill="currentColor" /><rect x="9.4" y="2" width="3.6" height="12" fill="currentColor" /></svg>
      <svg v-else viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2 L14 8 L4 14 Z" fill="currentColor" /></svg>
    </button>
    <DiscMini :e="e" :size="34" />
    <div class="txt">
      <button type="button" class="link t" style="text-decoration: none" @click="go">{{ title(e) }}</button>
      <span class="m">{{ [e.place, whenText(e), byline(e)].filter(Boolean).join(' · ') }}</span>
    </div>
    <div class="bar" aria-hidden="true">
      <svg viewBox="0 0 150 18" preserveAspectRatio="none"><path :d="d" fill="var(--line)" /></svg>
      <svg viewBox="0 0 150 18" preserveAspectRatio="none" class="on" :style="{ clipPath: `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)` }"><path :d="d" fill="var(--ink)" /></svg>
    </div>
  </section>
</template>
