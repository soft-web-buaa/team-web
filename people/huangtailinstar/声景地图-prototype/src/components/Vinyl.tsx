import type { SoundRecord } from '@/types'

interface Props {
  record: SoundRecord
  size?: number
  playing?: boolean
  onClick?: () => void
  showText?: boolean
}

/** 黑胶唱片视觉：中心标签 = 景色（渐变/照片）+ 感受文字的有机组合 */
export function Vinyl({ record, size = 120, playing = false, onClick, showText = true }: Props) {
  return (
    <div
      onClick={onClick}
      className={`vinyl-disc relative shrink-0 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size }}
      title={record.title}
    >
      {/* 外圈文字环 */}
      <div className="absolute inset-[3%] rounded-full pointer-events-none"
        style={{
          background: `conic-gradient(from 0deg, transparent, ${record.cover[0]}22, transparent 40%, ${record.cover[1]}22, transparent 75%)`,
        }}
      />
      <div className={`absolute inset-0 ${playing ? 'vinyl-spin' : ''}`}>
        <div className="vinyl-label"
          style={{
            background: record.photo
              ? `linear-gradient(160deg, ${record.cover[0]}cc, ${record.cover[1]}ee), url(${record.photo}) center/cover`
              : `linear-gradient(145deg, ${record.cover[0]}, ${record.cover[1]})`,
          }}
        >
          {showText && (
            <div className="relative z-10 w-full h-full flex items-center justify-center px-1.5 text-center">
              <span className="font-serif-cn leading-tight break-words"
                style={{
                  fontSize: Math.max(8, size * 0.085),
                  color: '#fff',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  fontWeight: 600,
                }}>
                {record.title.length > 16 ? record.title.slice(0, 15) + '…' : record.title}
              </span>
            </div>
          )}
        </div>
        <div className="vinyl-hole" />
      </div>
      {/* 高光 */}
      <div className="absolute inset-0 rounded-full pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.09), transparent 38%, rgba(255,255,255,0.03) 70%, transparent)' }}
      />
    </div>
  )
}

/** 播放时的波形动画 */
export function Waveform({ active, color = '#5fd4c4', bars = 28 }: { active: boolean; color?: string; bars?: number }) {
  return (
    <div className="flex items-center gap-[3px] h-8">
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i}
          className={`w-[3px] rounded-full ${active ? 'wave-bar' : ''}`}
          style={{
            height: active ? undefined : `${18 + ((i * 37) % 55)}%`,
            background: color,
            opacity: active ? 0.55 + (i % 4) * 0.12 : 0.35,
            animationDelay: active ? `${(i * 0.07) % 1}s` : undefined,
            minHeight: 3,
          }}
        />
      ))}
    </div>
  )
}
