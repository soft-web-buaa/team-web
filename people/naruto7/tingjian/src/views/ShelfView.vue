<script setup>
// 唱片架（2026-11-26）：十六个地方，每个地方一张唱片，插在一只木箱里。像在唱片行里翻唱片：滚轮、方向键、拖，一张张往前翻；
// 点正对着你的那一张，唱片从套子里滑出来，内页是这个地方的每一张声音。点一首就放，盘跟着转；「去这个地方」进楼。
// 套子正面：有审核通过的社区照片就用最新一张（角标「来自社区」），没有就用模型照（角标「模型照」，scripts/make-sleeves.mjs 从舞台上拍的）。
// 照片铺一层这个钟点的天色（双色调），整排套子跟着钟点变色，和全站同一条规则。
// 舞台在这一页不画（模式是 screen，镜头退进刻槽里）：唱片架盖满屏幕，没必要在后面多画一台唱机。
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { L, atPlace, isPublic, play, title, whenText, tierWord, semesterLabel, laterCountOf } from '../lib/library.js';
import { request, photoUrl } from '../lib/cloud.js';
import { clock } from '../lib/clock.js';
import { hourColor } from '../lib/wave.js';
import * as stage from '../stage/stage.js';
import { ui } from '../lib/ui.js';

const router = useRouter();
const route = useRoute();
const fromMine = route.query.from === 'mine';   // 从「我的」的唱片架页签进来：套子按我刻过的张数排
const BASE = import.meta.env.BASE_URL;
const sleeves = computed(() => {
  void L.version;
  const list = L.places.map((p) => {
    const all = atPlace(p.id).filter((e) => isPublic(e) || e.mine);
    const voices = all.filter((e) => e.tier !== 'archival').slice().reverse();
    const past = all.filter((e) => e.tier === 'archival');
    const sems = voices.map((e) => e.semester).filter(Boolean).sort();
    const newest = voices[0] || past[0] || null;
    return { p, voices, past, newest, n: voices.length, real: voices.filter((e) => e.tier === 'real').length, from: sems[0], to: sems.at(-1), mine: atPlace(p.id).filter((e) => e.mine).length };
  });
  return fromMine ? list.slice().sort((a, b) => b.mine - a.mine) : list;
});
const i = ref(0), open = ref(false);
const cur = computed(() => sleeves.value[i.value]);
const N = computed(() => sleeves.value.length);
const go = (k) => { i.value = Math.max(0, Math.min(N.value - 1, k)); };

// 社区照片：翻到哪一张就问一下这一处有没有审核通过的照片（问过就记住）
const photos = ref({});
async function askPhoto(pid) {
  if (pid in photos.value) return;
  photos.value = { ...photos.value, [pid]: null };
  const r = await request('GET', `/places/${pid}/photos`);
  const ok = r.ok && r.json.photos.find((x) => x.state === 'ok');
  if (ok) photos.value = { ...photos.value, [pid]: ok.id };
}
watch(i, (k) => { for (const d of [0, 1, -1]) { const s = sleeves.value[k + d]; if (s) askPhoto(s.p.id); } }, { immediate: true });
const front = (s) => (photos.value[s.p.id] ? { src: photoUrl(photos.value[s.p.id], 'full'), tag: '来自社区' } : { src: `${BASE}sleeves/${s.p.id}.jpg`, tag: '模型照' });

// 木箱里的位置：正对着的那张立着；前面翻过的往前倒；后面的往后靠，露出上沿
function pose(k) {
  const d = k - i.value;
  if (open.value && d !== 0) return { ...pose0(d), opacity: 0, pointerEvents: 'none' };
  return pose0(d);
}
function pose0(d) {
  if (open.value && d === 0) return { transform: 'translate3d(-38%, -96px, 140px) rotateY(10deg)', zIndex: 100 };
  if (d < 0) { const q = Math.min(4, -d); return { transform: `translate3d(0, ${120 + q * 14}px, ${60 + q * 6}px) rotateX(-78deg)`, opacity: q > 3 ? 0 : 1 - q * 0.18, zIndex: 50 - q, pointerEvents: q > 1 ? 'none' : 'auto' }; }
  const q = Math.min(9, d);
  // 正对着的那张从箱子里提起来一截，整张套子露出来
  return { transform: d ? `translate3d(0, ${-q * 26}px, ${-q * 30}px) rotateX(${9 + q * 1.2}deg)` : 'translate3d(0, -40px, 30px)', opacity: q > 8 ? 0 : 1, zIndex: 40 - q, filter: d ? `brightness(${1 - q * 0.06})` : 'none' };
}
function pick(k) { if (k === i.value) { open.value = !open.value; return; } open.value = false; go(k); }
function back() { router.push(fromMine ? '/mine' : '/'); }

// 翻：滚轮（攒够一格才翻，免得触控板一扫翻过头）、方向键、拖
let acc = 0, dragX = null;
function onWheel(ev) { if (open.value) return; acc += ev.deltaY + ev.deltaX; if (Math.abs(acc) > 60) { go(i.value + Math.sign(acc)); acc = 0; } }
function onKey(ev) {
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { open.value = false; go(i.value + 1); ev.preventDefault(); }
  else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { open.value = false; go(i.value - 1); ev.preventDefault(); }
  else if (ev.key === 'Enter' || ev.key === ' ') { if (ev.target.tagName !== 'BUTTON') { open.value = !open.value; ev.preventDefault(); } }
  else if (ev.key === 'Escape') { if (open.value) open.value = false; else back(); }
}
function onDown(ev) { dragX = ev.clientX; }
function onUp(ev) { if (dragX == null) return; const dx = ev.clientX - dragX; dragX = null; if (Math.abs(dx) > 50 && !open.value) go(i.value + (dx < 0 ? 1 : -1)); }
onMounted(() => addEventListener('keydown', onKey));
onBeforeUnmount(() => removeEventListener('keydown', onKey));

// 盘：正在放这个地方的声音时转；纸签是那一张的钟点色
const spinning = computed(() => !!(ui.clip && ui.clip.playing && L.playing && cur.value && L.playing.placeId === cur.value.p.id));
const playingHere = computed(() => (L.playing && cur.value && L.playing.placeId === cur.value.p.id ? L.playing : null));
const labelOf = (s) => hourColor((playingHere.value || s.newest || {}).hour ?? clock.shown);
const tint = computed(() => hourColor(clock.shown));
const yearSpan = (s) => (s.from ? (s.from === s.to ? semesterLabel(s.from) : `${semesterLabel(s.from)} 到 ${semesterLabel(s.to)}`) : '还没有');
function playOne(e) { if (e) play(e); }
function visit(s) { router.push(`/place/${s.p.id}`); }
</script>

<template>
  <section class="shelf" aria-label="唱片架" @wheel.passive="onWheel" @pointerdown="onDown" @pointerup="onUp" :style="{ '--tint': tint }">
    <header>
      <div>
        <p class="kicker">唱片架 · {{ N }} 个地方</p>
        <h1 class="h1">{{ fromMine ? '我的唱片架' : '每个地方一张唱片' }}</h1>
        <p class="fine">{{ fromMine ? '你刻过的地方排在前面，黄标写着你在那里刻了几张；滚轮、方向键或左右拖着翻。' : '滚轮、方向键或左右拖着翻；点正对着你的那一张，把唱片抽出来。' }}</p>
      </div>
      <button type="button" class="btn small ghost" @click="back">{{ fromMine ? '回到我的' : '回到留声机' }}</button>
    </header>

    <div class="crate" :class="{ open }">
      <div class="stack">
        <button v-for="(s, k) in sleeves" :key="s.p.id" type="button" class="sleeve" :class="{ cur: k === i }" :style="pose(k)" :aria-label="`${s.p.name}，${s.n} 张`" :aria-current="k === i ? 'true' : undefined" @click="pick(k)">
          <span class="photo"><img :src="front(s).src" :alt="''" loading="lazy" draggable="false"><i class="tone"></i></span>
          <span class="tag">{{ front(s).tag }}</span>
          <span v-if="fromMine && s.mine" class="mine-tag">我 {{ s.mine }} 张</span>
          <span class="strip">
            <b class="show">{{ s.p.name }}</b>
            <em>{{ s.n }} 张<template v-if="s.real"> · 真实 {{ s.real }}</template><template v-if="s.past.length"> · 史料 {{ s.past.length }}</template></em>
          </span>
          <span class="spine show">{{ s.p.name }}</span>
        </button>
      </div>
      <div class="box" aria-hidden="true"><i class="lip"></i><b class="show">学院路 · 刻声馆藏</b></div>

      <!-- 抽出来的唱片和内页 -->
      <Transition name="disc">
        <div v-if="open && cur" class="out">
          <div class="disc" :class="{ spin: spinning }" aria-hidden="true">
            <i class="label" :style="{ background: labelOf(cur) }"><b class="show">{{ cur.p.name }}</b><em>33⅓</em></i>
          </div>
          <div class="inner">
            <p class="kicker">{{ yearSpan(cur) }}</p>
            <h2 class="show">{{ cur.p.name }}</h2>
            <div class="row">
              <button type="button" class="btn small" :disabled="!cur.newest" @click="playOne(cur.newest)">放最新的一张</button>
              <button type="button" class="btn small ghost" @click="visit(cur)">去这个地方</button>
            </div>
            <ol class="tracks">
              <li v-for="(e, n) in [...cur.voices, ...cur.past].slice(0, 9)" :key="e.id">
                <button type="button" :class="{ on: playingHere && playingHere.id === e.id }" @click="playOne(e)">
                  <span class="no">{{ String(n + 1).padStart(2, '0') }}</span>
                  <span class="t show">{{ title(e) }}</span>
                  <span class="w">{{ whenText(e) }} · {{ tierWord(e) }}<span v-if="laterCountOf(e)" class="later-tag">后来 {{ laterCountOf(e) }}</span></span>
                </button>
              </li>
            </ol>
            <p v-if="cur.voices.length + cur.past.length > 9" class="fine">还有 {{ cur.voices.length + cur.past.length - 9 }} 张，<button type="button" class="link fine" @click="visit(cur)">去这个地方看全部</button>。</p>
          </div>
        </div>
      </Transition>
    </div>

    <nav class="dots" aria-label="翻到">
      <button v-for="(s, k) in sleeves" :key="s.p.id" type="button" :class="{ on: k === i }" :aria-label="s.p.name" @click="open = false; go(k)"></button>
    </nav>
  </section>
</template>

<style scoped>
.shelf { position: fixed; inset: 0; z-index: 25; overflow: hidden; color: var(--ink); background-color: var(--paper); background-image: var(--grain), radial-gradient(110% 80% at 50% 20%, var(--paper), color-mix(in srgb, var(--paper) 70%, var(--bg1))); user-select: none; -webkit-user-select: none; touch-action: pan-y; }
header { position: absolute; left: 40px; right: 40px; top: 28px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; z-index: 200; }
header .h1 { margin-bottom: 6px; }
.crate { position: absolute; left: 50%; top: 56%; width: 340px; height: 340px; transform: translate(-50%, -50%); perspective: 1500px; perspective-origin: 50% 10%; transition: transform .7s var(--ease); }
.stack { position: absolute; inset: 0; transform-style: preserve-3d; }
.sleeve { position: absolute; inset: 0; padding: 0; border: 0; border-radius: 2px; background: #EFE8DA; transform-origin: 50% 100%; transition: transform .55s var(--ease), opacity .4s, filter .4s; box-shadow: 0 1px 0 rgb(0 0 0 / .08), 0 30px 50px -24px rgb(0 0 0 / .55); cursor: pointer; overflow: hidden; display: block; text-align: left; backface-visibility: hidden; }
.sleeve .photo { position: absolute; left: 0; right: 0; top: 0; height: 78%; overflow: hidden; }
.sleeve img { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(.82) contrast(1.04); }
.sleeve .tone { position: absolute; inset: 0; background: var(--tint); mix-blend-mode: soft-light; opacity: .75; }
.sleeve .tag { position: absolute; left: 10px; top: 10px; font-size: 12px; padding: 2px 6px; border-radius: 2px; background: rgb(244 241 234 / .9); color: #3B4452; }
.sleeve .strip { position: absolute; left: 0; right: 0; bottom: 0; height: 22%; padding: 10px 14px; display: grid; align-content: center; gap: 3px; background: #EFE8DA; color: #24304A; }
.sleeve .strip b { font-size: 22px; letter-spacing: .06em; }
.sleeve .strip em { font: 12px var(--f-ui); font-style: normal; color: #5A6274; }
/* 后面排着的套子只看上沿：书名条、角标都收起来，一排干净的照片边 */
.sleeve:not(.cur) .strip, .sleeve:not(.cur) .tag, .sleeve:not(.cur) .mine-tag { opacity: 0; }
.sleeve .strip, .sleeve .tag { transition: opacity .3s; }
.sleeve .spine { position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--tint); opacity: .9; font-size: 0; }
/* 「我的」进来时：刻过的套子条上贴一枚示波黄小签 */
.sleeve .mine-tag { position: absolute; right: 12px; bottom: calc(22% + 8px); z-index: 2; font: 11px var(--f-ui); padding: 2px 6px; border-radius: 1px; background: #E6BE3A; color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / .25); }
.sleeve.cur { box-shadow: 0 0 0 1px rgb(0 0 0 / .05), 0 40px 70px -26px rgb(0 0 0 / .6); }
.sleeve.cur:focus-visible { outline: 3px solid var(--scope); outline-offset: 3px; }
.box { position: absolute; left: -46px; right: -46px; bottom: -70px; height: 130px; transform: translateZ(80px); transition: opacity .4s, transform .6s var(--ease); border-radius: 4px; background-color: #7A5C40; background-image: linear-gradient(180deg, rgb(255 255 255 / .1), transparent 26%), repeating-linear-gradient(92deg, transparent 0 13px, rgb(0 0 0 / .035) 13px 14px), linear-gradient(#8B6A4A, #6E5238); box-shadow: inset 0 2px 0 rgb(255 255 255 / .16), inset 0 -10px 18px rgb(0 0 0 / .2), 0 30px 60px -30px rgb(0 0 0 / .6); display: grid; place-items: end center; padding-bottom: 18px; pointer-events: none; z-index: 60; }
.box .lip { position: absolute; left: 0; right: 0; top: 0; height: 11px; background: linear-gradient(#A98763, #96744F); border-radius: 4px 4px 0 0; box-shadow: inset 0 1px 0 rgb(255 255 255 / .22), 0 2px 3px rgb(0 0 0 / .18); }
.box b { color: rgb(255 244 222 / .72); font-size: 14px; letter-spacing: .3em; }
.crate.open { transform: translate(-50%, -50%) translateX(-200px); }
.crate.open .box { opacity: 0; transform: translateZ(80px) translateY(40px); }
.out { position: absolute; left: 0; top: 0; width: 340px; height: 340px; z-index: 90; pointer-events: none; }
.out .inner { pointer-events: auto; }
.disc { position: absolute; left: 34%; top: -96px; width: 330px; height: 330px; border-radius: 50%; background: repeating-radial-gradient(circle at 50% 50%, #0E0F12 0 1.4px, #1B1D22 1.6px 2.6px), #111; box-shadow: 0 24px 50px -20px rgb(0 0 0 / .7), inset 0 0 0 2px #0A0A0C; position: relative; animation: slide .8s var(--ease) both; }
.disc::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 30deg, transparent 0 8%, rgb(255 255 255 / .1) 12%, transparent 18% 58%, rgb(255 255 255 / .08) 62%, transparent 68%); }
.disc .label { position: absolute; left: 50%; top: 50%; width: 112px; height: 112px; margin: -56px 0 0 -56px; border-radius: 50%; display: grid; place-content: center; text-align: center; gap: 2px; color: #fff; box-shadow: inset 0 0 0 1px rgb(255 255 255 / .2); }
.disc .label b { font-size: 15px; text-shadow: 0 0 6px rgb(0 0 0 / .55), 0 1px 2px rgb(0 0 0 / .4); }
.disc .label em { font: 10px var(--f-ui); font-style: normal; text-shadow: 0 0 5px rgb(0 0 0 / .6); }
.disc .label::after { content: ''; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: #E6BE3A; }
.disc.spin { animation: slide .8s var(--ease) both, turn 1.8s linear infinite .8s; }
@keyframes slide { from { transform: translateX(-160px) rotate(-40deg); opacity: .4; } to { transform: none; opacity: 1; } }
@keyframes turn { to { transform: rotate(360deg); } }
.inner { position: absolute; left: calc(34% + 360px); top: -110px; width: 340px; max-height: 470px; overflow-y: auto; padding: 18px 20px 14px; border-radius: 5px; background-color: var(--paper); background-image: var(--grain); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 7%, transparent), 0 1px 1px rgb(0 0 0 / .05), 0 26px 50px -24px rgb(0 0 0 / .45); animation: rise .6s .15s var(--ease) both; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--line) 75%, transparent) transparent; }
@keyframes rise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
.inner::-webkit-scrollbar { width: 8px; }
.inner::-webkit-scrollbar-track { background: transparent; }
.inner::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 8px; background: color-mix(in srgb, var(--line) 70%, transparent) padding-box; }
.inner h2 { font-size: 30px; margin: 0 0 12px; font-weight: 400; }
.tracks { list-style: none; margin: 14px 0 0; padding: 0; }
.tracks button { width: 100%; display: grid; grid-template-columns: 28px 1fr; grid-template-rows: auto auto; column-gap: 8px; padding: 7px 0; border: 0; border-top: 1px solid var(--hair); background: none; text-align: left; color: var(--ink); cursor: pointer; }
.tracks .no { grid-row: 1 / 3; font: 12px var(--f-ui); color: var(--ink-2); padding-top: 2px; font-variant-numeric: tabular-nums; }
.tracks .t { font-size: 15px; }
.tracks .w { font-size: 12px; color: var(--ink-2); }
.tracks .later-tag { margin-left: 8px; padding: 1px 5px; border: 1px solid var(--line); border-radius: 2px; font-size: 12px; letter-spacing: .04em; color: var(--ink); white-space: nowrap; }
.tracks button.on .t { color: var(--ink); box-shadow: inset 0 -2px 0 var(--scope); width: fit-content; }
.disc-enter-active, .disc-leave-active { transition: opacity .35s; }
.disc-enter-from, .disc-leave-to { opacity: 0; }
.dots { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); display: flex; gap: 8px; z-index: 200; }
.dots button { width: 8px; height: 8px; padding: 0; border-radius: 50%; border: 0; background: var(--line); cursor: pointer; }
.dots button.on { background: var(--scope); transform: scale(1.3); }
@media (max-width: 760px) {
  header { left: 18px; right: 18px; top: 18px; flex-direction: column-reverse; gap: 10px; }
  header .btn { align-self: flex-end; }
  header .h1 { font-size: 32px; }
  .crate { width: 240px; height: 240px; top: 52%; }
  .crate.open { transform: translate(-50%, -50%) translateY(-130px) scale(.8); }
  .disc { display: none; }
  .inner { left: 50%; top: 250px; width: calc(100vw - 32px); transform: translateX(-50%); max-height: 40vh; animation: none; }
}
@media (prefers-reduced-motion: reduce) {
  .sleeve, .crate { transition: none; }
  .disc, .disc.spin { animation: none; }
}
</style>
