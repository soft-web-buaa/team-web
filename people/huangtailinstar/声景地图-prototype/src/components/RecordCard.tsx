import { Heart, MapPin, Play, Bookmark, Lock } from 'lucide-react'
import type { SoundRecord } from '@/types'
import { Vinyl } from './Vinyl'

interface Props {
  record: SoundRecord
  onClick: () => void
  size?: 'sm' | 'md'
}

export function RecordCard({ record, onClick, size = 'md' }: Props) {
  const locked = record.isCapsule && !!record.unlockAt && record.unlockAt > Date.now()
  return (
    <button onClick={onClick}
      className="card-hover glass group relative w-full rounded-2xl p-4 text-left overflow-hidden">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 30%, ${record.cover[0]}22, transparent 65%)` }} />
      <div className="relative flex items-start gap-3.5">
        <div className="relative shrink-0">
          <Vinyl record={record} size={size === 'sm' ? 62 : 76} showText={false} />
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <span className="w-9 h-9 rounded-full bg-[#5fd4c4]/90 text-[#06241f] flex items-center justify-center shadow-lg">
              {locked ? <Lock className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-serif-cn text-sm leading-snug text-white line-clamp-2 mb-2">{record.title}</p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/45">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{record.locationName}</span>
            <span className="flex items-center gap-1" style={{ color: record.authorColor }}>{record.authorName}</span>
          </div>
          <div className="flex items-center gap-3 mt-2.5 text-[11px] text-white/40">
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{record.likedBy.length}</span>
            <span className="tag !py-0 !px-1.5">{record.memoryType}</span>
            {record.favorite && <Bookmark className="w-3 h-3 text-amber-300" fill="currentColor" />}
            {record.echoes.length > 0 && <span className="text-[#5fd4c4]">{record.echoes.length} 回声</span>}
          </div>
        </div>
      </div>
    </button>
  )
}
