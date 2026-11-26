<script setup>
// 合辑（学黄泰霖原型社区里的「主题合辑」、我的里的「共建唱片」）：
//   架上：官方征集的几张（种子是示意盘）+ 大家建的。封面是一张盘，每一段一道纹
//   打开一张：连着听 / 叠成一张（几个人的十秒刻进同一道纹）/ 放一段进去 / 拿出来
// 打开的是哪一张记在网址里（?album=），分享出去就是邀请：对方点开就能往里放。
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlbumDisc from './AlbumDisc.vue';
import DiscMini from './DiscMini.vue';
import { A, ALBUM, refreshAlbums, loadAlbum, albumById, itemsOf, albumLine, createAlbum, addTrack, takeOut, removeAlbum, playQueue, playMix, Q, stopQueue } from '../lib/albums.js';
import { L, play, title, byline, whenText, signature, say } from '../lib/library.js';

const p = defineProps({ only: { type: String, default: '' } });   // only = 'mine'：我的·共建，只列我建的和我放过的
const route = useRoute(), router = useRouter();
const openId = computed(() => route.query.album || null);
const open = computed(() => { void A.version; return openId.value ? albumById(openId.value) : null; });
const items = computed(() => { void A.version; void L.version; return itemsOf(open.value); });
const shelf = computed(() => { void A.version; const all = A.list.filter((a) => (p.only === 'mine' ? a.mine || a.joined : true)); return [...all.filter((a) => a.preset), ...all.filter((a) => !a.preset)]; });
const go = (album) => router.push({ path: route.path, query: { ...route.query, album: album || undefined } });
onMounted(refreshAlbums);
watch(openId, (id) => { if (id) loadAlbum(id); }, { immediate: true });

// 放一段进去：正在放的那张、我刻的（公开、已经发出去的）
const adding = ref(false), err = ref(''), busy = ref(false);
const inAlbum = computed(() => new Set(items.value.map((x) => x.e.id)));
const candidates = computed(() => {
  void L.version;
  const mine = L.entries.filter((e) => e.mine && e.tier === 'real' && e.visibility !== 'private' && !e.locked && !e.local).slice(-8).reverse();
  const pl = L.playing && L.playing.tier !== 'mix' && L.playing.tier !== 'archival' && !(L.playing.tier === 'real' && (L.playing.visibility === 'private' || L.playing.locked || L.playing.local)) ? [L.playing] : [];
  const seen = new Set();
  return [...pl, ...mine].filter((e) => !seen.has(e.id) && seen.add(e.id) && !inAlbum.value.has(e.id));
});
async function put(e) {
  err.value = ''; busy.value = true;
  try { await addTrack(open.value.id, e); adding.value = false; say(`放进「${open.value.name}」了。`); } catch (x) { err.value = x.message; }
  busy.value = false;
}
async function take(t) {
  try { await takeOut(t); say('拿出来了。'); } catch (x) { say(x.message); }
}
const confirmDel = ref(false);
async function del() {
  if (!confirmDel.value) { confirmDel.value = true; return; }
  try { await removeAlbum(open.value.id); go(null); say('这张合辑删掉了，放进去的声音本身还在。'); } catch (x) { say(x.message); }
  confirmDel.value = false;
}

// 建一张
const making = ref(false), name = ref(''), intro = ref('');
async function make() {
  err.value = '';
  try { const a = await createAlbum(name.value, intro.value); making.value = false; name.value = ''; intro.value = ''; go(a.id); say('建好了。先放一段进去，再把网址发给别人。'); } catch (x) { err.value = x.message; }
}
async function share() {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); say('网址复制好了：发给谁，谁就能往这张里放一段。'); } catch { say(url); }
}
const queuing = computed(() => Q.name && open.value && Q.name === open.value.id);
const people = computed(() => new Set(items.value.filter((x) => x.t).map((x) => x.t.mine ? 'me' : signature(x.t.author || {}) + x.t.at)).size);
</script>

<template>
  <section class="shelf">
    <template v-if="open">
      <button type="button" class="link fine" @click="go(null)">← 所有合辑</button>
      <div class="head">
        <AlbumDisc :items="items" :size="112" :name="open.name" :playing-id="L.playing && L.playing.id" />
        <div>
          <p class="kicker">{{ open.preset ? '征集中' : `${open.author && signature(open.author) !== '未落款' ? signature(open.author) : '没落款的人'}建的` }} · {{ albumLine(open) }}</p>
          <h2 class="h2 show">{{ open.name }}</h2>
          <p class="fine">{{ open.intro }}</p>
        </div>
      </div>
      <div class="row acts">
        <button type="button" class="btn small" :class="{ on: queuing }" :disabled="!items.length" @click="queuing ? stopQueue() : playQueue(items.map((x) => x.e), open.id)">{{ queuing ? `第 ${Q.i + 1} / ${Q.list.length} 段 · 停` : '一段接一段' }}</button>
        <button type="button" class="btn small ghost" :disabled="items.length < 2" @click="playMix(open, items.map((x) => x.e))">叠成一张</button>
        <button type="button" class="btn small ghost" @click="adding = !adding; err = ''">{{ adding ? '算了' : '放一段进去' }}</button>
        <button type="button" class="link fine" @click="share">邀请别人一起放</button>
      </div>
      <p class="fine">「叠成一张」：最多 {{ ALBUM.mixMax }} 段，各自拉到一样响，叠进同一张十秒的盘里放，刻纹也是叠出来的。几个人在不同年份、不同地方的十秒，同时响。</p>

      <div v-if="adding" class="add">
        <p class="fine" style="margin: 0 0 8px">只收公开的、已经发出去的：正在放的那张，或者你刻的。</p>
        <button v-for="e in candidates" :key="e.id" type="button" class="pick" :disabled="busy" @click="put(e)">
          <DiscMini :e="e" :size="30" /><span>{{ title(e) }}<i>{{ e.place }} · {{ e.mine ? '我刻的' : '正在放的' }}</i></span>
        </button>
        <p v-if="!candidates.length" class="fine">先放一张想放的（随手遇见、地点里都可以），或者按住下面那颗钮刻一段，再回来。</p>
        <p class="err" role="alert">{{ err }}</p>
      </div>

      <p class="h3">{{ items.length }} 段{{ people ? ` · ${people} 人放过` : '' }}</p>
      <ol class="tracks">
        <li v-for="(x, i) in items" :key="x.id" :class="{ on: L.playing && L.playing.id === x.e.id }">
          <button type="button" class="tr" @click="stopQueue(); play(x.e)">
            <span class="n">{{ i + 1 }}</span>
            <DiscMini :e="x.e" :size="34" />
            <span class="txt"><span class="t">{{ title(x.e) }}</span><span class="m">{{ [x.e.place, whenText(x.e)].filter(Boolean).join(' · ') }}</span></span>
            <span class="who">{{ x.seed ? '示意' : x.t.mine ? '我放的' : `${x.t.author && signature(x.t.author) !== '未落款' ? signature(x.t.author) : '没落款的人'}放的` }}</span>
          </button>
          <button v-if="x.t && x.t.canTake" type="button" class="link fine out" @click="take(x.t)">拿出来</button>
        </li>
      </ol>
      <p v-if="A.online === false" class="fine">连不上云：只看得到示意的几段，放不进去。</p>
      <button v-if="open.mine" type="button" class="link fine" style="margin-top: 14px" @click="del">{{ confirmDel ? '再点一次，删掉这张合辑' : '删掉这张合辑' }}</button>
    </template>

    <template v-else>
      <p class="fine" style="margin: 12px 0">{{ only === 'mine' ? '我建的、我往里放过一段的合辑。' : '一张合辑是大家往同一张盘里放的声音：官方征集的几张，和任何人建的。可以一段接一段听，也可以叠成一张。' }}</p>
      <div class="grid">
        <button v-for="a in shelf" :key="a.id" type="button" class="al" @click="go(a.id)">
          <AlbumDisc :items="itemsOf(a)" :size="58" :name="a.name" />
          <span class="txt"><b class="show">{{ a.name }}</b><span>{{ a.intro }}</span><i>{{ a.preset ? '征集 · ' : '' }}{{ albumLine(a) }}{{ a.mine ? ' · 我建的' : a.joined ? ' · 我放过' : '' }}</i></span>
        </button>
      </div>
      <p v-if="only === 'mine' && !shelf.length" class="fine">还没有。去<RouterLink :to="{ path: '/community', query: { tab: 'albums' } }">社区的合辑</RouterLink>里放一段，或者建一张。</p>
      <template v-if="only !== 'mine'">
        <button v-if="!making" type="button" class="btn small ghost" style="margin-top: 14px" @click="making = true">建一张合辑</button>
        <form v-else class="make" @submit.prevent="make">
          <input v-model="name" class="input" :maxlength="ALBUM.nameMax" placeholder="合辑名（2 到 16 个字），比如：考试周的图书馆" aria-label="合辑名">
          <input v-model="intro" class="input" :maxlength="ALBUM.introMax" placeholder="一句介绍（可以不写）" aria-label="一句介绍">
          <p class="err" role="alert">{{ err }}</p>
          <div class="row"><button type="submit" class="btn small" :disabled="name.trim().length < ALBUM.nameMin">建</button><button type="button" class="btn small ghost" @click="making = false">算了</button></div>
        </form>
      </template>
    </template>
  </section>
</template>

<style scoped>
.head { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; margin: 14px 0 12px; }
.head .h2 { margin: 2px 0 6px; }
.acts { flex-wrap: wrap; gap: 6px; align-items: center; }
.add { margin: 12px 0 0; padding: 12px; border-radius: 4px; background: var(--wash); border: 1px solid var(--hair); }
.pick { display: flex; gap: 10px; align-items: center; width: 100%; padding: 6px 6px; margin: 0 -6px; border: 0; border-top: 1px solid var(--hair); background: none; text-align: left; font-size: 14px; transition: background-color .16s; }
.pick:hover { background: color-mix(in srgb, var(--paper) 55%, transparent); }
.pick i { display: block; font-style: normal; font-size: 12px; color: var(--ink-2); }
.tracks { list-style: none; padding: 0; margin: 0; }
.tracks li { position: relative; border-top: 1px solid var(--hair); }
.tr { display: grid; grid-template-columns: 18px auto 1fr auto; gap: 10px; align-items: center; width: 100%; padding: 8px 6px; margin: 0 -6px; border: 0; background: none; text-align: left; transition: background-color .16s; }
.tr:hover { background: var(--wash); }
.tr .n { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.tr .t { display: block; font: 16px/1.35 var(--f-show); }
.tr .m { display: block; font-size: 12px; color: var(--ink-2); }
.tr .who { font-size: 12px; color: var(--ink-2); }
.tracks li.on .t::before { content: ''; display: inline-block; width: 7px; height: 7px; margin: 0 7px 2px 0; border-radius: 50%; background: var(--scope); }
.out { position: absolute; right: 0; bottom: 4px; }
.tracks li:has(.out) .tr { padding-bottom: 20px; }
.grid { display: grid; gap: 4px; }
.al { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; padding: 10px 6px; border: 0; border-top: 1px solid var(--hair); background: none; text-align: left; }
.al:hover { background: var(--wash); }
.al .txt { display: grid; gap: 2px; }
.al b { font-size: 17px; font-weight: 400; }
.al span span { font-size: 13px; color: var(--ink-2); }
.al i { font-style: normal; font-size: 12px; color: var(--ink-2); }
.make { display: grid; gap: 8px; margin-top: 14px; }
</style>
