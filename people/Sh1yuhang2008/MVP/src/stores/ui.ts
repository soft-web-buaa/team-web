import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const aboutOpen = ref(false)
  const memoryFor = ref<string | null>(null)
  const shareFor = ref<string | null>(null)
  const toast = ref('')

  let timer: number | undefined

  function notify(message: string) {
    toast.value = message
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      toast.value = ''
    }, 2600)
  }

  function openMemory(soundId: string) {
    memoryFor.value = soundId
  }

  function closeMemory() {
    memoryFor.value = null
  }

  function openShare(soundId: string) {
    shareFor.value = soundId
  }

  function closeShare() {
    shareFor.value = null
  }

  return {
    aboutOpen,
    memoryFor,
    shareFor,
    toast,
    notify,
    openMemory,
    closeMemory,
    openShare,
    closeShare,
  }
})
