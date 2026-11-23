import { useRef, useState } from 'react'
import {
  X, MapPin, Mic, Camera, PenLine, ArrowRight, ArrowLeft,
  SkipForward, Sparkles, Clock3, Eye, ListMusic, Upload, Volume2, Square,
} from 'lucide-react'
import type { MemoryType, Visibility } from '@/types'
import { LOCATIONS, getLocation } from '@/data/locations'
import { useStore, buildUserRecord } from '@/lib/store'
import { useRecorder } from '@/hooks/useRecorder'
import { AmbientPlayer, SCENE_LABEL } from '@/lib/audio'
import type { Scene } from '@/types'
import { MapCanvas } from './MapCanvas'

const MEMORY_TYPES: MemoryType[] = ['此刻', '清晨', '午后', '黄昏', '深夜', '雨后', '考试周']
const VISIBILITIES: Visibility[] = ['匿名公开', '好友可见', '仅自己']
const SCENES: Scene[] = ['birds', 'wind', 'rain', 'canteen', 'footsteps', 'library', 'gym', 'night', 'fountain', 'leaves', 'chatter', 'music']

interface Props {
  onClose: () => void
  initialLocationId?: string | null
  onDone?: () => void
}

export function CreateFlow({ onClose, initialLocationId, onDone }: Props) {
  const store = useStore()
  // 0 选地点 1 录音 2 拍照 3 写一句话 / 4 增强（写完直接进入）
  const [stage, setStage] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [locationId, setLocationId] = useState<string | null>(initialLocationId ?? null)
  const [customLoc, setCustomLoc] = useState<{ x: number; y: number } | null>(null)
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState<string | undefined>()
  const [scene, setScene] = useState<Scene>('birds')
  const [memoryType, setMemoryType] = useState<MemoryType>('此刻')
  const [visibility, setVisibility] = useState<Visibility>('匿名公开')
  const [collectionId, setCollectionId] = useState<string | undefined>()
  const [capsule, setCapsule] = useState(false)
  const [unlockAt, setUnlockAt] = useState('')
  const [shareCommunity, setShareCommunity] = useState(true)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const playerRef = useRef<AmbientPlayer | null>(null)
  const recorder = useRecorder(30)

  const steps = ['选地点', '录声音', '拍一张', '写一句', '增强']
  const locationName = locationId ? getLocation(locationId)?.name : customLoc ? '地图上的某个角落' : ''

  const pickSceneFromLocation = (id: string) => {
    const map: Record<string, Scene> = {
      lib: 'library', lake: 'wind', main: 'fountain', newmain: 'chatter',
      field: 'leaves', gym: 'gym', canteen: 'canteen', dorm: 'footsteps',
      ginkgo: 'leaves', woods: 'birds', cafe: 'music', lab: 'night',
      north: 'wind', south: 'night',
    }
    setScene(map[id] ?? 'birds')
  }

  const chooseLocation = (id: string) => {
    setLocationId(id)
    setCustomLoc(null)
    pickSceneFromLocation(id)
  }

  const preview = () => {
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; setPreviewPlaying(false); return }
    const p = new AmbientPlayer(scene, 8)
    p.onEnd = () => { setPreviewPlaying(false); p.destroy(); playerRef.current = null }
    playerRef.current = p
    void p.play()
    setPreviewPlaying(true)
  }

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(file)
  }

  const publish = (enhanced: boolean) => {
    if (!locationId && !customLoc) return
    const rec = buildUserRecord({
      title: title.trim() || '此刻，说不出名字的声音',
      locationId: locationId ?? 'custom',
      locationName: locationName ?? '地图上的某个角落',
      photo,
      scene,
      audioUrl: recorder.audioUrl,
      duration: Math.max(recorder.seconds, 12),
      memoryType: enhanced ? memoryType : '此刻',
      visibility: enhanced ? visibility : '匿名公开',
      inCommunity: enhanced ? shareCommunity : true,
      collectionId: enhanced ? collectionId : undefined,
      isCapsule: enhanced ? capsule : false,
      unlockAt: enhanced && capsule && unlockAt ? new Date(unlockAt).getTime() : undefined,
    })
    store.addRecord(rec)
    playerRef.current?.destroy()
    onDone?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#030a12]/85 backdrop-blur-md p-3 fade-in">
      <div className="glass relative w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-3xl shadow-2xl rise-in">
        <button onClick={onClose} className="absolute top-4 right-4 z-20 rounded-full p-2 bg-white/10 hover:bg-white/20 text-white/80 transition">
          <X className="w-5 h-5" />
        </button>

        {/* 进度 */}
        <div className="px-6 md:px-10 pt-8 pb-5 border-b border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <span className="tag !text-[#5fd4c4] !border-[#5fd4c4]/30">
              {stage <= 3 ? '第一段 · 基础记录' : '第二段 · 增强（可跳过）'}
            </span>
          </div>
          <h2 className="font-serif-cn text-2xl md:text-3xl text-white mb-5">
            {stage <= 3 ? '把此刻，压成一张唱片' : '再给这段记忆一点意义'}
          </h2>
          <div className="flex gap-1.5">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-all ${i <= stage ? 'bg-[#5fd4c4]' : 'bg-white/10'}`} />
                <div className={`text-[10px] mt-1.5 ${i === stage ? 'text-[#5fd4c4]' : i < stage ? 'text-white/45' : 'text-white/25'}`}>{i + 1}. {s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 md:px-10 py-7">
          {/* 第一步：选地点 */}
          {stage === 0 && (
            <div className="rise-in">
              <p className="text-sm text-white/60 mb-4">在地图上点击你所在的位置，或从常用地点中选择。</p>
              <div className="grid md:grid-cols-[1fr_240px] gap-5">
                <MapCanvas records={store.records} mode="original" compact
                  className="aspect-[1038/1076] max-h-[430px]"
                  selectedId={locationId}
                  onSelect={(id) => chooseLocation(id)}
                  onMapClick={(x, y) => { setCustomLoc({ x, y }); setLocationId(null); setScene('wind') }}
                />
                <div className="space-y-2">
                  <div className="text-xs text-white/45 mb-2">常用地点</div>
                  <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
                    {LOCATIONS.map(l => (
                      <button key={l.id} onClick={() => chooseLocation(l.id)}
                        className={`rounded-lg px-2.5 py-2 text-left text-xs border transition ${
                          locationId === l.id ? 'bg-[#5fd4c4]/15 border-[#5fd4c4]/50 text-[#5fd4c4]' : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/10'
                        }`}>
                        <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />{l.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 第二步：录音 */}
          {stage === 1 && (
            <div className="rise-in max-w-2xl mx-auto text-center py-6">
              <div className="relative w-40 h-40 mx-auto mb-6">
                <div className={`absolute inset-0 rounded-full border-2 ${recorder.recording ? 'border-rose-400/60 ping-ring' : 'border-white/10'}`} />
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#1d3548] to-[#0d1c2b] flex items-center justify-center shadow-2xl">
                  {recorder.recording ? (
                    <button onClick={recorder.stop} className="w-20 h-20 rounded-full bg-rose-500/90 flex items-center justify-center hover:scale-105 transition">
                      <Square className="w-7 h-7 text-white" fill="white" />
                    </button>
                  ) : (
                    <button onClick={() => void recorder.start()} className="w-20 h-20 rounded-full btn-primary flex items-center justify-center">
                      <Mic className="w-8 h-8" />
                    </button>
                  )}
                </div>
              </div>
              <div className="font-mono text-4xl text-white tabular-nums mb-2">
                00:{String(recorder.seconds).padStart(2, '0')}
              </div>
              <p className="text-sm text-white/50 mb-6">
                {recorder.recording ? '正在聆听此刻的声音… 最长 30 秒' : recorder.audioUrl ? '录音已保存，可以进入下一步' : '点击麦克风开始录音（可选）'}
              </p>
              {recorder.error && (
                <div className="rounded-xl bg-amber-400/10 border border-amber-400/25 text-amber-200/90 text-xs p-3 mb-5">{recorder.error}</div>
              )}
              {recorder.audioUrl && (
                <audio src={recorder.audioUrl} controls className="mx-auto mb-5 w-full max-w-md" />
              )}
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 text-left">
                <div className="text-xs text-white/55 mb-3 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" /> 没有录音也没关系——选一种声景作为这张唱片的底色
                </div>
                <div className="flex flex-wrap gap-2">
                  {SCENES.map(s => (
                    <button key={s} onClick={() => setScene(s)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition ${
                        scene === s ? 'bg-[#e9b26f]/20 border-[#e9b26f]/50 text-[#e9b26f]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                      }`}>{SCENE_LABEL[s]}</button>
                  ))}
                </div>
                <button onClick={preview} className="mt-3 text-xs text-[#5fd4c4] flex items-center gap-1.5 hover:underline">
                  <Volume2 className="w-3.5 h-3.5" /> {previewPlaying ? '停止试听' : '试听声景'}
                </button>
              </div>
            </div>
          )}

          {/* 第三步：拍照 */}
          {stage === 2 && (
            <div className="rise-in max-w-2xl mx-auto text-center py-6">
              <Camera className="w-12 h-12 mx-auto text-[#5fd4c4] mb-4" />
              <h3 className="font-serif-cn text-xl text-white mb-2">为唱片拍一张封面</h3>
              <p className="text-sm text-white/50 mb-6">照片将与你的文字融合成唱片包装表面。这一步可以跳过。</p>
              {photo ? (
                <div className="relative inline-block">
                  <img src={photo} alt="封面预览" className="max-h-64 rounded-2xl border border-white/15 shadow-xl" />
                  <button onClick={() => setPhoto(undefined)} className="absolute -top-2 -right-2 rounded-full bg-rose-500 text-white p-1.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex flex-col items-center gap-3 px-10 py-10 rounded-2xl border-2 border-dashed border-white/15 hover:border-[#5fd4c4]/50 cursor-pointer transition bg-white/[0.02]">
                  <Upload className="w-8 h-8 text-white/40" />
                  <span className="text-sm text-white/60">点击上传照片</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                </label>
              )}
            </div>
          )}

          {/* 第四步：写一句话 */}
          {stage === 3 && (
            <div className="rise-in max-w-2xl mx-auto py-6">
              <PenLine className="w-10 h-10 text-[#e9b26f] mb-4" />
              <h3 className="font-serif-cn text-2xl text-white mb-2">此刻，你心里的一句话</h3>
              <p className="text-sm text-white/50 mb-6">这句话会印在唱片封面上，和声音一起被保存。</p>
              <textarea value={title} onChange={e => setTitle(e.target.value)}
                placeholder="例如：风把银杏吹成一封没寄出的信…"
                className="w-full bg-white/[0.04] border border-white/12 rounded-2xl p-5 font-serif-cn text-lg leading-relaxed outline-none focus:border-[#5fd4c4]/50 resize-none min-h-[140px]"
              />
              <div className="text-right text-xs text-white/35 mt-2">{title.length} 字</div>
              {locationName && (
                <div className="mt-4 flex items-center gap-2 text-sm text-white/55">
                  <MapPin className="w-4 h-4 text-[#5fd4c4]" /> 地点：{locationName}
                  <span className="tag">{SCENE_LABEL[scene]}</span>
                </div>
              )}
            </div>
          )}

          {/* 第五步：增强（写完一句话直接进入） */}
          {stage === 4 && (
            <div className="rise-in max-w-2xl mx-auto py-2 space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-white/85 mb-3"><Clock3 className="w-4 h-4 text-[#5fd4c4]" />这条记忆属于哪种类型？</label>
                <div className="flex flex-wrap gap-2">
                  {MEMORY_TYPES.map(t => (
                    <button key={t} onClick={() => setMemoryType(t)}
                      className={`px-3.5 py-2 rounded-full text-xs border transition ${memoryType === t ? 'bg-[#5fd4c4]/15 border-[#5fd4c4]/50 text-[#5fd4c4]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-white/85 mb-3"><ListMusic className="w-4 h-4 text-[#e9b26f]" />加入某个合辑 / 路线 / 事件？</label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {store.collections.map(c => (
                    <button key={c.id} onClick={() => setCollectionId(collectionId === c.id ? undefined : c.id)}
                      className={`rounded-xl p-3 text-left border transition ${collectionId === c.id ? 'border-[#e9b26f]/55 bg-[#e9b26f]/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
                      <div className="flex items-center gap-2 text-xs font-semibold text-white/85">
                        <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.name}
                        <span className="tag !py-0 !px-1.5 ml-auto">{c.kind}</span>
                      </div>
                      <div className="text-[11px] text-white/40 mt-1 truncate">{c.theme}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-white/85 mb-3"><Eye className="w-4 h-4 text-[#9a9fe0]" />可见范围？</label>
                <div className="flex gap-2">
                  {VISIBILITIES.map(v => (
                    <button key={v} onClick={() => { setVisibility(v); if (v === '仅自己') setShareCommunity(false) }}
                      className={`px-4 py-2 rounded-full text-xs border transition ${visibility === v ? 'bg-[#9a9fe0]/20 border-[#9a9fe0]/50 text-[#c5c8ef]' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>{v}</button>
                  ))}
                </div>
              </div>
              {visibility !== '仅自己' && (
                <label className="flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/10 p-3.5 cursor-pointer">
                  <input type="checkbox" checked={shareCommunity} onChange={e => setShareCommunity(e.target.checked)}
                    className="w-4 h-4 accent-[#5fd4c4]" />
                  <div className="text-sm text-white/75">分享到社区地图，让其他人也能听见</div>
                </label>
              )}
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={capsule} onChange={e => setCapsule(e.target.checked)}
                    className="w-4 h-4 accent-[#e9b26f]" />
                  <div>
                    <div className="text-sm text-white/85 flex items-center gap-1.5"><Clock3 className="w-4 h-4 text-[#e9b26f]" />设为时间胶囊</div>
                    <div className="text-[11px] text-white/40 mt-0.5">在选定的时间，这张唱片才会送达给你</div>
                  </div>
                </label>
                {capsule && (
                  <input type="datetime-local" value={unlockAt} onChange={e => setUnlockAt(e.target.value)}
                    className="mt-3 w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm outline-none" />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 pt-3">
                <button onClick={() => setStage(3)} className="px-5 py-3 rounded-xl bg-white/5 border border-white/12 text-white/70 flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 返回
                </button>
                <div className="flex items-center gap-2.5">
                  <button onClick={() => publish(false)} className="px-5 py-3 rounded-xl bg-white/5 border border-white/12 text-white/65 hover:bg-white/10 flex items-center gap-2">
                    <SkipForward className="w-4 h-4" /> 跳过
                  </button>
                  <button onClick={() => publish(true)} className="px-6 py-3 rounded-xl btn-primary flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> 完成
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部导航（第一段，step 3 写完后直接进入增强页） */}
        {stage <= 3 && (
          <div className="flex items-center justify-between px-6 md:px-10 py-5 border-t border-white/10">
            <button onClick={() => setStage(s => Math.max(0, s - 1) as typeof stage)} disabled={stage === 0}
              className="px-4 py-2.5 rounded-xl text-sm text-white/60 hover:bg-white/5 disabled:opacity-25 flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" /> 上一步
            </button>
            <span className="text-xs text-white/35">地点：{locationName || '未选择'}</span>
            <button onClick={() => setStage(s => (s + 1) as typeof stage)} disabled={stage === 0 && !locationId && !customLoc}
              className="px-5 py-2.5 rounded-xl btn-primary text-sm flex items-center gap-1.5 disabled:opacity-30">
              {stage === 3 ? '下一步：增强' : '下一步'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
