<script setup>
// 年轮的星系（src/lib/galaxy.js 画）：一条轨道一个学年，一颗星一张盘。悬停看是哪一张，点一下放；滚轮拉近，星尘里的星一颗颗分出来。
// 两处用：年轮页左边整块（fixed），样张页里的小格（inline）。
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { GalaxyPainter } from '../lib/galaxy.js';
import { title } from '../lib/library.js';
import { fmtHour } from '../lib/clock.js';

const p = defineProps({
  list: Array, mode: { type: String, default: 'clock' }, hour: { type: Number, default: 12 },
  playingId: { type: String, default: null }, focusYear: { type: Number, default: null },
  fixed: Boolean, disc: Boolean, label: { type: String, default: '年轮星系' },
});
const emit = defineEmits(['pick']);
const box = ref(null), cv = ref(null), tip = ref(null), count = ref(null);
let painter = null, raf = 0, last = 0, ro = null, visible = true, zoom = 1;

function fit() {
  const r = box.value.getBoundingClientRect();
  painter.resize(Math.max(50, r.width), Math.max(50, r.height), Math.min(2, devicePixelRatio || 1));
}
function loop(now) {
  raf = requestAnimationFrame(loop);
  if (!visible || document.hidden) { last = 0; return; }
  const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
  last = now;
  painter.frame(dt);
}
function local(ev) { const r = cv.value.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function onMove(ev) {
  const [x, y] = local(ev), s = painter.pick(x, y);
  painter.hover = s;
  cv.value.style.cursor = s ? 'pointer' : 'default';
  tip.value = s ? { x, y, t: title(s.e), w: `${s.e.place || ''} · ${fmtHour(s.e.hour)}${s.star ? '' : ' · 星尘里的一颗'}`, mine: s.mine } : null;
}
function onClick(ev) { const [x, y] = local(ev), s = painter.pick(x, y); if (s) emit('pick', s.e); }
function onWheel(ev) {
  ev.preventDefault();
  zoom = Math.min(2.6, Math.max(1, zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
  painter.set({ zoom });
}
onMounted(() => {
  painter = new GalaxyPainter(cv.value, p.disc ? { background: false, round: true, fill: 0.41 } : {});
  fit();
  painter.setData(p.list || []);
  painter.set({ mode: p.mode, hour: p.hour, playingId: p.playingId, focusYear: p.focusYear });
  count.value = painter.count;
  ro = new ResizeObserver(fit); ro.observe(box.value);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(box.value);
  onBeforeUnmount(() => io.disconnect());
  raf = requestAnimationFrame(loop);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro && ro.disconnect(); });
watch(() => p.list, (l) => { painter && (painter.setData(l || []), (count.value = painter.count)); });
watch(() => [p.mode, p.hour, p.playingId, p.focusYear], () => painter && painter.set({ mode: p.mode, hour: p.hour, playingId: p.playingId, focusYear: p.focusYear }));
defineExpose({ replay: () => painter && painter.replay() });
</script>

<template>
  <div ref="box" class="gx" :class="{ fixed, disc }">
    <canvas ref="cv" role="img" :aria-label="`${label}：${(list || []).length} 张。一条轨道是一个学年，最里最早；一颗星是一张盘，角度是录下的钟点。`" @pointermove="onMove" @pointerleave="tip = null; painter && (painter.hover = null)" @click="onClick" @wheel="onWheel"></canvas>
    <div v-if="tip" class="tip" :class="{ mine: tip.mine }" :style="{ transform: `translate(${tip.x + 14}px, ${tip.y - 10}px)` }"><b class="show">{{ tip.t }}</b><span>{{ tip.w }}</span></div>
    <p v-if="count && !disc" class="legend">{{ (list || []).length }} 张 · 亮着 {{ count.stars }} 颗星<template v-if="count.dust">，{{ count.dust }} 颗化成了星尘（滚轮拉近会分出来）</template></p>
  </div>
</template>

<style scoped>
.gx { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 4px; background: #05061a; }
.gx.fixed { position: fixed; z-index: 5; left: 0; top: 0; bottom: 0; right: calc(var(--paper-w) + 32px); width: auto; aspect-ratio: auto; border-radius: 0; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.tip { position: absolute; left: 0; top: 0; pointer-events: none; display: grid; gap: 2px; max-width: 260px; padding: 7px 10px; border-radius: 3px; background: rgb(12 13 38 / .86); color: #ECEAF6; box-shadow: 0 0 0 1px rgb(190 195 255 / .18); font-size: 12px; }
.tip b { font-size: 14px; font-weight: normal; }
.tip span { color: #B9BCD8; }
.tip.mine { box-shadow: 0 0 0 1px #E6BE3A; }
.legend { position: absolute; left: 16px; bottom: 10px; margin: 0; font-size: 12px; color: rgb(205 209 235 / .7); pointer-events: none; }
.gx.disc { position: fixed; z-index: 5; left: 0; top: 0; width: 100px; height: 100px; aspect-ratio: auto; border-radius: 50%; background: transparent; }
.gx.fixed .legend { left: auto; right: 22px; bottom: 98px; text-align: right; max-width: 40%; }
@media (max-width: 760px) {
  .gx.fixed { right: 0; bottom: 52vh; top: var(--top); }
  .gx.fixed .legend { bottom: 10px; }
}
</style>
