import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { SLOTS, minuteLabel, slotAt } from '@/themes'
import type { DaySlot } from '@/types'
import { engine } from '@/audio/engine'
import { useSoundStore } from './sound'

const DAY_TOTAL = 90_000
const START_MINUTE = 330

export const useTimeStore = defineStore('time', () => {
  const minute = ref(18 * 60 + 20)
  const immersive = ref(false)
  const playing = ref(false)
  const finished = ref(false)
  const progress = ref(0)

  const slot = computed<DaySlot>(() => slotAt(minute.value))
  const theme = computed(() => SLOTS[slot.value])
  const label = computed(() => minuteLabel(minute.value))

  let raf = 0
  let startedAt = 0
  let elapsed = 0
  let lastSlot: DaySlot | null = null

  function setMinute(value: number) {
    minute.value = ((Math.round(value) % 1440) + 1440) % 1440
  }

  function previewSlot() {
    const soundStore = useSoundStore()
    const rep = soundStore.representative(slot.value)
    if (rep) engine.playMotif(rep.motif)
  }

  function frame(now: number) {
    const p = Math.min(1, (now - startedAt) / DAY_TOTAL)
    progress.value = p
    setMinute(START_MINUTE + p * 1440)

    if (slot.value !== lastSlot) {
      lastSlot = slot.value
      const soundStore = useSoundStore()
      const rep = soundStore.representative(slot.value)
      if (rep) engine.playMotif(rep.motif)
      engine.setSlot(slot.value)
    }

    if (p < 1) {
      raf = requestAnimationFrame(frame)
    } else {
      playing.value = false
      finished.value = true
      engine.stopAmbient()
      engine.stopMotifs()
    }
  }

  function startDay() {
    engine.unlock()
    engine.stopMotifs()
    immersive.value = true
    finished.value = false
    playing.value = true
    progress.value = 0
    elapsed = 0
    startedAt = performance.now()
    lastSlot = null
    setMinute(START_MINUTE)
    engine.startAmbient(slot.value)
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
  }

  function pauseDay() {
    if (!playing.value) return
    playing.value = false
    elapsed = performance.now() - startedAt
    cancelAnimationFrame(raf)
    engine.stopAmbient()
    engine.stopMotifs()
  }

  function resumeDay() {
    if (playing.value || finished.value) return
    playing.value = true
    startedAt = performance.now() - elapsed
    engine.startAmbient(slot.value)
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(frame)
  }

  function stopDay() {
    cancelAnimationFrame(raf)
    playing.value = false
    immersive.value = false
    finished.value = false
    progress.value = 0
    elapsed = 0
    engine.stopAmbient()
    engine.stopMotifs()
  }

  function jumpTo(value: number) {
    if (immersive.value) return
    setMinute(value)
  }

  return {
    minute,
    immersive,
    playing,
    finished,
    progress,
    slot,
    theme,
    label,
    setMinute,
    previewSlot,
    startDay,
    pauseDay,
    resumeDay,
    stopDay,
    jumpTo,
  }
})
