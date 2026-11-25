<script setup>
// 社区（众人）：别人听见了什么、在说什么。结构学黄泰霖原型的社区，加上贴吧式的帖子与楼层。
//   广场：帖子流（最新 / 热门），按话题筛，写一帖
//   话题：预置的和用户建的 #话题，一个话题一个广场
//   接力：一人一棒，链从第一棒排到最后一棒
//   多机位：同一个地方、前后半小时里的几段录音，自动归成「一场」，切机位从同一秒接着放
//   看板：心情、地点 × 钟点、舞台上光柱的口径
//   合辑：官方征集的和大家建的合辑，一段接一段听或叠成一张（学黄泰霖原型的主题合辑与共建唱片）
//   声音：随手遇见、钉在某一秒的话
// 页面状态放在网址里（?tab=&topic=&post=），分享出去、按 F5 都还在原处。
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import DiscMini from '../components/DiscMini.vue';
import PostCard from '../components/PostCard.vue';
import PostThread from '../components/PostThread.vue';
import Compose from '../components/Compose.vue';
import DataPanel from '../components/DataPanel.vue';
import AlbumShelf from '../components/AlbumShelf.vue';
import { playQueue, A, albumById, itemsOf } from '../lib/albums.js';
import { L, columns, isPublic, play, entryById, title, echoByline, refresh as refreshLib, whenText, byline } from '../lib/library.js';
import { C, init, refresh, feed, topicById, topicCount, chains, scenes, sameSlot, moodTally, moodPlaces, heat, loadStats, ago } from '../lib/community.js';
import { ui } from '../lib/ui.js';
import { clock, cnHour, goHour } from '../lib/clock.js';
import { hourColor } from '../lib/wave.js';
import * as stage from '../stage/stage.js';

const route = useRoute(), router = useRouter();
const TABS = [['square', '广场'], ['topics', '话题'], ['relay', '接力'], ['scene', '多机位'], ['albums', '合辑'], ['board', '看板'], ['sound', '声音']];
const tab = computed(() => route.query.tab || 'square');
const view = computed(() => (route.query.map === 'data' ? 'data' : 'plain'));   // 原始地图 / 数据地图（学黄泰霖原型）
const topic = computed(() => route.query.topic || null);
const postId = computed(() => route.query.post || null);
const go = (q) => router.push({ path: '/community', query: { ...q } });
const sort = ref('new');
const writing = ref(!!ui.compose);

onMounted(() => { init(); loadStats(); });
const timer = setInterval(() => { if (!document.hidden) { refresh(); refreshLib(); } }, 20000);
onBeforeUnmount(() => { clearInterval(timer); stage.setColumns(new Map()); });

// —— 广场 ——
const list = computed(() => { void C.version; return feed({ sort: sort.value, topic: topic.value }); });
const curTopic = computed(() => (topic.value ? topicById(topic.value) : null));
function onPosted(p) { writing.value = false; go({ post: p.id }); }

// —— 话题 ——
const topicsSorted = computed(() => { void C.version; return [...C.topics].map((t) => ({ ...t, n: topicCount(t.id) })).sort((a, b) => b.n - a.n || (a.preset === b.preset ? 0 : a.preset ? -1 : 1)); });

// —— 接力 ——
const chainList = computed(() => { void C.version; return chains(); });
function startRelay() { ui.compose = { text: '', topics: ['tp-jieli'], placeId: null, mood: null, soundId: null, relayStart: true }; writing.value = true; go({}); }

// —— 多机位 ——
const realScenes = computed(() => scenes());
const demoScenes = computed(() => sameSlot());
const sceneOpen = ref(null), cam = ref(0);
async function switchCam(group, i) {
  const t = stage.playing() && L.playing && group.some((e) => e.id === L.playing.id) ? stage.position() : 0;
  cam.value = i;
  await play(group[i], { seek: Math.min(t, (group[i].seconds || 10) - 0.2) });
}
function openScene(k, group) { sceneOpen.value = sceneOpen.value === k ? null : k; cam.value = 0; if (sceneOpen.value) play(group[0]); }

// —— 看板 ——
const LAYERS = [
  { id: 'all', name: '全部', test: () => true, say: '每根光柱是一个地方，高度是这里留下的张数。' },
  { id: 'sem', name: '本学期', test: (e) => e.semester === L.nowSem, say: '只数这个学期留下的。' },
  { id: 'hour', name: '这个钟点', test: (e) => e.hour != null && Math.min(Math.abs(e.hour - clock.shown), 24 - Math.abs(e.hour - clock.shown)) < 1.5, say: '只数前后一个半小时里录的：这个钟点，哪里最热闹。' },
  { id: 'real', name: '只数真实', test: (e) => e.tier === 'real', say: '只数同学亲手刻的。' },
];
const layer = ref('all');
// 打开一张合辑时，光柱只数这张合辑里的：一眼看出这张盘是从哪些地方凑起来的
const albumOpen = computed(() => { void A.version; return tab.value === 'albums' && route.query.album ? albumById(route.query.album) : null; });
function paint() {
  if (view.value === 'data') return;
  if (albumOpen.value) { const ids = new Set(itemsOf(albumOpen.value).map((x) => x.e.id)); stage.setColumns(columns((e) => ids.has(e.id))); return; }
  const L0 = LAYERS.find((x) => x.id === layer.value); stage.setColumns(columns((e) => isPublic(e) && e.tier !== 'archival' && L0.test(e)));
}
watch([layer, view, albumOpen, () => A.version, () => L.version, () => Math.round(clock.shown * 2)], paint, { immediate: true });
const moods = computed(() => { void C.version; void C.stats; return moodTally(); });
const moodMax = computed(() => Math.max(1, ...moods.value.map((m) => m.real + m.demo)));
const moodPick = ref(null);
const onlyReal = ref(false);
const grid = computed(() => heat(onlyReal.value));
const gridMax = computed(() => Math.max(1, ...[...grid.value.values()].flat()));

// —— 声音 ——
const pub = computed(() => { void L.version; return L.entries.filter((e) => isPublic(e) && e.tier !== 'archival'); });
const seed = ref(0);
const meet = computed(() => { void seed.value; const a = pub.value.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 4); });
const echoFeed = computed(() => L.feed.map((x) => ({ x, e: entryById(x.discId) })).filter((y) => y.e).slice(0, 12));
</script>

<template>
  <Paper label="社区">
    <template v-if="postId">
      <PostThread :id="postId" @back="go({ tab: 'square', ...(topic ? { topic } : {}) })" @topic="(t) => go({ topic: t })" @relay="writing = true; go({})" />
    </template>
    <template v-else>
      <p class="kicker">众人 · {{ C.demo.length + C.posts.length }} 帖 · {{ pub.length }} 张公开的盘</p>
      <h1 class="h1">{{ curTopic ? `#${curTopic.name}` : view === 'data' ? '校园的声音长什么样' : '别人听见了什么' }}</h1>
      <div class="seg" role="tablist" aria-label="地图">
        <button type="button" role="tab" :aria-selected="view === 'plain'" :class="{ on: view === 'plain' }" @click="go({ tab: tab === 'board' ? 'square' : tab })">原始地图</button>
        <button type="button" role="tab" :aria-selected="view === 'data'" :class="{ on: view === 'data' }" @click="go({ map: 'data' })">数据地图</button>
      </div>
      <DataPanel v-if="view === 'data'" />
      <template v-else>
      <p v-if="curTopic" class="lede">{{ curTopic.intro || '用户建的话题。' }} <button type="button" class="link fine" @click="go({})">回到全部</button></p>
      <nav class="tabs" aria-label="社区">
        <button v-for="t in TABS" :key="t[0]" type="button" class="tab" :class="{ on: tab === t[0] }" :aria-current="tab === t[0] ? 'page' : undefined" @click="go({ tab: t[0] })">{{ t[1] }}</button>
      </nav>

      <!-- 广场 -->
      <section v-if="tab === 'square'">
        <div class="bar">
          <div class="row" role="radiogroup" aria-label="排序">
            <button type="button" role="radio" class="chip" :class="{ on: sort === 'new' }" :aria-checked="sort === 'new'" @click="sort = 'new'">最新</button>
            <button type="button" role="radio" class="chip" :class="{ on: sort === 'hot' }" :aria-checked="sort === 'hot'" @click="sort = 'hot'">热门</button>
          </div>
          <button v-if="!writing" type="button" class="btn small" @click="ui.compose = ui.compose || { text: '', topics: topic ? [topic] : [], placeId: null, mood: null, soundId: null }; writing = true">写一帖</button>
        </div>
        <Compose v-if="writing" @done="onPosted" @cancel="writing = false" />
        <p v-if="C.online === false" class="fine">连不上云：现在看到的是示例帖，发帖和回复要等连上。</p>
        <PostCard v-for="p in list" :key="p.id" :post="p" @open="(x) => go({ post: x.id })" @topic="(t) => go({ topic: t })" />
        <p v-if="!list.length" class="fine" style="margin-top: 16px">这个话题下还没有帖子。写第一帖。</p>
      </section>

      <!-- 话题 -->
      <section v-else-if="tab === 'topics'">
        <p class="fine" style="margin: 12px 0">一个话题一个广场。发帖时带上 #话题，就会出现在这里；没有合适的，发帖时可以自己建一个。</p>
        <div class="topic-grid">
          <button v-for="t in topicsSorted" :key="t.id" type="button" class="topic" @click="go({ topic: t.id })">
            <b class="show">#{{ t.name }}</b>
            <span>{{ t.intro || '用户建的话题' }}</span>
            <i>{{ t.n }} 帖{{ t.preset ? '' : ' · 用户建' }}</i>
          </button>
        </div>
      </section>

      <!-- 接力 -->
      <section v-else-if="tab === 'relay'">
        <p class="fine" style="margin: 12px 0">一个人录一段，写下「下一棒去哪」；下一个人接着录。学 Instagram 的 Add Yours 和微信接龙：每一棒都附一段声音，第几棒由服务端数。</p>
        <button type="button" class="btn small" @click="startRelay">发起一条接力</button>
        <article v-for="ch in chainList" :key="ch[0].relayRoot" class="chain">
          <header><b class="show">{{ ch[0].text.slice(0, 30) }}{{ ch[0].text.length > 30 ? '…' : '' }}</b><span class="fine">{{ ch.length }} 棒 · 最近一棒 {{ ago(ch.at(-1).at) }}</span></header>
          <ol>
            <li v-for="x in ch" :key="x.id">
              <button type="button" class="baton" @click="go({ post: x.id })">
                <span class="n">{{ x.relayIndex }}</span>
                <DiscMini v-if="x.soundId && entryById(x.soundId)" :e="entryById(x.soundId)" :size="40" />
                <span class="pl">{{ x.placeId ? L.placeById.get(x.placeId).name : '' }}</span>
              </button>
            </li>
            <li><button type="button" class="baton next" @click="go({ post: ch.at(-1).id })"><span class="n">+</span><span class="pl">接一棒</span></button></li>
          </ol>
          <button type="button" class="link fine" @click="playQueue(ch.map((x) => x.soundId && entryById(x.soundId)), ch[0].relayRoot)">从第一棒连着听</button>
        </article>
      </section>

      <!-- 多机位 -->
      <section v-else-if="tab === 'scene'">
        <p class="fine" style="margin: 12px 0">同一个地方、前后半小时里有几个人在录，就自动归成「一场」。不用约，正常刻就会长出来。切机位时从同一秒接着放。答辩那天大家一起按住，现场就是一场。</p>
        <p class="h3">真实的 · {{ realScenes.length }} 场</p>
        <p v-if="!realScenes.length" class="fine">还没有。两个人在同一个地方、半小时内各刻一段，这里就有第一场。</p>
        <article v-for="(g, k) in realScenes" :key="g[0].id" class="scene">
          <button type="button" class="scene-h" :aria-expanded="sceneOpen === `r${k}`" @click="openScene(`r${k}`, g)"><b class="show">{{ g[0].place }}</b><span class="fine">{{ whenText(g[0]) }} · {{ g.length }} 个机位</span></button>
          <div v-if="sceneOpen === `r${k}`" class="cams">
            <button v-for="(e, i) in g" :key="e.id" type="button" class="cam" :class="{ on: cam === i }" @click="switchCam(g, i)"><DiscMini :e="e" :size="36" /><span>机位 {{ i + 1 }}</span><i>{{ byline(e) }}</i></button>
          </div>
        </article>
        <p class="h3">示意 · 同一学期、同一时段、同一个地方</p>
        <p class="fine">页面合成的声音，只用来看多机位长什么样。</p>
        <article v-for="(g, k) in demoScenes" :key="g[0].id" class="scene">
          <button type="button" class="scene-h" :aria-expanded="sceneOpen === `d${k}`" @click="openScene(`d${k}`, g)"><b class="show">{{ g[0].place }}</b><span class="fine">{{ whenText(g[0]) }} · {{ g.length }} 个机位 · 示意</span></button>
          <div v-if="sceneOpen === `d${k}`" class="cams">
            <button v-for="(e, i) in g" :key="e.id" type="button" class="cam" :class="{ on: cam === i }" @click="switchCam(g, i)"><DiscMini :e="e" :size="36" /><span>机位 {{ i + 1 }}</span><i>{{ title(e) }}</i></button>
          </div>
        </article>
      </section>

      <!-- 合辑 -->
      <section v-else-if="tab === 'albums'">
        <AlbumShelf />
      </section>

      <!-- 看板 -->
      <section v-else-if="tab === 'board'">
        <p class="fine" style="margin-top: 12px">舞台上每根光柱是一个地方，高度是这里留下的张数。想换一种画法、只看某个钟点，去<button type="button" class="link" @click="go({ map: 'data' })">数据地图</button>。</p>

        <p class="h3">心情</p>
        <p class="fine">心情是发帖的人自己选的，不从声音里猜。深色是真实的帖子（n = {{ moods.reduce((s, m) => s + m.real, 0) }}），浅色是示例帖（n = {{ moods.reduce((s, m) => s + m.demo, 0) }}）。点一种心情，看同样心情的人在哪儿。</p>
        <div class="moods">
          <button v-for="m in moods" :key="m.id" type="button" class="mood" :class="{ on: moodPick === m.id }" @click="moodPick = moodPick === m.id ? null : m.id">
            <span class="nm">{{ m.name }}</span>
            <span class="bar2"><i class="r" :style="{ width: `${(m.real / moodMax) * 100}%` }"></i><i class="d" :style="{ width: `${(m.demo / moodMax) * 100}%` }"></i></span>
            <span class="n">{{ m.real + m.demo }}</span>
          </button>
        </div>
        <p v-if="moodPick" class="fine">「{{ moods.find((m) => m.id === moodPick).name }}」最多的地方：<template v-for="([pid, n], i) in moodPlaces(moodPick)" :key="pid"><button type="button" class="link" @click="router.push(`/place/${pid}`)">{{ L.placeById.get(pid).name }}</button> {{ n }}<template v-if="i < moodPlaces(moodPick).length - 1">、</template></template><template v-if="!moodPlaces(moodPick).length">还没有。</template></p>

        <p class="h3">地点 × 钟点</p>
        <label class="fine"><input v-model="onlyReal" type="checkbox"> 只数真实录音</label>
        <div class="heat" role="img" :aria-label="`16 个地点、24 个钟点各有几张声音${onlyReal ? '（只数真实录音）' : ''}`">
          <div class="hrow head"><span></span><i v-for="h in 24" :key="h">{{ (h - 1) % 6 === 0 ? h - 1 : '' }}</i></div>
          <div v-for="p in L.places" :key="p.id" class="hrow">
            <button type="button" class="pn" @click="router.push(`/place/${p.id}`)">{{ p.name }}</button>
            <button v-for="(n, h) in grid.get(p.id)" :key="h" type="button" class="cell" :title="`${p.name} · ${h} 时 · ${n} 张`" :style="{ background: n ? hourColor(h + 0.5) : 'transparent', opacity: n ? 0.25 + 0.75 * (n / gridMax) : 1 }" @click="goHour(h + 0.5, { label: `${h} 时的学院路` })"></button>
          </div>
        </div>
        <p class="fine">格子的颜色是那个钟点的天色，越深这里那个钟点的声音越多。点一格，整站变成那个钟点。</p>
      </section>

      <!-- 声音 -->
      <section v-else>
        <p class="h3">刚刚有人说</p>
        <ol v-if="echoFeed.length" class="echo-feed">
          <li v-for="y in echoFeed" :key="y.x.id">
            <button type="button" class="say" @click="play(y.e, { seek: Math.max(0, y.x.t - 0.4) })">
              <span class="q">「{{ y.x.text }}」</span>
              <span class="m">钉在 {{ y.e.place }} · {{ title(y.e) }} 的第 {{ y.x.t.toFixed(1) }} 秒{{ echoByline(y.x) ? ` · ${echoByline(y.x)}` : '' }}</span>
            </button>
          </li>
        </ol>
        <p v-else class="fine">{{ L.online === false ? '连不上云，看不到别人刚说的话。' : '还没有人钉过话。放一张，在你想说话的那一秒钉一句。' }}</p>
        <p class="h3">随手遇见 <button type="button" class="link fine" @click="seed++">换一批</button></p>
        <p class="fine" style="margin-top: -4px">纯随机，没有推荐算法。</p>
        <ol class="discs"><DiscRow v-for="e in meet" :key="e.id" :e="e" /></ol>
        <p class="fine" style="margin-top: 18px">想把几段放在一起听，去<button type="button" class="link" @click="go({ tab: 'albums' })">合辑</button>。</p>
      </section>
      </template>
    </template>
  </Paper>
</template>

<style scoped>
.seg { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--wash); box-shadow: inset 0 0 0 1px var(--hair); margin: 0 0 14px; }
.seg button { border: 0; background: none; padding: 6px 14px; border-radius: 999px; font: 14px var(--f-show); letter-spacing: .06em; color: var(--ink-2); }
.seg button.on { background: var(--ink); color: var(--paper); }
.tabs { display: flex; gap: 2px; margin: 4px -4px 0; overflow-x: auto; border-bottom: 1px solid var(--hair); scrollbar-width: none; }
.tab { flex: none; padding: 9px 7px 10px; border: 0; background: none; font: 15px var(--f-show); letter-spacing: .02em; color: var(--ink-2); position: relative; }
.tab.on { color: var(--ink); }
.tab.on::after { content: ''; position: absolute; left: 7px; right: 7px; bottom: -1px; height: 2px; background: var(--ink); }
.tab.on::before { content: ''; position: absolute; left: 50%; bottom: -4px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%; background: var(--scope); }
.bar { display: flex; justify-content: space-between; align-items: center; margin: 14px 0 6px; }
.topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.topic { display: grid; gap: 4px; padding: 12px; border-radius: 3px; border: 1px solid var(--hair); background: var(--wash); text-align: left; }
.topic b { font-size: 16px; }
.topic span { font-size: 12px; color: var(--ink-2); line-height: 1.5; }
.topic i { font-style: normal; font-size: 11px; color: var(--ink-2); }
.topic:hover { border-color: var(--line); }
.chain { margin: 16px 0 0; padding: 14px 0 0; border-top: 1px solid var(--hair); }
.chain header { display: grid; gap: 2px; margin: 0 0 10px; }
.chain ol { list-style: none; padding: 0; margin: 0 0 8px; display: flex; gap: 4px; overflow-x: auto; }
.baton { display: grid; justify-items: center; gap: 4px; width: 64px; border: 0; background: none; padding: 4px 0; position: relative; }
.baton .n { font: 600 11px var(--f-ui); }
.baton .pl { font-size: 11px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 64px; }
.baton.next .n { width: 40px; height: 40px; border-radius: 50%; border: 1.5px dashed var(--line); display: grid; place-items: center; font-size: 18px; color: var(--ink-2); margin-top: 15px; }
.scene { border-top: 1px solid var(--hair); }
.scene-h { display: grid; width: 100%; gap: 2px; padding: 10px 0; border: 0; background: none; text-align: left; }
.scene-h b { font-size: 16px; }
.cams { display: flex; gap: 6px; padding: 0 0 12px; overflow-x: auto; }
.cam { flex: none; display: grid; justify-items: center; gap: 3px; width: 86px; padding: 8px 4px; border-radius: 3px; border: 1px solid var(--hair); background: none; }
.cam span { font-size: 12px; }
.cam i { font-style: normal; font-size: 10px; color: var(--ink-2); max-width: 78px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cam.on { border-color: var(--ink); box-shadow: inset 0 -3px 0 var(--scope); }
.moods { display: grid; gap: 4px; margin: 10px 0; }
.mood { display: grid; grid-template-columns: 44px 1fr 30px; align-items: center; gap: 8px; padding: 4px 0; border: 0; background: none; text-align: left; }
.mood .nm { font: 15px var(--f-show); }
.bar2 { display: flex; height: 10px; border-radius: 2px; background: var(--hair); overflow: hidden; }
.bar2 .r { background: var(--ink); }
.bar2 .d { background: var(--line); }
.mood .n { font-size: 12px; color: var(--ink-2); text-align: right; }
.mood.on .nm { box-shadow: inset 0 -2px 0 var(--scope); }
.heat { margin: 10px 0 6px; font-size: 10px; }
.hrow { display: grid; grid-template-columns: 76px repeat(24, 1fr); gap: 1px; align-items: center; }
.hrow.head i { font-style: normal; color: var(--ink-2); }
.pn { border: 0; background: none; padding: 0 4px 0 0; font-size: 11px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
.cell { height: 12px; border: 0; padding: 0; border-radius: 1px; outline: 1px solid var(--hair); outline-offset: -1px; }
.echo-feed { list-style: none; padding: 0; margin: 0; }
.say { display: block; width: 100%; text-align: left; border: 0; border-top: 1px solid var(--hair); background: none; padding: 10px 0; }
.say .q { font: 17px/1.5 var(--f-show); display: block; }
.say .m { font-size: 12px; color: var(--ink-2); }
.sets { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.set { display: flex; justify-content: space-between; align-items: baseline; padding: 12px; border-radius: 3px; border: 1px solid var(--hair); background: var(--wash); text-align: left; }
.set b { font-size: 16px; }
.set span { font-size: 12px; color: var(--ink-2); }
.set.on { border-color: var(--ink); background: var(--paper); box-shadow: inset 3px 0 0 var(--scope); }
</style>
