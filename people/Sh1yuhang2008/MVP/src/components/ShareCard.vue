<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSoundStore } from '@/stores/sound'
import { CATEGORY_MAP } from '@/data/sounds'
import { SLOTS } from '@/themes'

const ui = useUiStore()
const store = useSoundStore()

const sound = computed(() => store.byId(ui.shareFor ?? undefined))
const theme = computed(() => (sound.value ? SLOTS[sound.value.slot] : null))
const category = computed(() => (sound.value ? CATEGORY_MAP[sound.value.category] : null))

const bars = computed(() => {
  if (!sound.value) return []
  let seed = 7
  for (const char of sound.value.id) seed = (seed * 31 + char.charCodeAt(0)) >>> 0
  return Array.from({ length: 42 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return 12 + (seed % 26)
  })
})

async function copyLink() {
  if (!sound.value) return
  const url = `${location.origin}${location.pathname}#/sound/${sound.value.id}`
  try {
    await navigator.clipboard.writeText(url)
    ui.notify('链接已复制')
  } catch {
    ui.notify('复制失败，请手动复制地址栏')
  }
}
</script>

<template>
  <div v-if="sound && theme && category" class="modal" role="dialog" aria-modal="true" aria-label="声音票根" @click.self="ui.closeShare()">
    <div class="share">
      <button class="modal__close share__close" type="button" aria-label="关闭" @click="ui.closeShare()">×</button>

      <div class="ticket">
        <header class="ticket__head">
          <span>听见校园 · 声音票根</span>
          <span>NO. {{ sound.id.replace('snd-', '') }}</span>
        </header>

        <div class="ticket__body">
          <p class="ticket__cat" :style="{ '--c': category.color }">
            <i />
            {{ category.name }} · {{ theme.name }}
          </p>
          <h2>{{ sound.title }}</h2>
          <p class="ticket__place">{{ sound.place }}</p>

          <div class="ticket__wave" aria-hidden="true">
            <span v-for="(height, index) in bars" :key="index" :style="{ height: `${height}px` }" />
          </div>

          <div class="ticket__meta">
            <span>{{ sound.timeLabel }}</span>
            <span>{{ sound.duration }}s</span>
            <span>{{ sound.credit }}</span>
          </div>
        </div>

        <footer class="ticket__stub">
          <span>北京航空航天大学 · 学院路校区</span>
          <span class="ticket__barcode" aria-hidden="true">
            <i v-for="n in 18" :key="n" :style="{ width: `${1 + (n % 3)}px` }" />
          </span>
        </footer>
      </div>

      <div class="share__actions">
        <button type="button" class="ghost" @click="ui.closeShare()">关闭</button>
        <button type="button" class="primary" @click="copyLink">复制链接</button>
      </div>
      <p class="share__note">演示版不生成图片；复制链接可在同一浏览器打开。</p>
    </div>
  </div>
</template>

<style scoped>
.share {
  position: relative;
  width: min(420px, calc(100vw - 32px));
}

.share__close {
  position: absolute;
  top: -14px;
  right: -8px;
  z-index: 2;
  background: var(--glass-strong);
}

.ticket {
  border-radius: 18px;
  overflow: hidden;
  background: #f4efe2;
  color: #1e2a29;
  box-shadow: 0 30px 80px -30px rgba(6, 12, 16, 0.65);
}

.ticket__head {
  display: flex;
  justify-content: space-between;
  padding: 12px 18px;
  font-size: 9.5px;
  letter-spacing: 0.18em;
  color: #6d756c;
  border-bottom: 1px dashed rgba(30, 42, 41, 0.22);
}

.ticket__body {
  padding: 20px 20px 16px;
}

.ticket__cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: #6d756c;
}

.ticket__cat i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c);
}

h2 {
  margin: 10px 0 0;
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #1a2524;
}

.ticket__place {
  margin: 6px 0 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: #70786f;
}

.ticket__wave {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 38px;
  margin-top: 20px;
}

.ticket__wave span {
  flex: 1;
  border-radius: 2px;
  background: color-mix(in srgb, var(--accent) 70%, #6d756c);
  opacity: 0.85;
}

.ticket__meta {
  display: flex;
  gap: 14px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(30, 42, 41, 0.12);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  color: #70786f;
}

.ticket__stub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  background: #e9e2d1;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: #6d756c;
}

.ticket__barcode {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 18px;
}

.ticket__barcode i {
  display: block;
  height: 100%;
  background: #3a4542;
}

.share__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.share__actions button {
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 11.5px;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.ghost {
  border: 1px solid color-mix(in srgb, #f3efe4 30%, transparent);
  background: transparent;
  color: #f3efe4;
}

.primary {
  border: none;
  background: #f3efe4;
  color: #17211f;
}

.share__note {
  margin: 8px 0 0;
  text-align: right;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, #f3efe4 55%, transparent);
}
</style>
