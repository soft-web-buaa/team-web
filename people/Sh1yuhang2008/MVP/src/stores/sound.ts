import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { CATEGORIES, REPRESENTATIVES, SOUNDS } from '@/data/sounds'
import type { CategoryId, DaySlot, Memory, Sound } from '@/types'

const FAVORITES_KEY = 'hear-campus:favorites'
const PENDING_KEY = 'hear-campus:pending-memories'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage may be unavailable */
  }
}

export const useSoundStore = defineStore('sound', () => {
  const category = ref<CategoryId | 'all'>('all')
  const favorites = ref<string[]>(readJson<string[]>(FAVORITES_KEY, []))
  const pendingMemories = ref<Memory[]>(readJson<Memory[]>(PENDING_KEY, []))

  const categories = CATEGORIES
  const all = SOUNDS

  const filtered = computed<Sound[]>(() =>
    category.value === 'all' ? all : all.filter((s) => s.category === category.value),
  )

  const favoriteCount = computed(() => favorites.value.length)

  function byId(id: string | undefined): Sound | undefined {
    if (!id) return undefined
    return all.find((s) => s.id === id)
  }

  function representative(slot: DaySlot): Sound | undefined {
    return byId(REPRESENTATIVES[slot])
  }

  function isFavorite(id: string): boolean {
    return favorites.value.includes(id)
  }

  function toggleFavorite(id: string) {
    favorites.value = isFavorite(id)
      ? favorites.value.filter((item) => item !== id)
      : [...favorites.value, id]
    writeJson(FAVORITES_KEY, favorites.value)
  }

  function pendingFor(soundId: string): Memory[] {
    return pendingMemories.value.filter((m) => m.soundId === soundId)
  }

  function addPendingMemory(soundId: string, text: string, author: string): Memory {
    const memory: Memory = {
      id: `local-${Date.now()}`,
      soundId,
      author: author.trim() || '匿名同学',
      text: text.trim(),
      date: new Date().toISOString().slice(0, 10),
      pending: true,
    }
    pendingMemories.value = [memory, ...pendingMemories.value]
    writeJson(PENDING_KEY, pendingMemories.value)
    return memory
  }

  return {
    category,
    favorites,
    pendingMemories,
    categories,
    all,
    filtered,
    favoriteCount,
    byId,
    representative,
    isFavorite,
    toggleFavorite,
    pendingFor,
    addPendingMemory,
  }
})
