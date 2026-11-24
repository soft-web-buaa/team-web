<script setup>
// 回声带：正在放的这张的包络线，钉在某一秒的话竖在线上。针走到那一秒，那句话浮上来；点一根钉，声音从那一秒前面一点接着放。
// 同一句话也立在三维盘面的刻纹上（stage.setEchoes）：声音、波形、盘面三处指同一个瞬间。
import { ref, computed, watch } from 'vue';
import { L, echoesOf, echoByline, pinEcho, dropEcho, title } from '../lib/library.js';
import { photoUrl } from '../lib/cloud.js';
import { ui } from '../lib/ui.js';
import { usePlayhead } from '../lib/playhead.js';
import { wavePath } from '../lib/wave.js';
import * as stage from '../stage/stage.js';
import { prepare } from '../kesheng/web/photo.js';

const { pos } = usePlayhead();
const e = computed(() => L.playing);
const sec = computed(() => (ui.clip ? ui.clip.seconds : 10));
const list = computed(() => { void L.pending; void L.echoes; void L.hidden; return e.value ? echoesOf(e.value.id) : []; });
const d = computed(() => (ui.clip ? wavePath(ui.clip.env, ui.clip.seconds, 160, 56) : ''));
const p = computed(() => Math.min(1, pos.value / sec.value));
const active = computed(() => { let k = -1; list.value.forEach((x, i) => { if (x.t <= pos.value + 0.15 && pos.value - x.t < 1.8) k = i; }); return k; });
watch(active, (k) => stage.setEchoActive(k));
const now = computed(() => (active.value >= 0 ? list.value[active.value] : null));

const open = ref(false), at = ref(0), text = ref(''), err = ref(''), busy = ref(false), photo = ref(null), consent = ref(false), all = ref(false);
function begin() { open.value = true; at.value = Math.round(Math.min(sec.value, pos.value) * 10) / 10; text.value = ''; err.value = ''; photo.value = null; consent.value = false; }
async function pick(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  err.value = '';
  try { photo.value = await prepare(f); } catch (x) { err.value = x.message; }
  ev.target.value = '';
}
async function send() {
  err.value = '';
  if (photo.value && !consent.value) { err.value = '要先勾选"照片里没有能认出身份的人，或我已经问过"。'; return; }
  busy.value = true;
  try {
    await pinEcho({ disc: e.value, t: at.value, text: text.value, photo: photo.value ? { thumb: photo.value.thumb, full: photo.value.full } : null });
    open.value = false;
    if (photo.value) URL.revokeObjectURL(photo.value.previewUrl);
    photo.value = null;
  } catch (x) { err.value = x.message; }
  busy.value = false;
}
const seekTo = (x) => stage.seek(Math.max(0, x.t - 0.4));
const src = (x) => (x.photo && x.photo.id ? photoUrl(x.photo.id, 'thumb') : null);
</script>

<template>
  <section v-if="e && ui.clip" class="band" aria-label="钉在这张声片上的话">
    <div class="track">
      <svg viewBox="0 0 160 56" preserveAspectRatio="none" aria-hidden="true"><path :d="d" class="off" /></svg>
      <svg viewBox="0 0 160 56" preserveAspectRatio="none" aria-hidden="true" :style="{ clipPath: `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)` }"><path :d="d" class="lit" /></svg>
      <i class="head" :style="{ left: `${(p * 100).toFixed(2)}%` }" aria-hidden="true"></i>
      <button v-for="(x, i) in list" :key="x.id" type="button" class="pin" :class="{ mine: x.mine, on: i === active, ph: x.photo }" :style="{ left: `${((x.t / sec) * 100).toFixed(2)}%` }"
        :aria-label="`${x.t.toFixed(1)} 秒：${x.text}`" @click="seekTo(x)"></button>
      <i v-if="open" class="ghost" :style="{ left: `${((at / sec) * 100).toFixed(2)}%` }" aria-hidden="true"></i>
    </div>
    <div class="say" aria-live="polite">
      <template v-if="now">
        <img v-if="src(now)" :src="src(now)" alt="" class="dev" width="56" height="42">
        <p><span class="q">「{{ now.text }}」</span><span class="by">{{ now.t.toFixed(1) }} 秒 · {{ echoByline(now) || '没落款的人' }}</span></p>
      </template>
      <p v-else class="fine">{{ list.length ? `这张上钉着 ${list.length} 句话，放到那一秒会浮上来。` : `「${title(e)}」上还没有话。` }}</p>
    </div>
    <div class="row">
      <button v-if="!open" type="button" class="btn small" @click="begin">钉一句话</button>
      <button v-if="list.length" type="button" class="btn small ghost" :aria-expanded="all" @click="all = !all">{{ all ? '收起' : `全部 ${list.length} 句` }}</button>
    </div>
    <form v-if="open" class="form" @submit.prevent="send">
      <label class="field"><span>钉在第 <b class="num">{{ at.toFixed(1) }}</b> 秒</span><input v-model.number="at" type="range" min="0" :max="sec" step="0.1"></label>
      <label class="field"><span>这一秒让你想起什么（最多 40 字）</span><input v-model="text" class="input" maxlength="40" autocomplete="off" placeholder="比如：铃一响，后排的人已经把书合上了"></label>
      <div class="photo">
        <label v-if="!photo" class="btn small ghost">配一张照片<input type="file" accept="image/*" class="sr-only" @change="pick"></label>
        <template v-else>
          <img :src="photo.previewUrl" alt="要配的照片" width="72" height="54">
          <label class="consent"><input v-model="consent" type="checkbox"> 照片里没有能认出身份的人，或我已经问过。</label>
          <button type="button" class="link" @click="photo = null">不配了</button>
        </template>
        <p class="fine">照片先审后显，通过之前只有你看得到；拍摄地点这类信息在你的设备上就去掉了。</p>
      </div>
      <p class="err" role="alert">{{ err }}</p>
      <div class="row"><button type="submit" class="btn small" :disabled="busy">钉上去</button><button type="button" class="btn small ghost" @click="open = false">取消</button></div>
    </form>
    <ol v-if="all" class="list">
      <li v-for="x in list" :key="x.id">
        <button type="button" class="line" @click="seekTo(x)"><b class="num">{{ x.t.toFixed(1) }}″</b><span>{{ x.text }}</span><i>{{ echoByline(x) }}{{ x.error ? ` · ${x.error}` : '' }}</i></button>
        <button type="button" class="link small" @click="dropEcho(x)">{{ x.mine ? '删掉' : x.demo ? '收起' : '举报' }}</button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.band { margin: 18px 0 0; }
.track { position: relative; height: 56px; margin: 0 0 10px; }
.track svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.off { fill: var(--hair); }
.lit { fill: var(--ink); }
.head { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--scope); }
.pin { position: absolute; top: -10px; width: 14px; height: 76px; margin-left: -7px; border: 0; background: none; padding: 0; }
.pin::before { content: ''; position: absolute; left: 6px; top: 8px; bottom: 0; width: 2px; background: var(--ink-2); opacity: .55; }
.pin::after { content: ''; position: absolute; left: 2px; top: 0; width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2px solid var(--ink); }
.pin.ph::after { border-radius: 2px; }
.pin.mine::after { background: var(--scope); border-color: var(--scope); }
.pin.on::after { transform: scale(1.35); background: var(--ink); }
.ghost { position: absolute; top: -8px; bottom: -4px; width: 2px; margin-left: -1px; background: repeating-linear-gradient(var(--ink) 0 3px, transparent 3px 6px); }
.say { display: flex; gap: 10px; align-items: center; min-height: 54px; }
.say p { margin: 0; }
.q { font: 17px/1.5 var(--f-show); display: block; }
.by { font-size: 12px; color: var(--ink-2); }
.dev { border-radius: 2px; object-fit: cover; animation: develop 1.6s ease-out both; }
@keyframes develop { from { filter: brightness(2.2) saturate(0) blur(2px); opacity: .2; } to { filter: none; opacity: 1; } }
.form { margin: 14px 0 0; padding: 14px; border-radius: 4px; background: var(--wash); }
.form input[type='range'] { width: 100%; accent-color: var(--ink); }
.photo { display: grid; gap: 8px; margin: 0 0 6px; }
.photo img { border-radius: 2px; object-fit: cover; }
.consent { font-size: 13px; display: flex; gap: 6px; align-items: flex-start; }
.list { list-style: none; padding: 0; margin: 12px 0 0; }
.list li { display: flex; gap: 8px; align-items: baseline; border-top: 1px solid var(--hair); }
.line { flex: 1; display: grid; grid-template-columns: 42px 1fr; column-gap: 8px; padding: 8px 0; border: 0; background: none; text-align: left; }
.line b { font-weight: 600; font-size: 12px; color: var(--ink-2); }
.line i { grid-column: 2; font-size: 12px; font-style: normal; color: var(--ink-2); }
.small { font-size: 12px; }
</style>
