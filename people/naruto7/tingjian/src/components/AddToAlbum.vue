<script setup>
// 「放进合辑」：地点页里正在放的那张，点一下列出合辑，选一张就放进去。
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { A, refreshAlbums, addTrack, itemsOf } from '../lib/albums.js';
import { say } from '../lib/library.js';

const p = defineProps({ e: Object });
const router = useRouter();
const open = ref(false), busy = ref(false);
const can = computed(() => p.e && p.e.tier !== 'archival' && p.e.tier !== 'mix' && !(p.e.tier === 'real' && (p.e.visibility === 'private' || p.e.locked || p.e.local)));
const list = computed(() => { void A.version; return A.list.map((a) => ({ a, has: itemsOf(a).some((x) => x.e.id === p.e.id) })); });
async function toggle() { open.value = !open.value; if (open.value) await refreshAlbums(); }
async function put(a) {
  busy.value = true;
  try { await addTrack(a.id, p.e); open.value = false; say(`放进「${a.name}」了。`); } catch (x) { say(x.message); }
  busy.value = false;
}
</script>

<template>
  <span v-if="can" class="ata">
    <button type="button" class="btn small ghost" :aria-expanded="open" @click="toggle">放进合辑</button>
    <div v-if="open" class="menu">
      <button v-for="x in list" :key="x.a.id" type="button" class="it" :disabled="busy || x.has" @click="put(x.a)">{{ x.a.name }}<i>{{ x.has ? '已经在里面' : x.a.preset ? '征集' : '' }}</i></button>
      <button type="button" class="link fine" @click="router.push({ path: '/community', query: { tab: 'albums' } })">建一张新的</button>
    </div>
  </span>
</template>

<style scoped>
.ata { position: relative; display: inline-block; }
.menu { position: absolute; z-index: 5; left: 0; top: 36px; width: 230px; padding: 6px; border-radius: 4px; background: var(--paper); box-shadow: 0 1px 0 var(--hair), 0 16px 40px -12px rgb(0 0 0 / .35); display: grid; }
.it { display: flex; justify-content: space-between; gap: 8px; padding: 8px 6px; border: 0; border-top: 1px solid var(--hair); background: none; text-align: left; font: 15px var(--f-show); }
.it:first-child { border-top: 0; }
.it i { font: 12px var(--f-ui); font-style: normal; color: var(--ink-2); }
.it[disabled] { opacity: .5; }
.menu .link { padding: 8px 6px 4px; text-align: left; }
</style>
