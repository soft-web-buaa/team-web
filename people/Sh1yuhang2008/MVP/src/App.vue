<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useTimeStore } from '@/stores/time'
import { useUiStore } from '@/stores/ui'
import { engine } from '@/audio/engine'
import TopBar from '@/components/TopBar.vue'
import TimelineDock from '@/components/TimelineDock.vue'
import DetailPanel from '@/components/DetailPanel.vue'
import ImmersivePlayer from '@/components/ImmersivePlayer.vue'
import ThemeOverlay from '@/components/ThemeOverlay.vue'
import ParticleLayer from '@/components/ParticleLayer.vue'
import AboutDialog from '@/components/AboutDialog.vue'
import MemoryDialog from '@/components/MemoryDialog.vue'
import ShareCard from '@/components/ShareCard.vue'
import Toast from '@/components/Toast.vue'

const time = useTimeStore()
const ui = useUiStore()

const themeVars = computed<Record<string, string>>(() => ({
  '--accent': time.theme.accent,
  '--sky-top': time.theme.skyTop,
  '--sky-bottom': time.theme.skyBottom,
  '--map-filter': time.theme.mapFilter,
}))

onMounted(() => {
  const unlock = () => engine.unlock()
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
})
</script>

<template>
  <div class="app" :data-slot="time.slot" :class="{ 'is-immersive': time.immersive }" :style="themeVars">
    <div class="layer-map">
      <router-view />
    </div>

    <ThemeOverlay />
    <ParticleLayer :mode="time.theme.particle" :accent="time.theme.accent" />

    <div class="layer-hud">
      <p v-if="!time.immersive" class="map-note">校园平面图 · 课程演示用</p>
      <TopBar v-if="!time.immersive" />
      <TimelineDock v-if="!time.immersive" />
      <DetailPanel />
      <ImmersivePlayer v-if="time.immersive" />
      <AboutDialog v-if="ui.aboutOpen" />
      <MemoryDialog />
      <ShareCard />
      <Toast />
    </div>
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #0f1a27;
}

.layer-map {
  position: absolute;
  inset: 0;
}

.layer-hud {
  position: absolute;
  inset: 0;
  z-index: 1100;
  pointer-events: none;
}

.layer-hud > * {
  pointer-events: auto;
}

.map-note {
  position: absolute;
  left: 24px;
  top: 96px;
  z-index: 12;
  margin: 0;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(8, 24, 26, 0.55);
  backdrop-filter: blur(6px);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: rgba(243, 239, 228, 0.78);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

@media (max-width: 720px) {
  .map-note {
    display: none;
  }
}
</style>
