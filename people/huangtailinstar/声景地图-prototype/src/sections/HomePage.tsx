import { useMemo, useState } from 'react'
import { Mic2, MapPin, Play, Headphones, Sparkles, ArrowRight, Disc3, Heart, Camera, PenLine } from 'lucide-react'
import { useStore } from '@/lib/store'
import { MapCanvas } from '@/components/MapCanvas'
import { RecordCard } from '@/components/RecordCard'
import { RecordPlayer } from '@/components/RecordPlayer'
import { Vinyl } from '@/components/Vinyl'

export function HomePage({ onCreate }: { onCreate: (loc?: string) => void }) {
  const store = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const featured = useMemo(() => [...store.records].sort((a, b) => b.likedBy.length - a.likedBy.length)[0], [store.records])
  const recent = useMemo(() => [...store.records].slice(0, 4), [store.records])
  const openRecord = openId ? store.getRecord(openId) : undefined
  const totalSounds = store.records.length

  return (
    <div className="rise-in">
      {/* Hero */}
      <section className="relative max-w-7xl mx-auto px-4 md:px-8 pt-10 md:pt-16 pb-10">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#5fd4c4]/10 border border-[#5fd4c4]/25 text-[#5fd4c4] text-xs mb-6">
              <Headphones className="w-3.5 h-3.5" /> 北航学院路校区 · 声景计划
            </div>
            <h1 className="font-serif-cn text-4xl md:text-6xl leading-tight text-white mb-6">
              听见
              <span className="text-[#5fd4c4]">  </span>
              你走过的
              <span className="text-[#e9b26f]">  地方</span>
            </h1>
            <p className="text-white/55 leading-relaxed text-base md:text-lg mb-8 max-w-lg">
              每一段声音，都压成一张唱片。封面是那一刻的景色与心情，内里是你听见的世界。
              在地图上留下你的声音，也听听别人的北航。
            </p>
            <button onClick={() => onCreate()} className="inline-flex items-center gap-3 px-7 py-4 rounded-2xl btn-primary text-base">
              <Mic2 className="w-5 h-5" /> 开始录制我的唱片 <ArrowRight className="w-5 h-5" />
            </button>
            <div className="flex gap-8 mt-9">
              <div><div className="text-2xl font-bold text-white">{totalSounds}</div><div className="text-xs text-white/40 mt-1">张唱片</div></div>
              <div><div className="text-2xl font-bold text-white">14</div><div className="text-xs text-white/40 mt-1">个地点</div></div>
              <div><div className="text-2xl font-bold text-white">{store.collections.length}</div><div className="text-xs text-white/40 mt-1">个主题合辑</div></div>
            </div>
          </div>

          {/* Hero 唱片堆 */}
          <div className="relative hidden md:flex items-center justify-center h-[420px]">
            <div className="absolute w-80 h-80 rounded-full bg-[#5fd4c4]/8 blur-3xl" />
            <div className="absolute left-6 top-10 float-y" style={{ animationDelay: '0.5s' }}>
              <Vinyl record={store.records[1] ?? featured} size={150} playing showText={false} />
            </div>
            <div className="absolute right-4 top-24 float-y" style={{ animationDelay: '1.2s' }}>
              <Vinyl record={store.records[2] ?? featured} size={170} playing showText={false} />
            </div>
            <div className="relative z-10 float-y">
              <Vinyl record={featured} size={250} playing onClick={() => setOpenId(featured.id)} />
              <button onClick={() => setOpenId(featured.id)}
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#5fd4c4] text-[#06241f] flex items-center justify-center shadow-2xl hover:scale-105 transition">
                <Play className="w-7 h-7 ml-1" fill="currentColor" />
              </button>
            </div>
            {featured && (
              <div className="absolute bottom-0 glass rounded-xl px-4 py-2.5 text-center max-w-xs">
                <div className="text-[10px] text-white/40 mb-0.5">今日最被打动</div>
                <div className="font-serif-cn text-sm text-white truncate">「{featured.title}」</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 地图 + 创建 */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <div className="glass rounded-3xl p-5 md:p-8 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-serif-cn text-2xl text-white mb-1.5">此刻，你在哪里？</h2>
              <p className="text-sm text-white/45">在地图上选一个位置，开始录制你的声景唱片。</p>
            </div>
            <button onClick={() => onCreate()} className="px-5 py-3 rounded-xl btn-primary flex items-center gap-2 shrink-0">
              <Mic2 className="w-4 h-4" /> 创建唱片
            </button>
          </div>
          <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
            <MapCanvas records={store.records} mode="original" className="aspect-[1038/1076] max-h-[540px]"
              onSelect={(id) => onCreate(id)} />
            <div className="space-y-4">
              <div className="text-xs text-white/45 font-semibold mb-2">录制只需三步</div>
              {[
                { icon: MapPin, title: '选地点', desc: '在地图上点出你所在的位置', color: '#5fd4c4' },
                { icon: Mic2, title: '录声音', desc: '记下此刻最真实的声音', color: '#e9b26f' },
                { icon: Camera, title: '拍一张 · 写一句', desc: '用景色和文字封存心情', color: '#9a9fe0' },
              ].map((s, i) => {
                const Icon = s.icon
                return (
                  <div key={s.title} className="rounded-2xl bg-white/[0.035] border border-white/10 p-4 flex gap-3.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${s.color}18`, border: `1px solid ${s.color}44` }}>
                      <Icon className="w-5 h-5" style={{ color: s.color }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white mb-0.5">{i + 1}. {s.title}</div>
                      <div className="text-xs text-white/40 leading-relaxed">{s.desc}</div>
                    </div>
                  </div>
                )
              })}
              <div className="rounded-2xl bg-[#5fd4c4]/8 border border-[#5fd4c4]/20 p-4 text-xs text-white/55 leading-relaxed">
                <Sparkles className="w-4 h-4 text-[#5fd4c4] inline mr-1.5 -mt-0.5" />
                完成后还可以选择加入合辑、设为时间胶囊，或匿名分享到社区。
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 最近的声音 */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif-cn text-2xl text-white flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-[#e9b26f]" /> 最近的声音
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recent.map(r => <RecordCard key={r.id} record={r} onClick={() => setOpenId(r.id)} size="sm" />)}
        </div>
      </section>

      {/* 理念 */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 pb-16">
        <div className="glass rounded-3xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="noise-overlay" />
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-[#5fd4c4]/10 border border-[#5fd4c4]/25 flex items-center justify-center mx-auto mb-5">
              <PenLine className="w-6 h-6 text-[#5fd4c4]" />
            </div>
            <h2 className="font-serif-cn text-2xl md:text-3xl text-white mb-4">
              声音，是这个地方最诚实的注脚
            </h2>
            <p className="text-white/45 max-w-2xl mx-auto leading-relaxed text-sm md:text-base">
              同一条银杏大道，有人听见风，有人听见离别。声景地图把无数个「此刻」压成唱片，
              让校园不再只是建筑的集合，而是一段段可以被听见、被共鸣的记忆。
            </p>
            <div className="flex items-center justify-center gap-6 mt-8 text-xs text-white/35">
              <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-rose-300" />被打动</span>
              <span className="flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5 text-[#5fd4c4]" />彼此聆听</span>
              <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-[#e9b26f]" />共同建造</span>
            </div>
          </div>
        </div>
      </section>

      {openRecord && <RecordPlayer record={openRecord} onClose={() => setOpenId(null)} />}
    </div>
  )
}
