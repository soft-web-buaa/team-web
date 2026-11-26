<script setup>
// 地点（一栋楼）：舞台上这栋楼被从模型里提起来，落在一只纸台座上慢慢转；盘面压暗、移轴虚化成轮廓（stage.js）。
// 纸上：这里的年轮、这里的从前（史料）、这里的照片、这里的每一张。
import { computed, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import RingWood from '../components/RingWood.vue';
import EchoBand from '../components/EchoBand.vue';
import AddToAlbum from '../components/AddToAlbum.vue';
import PaperSlip from '../components/PaperSlip.vue';
import { L, atPlace, placeLine, play, isPublic, toggleHeard, toggleFav, isFav, title, laterOf, addLater, removeLater, dropEcho, say } from '../lib/library.js';
import { request, photoUrl } from '../lib/cloud.js';

const route = useRoute(), router = useRouter();
const pid = computed(() => route.params.id);
const place = computed(() => L.placeById.get(pid.value));
const all = computed(() => { void L.version; return atPlace(pid.value).filter((e) => isPublic(e) || e.mine); });
const past = computed(() => all.value.filter((e) => e.tier === 'archival'));
const voices = computed(() => all.value.filter((e) => e.tier !== 'archival').slice().reverse());
const real = computed(() => voices.value.filter((e) => e.tier === 'real'));
const zone = computed(() => place.value && L.zones.find((z) => z.id === place.value.z));
const facts = computed(() => L.facts[pid.value] || []);
const photos = ref([]);
const sleeve = computed(() => photos.value.find((p) => p.state === 'ok'));
const playingHere = computed(() => L.playing && L.playing.placeId === pid.value ? L.playing : null);
const neighbors = computed(() => L.places.filter((p) => p.z === place.value?.z && p.id !== pid.value));
// 「后来」：正在放的这张盘旁边叠着的纸签（最新在上）；我的盘多一颗「写一句后来」。
const laters = computed(() => { void L.version; return playingHere.value ? laterOf(playingHere.value.id) : []; });
const writing = ref(false), draft = ref(''), laterErr = ref(''), sticking = ref(false);
const canWrite = computed(() => !!playingHere.value && playingHere.value.mine && playingHere.value.tier === 'real' && !playingHere.value.local && laters.value.length < 5);
function beginLater() { writing.value = true; draft.value = ''; laterErr.value = ''; }
async function stick() {
  laterErr.value = '';
  sticking.value = true;
  try { await addLater(playingHere.value, draft.value); writing.value = false; draft.value = ''; say('贴上了。原声没动，这条叠在旁边。'); }
  catch (x) { laterErr.value = x.message; }
  sticking.value = false;
}
async function dropLater(x) { if (await removeLater(x.id)) say('这条后来删掉了。'); }
async function loadPhotos() {
  photos.value = [];
  const r = await request('GET', `/places/${pid.value}/photos`);
  if (r.ok) photos.value = r.json.photos;
}
watch(pid, (v) => {
  if (!L.placeById.has(v)) { router.replace('/'); return; }
  loadPhotos();
  // 从「我的」点「回头听听」过来：网址里带着要放的那张，直接放它
  const want = route.query.play && all.value.find((x) => x.id === route.query.play);
  if (want) { play(want); return; }
  // 进来就放这里最新的一张（没有就放史料），但不改正在放的、别处的那张以外的东西
  if (!L.playing || L.playing.placeId !== v) {
    const e = voices.value.find((x) => x.tier === 'real' && x.mine) || real.value[0] || voices.value[0] || past.value[0];
    if (e) play(e, { auto: false });
  }
}, { immediate: true });
// 云上的盘可能比页面晚一步到：等它到了再放，别让「回头听听」落空
watch(() => [route.query.play, L.version], () => {
  const id = route.query.play;
  if (!id || (L.playing && L.playing.id === id)) return;
  const e = all.value.find((x) => x.id === id);
  if (e) play(e);
});
const n = (k) => all.value.filter((e) => e.tier === k).length;
</script>

<template>
  <Paper v-if="place" :label="place.name">
    <button type="button" class="link fine" @click="router.push('/')">← 回到整台唱机</button>
    <p class="kicker" style="margin-top: 18px">{{ zone ? zone.name : '' }} · {{ place.b }}</p>
    <h1 class="h1">{{ place.name }}</h1>
    <p class="lede">{{ placeLine(pid) }}</p>
    <div v-if="sleeve" class="sleeve">
      <img :src="photoUrl(sleeve.id, 'full')" alt="这里的一张照片（来自社区）" loading="lazy">
      <span class="tier">来自社区</span>
    </div>

    <template v-if="playingHere">
      <p class="h3">正在放</p>
      <p class="now-title show">{{ title(playingHere) }}</p>
      <EchoBand />
      <div v-if="playingHere.tier !== 'archival'" class="row" style="margin-top: 12px">
        <button type="button" class="btn small" :class="{ on: playingHere.heardByMe }" @click="toggleHeard(playingHere)">我也听过{{ playingHere.heard ? ` · ${playingHere.heard}` : '' }}</button>
        <button type="button" class="btn small ghost" :aria-pressed="isFav(playingHere)" @click="toggleFav(playingHere)">{{ isFav(playingHere) ? '已收藏' : '收藏' }}</button>
        <AddToAlbum :e="playingHere" />
      </div>
      <!-- 「后来」：原声不动，作者回头听时在旁边补的话，一张张纸签叠着 -->
      <div v-if="playingHere.tier === 'real' && (laters.length || (canWrite && !writing) || writing)" class="laters">
        <p class="laters-head">后来<span v-if="laters.length" class="n">{{ laters.length }}/5</span></p>
        <div class="slip-stack">
          <PaperSlip v-for="x in laters" :key="x.id" :id="x.id" :text="x.text" :at="x.at" :days-after="x.daysAfter" :mine="x.mine" @remove="dropLater(x)" @report="dropEcho(x)" />
        </div>
        <button v-if="canWrite && !writing" type="button" class="btn small ghost" @click="beginLater">写一句后来</button>
        <form v-if="writing" class="later-form" @submit.prevent="stick">
          <label class="field"><span>后来 <span class="fine">最多 80 字</span></span>
            <textarea v-model="draft" class="input later-input" maxlength="80" rows="3" placeholder="回头听这一段，你想说点什么？"></textarea>
          </label>
          <div class="later-meta"><span class="fine">原声不会改，后来会一条条叠在它旁边。</span><span class="count num">{{ draft.length }}/80</span></div>
          <p class="err" role="alert">{{ laterErr }}</p>
          <div class="row"><button type="submit" class="btn small" :disabled="sticking || !draft.trim()">贴上</button><button type="button" class="btn small ghost" @click="writing = false">算了</button></div>
        </form>
      </div>
    </template>

    <p class="h3">这里的年轮</p>
    <RingWood :list="voices" :size="320" :playing-id="L.playing && L.playing.id" @pick="play" />

    <template v-if="past.length || facts.length">
      <p class="h3">这里的从前</p>
      <ul v-if="facts.length" class="facts">
        <li v-for="f in facts" :key="f.text">{{ f.text }} <a :href="f.src" target="_blank" rel="noreferrer">出处</a></li>
      </ul>
      <ol class="discs"><DiscRow v-for="e in past" :key="e.id" :e="e" :show-place="false" /></ol>
    </template>

    <template v-if="photos.length">
      <p class="h3">这里的照片</p>
      <div class="contact">
        <a v-for="p in photos" :key="p.id" :href="photoUrl(p.id, 'full')" target="_blank" rel="noreferrer" class="frame">
          <img :src="photoUrl(p.id, 'thumb')" :alt="p.state === 'pending' ? '你传的照片，审核中' : '这里的一张照片'" loading="lazy">
          <span v-if="p.state === 'pending'" class="tier">审核中</span>
        </a>
      </div>
    </template>

    <p class="h3">这里的每一张 · {{ voices.length }}</p>
    <p class="fine">{{ n('real') }} 张真实录音，{{ n('synthetic') }} 张示意。按住下面那颗钮，刻的就是{{ place.name }}。</p>
    <ol class="discs"><DiscRow v-for="e in voices" :key="e.id" :e="e" :show-place="false" /></ol>

    <template v-if="neighbors.length">
      <p class="h3">同一片的</p>
      <div class="row"><RouterLink v-for="p in neighbors" :key="p.id" :to="`/place/${p.id}`" class="chip">{{ p.name }}</RouterLink></div>
    </template>
  </Paper>
</template>

<style scoped>
.now-title { font: 21px/1.4 var(--f-show); letter-spacing: .02em; margin: 0; }
.sleeve { position: relative; margin: 0 0 8px; }
.sleeve img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 3px; display: block; }
.sleeve .tier { position: absolute; left: 8px; top: 8px; background: var(--paper); }
.facts { padding: 0 0 0 1.1em; margin: 0 0 8px; font-size: 14px; }
.facts li { margin: 0 0 6px; }
.facts a { font-size: 12px; color: var(--ink-2); }
.contact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.frame { position: relative; display: block; border-radius: 3px; overflow: hidden; }
.frame img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; transition: transform .4s var(--ease); }
.frame:hover img { transform: scale(1.03); }
.frame .tier { position: absolute; left: 4px; bottom: 4px; background: var(--paper); }
.chip { text-decoration: none; }
/* 后来：最新的一张在上，小幅错落 */
.laters { margin: 16px 0 0; }
.laters-head { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font: 600 13px/1.4 var(--f-ui); letter-spacing: .08em; color: var(--ink-2); }
.laters-head .n { font-weight: 400; font-size: 12px; letter-spacing: .04em; opacity: .7; }
.slip-stack { display: grid; margin: 0 0 10px; }
.slip-stack > * + * { margin-top: -6px; }
.slip-stack > *:nth-child(2n) { margin-left: 10px; }
.slip-stack > *:nth-child(3n) { margin-right: 6px; }
.later-form { margin: 10px 0 0; padding: 14px; border-radius: 5px; background-color: var(--wash); background-image: var(--grain); border: 1px solid var(--hair); }
.later-input { height: auto; min-height: 76px; padding: 10px 12px; line-height: 1.6; resize: vertical; }
.later-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 6px 0 2px; }
.later-meta .count { font-size: 12px; color: var(--ink-2); }
</style>
