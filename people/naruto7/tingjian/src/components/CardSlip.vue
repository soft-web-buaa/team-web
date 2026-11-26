<script setup>
// 刻声卡本身：一张借书证似的卡，落款、卡号、学号三行，右下角是盖章处。点盖章处，卡下面展开两步：寄验证码、填六位数盖章。
// 不另开登录页、不弹窗：账号就是这张卡上多了一枚章（DESIGN.md §7c）。
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import SealMark from './SealMark.vue';
import { L, say, signature } from '../lib/library.js';
import { keyNow } from '../lib/cloud.js';
import { S, probe, sendCode, stamp } from '../lib/seal.js';

const emit = defineEmits(['stamped']);
const step = ref(0);              // 0 收着 / 1 填学号 / 2 填验证码
const sid = ref(''), code = ref(''), to = ref(''), err = ref(''), busy = ref(false), wait = ref(0), fresh = ref(false);
const sidIn = ref(null), codeIn = ref(null);
let timer = 0;
const cardNo = computed(() => { void L.version; const k = keyNow(); return k ? `${k.slice(0, 4)} ${k.slice(4, 8)} ·· ${k.slice(-2)}` : '还没领'; });
const since = computed(() => (S.account && S.account.since ? S.account.since.slice(0, 10).replace(/-/g, '.') : ''));
const sidOk = computed(() => /^(?:[a-z]{2})?\d{6,10}$/i.test(sid.value.trim().replace(/@buaa\.edu\.cn$/i, '')));

function tick(n) {
  wait.value = n;
  clearInterval(timer);
  timer = setInterval(() => { wait.value = Math.max(0, wait.value - 1); if (!wait.value) clearInterval(timer); }, 1000);
}
async function begin() {
  if (S.open === false) return;
  step.value = 1; err.value = '';
  await nextTick(); sidIn.value && sidIn.value.focus();
}
async function send() {
  err.value = '';
  if (!sidOk.value) { err.value = '学号的样子不对：本科是 8 位数字，研究生是 SY、ZY、BY 加数字。'; return; }
  busy.value = true;
  const r = await sendCode(sid.value);
  busy.value = false;
  if (!r.ok) { err.value = r.error; return; }
  to.value = r.to; step.value = 2; code.value = S.dev || ''; tick(r.wait);
  await nextTick(); codeIn.value && codeIn.value.focus();
}
async function resend() { if (wait.value || busy.value) return; await send(); }
async function seal() {
  err.value = '';
  if (code.value.length !== 6) { err.value = '验证码是六位数。'; return; }
  busy.value = true;
  const r = await stamp(sid.value, code.value);
  busy.value = false;
  if (!r.ok) { err.value = r.error; return; }
  step.value = 0; fresh.value = true; sid.value = ''; code.value = '';
  say(`盖好了。${r.merged ? `这台设备上的 ${r.merged} 件一并认到你名下。` : ''}换设备时用学号再盖一次，盘都认得回来。`);
  emit('stamped');
}
function onCode() {
  code.value = code.value.replace(/\D/g, '').slice(0, 6);
  if (code.value.length === 6 && !busy.value) seal();
}
onMounted(probe);
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="slip" :class="{ sealed: !!S.account }">
    <header><span class="show">刻声卡</span><span>学院路 · 刻声馆藏</span></header>
    <dl>
      <div><dt>落款</dt><dd class="show">{{ L.identity ? signature(L.identity) : '未落款' }}</dd></div>
      <div><dt>卡号</dt><dd class="num">{{ cardNo }}</dd></div>
      <div><dt>学号</dt><dd class="num">{{ S.account ? `${S.account.sid} · ${since} 盖章` : '未盖章' }}</dd></div>
    </dl>
    <SealMark v-if="S.account" class="mark" :size="54" :fresh="fresh" />
    <button v-else type="button" class="slot" :class="{ on: step }" :disabled="S.open === false" :aria-expanded="!!step" aria-label="盖章处：用学号给这张卡盖章" @click="step ? (step = 0) : begin()"><span>盖章处</span></button>
  </div>

  <p v-if="!S.account && S.open === false" class="fine" style="margin: 10px 0 0">学号盖章还没开放。这张卡照样能用：听、刻、回应都不受影响。</p>

    <form v-if="step === 1" class="stamp" @submit.prevent="send">
      <label class="field">
        <span>学号</span>
        <span class="sid"><input ref="sidIn" v-model="sid" class="input" maxlength="24" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="21371234"><i>@buaa.edu.cn</i></span>
      </label>
      <p class="fine">验证码寄到你的北航邮箱。不问统一认证密码；学号不会出现在任何一张盘、一个帖子上。</p>
      <p class="err" role="alert">{{ err }}</p>
      <div class="row">
        <button type="submit" class="btn small" :disabled="busy">{{ busy ? '在寄…' : '寄验证码' }}</button>
        <button type="button" class="btn small ghost" @click="step = 0">算了</button>
      </div>
    </form>
    <form v-else-if="step === 2" class="stamp" @submit.prevent="seal">
      <p class="fine" style="margin-top: 0">寄到 <b class="num">{{ to }}</b> 了，十分钟内有效。没收到的话看看垃圾邮件。</p>
      <label class="field">
        <span>邮件里的六位数</span>
        <input ref="codeIn" v-model="code" class="input code num" inputmode="numeric" autocomplete="one-time-code" maxlength="6" @input="onCode">
      </label>
      <p v-if="S.dev" class="fine">本机开发：验证码已经替你填上（线上不会这样）。</p>
      <p class="err" role="alert">{{ err }}</p>
      <div class="row">
        <button type="submit" class="btn small" :disabled="busy || code.length !== 6">{{ busy ? '在盖…' : '盖章' }}</button>
        <button type="button" class="link fine" :disabled="!!wait" @click="resend">{{ wait ? `${wait} 秒后可以重寄` : '重寄一封' }}</button>
        <button type="button" class="link fine" @click="step = 1; code = ''; err = ''">换个学号</button>
      </div>
    </form>
</template>

<style scoped>
.slip { position: relative; margin: 18px 0 0; padding: 14px 16px 16px; border: 1px solid var(--line); border-top: 3px double var(--line); border-radius: 3px; background: var(--wash); }
.slip header { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid var(--hair); }
.slip header .show { font-size: 18px; letter-spacing: .16em; }
.slip header span:last-child { font-size: 12px; letter-spacing: .1em; color: var(--ink-2); }
.slip dl { margin: 0; padding-right: 64px; }
.slip dl div { display: grid; grid-template-columns: 3em 1fr; align-items: baseline; padding: 7px 0 6px; border-bottom: 1px dotted var(--line); }
.slip dt { font-size: 12px; color: var(--ink-2); letter-spacing: .08em; }
.slip dd { margin: 0; font-size: 14px; min-width: 0; overflow-wrap: anywhere; }
.slip dd.show { font-size: 16px; }
.slot { position: absolute; right: 14px; bottom: 14px; width: 46px; height: 64px; display: grid; place-items: center; border: 1px dashed var(--line); border-radius: 2px; background: none; color: var(--ink-2); transition: border-color .2s, color .2s; }
.slot span { writing-mode: vertical-rl; font: 12px/1 var(--f-show); letter-spacing: .3em; }
.slot:hover:not([disabled]), .slot.on { border-color: var(--ink); color: var(--ink); }
.slot[disabled] { opacity: .5; cursor: default; }
.mark { position: absolute; right: 16px; bottom: 12px; }
.stamp { margin: 14px 0 0; padding: 0 0 4px; animation: unfold .35s var(--ease) both; }
.sid { display: flex; align-items: center; border: 1px solid var(--line); border-radius: var(--r); background: var(--wash); }
.sid:focus-within { outline: 2px solid var(--scope); border-color: transparent; }
.sid .input { border: 0; background: none; outline: none; flex: 1; min-width: 0; }
.sid i { font-style: normal; font-size: 13px; color: var(--ink-2); padding: 0 12px 0 0; white-space: nowrap; }
.code { font: 24px/1 var(--f-ui); letter-spacing: .5em; height: 48px; text-indent: .25em; max-width: 13em; }
.stamp .err:empty { display: none; }
@keyframes unfold { from { opacity: 0; transform: translateY(-6px); } }
</style>
