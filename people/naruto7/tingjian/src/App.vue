<script setup>
// 听见校园 · 外壳：一块常驻的三维舞台，上面浮着顶栏、板块的纸、正在放的那张、「按住 刻十秒」。
// 换板块只换舞台的模式与机位（stage.setMode），所以过场是连贯的一镜。屏风在最上面，进站只经过一次。
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NAV } from './router.js';
import * as stage from './stage/stage.js';
import { L, init as initLib, say, play, isPublic, unread } from './lib/library.js';
import { ui } from './lib/ui.js';
import ClockFace from './components/ClockFace.vue';
import Deck from './components/Deck.vue';
import Press from './components/Press.vue';
import Screen from './components/Screen.vue';
import RecordSheet from './components/RecordSheet.vue';
import WalkCard from './components/WalkCard.vue';

const route = useRoute(), router = useRouter();
const cv = ref(null), lb = ref(null);
const nogl = ref(false);
const width = ref(innerWidth);
addEventListener('resize', () => { width.value = innerWidth; ui.narrow = innerWidth <= 760; });
ui.narrow = innerWidth <= 760;

// 屏风：从首页进站、这一次会话还没进过时才出现。?screen=1 强制出现
const q = new URLSearchParams(location.search);
let entered = false;
try { entered = sessionStorage.getItem('tj-entered') === '1'; } catch { /* 隐私模式 */ }
ui.screen = q.has('screen') || (!entered && (location.hash === '' || location.hash === '#/'));

const height = ref(innerHeight);
addEventListener('resize', () => { height.value = innerHeight; });
const insetPx = computed(() => (width.value <= 760 ? 0 : route.name === 'home' ? 372 : 452));
// 手机：底部抽屉三档（一点 / 一半 / 全开）压住画布的高度
const insetBottom = computed(() => (width.value > 760 ? 0 : ui.sheet === 'min' ? 132 : ui.sheet === 'full' ? height.value - 110 : Math.round(height.value * 0.52)));
watch([insetPx, insetBottom], ([a, b]) => stage.setInset(a, b), { immediate: true });

function applyMode() {
  const mode = route.meta.mode || 'home';
  stage.setMode(mode, { pid: route.name === 'place' ? route.params.id : null });
}
watch(() => route.fullPath, applyMode);

stage.on('place', (pid) => router.push(`/place/${pid}`));
stage.on('zone', (zid) => {
  const p = L.places.find((x) => x.z === zid);
  if (p) router.push(`/place/${p.id}`);
});
stage.on('empty', () => { if (route.name === 'place') router.push('/'); });
stage.on('clip', (c) => { ui.clip = c; });

// 屏风折起来要 1.2 秒：舞台的镜头同时开始拉出，折完再把屏风拿掉、纸和按钮浮上来
const folding = ref(false);
function enter({ quick = false } = {}) {
  try { sessionStorage.setItem('tj-entered', '1'); } catch { /* 隐私模式 */ }
  applyMode();
  stage.reveal({ quick });
  folding.value = true;
  setTimeout(() => { ui.screen = false; folding.value = false; }, quick ? 450 : 1250);
}
watch(() => ui.screen, (v) => { if (v && stage.isBuilt()) stage.setMode('screen'); });

onMounted(async () => {
  stage.setInset(insetPx.value, insetBottom.value);
  applyMode();
  await initLib();
  if (L.failed) { say(L.failed); return; }
  const okGL = await stage.init(cv.value, lb.value, L.campus);
  if (!okGL) { nogl.value = true; return; }
  applyMode();
  if (!ui.screen) stage.reveal({ quick: route.name !== 'home' });
  // 盘上不能是空的：没在放的时候，外圈刻着最新的一张真实录音（没有就是最新的一张）。不出声，不改钟点
  if (!L.playing && route.name !== 'place') {
    const pick = [...L.entries].reverse().find((e) => e.tier === 'real' && isPublic(e)) || [...L.entries].reverse().find((e) => e.tier === 'synthetic');
    if (pick) play(pick, { auto: false });
  }
});
</script>

<template>
  <div class="stage" :class="{ 'is-veiled': ui.screen }">
    <canvas ref="cv" tabindex="0" aria-label="学院路校园的三维留声机。点一栋楼进入那个地方；按住外圈刻纹可以搓；方向键转视角，加减号缩放，空格放或停。"></canvas>
    <div ref="lb" class="labels" aria-hidden="true"></div>
    <p v-if="nogl" class="nogl">这个浏览器画不出三维（需要 WebGL 2）。右边的纸照常能用，声音照常能放。</p>
  </div>

  <header v-show="!ui.screen" class="top">
    <a class="mark" href="#/" @click.prevent="ui.screen = true" aria-label="听见校园：回到屏风">
      <b>听见校园</b><span>学院路 · 刻声馆藏</span>
    </a>
    <nav class="nav" aria-label="四个板块">
      <RouterLink v-for="n in NAV" :key="n.name" :to="n.to" :class="{ on: route.name === n.name || (n.name === 'home' && route.name === 'place') }" :aria-current="route.name === n.name ? 'page' : undefined">
        {{ n.label }}<i>{{ n.hint }}</i><b v-if="n.name === 'mine' && unread()" class="dot" :aria-label="`${unread()} 条新的回应`"></b>
      </RouterLink>
    </nav>
    <ClockFace />
  </header>

  <RouterView v-if="L.ready" v-slot="{ Component }">
    <Transition name="paper">
      <component :is="Component" v-show="!ui.screen" :key="route.name" />
    </Transition>
  </RouterView>

  <!-- 播放条和刻钮在屏风后面就挂好、只是藏着：原来屏风拿掉的那一刻才挂，这一下的排版落在进站的镜头里（约 70 毫秒的一帧） -->
  <Deck v-show="!ui.screen" />
  <Press v-show="!ui.screen" />
  <WalkCard v-show="!ui.screen" />
  <RecordSheet v-if="!ui.screen && ui.take" />

  <Transition name="fade"><p v-if="L.toast" class="toast" role="status">{{ L.toast }}</p></Transition>
  <Screen v-if="ui.screen" @enter="enter" />
</template>
