<script setup>
// 广场里的一个帖子：谁、何时、在哪、什么心情、一段话、附的那段声音、#话题，下面是回复数、抱抱、我也是。点正文进楼。
import { computed } from 'vue';
import DiscMini from './DiscMini.vue';
import { countsOf, ago, topicName, react } from '../lib/community.js';
import { L, entryById, play, title, say, signature } from '../lib/library.js';
import { moodName } from '../lib/topics.js';

const p = defineProps({ post: Object, full: Boolean });
const emit = defineEmits(['open', 'topic']);
const c = computed(() => countsOf(p.post));
const snd = computed(() => (p.post.soundId ? entryById(p.post.soundId) : null));
const place = computed(() => (p.post.placeId ? L.placeById.get(p.post.placeId) : null));
const who = computed(() => {
  const a = p.post.author;
  const s = a ? signature(a) : '';
  return s && s !== '未落款' ? s : '没落款的人';
});
const on = (t) => c.value.my.includes(t);
async function hit(type) {
  try { await react(p.post.id, type, p.post.demo ? c.value : p.post); } catch (e) { say(e.message); }
}
</script>

<template>
  <article class="post" :class="{ full, relay: post.relayIndex }">
    <header>
      <span class="who">{{ who }}</span>
      <span v-if="post.demo" class="tier">示例</span>
      <span v-if="post.mine" class="tier real">我</span>
      <span class="m">{{ ago(post.at) }}<template v-if="place"> · {{ place.name }}</template><template v-if="post.mood"> · {{ moodName(post.mood) }}</template></span>
      <span v-if="post.relayIndex" class="baton">第 {{ post.relayIndex }} 棒</span>
    </header>
    <button type="button" class="text" :class="{ clamp: !full }" @click="emit('open', post)">{{ post.text }}</button>
    <button v-if="snd" type="button" class="snd" :class="{ on: L.playing && L.playing.id === snd.id }" @click="play(snd)">
      <DiscMini :e="snd" :size="30" />
      <span><b>{{ title(snd) }}</b><i>{{ snd.place }} · {{ snd.tier === 'real' ? '真实录音' : snd.tier === 'archival' ? '史料' : '示意' }}</i></span>
    </button>
    <div v-if="post.topics.length" class="tags">
      <button v-for="t in post.topics" :key="t" type="button" class="ttag" @click="emit('topic', t)">#{{ topicName(t) }}</button>
    </div>
    <footer>
      <button type="button" class="act" @click="emit('open', post)">回复{{ c.replies ? ` ${c.replies}` : '' }}</button>
      <button type="button" class="act" :class="{ on: on('hug') }" :aria-pressed="on('hug')" @click="hit('hug')">抱抱{{ c.hug ? ` ${c.hug}` : '' }}</button>
      <button type="button" class="act" :class="{ on: on('same') }" :aria-pressed="on('same')" @click="hit('same')">我也是{{ c.same ? ` ${c.same}` : '' }}</button>
    </footer>
  </article>
</template>

<style scoped>
.post { padding: 16px 0 12px; border-top: 1px solid var(--hair); }
.post.relay { box-shadow: inset 3px 0 0 var(--scope); padding-left: 12px; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 12px; color: var(--ink-2); }
.who { font-weight: 600; color: var(--ink); font-size: 13px; }
.baton { margin-left: auto; font: 600 11px var(--f-ui); padding: 2px 7px; border-radius: 999px; background: var(--scope); color: #2A2104; }
.text { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 8px 0 0; font: 16px/1.7 var(--f-show); color: var(--ink); white-space: pre-wrap; }
.text.clamp { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.snd { display: flex; align-items: center; gap: 10px; width: 100%; margin: 10px 0 0; padding: 7px 10px 7px 7px; border-radius: 999px; border: 1px solid var(--hair); background: var(--wash); text-align: left; }
.snd.on { border-color: var(--scope); }
.snd b { display: block; font: 14px/1.3 var(--f-show); }
.snd i { display: block; font-style: normal; font-size: 11px; color: var(--ink-2); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.ttag { border: 0; background: none; padding: 0; font-size: 13px; color: var(--ink); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
footer { display: flex; gap: 4px; margin: 10px 0 0; }
.act { height: 28px; padding: 0 11px; border-radius: 999px; border: 1px solid transparent; background: none; font-size: 13px; color: var(--ink-2); }
.act:hover { border-color: var(--hair); color: var(--ink); }
.act.on { background: var(--ink); color: var(--paper); }
</style>
