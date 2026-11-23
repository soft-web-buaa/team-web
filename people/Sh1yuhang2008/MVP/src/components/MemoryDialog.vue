<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSoundStore } from '@/stores/sound'

const ui = useUiStore()
const store = useSoundStore()

const text = ref('')
const author = ref('')
const max = 100

const sound = computed(() => store.byId(ui.memoryFor ?? undefined))

watch(
  () => ui.memoryFor,
  () => {
    text.value = ''
    author.value = ''
  },
)

function submit() {
  if (!sound.value) return
  const value = text.value.trim()
  if (value.length < 4) {
    ui.notify('再多写几个字吧')
    return
  }
  store.addPendingMemory(sound.value.id, value, author.value)
  ui.closeMemory()
  ui.notify('已提交 · 审核通过后展示')
}
</script>

<template>
  <div v-if="sound" class="modal" role="dialog" aria-modal="true" aria-label="写一条声音记忆" @click.self="ui.closeMemory()">
    <div class="modal__card memory">
      <button class="modal__close" type="button" aria-label="关闭" @click="ui.closeMemory()">×</button>
      <p class="eyebrow">MEMORY · 声音记忆</p>
      <h2>关于「{{ sound.title }}」</h2>
      <p class="hint">
        写下你在这个地方听到声音时想起的一件事。提交后会进入审核，通过后才会出现在公开页面。
      </p>

      <label class="field">
        <span>你的记忆</span>
        <textarea
          v-model="text"
          :maxlength="max"
          rows="4"
          placeholder="比如：毕业前最后一次闭馆，保安说“明天再来”……"
        />
        <em>{{ text.length }} / {{ max }}</em>
      </label>

      <label class="field field--inline">
        <span>署名</span>
        <input v-model="author" type="text" maxlength="16" placeholder="匿名同学" />
      </label>

      <p class="notice">演示版：投稿仅保存在本机，标记为「待审核」，不会上传服务器。</p>

      <div class="modal__actions">
        <button type="button" class="ghost" @click="ui.closeMemory()">取消</button>
        <button type="button" class="primary" @click="submit">提交审核</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal__card.memory {
  max-width: 480px;
}

h2 {
  margin: 8px 0 0;
  font-family: var(--font-serif);
  font-size: 25px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink);
}

.hint {
  margin: 10px 0 18px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--ink-soft);
}

.field {
  display: block;
  position: relative;
  margin-bottom: 12px;
}

.field > span {
  display: block;
  margin-bottom: 6px;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--ink-soft);
}

.field textarea,
.field input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: color-mix(in srgb, #fff 45%, transparent);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink);
  outline: none;
  resize: none;
}

.field textarea:focus,
.field input:focus {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
}

.field em {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-style: normal;
  font-size: 9.5px;
  color: var(--ink-soft);
}

.field--inline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field--inline > span {
  margin: 0;
  flex: none;
}

.notice {
  margin: 6px 0 18px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, #b07a3f 7%, transparent);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: #8b5f2f;
}

.modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal__actions button {
  padding: 9px 18px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.ghost {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-soft);
}

.primary {
  border: none;
  background: var(--ink);
  color: #f7f3e9;
}

.primary:hover {
  background: color-mix(in srgb, var(--ink) 88%, var(--accent));
}
</style>
