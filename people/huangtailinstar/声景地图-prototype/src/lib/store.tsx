import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppData, Echo, SoundRecord, Visibility } from '@/types'
import { createSeedData, COVER_PRESETS } from '@/data/seed'

const KEY = 'soundscape-data-v2'

interface StoreValue extends AppData {
  addRecord: (r: SoundRecord) => void
  toggleFavorite: (id: string) => void
  toggleLike: (id: string, userId?: string) => void
  addEcho: (id: string, echo: Echo) => void
  markRead: (id: string) => void
  markAllRead: () => void
  getRecord: (id: string) => SoundRecord | undefined
  reset: () => void
  currentUser: string
}

const Ctx = createContext<StoreValue | null>(null)

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed.records && parsed.inbox && parsed.collections) return parsed
    }
  } catch { /* 使用种子数据 */ }
  return createSeedData()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => load())

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* 忽略容量限制 */ }
  }, [data])

  const value = useMemo<StoreValue>(() => ({
    ...data,
    currentUser: 'me',
    addRecord: (r) => setData(d => ({ ...d, records: [r, ...d.records] })),
    toggleFavorite: (id) => setData(d => ({
      ...d,
      records: d.records.map(r => r.id === id ? { ...r, favorite: !r.favorite } : r),
    })),
    toggleLike: (id, userId = 'me') => setData(d => ({
      ...d,
      records: d.records.map(r => {
        if (r.id !== id) return r
        const has = r.likedBy.includes(userId)
        return { ...r, likedBy: has ? r.likedBy.filter(u => u !== userId) : [...r.likedBy, userId] }
      }),
    })),
    addEcho: (id, echo) => setData(d => ({
      ...d,
      records: d.records.map(r => r.id === id ? { ...r, echoes: [...r.echoes, echo] } : r),
    })),
    markRead: (id) => setData(d => ({
      ...d,
      inbox: d.inbox.map(m => m.id === id ? { ...m, read: true } : m),
    })),
    markAllRead: () => setData(d => ({ ...d, inbox: d.inbox.map(m => ({ ...m, read: true })) })),
    getRecord: (id) => data.records.find(r => r.id === id),
    reset: () => setData(createSeedData()),
  }), [data])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore 必须在 StoreProvider 内使用')
  return v
}

let seq = 0
export function makeRecordId() {
  return `u-${Date.now().toString(36)}-${seq++}`
}

export function buildUserRecord(p: {
  title: string
  locationId: string
  locationName: string
  photo?: string
  scene: SoundRecord['scene']
  audioUrl?: string
  duration: number
  memoryType: SoundRecord['memoryType']
  visibility: Visibility
  inCommunity: boolean
  collectionId?: string
  isCapsule: boolean
  unlockAt?: number
}): SoundRecord {
  const cover = COVER_PRESETS[Math.floor(Math.random() * COVER_PRESETS.length)] as [string, string]
  return {
    id: makeRecordId(),
    title: p.title || '此刻，说不出名字的声音',
    locationId: p.locationId,
    locationName: p.locationName,
    authorId: 'me',
    authorName: '我',
    authorColor: '#7fd4c1',
    cover,
    photo: p.photo,
    scene: p.scene,
    audioUrl: p.audioUrl,
    duration: p.duration,
    createdAt: Date.now(),
    memoryType: p.memoryType,
    visibility: p.visibility,
    inCommunity: p.inCommunity && p.visibility !== '仅自己',
    isMine: true,
    favorite: false,
    likedBy: [],
    echoes: [],
    collectionId: p.collectionId,
    isCapsule: p.isCapsule,
    unlockAt: p.unlockAt,
    mood: 60 + Math.floor(Math.random() * 35),
    activity: 35 + Math.floor(Math.random() * 55),
    quiet: 30 + Math.floor(Math.random() * 55),
  }
}
