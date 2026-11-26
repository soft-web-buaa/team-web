<script setup>
// 发帖：一段话（必填），可以附一段声音（我刻的、正在放的那张）、一个地点、一种心情、至多 3 个 #话题；也可以发起或接一棒接力。
// 草稿放在 ui.compose：写到一半去刻一段，回来还在。
import { computed, ref } from 'vue';
import { ui } from '../lib/ui.js';
import { L, entryById, title, say } from '../lib/library.js';
import { C, post, createTopic, topicName } from '../lib/community.js';
import { MOODS, POST } from '../lib/topics.js';

const emit = defineEmits(['done', 'cancel']);
if (!ui.compose) ui.compose = { text: '', topics: [], placeId: null, mood: null, soundId: null };
const d = ui.compose;
const busy = ref(false), err = ref(''), newTopic = ref(''), showTopics = ref(false);
const mineDiscs = computed(() => { void L.version; return L.entries.filter((e) => e.mine && e.tier === 'real' && e.visibility !== 'private' && !e.locked && !e.local).slice(-6).reverse(); });
const playing = computed(() => (L.playing && L.playing.tier !== 'real' ? L.playing : L.playing && L.playing.visibility !== 'private' && !L.playing.locked && !L.playing.local ? L.playing : null));
const snd = computed(() => (d.soundId ? entryById(d.soundId) : null));
const relayUp = computed(() => (d.relayOf ? C.demo.concat(C.posts).find((x) => x.id === d.relayOf) : null));
function useSound(e) { d.soundId = e.id; if (!d.placeId && e.placeId) d.placeId = e.placeId; }
function toggleTopic(id) {
  const i = d.topics.indexOf(id);
  if (i >= 0) d.topics.splice(i, 1);
  else if (d.topics.length < POST.topicsMax) d.topics.push(id);
  else say(`最多带 ${POST.topicsMax} 个话题。`);
}
async function addTopic() {
  err.value = '';
  try { const t = await createTopic(newTopic.value.trim()); newTopic.value = ''; if (!d.topics.includes(t.id)) toggleTopic(t.id); } catch (e) { err.value = e.message; }
}
async function send() {
  err.value = '';
  busy.value = true;
  try {
    const p = await post(d);
    ui.compose = null;
    say(d.relayOf ? `接上了，你是第 ${p.relayIndex} 棒。` : d.relayStart ? '接力发起了，等下一棒。' : '发出去了。');
    emit('done', p);
  } catch (e) { err.value = e.message; }
  busy.value = false;
}
function cancel() { ui.compose = null; emit('cancel'); }
</script>

<template>
  <section class="compose" aria-label="写一帖">
    <p v-if="relayUp" class="relay-up">接在第 {{ relayUp.relayIndex || 1 }} 棒后面：「{{ relayUp.text.slice(0, 40) }}{{ relayUp.text.length > 40 ? '…' : '' }}」</p>
    <p v-else-if="d.relayStart" class="relay-up">发起一条接力：写清楚下一棒要录什么，附上你的第一棒。</p>
    <label class="sr-only" for="compose-text">想说的话</label>
    <textarea id="compose-text" v-model="d.text" class="input area" :maxlength="POST.textMax" rows="4" :placeholder="d.relayOf ? '这一棒你录的是哪儿' : '这里听见了什么？可以只写一句。'"></textarea>
    <p class="fine count">{{ d.text.length }}/{{ POST.textMax }}</p>

    <div class="row-l">
      <span class="lab">声音</span>
      <template v-if="snd"><span class="pick">{{ title(snd) }} · {{ snd.place }}</span><button type="button" class="link fine" @click="d.soundId = null">不附了</button></template>
      <template v-else>
        <button v-if="playing" type="button" class="chip" @click="useSound(playing)">附上正在放的：{{ title(playing) }}</button>
        <button v-for="e in mineDiscs" :key="e.id" type="button" class="chip" @click="useSound(e)">我刻的：{{ title(e) }}</button>
        <span v-if="!playing && !mineDiscs.length" class="fine">先放一张，或者按住下面那颗钮刻一段，再回来附上。</span>
      </template>
    </div>
    <div class="row-l">
      <span class="lab">地点</span>
      <select v-model="d.placeId" class="input sel" aria-label="地点">
        <option :value="null">不写</option>
        <option v-for="p in L.places" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </div>
    <div class="row-l" role="radiogroup" aria-label="心情">
      <span class="lab">心情</span>
      <button v-for="m in MOODS" :key="m.id" type="button" role="radio" class="chip" :class="{ on: d.mood === m.id }" :aria-checked="d.mood === m.id" @click="d.mood = d.mood === m.id ? null : m.id">{{ m.name }}</button>
    </div>
    <div class="row-l">
      <span class="lab">话题</span>
      <button v-for="t in d.topics" :key="t" type="button" class="chip on" @click="toggleTopic(t)">#{{ topicName(t) }} ×</button>
      <button type="button" class="link fine" :aria-expanded="showTopics" @click="showTopics = !showTopics">{{ showTopics ? '收起' : '加话题' }}</button>
    </div>
    <div v-if="showTopics" class="topics">
      <button v-for="t in C.topics" :key="t.id" type="button" class="chip" :class="{ on: d.topics.includes(t.id) }" @click="toggleTopic(t.id)">#{{ t.name }}</button>
      <form class="new" @submit.prevent="addTopic">
        <input v-model="newTopic" class="input" maxlength="16" placeholder="建一个新话题（2 到 16 个字）" aria-label="新话题">
        <button type="submit" class="btn small ghost" :disabled="newTopic.trim().length < 2">建</button>
      </form>
    </div>
    <p class="err" role="alert">{{ err }}</p>
    <div class="row">
      <button type="button" class="btn" :disabled="busy || !d.text.trim()" @click="send">{{ d.relayOf ? '接这一棒' : d.relayStart ? '发起接力' : '发出去' }}</button>
      <button type="button" class="btn ghost" @click="cancel">算了</button>
    </div>
    <p class="fine">公开的，大家都看得到。不收链接和号码；三个人举报会先收起。</p>
  </section>
</template>

<style scoped>
.compose { margin: 14px 0 4px; padding: 16px; border-radius: 5px; background-color: var(--wash); background-image: var(--grain); border: 1px solid var(--hair); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--paper) 40%, transparent); }
.area { height: auto; min-height: 96px; padding: 10px 12px; resize: vertical; font: 16px/1.7 var(--f-show); }
.count { text-align: right; margin: 2px 0 8px; }
.row-l { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; }
.lab { width: 34px; font-size: 12px; color: var(--ink-2); }
.pick { font-size: 13px; }
.sel { width: auto; height: 30px; padding: 0 8px; }
.topics { display: flex; flex-wrap: wrap; gap: 6px; margin: -2px 0 12px 40px; }
.new { display: flex; gap: 6px; width: 100%; }
.new .input { height: 30px; }
.relay-up { font-size: 13px; padding: 8px 10px; margin: 0 0 10px; border-radius: 3px; background: var(--paper); box-shadow: inset 3px 0 0 var(--scope); }
</style>
