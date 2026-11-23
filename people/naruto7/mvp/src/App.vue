<script setup>
import { ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { toast } from './lib/toast.js';

const route = useRoute();
const main = ref(null);

const NAV = [
  { to: '/', label: '首页' },
  { to: '/map', label: '地图' },
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

  <header class="top wrap">
    <RouterLink class="brand" to="/">听见校园</RouterLink>
    <nav class="nav" aria-label="主导航">
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

  <main id="main" ref="main" class="wrap" tabindex="-1">
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
}
</style>
