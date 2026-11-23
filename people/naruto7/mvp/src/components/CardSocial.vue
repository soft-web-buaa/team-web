<script setup>
// 声片卡下面的社区层：谁听过（共鸣），以及钉在声音某一秒的回声。
// summary 只显示"几个人听过"，full 还能点"我也听过"和留回声。
// 这里的数字和话全是示例（demo），真实的要等后端接上、别人也能看到之后才会出现。
import { computed, ref } from 'vue';
import SignGate from './SignGate.vue';
import { player } from '../lib/audio.js';
import { state, heardInfo, toggleHeard, echoesOf, createEcho, reportItem, ECHO_MAX } from '../lib/store.js';
import { signature } from '../data/community.js';
import { say } from '../lib/toast.js';

const props = defineProps({
  sound: { type: Object, required: true },
  mode: { type: String, default: 'summary' },
});

const info = computed(() => heardInfo(props.sound.id));
const years = computed(() =>
  info.value.rows
    .map((r) => r.cohort)
    .filter((c) => /^\d{4}$/.test(c))
    .map(Number),
);
const span = computed(() =>
  years.value.length < 2 ? '' : `${Math.min(...years.value)} 级到 ${Math.max(...years.value)} 级的人都听过。`,
);
const echoes = computed(() => echoesOf(props.sound.id));
const playingThis = computed(() => player.id === props.sound.id);

// 要先有入学年份才能说话；没有就先问，选完自动接着做刚才那件事
const asking = ref(false);
let pending = null;
function needMe(action) {
  if (state.me) return true;
  pending = action;
  asking.value = true;
  return false;
}
function runPending() {
  asking.value = false;
  const a = pending;
  pending = null;
  if (a) a();
}

function heard() {
  if (!needMe(heard)) return;
  try {
    say(toggleHeard(props.sound.id) ? '已记下：你也听过这段声音' : '已取消');
  } catch (e) {
    say(e.message, 'warn');
  }
}

const composing = ref(false);
const at = ref(0);
const text = ref('');
const error = ref('');

function toggleCompose() {
  if (composing.value) {
    composing.value = false;
    return;
  }
  at.value = playingThis.value ? Math.round(player.t * 10) / 10 : 0;
  error.value = '';
  composing.value = true;
}

async function send() {
  error.value = '';
  try {
    await createEcho(props.sound.id, { t: at.value, text: text.value });
    say(`已钉在第 ${at.value.toFixed(1)} 秒`);
    text.value = '';
    composing.value = false;
  } catch (e) {
    error.value = e.message || '没有发出去，再试一次。';
  }
}

function report(e) {
  reportItem(e.id);
  say('已隐藏这一条。');
}

/** 播放到这一秒之前，这条回声先淡着；播放到了，它就亮起来 */
const later = (e) => playingThis.value && e.t > player.t;
</script>

<template>
  <section class="social" :aria-label="'关于《' + sound.title + '》的共鸣'">
    <p class="heard">
      <span class="num total">{{ info.total }}</span>
      <span>人听过</span>
      <span v-if="info.hasDemo" class="tag demo">示例数据</span>
    </p>
    <p v-if="span" class="muted small">{{ span }}</p>

    <template v-if="mode === 'full'">
      <div class="chips">
        <button class="chip" type="button" :aria-pressed="info.mine" @click="heard">
          {{ info.mine ? '你也听过，已记下' : '我也听过' }}
        </button>
        <button class="chip" type="button" :aria-expanded="composing" @click="toggleCompose">留一句回声</button>
      </div>

      <SignGate v-if="asking && !state.me" why="想落个款吗？" @picked="runPending" />

      <ul v-if="echoes.length" class="echoes" aria-label="回声">
        <li v-for="e in echoes" :key="e.id" :class="{ later: later(e) }">
          <span class="sec num">{{ e.t.toFixed(1) }} 秒</span>
          <span class="txt">{{ e.text }}</span>
          <span class="by small muted">
            {{ signature(e) }}
            <span v-if="e.demo" class="tag demo">示例</span>
            <span v-else class="tag real">我的</span>
            <button class="link small" type="button" :aria-label="'举报这条回声：' + e.text" @click="report(e)">举报</button>
          </span>
        </li>
      </ul>
      <p v-else class="empty">还没有回声。播放时点“留一句回声”，把话钉在你想说的那一秒。</p>

      <form v-if="composing" class="compose" novalidate @submit.prevent="send">
        <SignGate why="留话之前，想落个款吗？">
          <label class="field">
            <span>钉在第 <span class="num">{{ at.toFixed(1) }}</span> 秒</span>
            <input v-model.number="at" type="range" min="0" :max="sound.duration || 10" step="0.1" />
          </label>
          <label class="field">
            <span>想说的话（最多 {{ ECHO_MAX }} 字，不能放链接和号码）</span>
            <input v-model="text" type="text" :maxlength="ECHO_MAX" placeholder="这一秒让你想起什么？" />
          </label>
          <p v-if="error" class="err" role="alert">{{ error }}</p>
          <button class="btn small" type="submit">钉在这一秒</button>
        </SignGate>
      </form>
    </template>
  </section>
</template>

<style scoped>
.social {
  display: grid;
  gap: 0.6rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--line-strong);
}

.heard {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.total {
  font-size: var(--t-2);
  line-height: 1;
}

.echoes {
  display: grid;
  gap: 0.5rem;
}

.echoes li {
  display: grid;
  grid-template-columns: 4.2rem 1fr;
  gap: 0 0.7rem;
  padding-left: 0.7rem;
  border-left: 3px solid var(--accent);
  transition: opacity 0.4s;
}

.echoes li.later {
  opacity: 0.35;
  border-left-color: var(--line-strong);
}

.sec {
  color: var(--ink-2);
}

.by {
  grid-column: 2;
}

.compose input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}

.err {
  padding: 0.5rem 0.8rem;
  border-left: 4px solid var(--accent);
  background: var(--panel);
}

.compose .btn {
  justify-self: start;
}
</style>
