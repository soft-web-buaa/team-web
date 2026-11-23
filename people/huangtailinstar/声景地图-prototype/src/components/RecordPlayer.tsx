import { useEffect, useRef, useState } from 'react'
import {
  X, Heart, Play, Pause, Bookmark, Volume2, MapPin, Clock3,
  ChevronRight, Send, Mic, Sparkles, Lock, Users, Globe2, Headphones,
} from 'lucide-react'
import type { Echo, Scene, SoundRecord } from '@/types'
import { useStore } from '@/lib/store'
import { AmbientPlayer, SCENE_LABEL } from '@/lib/audio'
import { Vinyl, Waveform } from './Vinyl'

const VIS_ICON = { '匿名公开': Globe2, '好友可见': Users, '仅自己': Lock }

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function EchoCard({ echo }: { echo: Echo }) {
  const [playing, setPlaying] = useState(false)
  const playerRef = useRef<AmbientPlayer | null>(null)
  useEffect(() => () => playerRef.current?.destroy(), [])
  const toggle = () => {
    if (!playerRef.current) {
      playerRef.current = new AmbientPlayer(echo.scene, 15)
      playerRef.current.onEnd = () => setPlaying(false)
    }
    if (playing) { playerRef.current.pause(); setPlaying(false) }
    else { void playerRef.current.play(); setPlaying(true) }
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] border border-white/[0.06] p-2.5">
      <button onClick={toggle} className="relative shrink-0" title="播放回声">
        <Vinyl record={{
          ...echo, id: echo.id, locationId: '', locationName: '', authorId: '',
          duration: 15, createdAt: echo.createdAt, memoryType: '此刻',
          visibility: '匿名公开', inCommunity: true, isMine: false, favorite: false,
          likedBy: [], echoes: [], isCapsule: false, mood: 50, activity: 30, quiet: 30,
        } as unknown as SoundRecord} size={44} playing={playing} showText={false} />
        <span className="absolute inset-0 flex items-center justify-center">
          {playing ? <Pause className="w-3.5 h-3.5 text-white drop-shadow" fill="white" /> : <Play className="w-3.5 h-3.5 text-white drop-shadow" fill="white" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold" style={{ color: echo.authorColor }}>{echo.authorName}</span>
          <span className="text-white/35">的回声</span>
          <span className="tag !py-0 !px-1.5">{SCENE_LABEL[echo.scene]}</span>
        </div>
        <p className="font-serif-cn text-sm text-white/85 mt-0.5 truncate">{echo.text}</p>
      </div>
    </div>
  )
}

interface Props {
  record: SoundRecord
  onClose: () => void
}

export function RecordPlayer({ record, onClose }: Props) {
  const store = useStore()
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [echoText, setEchoText] = useState('')
  const [echoScene, setEchoScene] = useState<Scene>(record.scene)
  const playerRef = useRef<AmbientPlayer | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const liked = record.likedBy.includes('me')

  const locked = record.isCapsule && !!record.unlockAt && record.unlockAt > Date.now()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      playerRef.current?.destroy()
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    }
  }, [onClose])

  const toggle = () => {
    if (locked) return
    if (playing) {
      playerRef.current?.pause()
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    if (record.audioUrl) {
      if (!audioRef.current) {
        const a = new Audio(record.audioUrl)
        a.onended = () => { setPlaying(false); setProgress(0) }
        a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0)
        audioRef.current = a
      }
      void audioRef.current.play()
    } else {
      if (!playerRef.current) {
        playerRef.current = new AmbientPlayer(record.scene, record.duration)
        playerRef.current.onTick = setProgress
        playerRef.current.onEnd = () => { setPlaying(false); setProgress(0) }
      }
      void playerRef.current.play()
    }
    setPlaying(true)
  }

  const submitEcho = () => {
    if (!echoText.trim()) return
    const echo: Echo = {
      id: `echo-${Date.now()}`,
      authorName: '我', authorColor: '#7fd4c1',
      text: echoText.trim(), scene: echoScene,
      cover: record.cover, createdAt: Date.now(),
    }
    store.addEcho(record.id, echo)
    setEchoText('')
  }

  const VisIcon = VIS_ICON[record.visibility]
  const collection = store.collections.find(c => c.id === record.collectionId)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#030a12]/80 backdrop-blur-md p-3 fade-in"
      onClick={onClose}>
      <div className="glass relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl rise-in"
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 rounded-full p-2 bg-white/10 hover:bg-white/20 text-white/80 transition">
          <X className="w-5 h-5" />
        </button>

        <div className="grid md:grid-cols-[340px_1fr]">
          {/* 左侧：唱片封面 */}
          <div className="relative p-8 flex flex-col items-center justify-center"
            style={{ background: `linear-gradient(160deg, ${record.cover[1]}33, #0b1a29 70%)` }}>
            <div className="noise-overlay" />
            <div className="relative float-y">
              <Vinyl record={record} size={230} playing={playing} onClick={locked ? undefined : toggle} />
              <button onClick={toggle}
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#5fd4c4] text-[#06241f] flex items-center justify-center shadow-2xl hover:scale-105 transition disabled:opacity-40"
                disabled={locked}>
                {locked ? <Lock className="w-6 h-6" /> : playing ? <Pause className="w-7 h-7" fill="currentColor" /> : <Play className="w-7 h-7 ml-1" fill="currentColor" />}
              </button>
            </div>
            <div className="relative mt-7 w-full flex items-center gap-2">
              <span className="text-xs text-white/50 tabular-nums">{fmt(progress * record.duration)}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden cursor-pointer"
                onClick={(e) => {
                  if (!record.audioUrl || !audioRef.current) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * audioRef.current.duration
                }}>
                <div className="h-full rounded-full bg-[#5fd4c4] transition-[width]"
                  style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="text-xs text-white/50 tabular-nums">{fmt(record.duration)}</span>
            </div>
            <Waveform active={playing && !locked} bars={24} />
            <p className="relative mt-3 text-[11px] flex items-center gap-1.5 text-white/45">
              <Headphones className="w-3.5 h-3.5" />
              {record.audioUrl ? '你的原始录音' : `现场合成声景 · ${SCENE_LABEL[record.scene]}`}
            </p>
          </div>

          {/* 右侧：信息 */}
          <div className="p-7 md:p-9">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="tag"><span className="w-1.5 h-1.5 rounded-full" style={{ background: record.authorColor }} />{record.authorName}</span>
              <span className="tag"><MapPin className="w-3 h-3" />{record.locationName}</span>
              <span className="tag"><Clock3 className="w-3 h-3" />{record.memoryType}</span>
              <span className="tag"><VisIcon className="w-3 h-3" />{record.visibility}</span>
            </div>

            <h2 className="font-serif-cn text-2xl md:text-3xl leading-relaxed text-white mb-3">
              「{record.title}」
            </h2>
            <p className="text-sm text-white/50">
              {new Date(record.createdAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' · '}录制于 {record.locationName}
            </p>

            {locked && (
              <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-200/90">
                <div className="flex items-center gap-2 font-semibold mb-1"><Lock className="w-4 h-4" />时间胶囊尚未开启</div>
                将在 {new Date(record.unlockAt!).toLocaleString('zh-CN')} 送达，请耐心等待。
              </div>
            )}

            {collection && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 flex items-center gap-3">
                <Sparkles className="w-5 h-5 shrink-0" style={{ color: collection.color }} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">收录于「{collection.name}」</div>
                  <div className="text-xs text-white/45 truncate">{collection.theme} · {collection.kind}合辑</div>
                </div>
                <ChevronRight className="w-4 h-4 ml-auto text-white/30" />
              </div>
            )}

            {/* 操作 */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => store.toggleLike(record.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition border ${
                  liked ? 'bg-rose-500/20 border-rose-400/40 text-rose-300' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}>
                <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
                {liked ? '已被打动' : '被打动了'} · {record.likedBy.length}
              </button>
              <button onClick={() => store.toggleFavorite(record.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition border ${
                  record.favorite ? 'bg-amber-400/20 border-amber-400/40 text-amber-200' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}>
                <Bookmark className="w-4 h-4" fill={record.favorite ? 'currentColor' : 'none'} />
                {record.favorite ? '已收藏' : '收藏'}
              </button>
            </div>

            {/* 回声区 */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85 mb-3">
                <Volume2 className="w-4 h-4 text-[#5fd4c4]" />
                在这里留下的回声 <span className="text-white/35 font-normal">({record.echoes.length})</span>
              </h3>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {record.echoes.map(e => <EchoCard key={e.id} echo={e} />)}
                {record.echoes.length === 0 && (
                  <p className="text-xs text-white/35 py-3">还没有回声，留下你的声音吧。</p>
                )}
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <textarea value={echoText} onChange={e => setEchoText(e.target.value)}
                  placeholder="也在这里录下你的唱片…写一句回应"
                  className="w-full bg-transparent resize-none text-sm outline-none placeholder:text-white/30 min-h-[52px]"
                />
                <div className="flex items-center gap-2 mt-2">
                  <select value={echoScene} onChange={e => setEchoScene(e.target.value as Scene)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs outline-none">
                    {(Object.keys(SCENE_LABEL) as Scene[]).map(s => <option key={s} value={s} className="bg-[#132234]">{SCENE_LABEL[s]}</option>)}
                  </select>
                  <span className="text-[10px] text-white/35 flex items-center gap-1"><Mic className="w-3 h-3" />小区域显示，不遮挡原唱片</span>
                  <button onClick={submitEcho} disabled={!echoText.trim()}
                    className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg btn-primary text-xs disabled:opacity-35 disabled:cursor-not-allowed">
                    <Send className="w-3.5 h-3.5" />留下回声
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
