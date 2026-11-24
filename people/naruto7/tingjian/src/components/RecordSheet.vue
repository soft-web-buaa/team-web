<script setup>
// 刚刻好的一张：地点（必填）、一句话、给谁听（公开 / 只给自己 / 封到某天）、落款。发出去先进发件箱，连上云就发。
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ui } from '../lib/ui.js';
import { L, publish, say, play, signature, setSignature } from '../lib/library.js';
import { wavePath } from '../lib/wave.js';
import * as stage from '../stage/stage.js';
import { landingLine } from '../kesheng/web/rings.js';

const router = useRouter();
const placeId = ref(ui.recPlace || '');
const note = ref('');
const vis = ref('public');
const until = ref('');
const sig = ref({ grade: L.identity?.grade || '', dept: L.identity?.dept || '', name: L.identity?.name || '' });
const err = ref('');
const busy = ref(false);
const env = computed(() => stage.envOf());
const d = computed(() => (env.value ? wavePath(env.value, ui.take.seconds, 160, 40) : ''));
const minDay = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const maxDay = new Date(Date.now() + 395 * 86400000).toISOString().slice(0, 10);

async function send() {
  err.value = '';
  if (!placeId.value) { err.value = '先选一个地点：这张是在哪儿录的？'; return; }
  if (vis.value === 'capsule' && !until.value) { err.value = '选一个开封的日子。'; return; }
  busy.value = true;
  try {
    if (sig.value.grade || sig.value.dept || sig.value.name) setSignature(sig.value);
    const take = ui.take;
    const e = await publish(take, { placeId: placeId.value, note: note.value, visibility: vis.value === 'private' ? 'private' : 'public', capsuleUntil: vis.value === 'capsule' ? new Date(`${until.value}T08:00:00+08:00`).toISOString() : null });
    ui.take = null;
    stage.landOn(e.placeId);
    const line = landingLine(L.entries, e, e.place, { mineCount: L.entries.filter((x) => x.mine).length });
    say(`${e.local === 'pending' ? '先存在这台设备上，连上云就发出去。' : '刻好了。'}${line ? ` ${line}` : ''}`);
    router.push(`/place/${e.placeId}`);
    play(e, { auto: false });
  } catch (x) { err.value = x.message || String(x); }
  busy.value = false;
}
function drop() {
  ui.take = null;
  say('这一段不要了，没有留下任何东西。');
  if (L.playing) play(L.playing, { auto: false, hour: false });
}
</script>

<template>
  <section class="rec-sheet" role="dialog" aria-labelledby="rec-h">
    <p class="kicker">刚刻好的一张 · {{ ui.take.seconds.toFixed(1) }} 秒</p>
    <h2 id="rec-h" class="h2" style="margin-top: 0">它是在哪儿录的？</h2>
    <svg class="rec-wave" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true"><path :d="d" /></svg>
    <div class="places" role="radiogroup" aria-label="地点">
      <button v-for="p in L.places" :key="p.id" type="button" role="radio" class="chip" :class="{ on: placeId === p.id }" :aria-checked="placeId === p.id" @click="placeId = p.id">{{ p.name }}</button>
    </div>
    <label class="field"><span>一句话（可以不写，最多 40 字）</span><input v-model="note" class="input" maxlength="40" placeholder="比如：闭馆前最后十分钟" autocomplete="off"></label>
    <div class="field" role="radiogroup" aria-label="给谁听">
      <span>给谁听</span>
      <div class="row">
        <button type="button" class="chip" :class="{ on: vis === 'public' }" @click="vis = 'public'">公开</button>
        <button type="button" class="chip" :class="{ on: vis === 'private' }" @click="vis = 'private'">只给自己</button>
        <button type="button" class="chip" :class="{ on: vis === 'capsule' }" @click="vis = 'capsule'">封到某一天</button>
      </div>
      <input v-if="vis === 'capsule'" v-model="until" type="date" class="input" :min="minDay" :max="maxDay" aria-label="开封的日子">
      <p class="fine">{{ vis === 'private' ? '只给自己：存在云上，换设备也在；只有你听得到，不进任何计数，一键真删。' : vis === 'capsule' ? '封到那天之前，谁都听不到，包括列表里也只露一道封条。过滤在服务端做。' : '公开：大家都听得到。别录能认出别人的对话。' }}</p>
    </div>
    <details class="sig">
      <summary>落款：{{ signature(sig) === '未落款' ? '不落款也行' : signature(sig) }}</summary>
      <div class="sig-grid">
        <label class="field"><span>年级</span><input v-model="sig.grade" class="input" maxlength="12" placeholder="2024级"></label>
        <label class="field"><span>学院</span><input v-model="sig.dept" class="input" maxlength="24" placeholder="宇航学院"></label>
        <label class="field"><span>名字</span><input v-model="sig.name" class="input" maxlength="16" placeholder="可以是昵称"></label>
      </div>
      <p class="fine">三项都可以不填。不收学号、不收手机号，链接和号码会被拦下。</p>
    </details>
    <p class="err" role="alert">{{ err }}</p>
    <div class="row">
      <button type="button" class="btn" :disabled="busy" @click="send">刻进馆藏</button>
      <button type="button" class="btn ghost" @click="drop">不要了</button>
    </div>
  </section>
</template>

<style scoped>
.rec-sheet { position: fixed; z-index: 30; left: 50%; bottom: 96px; transform: translateX(-50%); width: min(560px, calc(100vw - 24px)); max-height: calc(100vh - 170px); overflow-y: auto;
  background: var(--paper); color: var(--ink); border-radius: 6px; padding: 24px 26px; box-shadow: 0 1px 0 var(--hair), 0 40px 80px -24px rgb(0 0 0 / .5); }
.rec-wave { width: 100%; height: 40px; display: block; margin: 0 0 16px; }
.rec-wave path { fill: var(--ink); }
.places { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; }
.sig { margin: 0 0 6px; }
.sig summary { cursor: pointer; font-size: 13px; color: var(--ink-2); padding: 6px 0; }
.sig-grid { display: grid; grid-template-columns: 1fr 1.4fr 1fr; gap: 8px; margin-top: 8px; }
@media (max-width: 760px) { .rec-sheet { bottom: 74px; padding: 18px; } .sig-grid { grid-template-columns: 1fr; } }
</style>
