<script setup>
// 下方正中：按住 刻十秒。麦克风只在按住时打开；松手就停，最长十秒。声音一块一块刻进外圈，唱针跟着刻刀往里走。
// 权限弹窗会吞掉「按住」：开麦前已经松手的，改成「再按一次停」。在地点页里按，地点就是那里。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ui } from '../lib/ui.js';
import { L, say, inscription } from '../lib/library.js';
import * as audio from '../lib/audio.js';
import * as stage from '../stage/stage.js';
import { goHour, clock } from '../lib/clock.js';

const route = useRoute();
const MAX = 10;
let mic = null, chunks = [], mode = 'hold', released = false, at = null;
const C = 2 * Math.PI * 16;
const dash = computed(() => C * (1 - Math.min(1, ui.rec.n / (MAX * ui.rec.fs))));
const label = computed(() => (ui.rec.state === 'opening' ? '在开麦克风' : ui.rec.state === 'rec' ? (mode === 'toggle' ? '再按一次停' : `松手就停 · ${(ui.rec.n / ui.rec.fs).toFixed(1)} 秒`) : '按住　刻十秒'));

async function start(m) {
  if (ui.rec.state !== 'idle') { if (ui.rec.state === 'rec' && mode === 'toggle') stop(); return; }
  if (ui.take) { say('刚刻的那张还没处理：发出去，或者不要了，再刻下一张。'); return; }
  mode = m; released = false; chunks = []; ui.rec.n = 0;
  ui.rec.state = 'opening';
  ui.recPlace = route.name === 'place' ? route.params.id : null;
  try {
    mic = await audio.openMic((x, peak) => {
      if (ui.rec.state !== 'rec') return;
      const max = MAX * ui.rec.fs;
      const y = x.subarray(0, Math.max(0, Math.min(x.length, max - ui.rec.n)));
      if (y.length) { chunks.push(y); ui.rec.n += y.length; ui.rec.level = peak; stage.cutFeed(y); }
      if (ui.rec.n >= max) stop();
    });
    if (ui.rec.state !== 'opening') { mic.close(); mic = null; return; }
    if (mode === 'hold' && released) mode = 'toggle';
    ui.rec.fs = mic.fs;
    at = new Date();
    ui.rec.state = 'rec';
    goHour(clock.now, { source: 'now', dur: 900 });       // 正在刻：天光落到此刻
    const pl = ui.recPlace && L.placeById.get(ui.recPlace);
    stage.cutBegin(mic.fs, `正在刻　${pl ? pl.name : '学院路'}`);
  } catch (err) {
    ui.rec.state = 'idle';
    say(audio.micError(err));
  }
}
function stop() {
  if (ui.rec.state === 'opening') { released = true; return; }
  if (ui.rec.state !== 'rec') return;
  ui.rec.state = 'idle';
  mic.close(); mic = null;
  const r = stage.cutEnd();
  const n = ui.rec.n, fs = ui.rec.fs;
  if (n < fs * 1) { say('录得太短了，按住至少一秒。'); if (L.playing) stage.load({ ...L.playing }, { autoplay: false, label: inscription(L.playing) }).catch(() => {}); return; }
  const pcm = new Float32Array(n);
  let o = 0;
  for (const c of chunks) { pcm.set(c, o); o += c.length; }
  chunks = [];
  ui.take = { pcm, fs, at, seconds: n / fs, tex: r && r.tex };
  stage.load({ id: `take-${at.getTime()}`, pcm, fs, seconds: n / fs }, { autoplay: true, label: '刚刻的一张　还没发出去' });
}
function down(ev) { if (ev.button !== 0) return; ev.preventDefault(); start('hold'); }
function up() { if (mode === 'hold') stop(); else if (ui.rec.state === 'opening') released = true; }
function key(ev) {
  if (ev.key !== ' ' && ev.key !== 'Enter') return;
  ev.preventDefault();
  if (ev.repeat) return;
  if (ui.rec.state === 'rec') stop(); else start('toggle');
}
</script>

<template>
  <button type="button" class="press" :class="{ 'is-rec': ui.rec.state !== 'idle' }" :aria-pressed="ui.rec.state === 'rec'"
    aria-label="按住刻十秒：松手就停。键盘上按空格开始，再按一次停。" @pointerdown="down" @pointerup="up" @pointerleave="ui.rec.state === 'rec' && mode === 'hold' && stop()" @keydown="key" @click.prevent>
    <svg class="ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle class="bg" cx="20" cy="20" r="16" />
      <circle class="fg" cx="20" cy="20" r="16" :stroke-dasharray="C" :stroke-dashoffset="dash" />
      <circle class="dot" cx="20" cy="20" :r="ui.rec.state === 'rec' ? 6 + 4 * Math.min(1, ui.rec.level * 3) : 6" />
    </svg>
    <span>{{ label }}</span>
  </button>
</template>
