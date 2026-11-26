<script setup>
// 我的（我）：我留下了什么、谁回应了我。结构学黄泰霖原型的「我的」（我的地图、收藏馆、收件箱），加上刻声卡与心事盘。
// 舞台上：只有我的盘亮成示波黄，别人的褪成灰。
import { computed, ref, onMounted } from 'vue';
import Paper from '../components/Paper.vue';
import DiscRow from '../components/DiscRow.vue';
import RingWood from '../components/RingWood.vue';
import PostCard from '../components/PostCard.vue';
import AlbumShelf from '../components/AlbumShelf.vue';
import CardSlip from '../components/CardSlip.vue';
import SealMark from '../components/SealMark.vue';
import { S, probe, pushSig, leave } from '../lib/seal.js';
import { A, refreshAlbums } from '../lib/albums.js';
import { useRouter } from 'vue-router';
import { C, init as initCommunity } from '../lib/community.js';
import { L, unread, markRead, entryById, play, signature, setSignature, exportCard, importCard, deleteDisc, refresh, title, say, atPlace, laterOf } from '../lib/library.js';

const router = useRouter();
const tab = ref('discs');
const mine = computed(() => { void L.version; return L.entries.filter((e) => e.mine).slice().reverse(); });
const favs = computed(() => L.me.favs.map(entryById).filter(Boolean));
const inboxAll = computed(() => L.me.inbox.map((x) => ({ ...x, e: x.discId ? entryById(x.discId) : null, fresh: x.at > (L.readAt || '') })).filter((x) => x.e || x.postId || x.albumId));
// 类型：声音上的（钉的话、也听过）、帖子上的（回复、共鸣、我也是）
const KINDS = [['all', '全部'], ['sound', '声音上的', ['echo', 'heard']], ['post', '帖子上的', ['reply', 'hug', 'same']], ['album', '合辑里的', ['track']]];
const kind = ref('all');
const inbox = computed(() => { const k = KINDS.find((x) => x[0] === kind.value); return k[2] ? inboxAll.value.filter((x) => k[2].includes(x.kind)) : inboxAll.value; });
const myPosts = computed(() => { void C.version; return C.posts.filter((p) => p.mine); });
const KIND = { echo: '钉了一句话', heard: '也听过', reply: '回了你', hug: '和你共鸣', same: '说「我也是」', track: '往你的合辑里放了一段' };
const together = computed(() => { void A.version; return A.list.filter((a) => a.mine || a.joined).length; });
function openMsg(x) {
  if (x.kind === 'track') { tab.value = 'albums'; router.push({ path: '/mine', query: { album: x.albumId } }); return; }
  if (x.postId) router.push({ path: '/community', query: { post: x.postId } });
  else play(x.e, { seek: x.kind === 'echo' ? Math.max(0, x.t - 0.4) : null });
}
// 「后来」：我刻的盘下面露出最新的一条；还没有、又刻了一阵的，轻轻提醒一句（不动原文，只多一张纸签）
const daysSince = (e) => (e.at ? Math.max(0, Math.floor((Date.now() - Date.parse(e.at)) / 864e5)) : 0);
const newestLater = (e) => { void L.version; return laterOf(e.id)[0] || null; };
const clipText = (s) => (String(s).length > 24 ? `${String(s).slice(0, 24)}…` : String(s));
function openLater(e) { router.push(`/place/${e.placeId}?play=${encodeURIComponent(e.id)}`); }
const places = computed(() => new Set(mine.value.map((e) => e.placeId)).size);
const sems = computed(() => new Set(mine.value.map((e) => e.semester)).size);
// 唱片架：十六个地方各一张唱片，预览取我刻得最多的前六处（没刻过的也排上，撑满一排）
const sleeveBase = import.meta.env.BASE_URL;
const shelfPeek = computed(() => {
  void L.version;
  return L.places.map((p) => ({ p, n: atPlace(p.id).filter((e) => e.mine).length })).sort((a, b) => b.n - a.n).slice(0, 6);
});
function openShelf() { router.push('/shelf?from=mine'); }
const sig = ref({ grade: L.identity?.grade || '', dept: L.identity?.dept || '', name: L.identity?.name || '' });
const editing = ref(false);
function saveSig() { setSignature(sig.value); pushSig(sig.value); editing.value = false; say(`落款改好了：以后刻的盘用新落款，已经刻的不变。${S.account ? '换设备时跟着学号过去。' : ''}`); }
function stamped() { sig.value = { grade: L.identity?.grade || '', dept: L.identity?.dept || '', name: L.identity?.name || '' }; initCommunity(); refreshAlbums(); }
const leaving = ref(false);
function out() { if (!leaving.value) { leaving.value = true; return; } leave(); }
function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(exportCard());
  a.download = '刻声卡.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function pickCard(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  try { importCard(await f.text()); } catch (x) { say(`没导入：${x.message}`); }
}
const confirmId = ref(null);
async function del(e) {
  if (confirmId.value !== e.id) { confirmId.value = e.id; return; }
  confirmId.value = null;
  if (await deleteDisc(e)) say('删掉了。云上的声音、钉在上面的话一并删了。');
}
onMounted(() => { refresh(); initCommunity(); refreshAlbums(); probe(); });
if (new URLSearchParams(location.hash.split('?')[1] || '').get('album')) tab.value = 'albums';
</script>

<template>
  <Paper label="我的">
    <p class="kicker">我 · {{ L.identity && signature(L.identity) !== '未落款' ? signature(L.identity) : '还没落款' }}<SealMark v-if="S.account" class="kseal" :size="17" /></p>
    <h1 class="h1">{{ mine.length ? `${mine.length} 张，${places} 个地方，${sems} 个学期` : '还没有刻过' }}</h1>
    <p class="lede">{{ mine.length ? '左边的校园里，黄色的盘是你的。' : '按住下面那颗钮，十秒就够。地点、一句话、落款都可以刻完再补。' }}<template v-if="mine.length && !S.account && S.open"> 这些盘现在认的是这台设备；在<button type="button" class="link" @click="tab = 'card'">刻声卡</button>上用学号盖个章，换了手机也认得回来。</template></p>

    <div class="row" role="tablist" aria-label="我的">
      <button v-for="t in [['discs', '我刻的'], ['shelf', '唱片架'], ['favs', `收藏 ${favs.length || ''}`], ['posts', `我的帖子 ${myPosts.length || ''}`], ['albums', `共建 ${together || ''}`], ['inbox', unread() ? `回应我的 · ${unread()} 新` : `回应我的 ${inboxAll.length || ''}`], ['card', '刻声卡']]" :key="t[0]" type="button" role="tab" class="chip" :class="{ on: tab === t[0] }" :aria-selected="tab === t[0]" @click="tab = t[0]">{{ t[1] }}</button>
    </div>

    <section v-if="tab === 'discs'">
      <div v-if="!mine.length" class="slot" aria-hidden="true"><span></span><p class="fine">第一张会放在这里</p></div>
      <RingWood v-if="mine.length" :list="mine" :size="300" caption="我的年轮。" :playing-id="L.playing && L.playing.id" @pick="play" />
      <ol class="discs" style="margin-top: 12px">
        <li v-for="e in mine" :key="e.id" class="mine-row">
          <DiscRow :e="e" />
          <div v-if="newestLater(e)" class="later-line">
            <button type="button" @click="openLater(e)"><b>后来</b>{{ clipText(newestLater(e).text) }}</button>
          </div>
          <p v-else-if="!e.locked && daysSince(e) >= 7" class="later-hint"><button type="button" @click="openLater(e)">这张刻了 {{ daysSince(e) }} 天了，回头听听？</button></p>
          <div class="acts">
            <span v-if="e.error" class="err">{{ e.error }}</span>
            <button type="button" class="link fine" @click="del(e)">{{ confirmId === e.id ? '再点一次，真删' : '删掉' }}</button>
          </div>
        </li>
      </ol>
    </section>

    <section v-else-if="tab === 'shelf'">
      <div class="peek" aria-hidden="true">
        <span v-for="s in shelfPeek" :key="s.p.id" class="ps">
          <img :src="`${sleeveBase}sleeves/${s.p.id}.jpg`" alt="" loading="lazy">
          <i v-if="s.n" class="ymine">我 {{ s.n }} 张</i>
        </span>
      </div>
      <p class="fine">十六个地方，每处一张唱片，都排在木箱里。你刻过的地方插着示波黄的签，翻的时候排在前面。</p>
      <button type="button" class="btn small" style="margin-top: 12px" @click="openShelf">翻我的唱片架</button>
    </section>

    <section v-else-if="tab === 'favs'">
      <ol v-if="favs.length" class="discs" style="margin-top: 12px"><DiscRow v-for="e in favs" :key="e.id" :e="e" /></ol>
      <p v-else class="fine" style="margin-top: 14px">还没有收藏。在地点里放一张，点「收藏」。</p>
    </section>

    <section v-else-if="tab === 'posts'">
      <PostCard v-for="p in myPosts" :key="p.id" :post="p" @open="(x) => router.push({ path: '/community', query: { post: x.id } })" @topic="(t) => router.push({ path: '/community', query: { topic: t } })" />
      <p v-if="!myPosts.length" class="fine" style="margin-top: 14px">还没发过帖。去<RouterLink to="/community">社区</RouterLink>写一帖。</p>
    </section>

    <section v-else-if="tab === 'albums'">
      <AlbumShelf only="mine" />
    </section>

    <section v-else-if="tab === 'inbox'">
      <div class="bar">
        <div class="row" role="radiogroup" aria-label="回应的类型">
          <button v-for="k in KINDS" :key="k[0]" type="button" role="radio" class="chip" :class="{ on: kind === k[0] }" :aria-checked="kind === k[0]" @click="kind = k[0]">{{ k[1] }}</button>
        </div>
        <button v-if="unread()" type="button" class="link fine" @click="markRead()">全部标为已读</button>
      </div>
      <ol v-if="inbox.length" class="inbox">
        <li v-for="(x, i) in inbox" :key="i" :class="{ fresh: x.fresh }">
          <button type="button" class="msg" @click="openMsg(x)">
            <span class="k">{{ KIND[x.kind] || x.kind }}</span>
            <span v-if="x.text" class="q">「{{ x.text }}」</span>
            <span class="m">{{ x.kind === 'track' ? `「${x.albumName}」${x.e ? ` · ${title(x.e)}` : ''}` : x.e ? `在你的「${title(x.e)}」${x.kind === 'echo' ? `第 ${x.t.toFixed(1)} 秒` : ''}` : '在社区，你的帖子或回复下面' }}{{ x.author && signature(x.author) !== '未落款' ? ` · ${signature(x.author)}` : '' }} · {{ x.at.slice(0, 10) }}</span>
          </button>
        </li>
      </ol>
      <p v-else class="fine" style="margin-top: 14px">{{ mine.length ? '还没有人回应。' : '刻过之后，别人在你的盘上钉的话、点的「也听过」会出现在这里。' }}</p>
    </section>

    <section v-else class="card">
      <CardSlip @stamped="stamped" />
      <p class="h3">落款</p>
      <template v-if="!editing">
        <p class="show" style="font-size: 20px; margin: 0 0 8px">{{ L.identity ? signature(L.identity) : '未落款' }}</p>
        <button type="button" class="btn small ghost" @click="editing = true">改落款</button>
      </template>
      <form v-else @submit.prevent="saveSig">
        <label class="field"><span>年级</span><input v-model="sig.grade" class="input" maxlength="12" placeholder="2024级"></label>
        <label class="field"><span>学院</span><input v-model="sig.dept" class="input" maxlength="24" placeholder="宇航学院"></label>
        <label class="field"><span>名字（可以是昵称）</span><input v-model="sig.name" class="input" maxlength="16"></label>
        <div class="row"><button type="submit" class="btn small">好了</button><button type="button" class="btn small ghost" @click="editing = false">算了</button></div>
      </form>
      <template v-if="S.account">
        <p class="h3">这台设备</p>
        <p class="fine">盖过章的卡，换设备时用学号再盖一次就认得回来，不用导出。退出之后，这台设备换一张空卡，不再认得你的盘；盘都还在你的学号名下。</p>
        <button type="button" class="btn small ghost" @click="out">{{ leaving ? '再点一次，退出这台设备' : '退出这台设备' }}</button>
      </template>
      <template v-else>
        <p class="h3">不盖章也行</p>
        <p class="fine">不盖章就没有注册、没有密码。卡号只在这台设备上，云上只存它算出来的一串摘要，用来认出「这些盘是你的」。换设备时导出、在新设备上导入。卡丢了，盘还在，只是认不回来。</p>
        <div class="row">
          <button type="button" class="btn small ghost" :disabled="!L.identity" @click="download">导出刻声卡</button>
          <label class="btn small ghost">导入刻声卡<input type="file" accept=".json,application/json" class="sr-only" @change="pickCard"></label>
        </div>
      </template>
      <p class="h3">放在哪里</p>
      <p class="fine">云上：你刻的盘（声音和元数据）、钉的话、照片、收藏。盖了章的话，还有学号算出来的一串摘要（认人用）和打了码的学号（给你自己看）；学号原文、验证码都不存。这台设备上：刻声卡、还没发出去的、你隐藏的那几条。照片的拍摄地点在你的设备上就去掉了，服务端再剥一遍。只给自己的盘也存在云上，换设备还在，只有你听得到；删掉就是真删。</p>
    </section>
  </Paper>
</template>

<style scoped>
.kseal { margin: -3px 0 0 8px; }
.slot { display: grid; justify-items: center; gap: 10px; margin: 30px 0 10px; }
.slot span { width: 120px; height: 120px; border-radius: 50%; border: 1.5px dashed var(--line); background: repeating-radial-gradient(circle, transparent 0 7px, var(--hair) 7px 8px); }
/* 唱片架预览：几只套子从木箱口露出上沿 */
.peek { position: relative; display: flex; align-items: flex-end; gap: 6px; height: 118px; margin: 22px 0 14px; padding: 0 3px; }
.peek::after { content: ''; position: absolute; left: -3px; right: -3px; bottom: 0; height: 26px; border-radius: 2px; background: linear-gradient(#8B6A4A, #6E5238); box-shadow: inset 0 2px 0 rgb(255 255 255 / .12); }
.ps { position: relative; z-index: 1; flex: 1; height: 102px; border-radius: 2px; overflow: hidden; box-shadow: 0 8px 14px -8px rgb(0 0 0 / .55); }
.ps:nth-child(2n) { height: 96px; }
.ps img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 16%; filter: saturate(.8) contrast(1.05); }
.ps .ymine { position: absolute; left: 4px; bottom: 4px; font: 10px var(--f-ui); font-style: normal; padding: 1px 4px; border-radius: 1px; background: #E6BE3A; color: var(--ink); }
.mine-row { position: relative; }
.mine-row :deep(li) { list-style: none; }
.acts { display: flex; justify-content: flex-end; gap: 10px; margin: -6px 0 6px; }
.later-line { margin: -4px 0 6px 56px; }
.later-line button { display: block; width: 100%; padding: 2px 0; border: 0; background: none; text-align: left; font: 15px/1.5 var(--f-show); color: var(--ink); }
.later-line b { margin-right: 6px; font: 600 11px/1 var(--f-ui); letter-spacing: .08em; color: var(--ink-2); vertical-align: 1px; }
.later-hint { margin: -2px 0 6px 56px; font-size: 12px; }
.later-hint button { padding: 0; border: 0; background: none; font-size: 12px; color: var(--ink-2); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
.inbox { list-style: none; padding: 0; margin: 12px 0 0; }
.bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 14px 0 0; }
.inbox li { position: relative; }
.inbox li.fresh::before { content: ''; position: absolute; left: -14px; top: 18px; width: 7px; height: 7px; border-radius: 50%; background: #C8261A; }
.inbox li:not(.fresh) .msg { opacity: .72; }
.msg { display: grid; width: 100%; text-align: left; border: 0; border-top: 1px solid var(--hair); background: none; padding: 10px 0; gap: 2px; }
.msg .k { font-size: 12px; color: var(--ink-2); }
.msg .q { font: 17px/1.5 var(--f-show); }
.msg .m { font-size: 12px; color: var(--ink-2); }
</style>
