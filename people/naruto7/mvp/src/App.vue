<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { toast } from './lib/toast.js';

const route = useRoute();
const main = ref(null);
const topEl = ref(null);
const navEl = ref(null);

// 整屏页面（留声机）要知道顶栏和手机底部导航占了多高，才能刚好撑满剩下的屏幕
function measure() {
  const root = document.documentElement.style;
  root.setProperty('--top-h', `${Math.round(topEl.value ? topEl.value.getBoundingClientRect().height : 0)}px`);
  const fixedNav = navEl.value && getComputedStyle(navEl.value).position === 'fixed';
  root.setProperty('--nav-h', `${fixedNav ? Math.round(navEl.value.getBoundingClientRect().height) : 0}px`);
}
onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  document.fonts && document.fonts.ready.then(measure);
});
onBeforeUnmount(() => window.removeEventListener('resize', measure));

// 地图页还在（声音卡、话题里的链接都指向它），暂时不放进导航：舞台上的三维校园是地图。
// 两份声音数据合并之后，地图页并进留声机，见 docs/decisions/0005。
const NAV = [
  { to: '/', label: '留声机' },
  { to: '/now', label: '此刻' },
  { to: '/record', label: '留声' },
  { to: '/topics', label: '回应' },
  { to: '/time', label: '时间' },
  { to: '/about', label: '关于' },
];

function isOn(to) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}
</script>

<template>
  <button class="skip" type="button" @click="main && main.focus()">跳到正文</button>

  <header ref="topEl" class="top wrap">
    <RouterLink class="brand" to="/">听见校园</RouterLink>
    <nav ref="navEl" class="nav" aria-label="主导航">
      <RouterLink
        v-for="n in NAV"
        :key="n.to"
        :to="n.to"
        :class="{ 'is-on': isOn(n.to) }"
        :aria-current="isOn(n.to) ? 'page' : null"
      >
        {{ n.label }}
      </RouterLink>
    </nav>
  </header>

  <main id="main" ref="main" :class="route.meta.full ? 'full' : 'wrap'" tabindex="-1">
    <RouterView />
  </main>

  <div class="toast" role="status" aria-live="polite" :data-tone="toast.tone">{{ toast.msg }}</div>
</template>

<style scoped>
.skip {
  position: absolute;
  left: 1rem;
  top: -4rem;
  z-index: 40;
  padding: 0.5rem 1rem;
  border: 2px solid var(--accent);
  border-radius: 10px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
}

.skip:focus {
  top: 0.75rem;
}

.top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1rem 0.5rem;
}

.brand {
  font-size: var(--t-2);
  text-decoration: none;
  letter-spacing: 0.04em;
}

.nav a {
  color: var(--ink-2);
  text-decoration: none;
}

.nav a.is-on {
  color: var(--ink);
}

main {
  padding-block: 1rem 5.5rem;
  outline: none;
}

/* 整屏页面：去掉内边距，高度 = 视口 − 顶栏 − 手机底部导航（App.vue 里 measure 量出来） */
main.full {
  --stage-h: calc(100dvh - var(--top-h, 4rem) - var(--nav-h, 0px));
  padding: 0;
}

/* 手机：导航放在底部，单手够得到 */
@media (max-width: 759px) {
  .nav {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    padding-bottom: env(safe-area-inset-bottom);
    border-top: 1px solid var(--line-strong);
    background: var(--bg);
  }

  .nav a {
    padding: 0.85rem 0 0.8rem;
    border-top: 3px solid transparent;
    margin-top: -1px;
    text-align: center;
  }

  .nav a.is-on {
    border-top-color: var(--accent);
  }
}

@media (min-width: 760px) {
  .top {
    padding-block: 1.5rem 0.75rem;
  }

  .nav {
    display: flex;
    gap: 1.6rem;
  }

  .nav a.is-on {
    text-decoration: underline;
    text-decoration-color: var(--accent);
    text-decoration-thickness: 3px;
    text-underline-offset: 0.45em;
  }

  main {
    padding-bottom: 4rem;
  }

  main.full {
    padding: 0;
  }
}
</style>
