<script setup>
// 一个帖子的楼：楼主（1 楼）、楼层、楼中楼（只两层），每一层可以共鸣、我也是、回复；
// 帖子在接力链里的，上面有整条链，可以从这一棒接下去。
import { ref, watch } from 'vue';
import PostCard from './PostCard.vue';
import DiscMini from './DiscMini.vue';
import { open, floors, reply, react, ago, removePost, removeReply, report } from '../lib/community.js';
import { L, entryById, play, title, say, signature } from '../lib/library.js';
import { ui } from '../lib/ui.js';
import { POST } from '../lib/topics.js';

const p = defineProps({ id: String });
const emit = defineEmits(['back', 'topic', 'relay']);
const data = ref(null), err = ref(''), text = ref(''), to = ref(null), busy = ref(false);
async function load() {
  const r = await open(p.id);
  if (r.error) { err.value = r.error; return; }
  data.value = { ...r, fl: floors(r.replies) };
}
watch(() => p.id, load, { immediate: true });
const who = (a) => { const s = a ? signature(a) : ''; return s && s !== '未落款' ? s : '没落款的人'; };
async function send() {
  busy.value = true;
  try {
    await reply(p.id, text.value, { parentId: to.value ? to.value.id : null, soundId: L.playing && L.playing.id !== (data.value.post && data.value.post.soundId) && ui.attachPlaying ? L.playing.id : null });
    text.value = ''; to.value = null;
    await load();
  } catch (e) { say(e.message); }
  busy.value = false;
}
async function hit(r, type) { try { await react(r.id, type, r); } catch (e) { say(e.message); } }
async function delPost() {
  if (!confirm('删掉这个帖子？下面的回复会一起删掉。')) return;
  try { await removePost(p.id); say('删掉了。'); emit('back'); } catch (e) { say(e.message); }
}
async function delReply(r) { try { await removeReply(r.id); await load(); } catch (e) { say(e.message); } }
async function rep(kind, id) { try { const held = await report(kind, id); say(held ? '已经三个人举报了，先收起来。' : '举报了。三个人举报会先收起。'); } catch (e) { say(e.message); } }
function relayNext() {
  const last = data.value.relay.at(-1) || data.value.post;
  ui.compose = { text: '', topics: ['tp-jieli'], placeId: null, mood: null, soundId: null, relayOf: last.id, relayRoot: last.relayRoot || last.id, relayUpIndex: last.relayIndex || 1 };
  emit('relay');
}
</script>

<template>
  <section class="thread">
    <button type="button" class="link fine" @click="emit('back')">← 回到广场</button>
    <p v-if="err" class="err">{{ err }}</p>
    <template v-if="data && data.post">
      <ol v-if="data.relay.length > 1" class="chain" aria-label="这条接力">
        <li v-for="x in data.relay" :key="x.id" :class="{ here: x.id === id }">
          <b>{{ x.relayIndex }}</b>
          <button v-if="x.soundId && entryById(x.soundId)" type="button" class="cd" :aria-label="`放第 ${x.relayIndex} 棒`" @click="play(entryById(x.soundId))"><DiscMini :e="entryById(x.soundId)" :size="34" /></button>
          <span>{{ x.text.slice(0, 18) }}{{ x.text.length > 18 ? '…' : '' }}</span>
        </li>
        <li class="next"><button type="button" class="btn small" @click="relayNext">接下一棒</button></li>
      </ol>
      <PostCard :post="data.post" full @open="() => {}" @topic="(t) => emit('topic', t)" />
      <div class="row ops">
        <span class="fine">1 楼 · 楼主</span>
        <button v-if="data.post.relayIndex && data.relay.length <= 1" type="button" class="btn small" @click="relayNext">接下一棒</button>
        <button v-if="data.post.mine" type="button" class="link fine" @click="delPost">删掉</button>
        <button v-else-if="!data.post.demo" type="button" class="link fine" @click="rep('posts', id)">举报</button>
      </div>

      <ol class="floors">
        <li v-for="f in data.fl" :key="f.id" class="floor">
          <header><span class="who">{{ who(f.author) }}</span><span v-if="f.demo" class="tier">示例</span><span v-if="f.mine" class="tier real">我</span><span class="m">{{ f.floor }} 楼 · {{ ago(f.at) }}</span></header>
          <p class="t">{{ f.text }}</p>
          <button v-if="f.soundId && entryById(f.soundId)" type="button" class="snd" @click="play(entryById(f.soundId))"><DiscMini :e="entryById(f.soundId)" :size="24" /> 回了一段声音：{{ title(entryById(f.soundId)) }}</button>
          <div class="acts">
            <button type="button" class="act" @click="to = f">回复</button>
            <button type="button" class="act" :class="{ on: (f.my || []).includes('hug') }" @click="hit(f, 'hug')">共鸣{{ f.hug ? ` ${f.hug}` : '' }}</button>
            <button type="button" class="act" :class="{ on: (f.my || []).includes('same') }" @click="hit(f, 'same')">我也是{{ f.same ? ` ${f.same}` : '' }}</button>
            <button v-if="f.mine" type="button" class="act" @click="delReply(f)">删掉</button>
            <button v-else-if="!f.demo" type="button" class="act" @click="rep('replies', f.id)">举报</button>
          </div>
          <ol v-if="f.kids.length" class="kids">
            <li v-for="k in f.kids" :key="k.id">
              <span class="who">{{ who(k.author) }}</span><span v-if="k.demo" class="tier">示例</span>：{{ k.text }}
              <span class="m">{{ ago(k.at) }}</span>
              <button type="button" class="act small" @click="to = f">回复</button>
              <button type="button" class="act small" :class="{ on: (k.my || []).includes('hug') }" @click="hit(k, 'hug')">共鸣{{ k.hug ? ` ${k.hug}` : '' }}</button>
              <button v-if="k.mine" type="button" class="act small" @click="delReply(k)">删掉</button>
            </li>
          </ol>
        </li>
      </ol>
      <p v-if="!data.fl.length" class="fine" style="margin-top: 14px">还没有人回。抢个二楼。</p>

      <form class="say" @submit.prevent="send">
        <p v-if="to" class="fine">回 {{ to.floor }} 楼 {{ who(to.author) }} <button type="button" class="link fine" @click="to = null">不回这层了</button></p>
        <textarea v-model="text" class="input area" :maxlength="POST.replyMax" rows="2" :placeholder="to ? '在这一层下面说' : '回一句'" aria-label="回复"></textarea>
        <label v-if="L.playing && L.playing.id !== data.post.soundId" class="fine attach"><input v-model="ui.attachPlaying" type="checkbox"> 用声音回应：附上正在放的「{{ title(L.playing) }}」</label>
        <div class="row"><button type="submit" class="btn small" :disabled="busy || !text.trim()">回复</button></div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.thread { margin-top: 4px; }
.chain { list-style: none; display: flex; gap: 6px; padding: 12px 0 14px; margin: 10px 0 0; overflow-x: auto; border-top: 1px solid var(--hair); }
.chain li { flex: none; display: grid; justify-items: center; gap: 4px; width: 76px; font-size: 11px; color: var(--ink-2); text-align: center; position: relative; }
.chain li:not(.next)::after { content: ''; position: absolute; right: -6px; top: 34px; width: 6px; height: 1px; background: var(--line); }
.chain b { font: 600 11px var(--f-ui); color: var(--ink); }
.chain li.here b { background: var(--scope); color: #2A2104; padding: 1px 6px; border-radius: 999px; }
.chain .cd { border: 0; background: none; padding: 0; }
.chain .next { justify-content: center; align-self: center; width: auto; }
.ops { margin: -4px 0 6px; }
.floors { list-style: none; padding: 0; margin: 8px 0 0; }
.floor { padding: 12px 0; border-top: 1px solid var(--hair); }
.floor header { display: flex; gap: 6px; align-items: baseline; font-size: 12px; color: var(--ink-2); }
.who { font-weight: 600; color: var(--ink); font-size: 13px; }
.m { color: var(--ink-2); font-size: 12px; }
.t { font: 15px/1.7 var(--f-show); margin: 4px 0 0; }
.snd { display: inline-flex; align-items: center; gap: 6px; margin: 6px 0 0; border: 1px solid var(--hair); border-radius: 999px; background: var(--wash); padding: 3px 10px 3px 4px; font-size: 12px; }
.acts { display: flex; gap: 2px; margin: 6px 0 0 -8px; }
.act { height: 26px; padding: 0 8px; border-radius: 999px; border: 0; background: none; font-size: 12px; color: var(--ink-2); }
.act.on { background: var(--ink); color: var(--paper); }
.act.small { height: 22px; padding: 0 6px; }
.kids { list-style: none; margin: 8px 0 0; padding: 8px 12px; border-radius: 3px; background: var(--wash); font-size: 13px; line-height: 1.7; }
.kids li + li { margin-top: 4px; }
.say { position: sticky; bottom: -120px; margin: 16px -28px -120px; padding: 12px 28px 120px; background: var(--paper); border-top: 1px solid var(--hair); }
.area { height: auto; padding: 8px 12px; resize: vertical; }
.attach { display: flex; gap: 6px; align-items: center; margin: 6px 0; }
@media (max-width: 760px) { .say { margin: 16px -18px -150px; padding: 12px 18px 150px; } }
</style>
