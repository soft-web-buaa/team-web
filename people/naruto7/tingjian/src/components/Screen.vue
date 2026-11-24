<script setup>
// 屏风（玄关）：四扇屏，每一扇是一天里的一个钟点（晨、午、昏、夜），颜色就是网站在那个钟点的颜色。此刻所在的那一扇亮着。
// 正中一张盘、一句主句、一颗「按住　听」。按住时放一段真史料（口述北航 3 @ 0:43），刻纹在盘上一圈圈刻出来；
// 松手或听完，屏风折起、向两边推开，同一段声音落到留声机的刻槽里，镜头从刻槽一镜拉出整台唱机（DESIGN.md §2）。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { tokensAt, css, clock } from '../lib/clock.js';
import { L, play } from '../lib/library.js';
import * as stage from '../stage/stage.js';
import { TURN, R0, R1, PITCH } from '../kesheng/web/groove.js';

const emit = defineEmits(['enter']);
const LEAF = [
  { h: 6, word: '晨', hour: '六时', line: '那会儿是一片荒地。', src: '口述北航 · 建校初期', range: [5, 11] },
  { h: 12.5, word: '午', hour: '正午', line: '地面只剩一米。', src: '口述北航 · 北京五号', range: [11, 16] },
  { h: 18.4, word: '昏', hour: '十八时', line: '二〇〇八年八月，体育馆里的十秒。', src: '奥运举重 · 赛场实况', range: [16, 20] },
  { h: 23, word: '夜', hour: '二十三时', line: '今天，你在听。', src: '此刻', range: [20, 29] },
].map((x) => { const t = tokensAt(x.h); return { ...x, bg: `linear-gradient(180deg, ${css(t.bg0)}, ${css(t.bg1)})`, ink: css(t.dark ? t.ink : t.ink), paper: css(t.paper), dark: t.dark }; });
const nowLeaf = computed(() => { const h = clock.now < 5 ? clock.now + 24 : clock.now; return LEAF.findIndex((x) => h >= x.range[0] && h < x.range[1]); });

const CLIP = 'arc-oral-ep3-043';
const entry = computed(() => (L.ready ? L.entries.find((e) => e.id === CLIP) : null));
const state = ref('idle');    // idle / loading / listen
const said = ref(false);
const cv = ref(null);
let t0 = 0, raf = 0, keyMode = false;
const SECS = 10;

async function start() {
  if (state.value !== 'idle' || !entry.value) return;
  state.value = 'loading';
  try {
    await play(entry.value);
    t0 = performance.now();
    state.value = 'listen';
    setTimeout(() => { said.value = true; }, 1600);
  } catch { state.value = 'idle'; }
}
function go(quick = false) {
  if (state.value === 'gone') return;
  state.value = 'gone';
  emit('enter', { quick });
}
function down(ev) { if (ev.button !== 0) return; ev.preventDefault(); keyMode = false; start(); }
function up() { if (!keyMode && (state.value === 'listen' || state.value === 'loading')) go(); }
function key(ev) {
  if (ev.key !== ' ' && ev.key !== 'Enter') return;
  ev.preventDefault();
  if (ev.repeat) return;
  if (state.value === 'idle') { keyMode = true; start(); } else go();
}

// 盘：阿基米德螺旋，和留声机外圈同一个几何（10 秒 = 5 圈）。放到哪，刻到哪；线宽是那一刻的响度
function draw() {
  raf = requestAnimationFrame(draw);
  const c = cv.value;
  if (!c) return;
  const dpr = Math.min(2, devicePixelRatio || 1), S = c.clientWidth;
  if (c.width !== Math.round(S * dpr)) { c.width = c.height = Math.round(S * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, S, S);
  const R = S / 2, cx = R, cy = R;
  const t = clock.tokens;
  const elapsed = state.value === 'listen' ? Math.min(SECS, (performance.now() - t0) / 1000) : 0;
  const spin = state.value === 'listen' ? (elapsed / TURN) * Math.PI * 2 : (performance.now() / 9000) * Math.PI * 2 * 0.05;
  // 黑漆盘
  g.fillStyle = '#0B0C0F';
  g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.fill();
  const sheen = g.createConicGradient(spin * 0.15 - 0.6, cx, cy);
  sheen.addColorStop(0, 'rgb(255 255 255 / 0)'); sheen.addColorStop(0.08, 'rgb(255 255 255 / .10)'); sheen.addColorStop(0.16, 'rgb(255 255 255 / 0)');
  sheen.addColorStop(0.5, 'rgb(255 255 255 / 0)'); sheen.addColorStop(0.58, 'rgb(255 255 255 / .07)'); sheen.addColorStop(0.66, 'rgb(255 255 255 / 0)'); sheen.addColorStop(1, 'rgb(255 255 255 / 0)');
  g.fillStyle = sheen;
  g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.fill();
  // 引导螺旋（还没刻的地方，一道很淡的线）
  const env = stage.envOf();
  const pt = (sec) => { const a = (Math.PI * 2 * sec) / TURN - spin, r = (R0 - (PITCH * sec) / TURN) * (R - 2); return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; };
  g.strokeStyle = 'rgb(255 255 255 / .07)'; g.lineWidth = 0.8;
  g.beginPath();
  for (let s = 0; s <= SECS; s += 0.02) { const [x, y] = pt(s); s ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  // 刻下的部分
  if (env && elapsed > 0) {
    let mx = 1e-6;
    for (let i = 0; i < Math.min(env.length, SECS * 50); i++) mx = Math.max(mx, env[i]);
    g.lineCap = 'round';
    for (let s = 0; s < elapsed; s += 0.02) {
      const v = Math.pow((env[Math.floor(s * 50)] || 0) / mx, 0.7);
      const [x0, y0] = pt(s), [x1, y1] = pt(s + 0.022);
      const fresh = elapsed - s < 0.35;
      g.strokeStyle = fresh ? '#E6BE3A' : `rgb(226 230 236 / ${0.28 + 0.6 * v})`;
      g.lineWidth = 0.6 + v * 2.6;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  // 纸签：此刻的天色
  const lr = (R1 - 0.05) * R;
  g.fillStyle = css(t.paper);
  g.beginPath(); g.arc(cx, cy, lr, 0, Math.PI * 2); g.fill();
  g.strokeStyle = css(t.hair); g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, lr - 6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = css(t.ink);
  g.font = `${Math.round(lr * 0.2)}px Zhuque, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(state.value === 'listen' ? `${elapsed.toFixed(1)} 秒` : '十秒', cx, cy - lr * 0.22);
  g.font = `${Math.round(lr * 0.13)}px Zhuque, serif`;
  g.fillStyle = css(t.ink2);
  g.fillText('KS-ARC-009', cx, cy + lr * 0.2);
  g.fillStyle = '#E6BE3A';
  g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  if (state.value === 'listen' && elapsed >= SECS - 0.05) go();
}
onMounted(() => { raf = requestAnimationFrame(draw); });
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <section class="screen" :class="{ 'is-gone': state === 'gone' }" aria-label="屏风：听见校园">
    <div class="leaves" aria-hidden="true">
      <div v-for="(f, i) in LEAF" :key="f.word" class="leaf" :class="{ now: i === nowLeaf, dark: f.dark }" :style="{ background: f.bg, color: f.ink, '--i': i }">
        <div class="leaf-top"><b class="w">{{ f.word }}</b><i>{{ f.hour }}</i></div>
        <p class="line">{{ f.line }}</p>
        <p class="src">{{ i === nowLeaf ? '此刻在这一扇' : f.src }}</p>
        <span v-if="i === nowLeaf" class="here"></span>
      </div>
    </div>
    <div class="center">
      <canvas ref="cv" class="disc" aria-hidden="true"></canvas>
      <h1 class="main">有些声音，<br>比我们在这里待得久。</h1>
      <p class="sub" :class="{ on: said }">{{ said && entry ? `「${entry.copy}」` : '这是一台放了很多年的留声机。同一个地方，同一个钟点，不同年份的人听着同一个声音。' }}</p>
      <button type="button" class="hold" :disabled="!entry" :aria-label="entry ? '按住听一段 1950 年代的口述：松手就进去。键盘上按回车开始，再按一次进去。' : '在摆盘'"
        @pointerdown="down" @pointerup="up" @pointercancel="up" @keydown="key" @click.prevent>
        <span class="dot" :class="{ rec: state === 'listen' }"></span>
        <span>{{ !entry ? '在摆盘…' : state === 'listen' ? '松手　进去' : state === 'loading' ? '在落针…' : '按住　听' }}</span>
      </button>
      <p class="hint">{{ state === 'listen' ? '口述北航 3 · 建校初期 · 史料' : '按住听十秒：建校那几年，一位老先生的回忆。' }}</p>
      <button type="button" class="skip" @click="go(true)">不听，直接进去</button>
    </div>
  </section>
</template>

<style scoped>
.screen { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; perspective: 1600px; overflow: hidden; }
.leaves { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; background: #07080B; }
.leaf { position: relative; display: grid; grid-template-rows: auto 1fr auto; justify-items: center; padding: 34px 0 30px; transform-origin: var(--o, left) center;
  transition: transform 1.15s cubic-bezier(.65, 0, .35, 1) calc(var(--i) * 40ms), opacity .9s ease calc(.25s + var(--i) * 40ms); }
.leaf:nth-child(odd) { --o: left; }
.leaf:nth-child(even) { --o: right; }
.leaf::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgb(0 0 0 / .14), transparent 18%, transparent 82%, rgb(0 0 0 / .1)); }
.leaf-top { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.leaf .w { font: 400 44px/1 var(--f-show); letter-spacing: 0; }
.leaf i { font: 12px/1 var(--f-ui); font-style: normal; letter-spacing: .3em; writing-mode: vertical-rl; opacity: .7; }
.leaf .line { writing-mode: vertical-rl; font: 400 22px/1.9 var(--f-show); letter-spacing: .32em; margin: 30px 0 0; align-self: start; max-height: 56vh; opacity: .9; }
.leaf .src { writing-mode: vertical-rl; font: 12px/1.4 var(--f-ui); letter-spacing: .2em; opacity: .62; margin: 0; }
.leaf.now { box-shadow: inset 0 0 0 1px rgb(230 190 58 / .55); }
.leaf .here { position: absolute; left: 50%; bottom: 14px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--scope); box-shadow: 0 0 0 4px rgb(230 190 58 / .25); }
.center { position: relative; z-index: 2; display: grid; justify-items: center; text-align: center; padding: 40px 44px 34px; max-width: 560px;
  background: radial-gradient(closest-side, var(--paper) 62%, rgb(0 0 0 / 0)); color: var(--ink); transition: opacity .5s, transform 1s cubic-bezier(.65, 0, .35, 1); }
.disc { width: 232px; height: 232px; border-radius: 50%; box-shadow: 0 22px 40px -18px rgb(0 0 0 / .7); }
.main { font: 400 40px/1.35 var(--f-show); letter-spacing: .08em; margin: 26px 0 12px; }
.sub { font: 15px/1.8 var(--f-ui); color: var(--ink-2); margin: 0 0 22px; max-width: 26em; min-height: 3.6em; transition: opacity .6s; }
.sub.on { font: 18px/1.7 var(--f-show); color: var(--ink); letter-spacing: .04em; }
.hold { display: inline-flex; align-items: center; gap: 12px; height: 54px; padding: 0 26px 0 18px; border-radius: 999px; border: 0; background: var(--ink); color: var(--paper);
  font: 17px/1 var(--f-show); letter-spacing: .16em; touch-action: none; user-select: none; -webkit-user-select: none; box-shadow: 0 16px 30px -14px rgb(0 0 0 / .6); transition: transform .15s; }
.hold:active { transform: scale(.97); }
.hold[disabled] { opacity: .5; cursor: progress; }
.hold .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--scope); }
.hold .dot.rec { animation: pulse 1.1s ease-in-out infinite; }
@keyframes pulse { 50% { transform: scale(1.5); opacity: .5; } }
.hint { font-size: 12px; color: var(--ink-2); margin: 12px 0 0; letter-spacing: .04em; }
.skip { margin-top: 14px; border: 0; background: none; color: var(--ink-2); font-size: 13px; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
/* 折屏：单数扇往左折、双数扇往右折，像一扇屏风收起来；中间那张盘往下沉进唱机 */
.is-gone .leaf:nth-child(1), .is-gone .leaf:nth-child(2) { transform: translateX(-62vw) rotateY(78deg); }
.is-gone .leaf:nth-child(3), .is-gone .leaf:nth-child(4) { transform: translateX(62vw) rotateY(-78deg); }
.is-gone .leaf { opacity: 0; }
.is-gone .leaves { background: transparent; transition: background-color .3s; }
.is-gone .center { opacity: 0; transform: scale(.86) translateY(30px); }
.is-gone { pointer-events: none; }
@media (max-width: 760px) {
  .leaf { padding: 18px 0 16px; }
  .leaf .w { font-size: 30px; }
  .leaf .line { font-size: 14px; letter-spacing: .2em; margin-top: 14px; max-height: 30vh; overflow: hidden; }
  .leaf .src { display: none; }
  .center { padding: 24px 18px; width: calc(100vw - 28px); max-width: none; background: radial-gradient(closest-side, var(--paper) 78%, rgb(0 0 0 / 0)); }
  .sub { max-width: 19em; }
  .disc { width: 168px; height: 168px; }
  .main { font-size: 27px; margin-top: 18px; }
  .sub { font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) { .leaf, .center { transition: opacity .2s !important; } .is-gone .leaf { transform: none !important; } }
</style>
