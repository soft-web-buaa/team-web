import { useMemo } from 'react'
import { LOCATIONS } from '@/data/locations'
import type { SoundRecord } from '@/types'

export type DataLayer = 'mood' | 'activity' | 'quiet' | 'time'

interface Props {
  records: SoundRecord[]
  mode: 'original' | 'data'
  layer?: DataLayer
  timeFilter?: string
  selectedId?: string | null
  onSelect?: (locationId: string) => void
  onMapClick?: (x: number, y: number) => void
  className?: string
  compact?: boolean
}

const TIME_LABEL: Record<string, string> = {
  清晨: '06:00', 午后: '14:00', 黄昏: '18:00', 深夜: '23:00',
  此刻: '现在', 雨后: '雨后', 考试周: '任意',
}

// 数据层配色：高饱和、高对比，压暗的底图上格外醒目
function heatColor(v: number, type: DataLayer) {
  if (type === 'mood') {
    return v > 70 ? '#ffb020' : v > 45 ? '#ff5e7e' : '#4d8dff'
  }
  if (type === 'activity') {
    return v > 70 ? '#ff4747' : v > 40 ? '#ffab1f' : '#26d9b8'
  }
  return v > 70 ? '#2ff2c2' : v > 40 ? '#4fd68a' : '#9b7bff'
}

export function MapCanvas({
  records, mode, layer = 'mood', timeFilter = '此刻',
  selectedId, onSelect, onMapClick, className = '', compact = false,
}: Props) {
  const stats = useMemo(() => {
    const m = new Map<string, { count: number; mood: number; activity: number; quiet: number; times: string[] }>()
    LOCATIONS.forEach(l => m.set(l.id, { count: 0, mood: 0, activity: 0, quiet: 0, times: [] }))
    records.forEach(r => {
      const cur = m.get(r.locationId)
      if (!cur) return
      cur.count++
      cur.mood += r.mood
      cur.activity += r.activity
      cur.quiet += r.quiet
      cur.times.push(r.memoryType)
    })
    return m
  }, [records])

  const visibleRecords = useMemo(() => {
    if (layer !== 'time' || mode !== 'data') return records
    return records.filter(r => r.memoryType === timeFilter)
  }, [records, layer, timeFilter, mode])

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onMapClick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    // 命中最近地点（阈值内）则视为选点，否则传坐标
    const candidates = LOCATIONS
      .map(l => ({ id: l.id, d: Math.hypot(l.x - x, l.y - y) }))
      .filter(c => c.d < 5)
      .sort((a, b) => a.d - b.d)
    const best = candidates[0]
    if (best && onSelect) onSelect(best.id)
    else onMapClick(x, y)
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1a29] ${className}`}
      onClick={handleMapClick}
      style={{ cursor: onSelect || onMapClick ? 'crosshair' : 'default' }}
    >
      <img src={`${import.meta.env.BASE_URL}campus-map.png`} alt="北航学院路校区地图"
        className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none transition-all duration-500"
        style={mode === 'data' ? { opacity: 0.32, filter: 'grayscale(0.85) brightness(0.75)' } : undefined}
        draggable={false}
      />

      {/* 数据化图层 */}
      {mode === 'data' && (
        <div className="absolute inset-0 pointer-events-none fade-in">
          {LOCATIONS.map(loc => {
            const st = stats.get(loc.id)
            if (!st || st.count === 0) return null
            const relevant = visibleRecords.filter(r => r.locationId === loc.id)
            if (layer === 'time' && relevant.length === 0) return null
            const value = layer === 'activity'
              ? st.activity / st.count
              : layer === 'quiet'
                ? st.quiet / st.count
                : st.mood / st.count
            const size = 130 + st.count * 46
            const color = heatColor(value, layer)
            return (
              <div key={loc.id}
                className="absolute rounded-full"
                style={{
                  left: `${loc.x}%`, top: `${loc.y}%`,
                  width: size, height: size,
                  transform: 'translate(-50%,-50%)',
                  background: `radial-gradient(circle, ${color} 0%, ${color}cc 26%, ${color}55 52%, transparent 76%)`,
                  mixBlendMode: 'screen',
                  filter: 'blur(2px)',
                  boxShadow: `0 0 40px ${color}66`,
                }}
              />
            )
          })}
        </div>
      )}

      {/* 地点标记 */}
      {LOCATIONS.map(loc => {
        const st = stats.get(loc.id)
        const count = st?.count ?? 0
        const active = selectedId === loc.id
        const isData = mode === 'data'
        const dim = isData && layer === 'time' &&
          !visibleRecords.some(r => r.locationId === loc.id)
        return (
          <button key={loc.id}
            className="map-pin absolute z-20 flex flex-col items-center"
            style={{ left: `${loc.x}%`, top: `${loc.y}%`, transform: 'translate(-50%,-50%)', opacity: dim ? 0.3 : 1 }}
            onClick={(e) => { e.stopPropagation(); onSelect?.(loc.id) }}
            title={`${loc.name} · ${count} 张唱片`}
          >
            {active && <span className="ping-ring absolute rounded-full bg-[#5fd4c4]/40" style={{ width: 30, height: 30, top: -3 }} />}
            <span className={`relative flex items-center justify-center rounded-full font-bold shadow-lg transition-all ${compact ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'} ${
              active ? 'bg-[#5fd4c4] text-[#08231f] scale-110' : count > 0 ? 'bg-[#e9b26f] text-[#3a2410]' : 'bg-white/80 text-[#27404f]'
            }`}
              style={{ border: '2px solid rgba(255,255,255,0.75)' }}
            >
              {count || '·'}
            </span>
            {!compact && <span className="mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap"
              style={{ background: 'rgba(6,16,26,0.78)', color: active ? '#5fd4c4' : '#d3e1ec', border: '1px solid rgba(255,255,255,0.1)' }}>
              {loc.name}
            </span>}
          </button>
        )
      })}

      {/* 图例 */}
      {mode === 'data' && !compact && (
        <div className="absolute bottom-3 left-3 z-30 glass rounded-xl px-3 py-2 text-[11px] fade-in">
          <div className="flex items-center gap-2 mb-1.5 text-white/80 font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#5fd4c4]" />
            {layer === 'mood' ? '情绪热力' : layer === 'activity' ? '声音活跃度' : layer === 'quiet' ? '安静角落' : `时段 · ${TIME_LABEL[timeFilter] ?? timeFilter}`}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/50">低</span>
            <span className="w-20 h-1.5 rounded-full"
              style={{ background: `linear-gradient(90deg, ${heatColor(20, layer)}, ${heatColor(55, layer)}, ${heatColor(90, layer)})` }}
            />
            <span className="text-white/50">高</span>
          </div>
        </div>
      )}
    </div>
  )
}
