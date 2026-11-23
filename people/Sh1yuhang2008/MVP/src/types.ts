export type CategoryId = 'study' | 'life' | 'sport' | 'nature'

export type DaySlot = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night'

export type ParticleMode = 'mist' | 'heat' | 'bird' | 'firefly' | null

export interface Motif {
  notes: number[]
  type: OscillatorType
  step: number
  decay: number
  noise?: number
}

export interface Memory {
  id: string
  author: string
  text: string
  date: string
  pending?: boolean
  soundId?: string
}

export interface Sound {
  id: string
  title: string
  category: CategoryId
  slot: DaySlot
  timeLabel: string
  place: string
  x: number
  y: number
  story: string
  duration: number
  credit: string
  motif: Motif
  memories: Memory[]
}

export interface Category {
  id: CategoryId
  name: string
  color: string
}
