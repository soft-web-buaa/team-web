import type { DaySlot, ParticleMode } from '@/types'

export interface SlotTheme {
  id: DaySlot
  name: string
  range: string
  skyTop: string
  skyBottom: string
  accent: string
  mapFilter: string
  particle: ParticleMode
  drone: number
}

export const SLOT_ORDER: DaySlot[] = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night']

export const SLOTS: Record<DaySlot, SlotTheme> = {
  dawn: {
    id: 'dawn',
    name: '黎明',
    range: '05:30 – 07:00',
    skyTop: '#2e3a59',
    skyBottom: '#e8a87c',
    accent: '#e8a87c',
    mapFilter: 'brightness(.96) saturate(.9)',
    particle: 'mist',
    drone: 220,
  },
  morning: {
    id: 'morning',
    name: '上午',
    range: '07:00 – 11:00',
    skyTop: '#cfe0e8',
    skyBottom: '#f5f1e8',
    accent: '#5b7fa6',
    mapFilter: 'brightness(1) saturate(.92)',
    particle: null,
    drone: 330,
  },
  noon: {
    id: 'noon',
    name: '正午',
    range: '11:00 – 14:00',
    skyTop: '#fff8e7',
    skyBottom: '#e0b15c',
    accent: '#c08a3e',
    mapFilter: 'contrast(1.02) brightness(1) saturate(.95)',
    particle: 'heat',
    drone: 440,
  },
  afternoon: {
    id: 'afternoon',
    name: '下午',
    range: '14:00 – 17:00',
    skyTop: '#f3e2c7',
    skyBottom: '#c98b5e',
    accent: '#b5794d',
    mapFilter: 'brightness(1) saturate(.92)',
    particle: null,
    drone: 392,
  },
  dusk: {
    id: 'dusk',
    name: '黄昏',
    range: '17:00 – 19:00',
    skyTop: '#6b4c7a',
    skyBottom: '#f08a5d',
    accent: '#f08a5d',
    mapFilter: 'sepia(.08) brightness(.95) saturate(.96)',
    particle: 'bird',
    drone: 294,
  },
  night: {
    id: 'night',
    name: '夜晚',
    range: '19:00 – 05:30',
    skyTop: '#0f1b2d',
    skyBottom: '#3e6b8f',
    accent: '#7fb3d5',
    mapFilter: 'brightness(.55) saturate(.6)',
    particle: 'firefly',
    drone: 196,
  },
}

const RANGES: Array<{ id: DaySlot; start: number; end: number }> = [
  { id: 'dawn', start: 330, end: 420 },
  { id: 'morning', start: 420, end: 660 },
  { id: 'noon', start: 660, end: 840 },
  { id: 'afternoon', start: 840, end: 1020 },
  { id: 'dusk', start: 1020, end: 1140 },
  { id: 'night', start: 1140, end: 330 },
]

export function slotAt(minute: number): DaySlot {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440
  for (const r of RANGES) {
    if (r.start < r.end) {
      if (m >= r.start && m < r.end) return r.id
    } else if (m >= r.start || m < r.end) {
      return r.id
    }
  }
  return 'night'
}

export function minuteLabel(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export const SLOT_STARTS = RANGES.map((r) => ({ id: r.id, start: r.start }))
