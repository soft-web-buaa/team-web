<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <transition name="toast">
    <div v-if="ui.toast" class="toast" role="status">{{ ui.toast }}</div>
  </transition>
</template>

<style scoped>
.toast {
  position: absolute;
  left: 50%;
  bottom: 200px;
  transform: translateX(-50%);
  z-index: 70;
  padding: 9px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 92%, transparent);
  color: #f6f2e7;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  box-shadow: 0 16px 40px -20px rgba(8, 16, 18, 0.7);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (max-width: 720px) {
  .toast {
    bottom: 96px;
    max-width: calc(100% - 32px);
    white-space: normal;
    text-align: center;
  }
}
</style>
