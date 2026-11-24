<script setup>
// 地点（一栋楼）：舞台上这栋楼被从模型里提起来，落在一只纸台座上慢慢转；盘面压暗、移轴虚化成轮廓（stage.js）。
// 纸上：这里的年轮、这里的从前（史料）、这里的照片、这里的每一张。
import { computed, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import RingDial from '../components/RingDial.vue';
import EchoBand from '../components/EchoBand.vue';
import { L, atPlace, placeLine, play, isPublic, toggleHeard, toggleFav, isFav, title } from '../lib/library.js';
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
async function loadPhotos() {
  photos.value = [];
  const r = await request('GET', `/places/${pid.value}/photos`);
  if (r.ok) photos.value = r.json.photos;
}
watch(pid, (v) => {
  if (!L.placeById.has(v)) { router.replace('/'); return; }
  loadPhotos();
  // 进来就放这里最新的一张（没有就放史料），但不改正在放的、别处的那张以外的东西
  if (!L.playing || L.playing.placeId !== v) {
    const e = voices.value.find((x) => x.tier === 'real' && x.mine) || real.value[0] || voices.value[0] || past.value[0];
    if (e) play(e, { auto: false });
  }
}, { immediate: true });
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
      </div>
    </template>

    <p class="h3">这里的年轮</p>
    <RingDial :list="voices" :size="300" />

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
.now-title { font: 20px/1.4 var(--f-show); margin: 0; }
.sleeve { position: relative; margin: 0 0 8px; }
.sleeve img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 3px; display: block; }
.sleeve .tier { position: absolute; left: 8px; top: 8px; background: var(--paper); }
.facts { padding: 0 0 0 1.1em; margin: 0 0 8px; font-size: 14px; }
.facts li { margin: 0 0 6px; }
.facts a { font-size: 12px; color: var(--ink-2); }
.contact { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.frame { position: relative; display: block; }
.frame img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; border-radius: 2px; }
.frame .tier { position: absolute; left: 4px; bottom: 4px; background: var(--paper); }
.chip { text-decoration: none; }
</style>
