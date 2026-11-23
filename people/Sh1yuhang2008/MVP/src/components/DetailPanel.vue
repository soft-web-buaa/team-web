<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSoundStore } from '@/stores/sound'
import { useUiStore } from '@/stores/ui'
import { CATEGORY_MAP } from '@/data/sounds'
import { SLOTS } from '@/themes'
import { engine } from '@/audio/engine'
import type { Sound } from '@/types'

const route = useRoute()
const router = useRouter()
const store = useSoundStore()
const ui = useUiStore()

const sound = computed<Sound | undefined>(() =>
  store.byId(typeof route.params.id === 'string' ? route.params.id : undefined),
)
const category = computed(() => (sound.value ? CATEGORY_MAP[sound.value.category] : null))
const theme = computed(() => (sound.value ? SLOTS[sound.value.slot] : null))
const pending = computed(() => (sound.value ? store.pendingFor(sound.value.id) : []))
const favorite = computed(() => (sound.value ? store.isFavorite(sound.value.id) : false))

const playing = ref(false)
const progress = ref(0)
let raf = 0
let started = 0

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const bars = computed(() => {
  if (!sound.value) return []
  let seed = hash(sound.value.id)
  return Array.from({ length: 56 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = seed / 0xffffffff
    const envelope = 0.38 + Math.sin((Math.PI * (i + 1)) / 57) * 0.62
    return 0.16 + noise * envelope * 0.92
  })
})

function stop() {
  cancelAnimationFrame(raf)
  playing.value = false
  progress.value = 0
  engine.stopMotifs()
}

function loop(now: number) {
  const current = sound.value
  if (!current) return
  const p = Math.min(1, (now - started) / (current.duration * 1000))
  progress.value = p
  if (p < 1) {
    raf = requestAnimationFrame(loop)
  } else {
    playing.value = false
  }
}

function togglePlay() {
  if (!sound.value) return
  if (playing.value) {
    stop()
    return
  }
  engine.unlock()
  engine.playMotif(sound.value.motif)
  playing.value = true
  progress.value = 0
  started = performance.now()
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(loop)
}

function close() {
  stop()
  void router.push('/sound')
}

function toggleFavorite() {
  if (!sound.value) return
  store.toggleFavorite(sound.value.id)
  ui.notify(favorite.value ? '已取消收藏' : '已收藏 · 仅保存在本机')
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && sound.value) close()
}

watch(
  () => route.params.id,
  () => stop(),
)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stop()
})
</script>

<template>
  <transition name="panel">
    <aside v-if="sound && category && theme" class="panel" role="dialog" aria-modal="false" :aria-label="sound.title">
      <div class="panel__top">
        <span class="tag" :style="{ '--c': category.color }">
          <i />
          {{ category.name }}
        </span>
        <span class="tag tag--ghost">{{ theme.name }} · {{ sound.timeLabel }}</span>
        <button class="close" type="button" aria-label="关闭详情" @click="close">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <h2>{{ sound.title }}</h2>
      <p class="place">{{ sound.place }}</p>

      <div class="player">
        <button class="play" type="button" :aria-label="playing ? '停止' : '播放'" @click="togglePlay">
          <svg v-if="!playing" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 6.5h3.2v11H8zM12.8 6.5H16v11h-3.2z" fill="currentColor" />
          </svg>
        </button>

        <div class="wave" aria-hidden="true">
          <span
            v-for="(height, index) in bars"
            :key="index"
            :class="{ 'is-on': index / bars.length < progress }"
            :style="{ height: `${Math.round(height * 100)}%` }"
          />
        </div>

        <span class="duration">{{ sound.duration }}s</span>
      </div>
      <p class="synth-note">演示合成音 · 非真实录音</p>

      <p class="story">{{ sound.story }}</p>

      <section class="memories">
        <div class="memories__head">
          <h3>
            声音记忆
            <em>{{ sound.memories.length + pending.length }}</em>
          </h3>
          <button type="button" @click="ui.openMemory(sound.id)">写一条</button>
        </div>

        <ul>
          <li v-for="memory in sound.memories" :key="memory.id">
            <p>{{ memory.text }}</p>
            <footer>
              <span>{{ memory.author }}</span>
              <time>{{ memory.date }}</time>
            </footer>
          </li>
          <li v-for="memory in pending" :key="memory.id" class="is-pending">
            <p>{{ memory.text }}</p>
            <footer>
              <span>{{ memory.author }}</span>
              <em>待审核 · 仅本机可见</em>
            </footer>
          </li>
        </ul>
      </section>

      <div class="actions">
        <button type="button" :class="{ 'is-active': favorite }" @click="toggleFavorite">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.8C19 15.6 12 20 12 20z"
              :fill="favorite ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
          {{ favorite ? '已收藏' : '收藏' }}
        </button>
        <button type="button" @click="ui.openShare(sound.id)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 8.5h16v10H4zM4 8.5V6h16v2.5M8 12h4M8 15h7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          声音票根
        </button>
      </div>

      <footer class="credit">{{ sound.credit }} · 校园平面图</footer>
    </aside>
  </transition>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 104px;
  right: 22px;
  bottom: 122px;
  width: 396px;
  z-index: 26;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 22px 22px 18px;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--glass-strong);
  backdrop-filter: blur(26px) saturate(1.2);
  box-shadow: 0 30px 80px -40px rgba(8, 16, 18, 0.6);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.panel::-webkit-scrollbar {
  width: 6px;
}

.panel::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  border-radius: 99px;
}

.panel__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink);
  background: color-mix(in srgb, var(--c, var(--accent)) 16%, transparent);
}

.tag i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c, var(--accent));
}

.tag--ghost {
  background: transparent;
  color: var(--ink-soft);
  border: 1px solid var(--line);
  letter-spacing: 0.06em;
}

.close {
  margin-left: auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
}

.close:hover {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--ink) 25%, var(--line));
}

.close svg {
  width: 15px;
  height: 15px;
}

h2 {
  margin: 16px 0 0;
  font-family: var(--font-serif);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--ink);
  line-height: 1.2;
}

.place {
  margin: 7px 0 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
}

.player {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: color-mix(in srgb, #fff 38%, transparent);
}

.play {
  flex: none;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: var(--ink);
  color: #f7f3e9;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.18s ease;
}

.play:hover {
  transform: scale(1.04);
  background: color-mix(in srgb, var(--ink) 86%, var(--accent));
}

.play svg {
  width: 19px;
  height: 19px;
}

.wave {
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.wave span {
  flex: 1;
  min-width: 1px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--ink) 18%, transparent);
  transition: background 0.12s linear;
}

.wave span.is-on {
  background: var(--accent);
}

.duration {
  flex: none;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.synth-note {
  margin: 6px 0 0;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: color-mix(in srgb, var(--ink-soft) 80%, transparent);
}

.story {
  margin: 16px 0 0;
  font-size: 13.5px;
  line-height: 1.95;
  color: color-mix(in srgb, var(--ink) 88%, transparent);
  text-align: justify;
}

.memories {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.memories__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.memories__head h3 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink);
}

.memories__head h3 em {
  font-style: normal;
  font-size: 11px;
  color: var(--ink-soft);
  margin-left: 5px;
}

.memories__head button {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 11.5px;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: 4px 0;
}

.memories ul {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memories li {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}

.memories li p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: color-mix(in srgb, var(--ink) 90%, transparent);
}

.memories li footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}

.memories li footer em {
  font-style: normal;
  color: #b07a3f;
}

.memories li.is-pending {
  border: 1px dashed color-mix(in srgb, #b07a3f 45%, transparent);
  background: color-mix(in srgb, #b07a3f 6%, transparent);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.actions button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 12px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: 0.2s ease;
}

.actions button:hover {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--ink) 25%, var(--line));
}

.actions button.is-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.actions svg {
  width: 15px;
  height: 15px;
}

.credit {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--ink-soft) 75%, transparent);
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.32s ease, transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(26px);
}

@media (max-width: 720px) {
  .panel {
    top: auto;
    left: 10px;
    right: 10px;
    bottom: 10px;
    width: auto;
    max-height: 78vh;
    padding: 18px 18px 16px;
    border-radius: 24px;
  }

  h2 {
    font-size: 25px;
  }

  .panel-enter-from,
  .panel-leave-to {
    transform: translateY(30px);
  }
}
</style>
