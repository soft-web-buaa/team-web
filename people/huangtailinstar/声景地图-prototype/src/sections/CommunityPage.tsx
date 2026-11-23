import { useMemo, useState } from 'react'
import {
  Map as MapIcon, BarChart3, Shuffle, Sparkles, Heart, ChevronRight,
  MapPin, Users, Volume2, TreePine, Clock3, Activity, Smile,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { MapCanvas } from '@/components/MapCanvas'
import type { DataLayer } from '@/components/MapCanvas'
import { RecordCard } from '@/components/RecordCard'
import { RecordPlayer } from '@/components/RecordPlayer'
import { Vinyl } from '@/components/Vinyl'

const LAYERS: { id: DataLayer; label: string; icon: typeof Smile }[] = [
  { id: 'mood', label: '校园情绪热力', icon: Smile },
  { id: 'activity', label: '声音活跃度', icon: Activity },
  { id: 'quiet', label: '安静角落', icon: TreePine },
  { id: 'time', label: '时段声景变化', icon: Clock3 },
]
const TIMES = ['清晨', '午后', '黄昏', '深夜']

export function CommunityPage() {
  const store = useStore()
  const [mode, setMode] = useState<'original' | 'data'>('original')
  const [layer, setLayer] = useState<DataLayer>('mood')
  const [timeFilter, setTimeFilter] = useState('清晨')
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'random' | 'themes'>('random')
  const [activeTheme, setActiveTheme] = useState<string | null>(null)

  const communityRecords = useMemo(() => store.records.filter(r => r.inCommunity && r.visibility !== '仅自己'), [store.records])
  const atLocation = useMemo(() => communityRecords.filter(r => r.locationId === selectedLoc), [communityRecords, selectedLoc])
  const randomRecords = useMemo(() => [...communityRecords].sort(() => Math.random() - 0.5).slice(0, 6), [communityRecords])
  const openRecord = openId ? store.getRecord(openId) : undefined
  const themeRecords = useMemo(() => activeTheme ? communityRecords.filter(r => r.collectionId === activeTheme) : [], [communityRecords, activeTheme])

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 rise-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-7">
        <div>
          <h1 className="font-serif-cn text-3xl md:text-4xl text-white mb-2">社区声景</h1>
          <p className="text-sm text-white/50">在北航的某个角落，听见彼此。点击地图上的地点，走进那里的声音。</p>
        </div>
        <div className="flex items-center gap-2 glass rounded-xl p-1.5">
          <button onClick={() => setMode('original')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${mode === 'original' ? 'bg-[#5fd4c4] text-[#06241f] font-semibold' : 'text-white/60 hover:bg-white/5'}`}>
            <MapIcon className="w-4 h-4" />原始地图
          </button>
          <button onClick={() => setMode('data')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${mode === 'data' ? 'bg-[#5fd4c4] text-[#06241f] font-semibold' : 'text-white/60 hover:bg-white/5'}`}>
            <BarChart3 className="w-4 h-4" />数据地图
          </button>
        </div>
      </div>

      {/* 数据图层选择 */}
      {mode === 'data' && (
        <div className="flex flex-wrap gap-2 mb-5 fade-in">
          {LAYERS.map(l => {
            const Icon = l.icon
            return (
              <button key={l.id} onClick={() => setLayer(l.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs border transition ${
                  layer === l.id ? 'bg-[#5fd4c4]/15 border-[#5fd4c4]/50 text-[#5fd4c4]' : 'bg-white/[0.04] border-white/10 text-white/60 hover:bg-white/10'
                }`}>
                <Icon className="w-3.5 h-3.5" />{l.label}
              </button>
            )
          })}
          {layer === 'time' && (
            <div className="flex gap-1.5 ml-auto">
              {TIMES.map(t => (
                <button key={t} onClick={() => setTimeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${timeFilter === t ? 'bg-[#e9b26f]/20 border-[#e9b26f]/50 text-[#e9b26f]' : 'bg-white/5 border-white/10 text-white/55'}`}>{t}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
        {/* 地图区域 */}
        <div>
          <MapCanvas records={communityRecords} mode={mode} layer={layer} timeFilter={timeFilter}
            className="aspect-[1038/1076] max-h-[680px]" selectedId={selectedLoc} onSelect={setSelectedLoc} />
          <p className="text-xs text-white/40 mt-3 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#5fd4c4]" />
            {mode === 'original' ? '选择一个放大点位，查看这里大家一起留下的唱片' : '色彩深浅代表数据强度，点击标记仍可进入地点'}
          </p>

          {/* 该地点唱片 */}
          {selectedLoc && (
            <div className="mt-5 rise-in">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-serif-cn text-xl text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#e9b26f]" />
                  {atLocation[0]?.locationName ?? '这个地点'}的声音 <span className="text-white/35 text-sm font-normal">({atLocation.length})</span>
                </h2>
                <button onClick={() => setSelectedLoc(null)} className="text-xs text-white/40 hover:text-white">收起</button>
              </div>
              <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                {atLocation.map(r => <RecordCard key={r.id} record={r} onClick={() => setOpenId(r.id)} />)}
                {atLocation.length === 0 && (
                  <div className="glass rounded-xl p-6 text-center text-sm text-white/45">这里还很安静，来留下第一张唱片吧。</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右侧两栏 */}
        <div className="space-y-6">
          <div className="flex gap-1.5 glass rounded-xl p-1.5">
            <button onClick={() => setPanel('random')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition ${panel === 'random' ? 'bg-[#5fd4c4] text-[#06241f] font-semibold' : 'text-white/60 hover:bg-white/5'}`}>
              <Shuffle className="w-4 h-4" />随机推送
            </button>
            <button onClick={() => setPanel('themes')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition ${panel === 'themes' ? 'bg-[#5fd4c4] text-[#06241f] font-semibold' : 'text-white/60 hover:bg-white/5'}`}>
              <Sparkles className="w-4 h-4" />主题唱片
            </button>
          </div>

          {panel === 'random' ? (
            <div className="space-y-3 fade-in">
              <p className="text-xs text-white/40">纯随机遇见，没有算法。每次都是新的相遇。</p>
              {randomRecords.map((r, i) => (
                <button key={r.id} onClick={() => setOpenId(r.id)}
                  className="w-full glass card-hover rounded-2xl p-3.5 flex items-center gap-3.5 text-left" style={{ animationDelay: `${i * 0.04}s` }}>
                  <Vinyl record={r} size={64} showText={false} />
                  <div className="min-w-0 flex-1">
                    <p className="font-serif-cn text-sm text-white line-clamp-1 mb-1.5">{r.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-white/40">
                      <MapPin className="w-3 h-3" />{r.locationName}
                      <span className="flex items-center gap-1 ml-auto"><Heart className="w-3 h-3" />{r.likedBy.length}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/25" />
                </button>
              ))}
            </div>
          ) : (
            <div className="fade-in">
              {!activeTheme ? (
                <>
                  <p className="text-xs text-white/40 mb-3">大家组团共建 + 官方统一收集的主题合辑。</p>
                  <div className="space-y-3">
                    {store.collections.map(c => (
                      <button key={c.id} onClick={() => setActiveTheme(c.id)}
                        className="w-full glass card-hover rounded-2xl p-4 flex items-center gap-4 text-left">
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `linear-gradient(135deg, ${c.color}55, ${c.color}18)`, border: `1px solid ${c.color}55` }}>
                          <Sparkles className="w-6 h-6" style={{ color: c.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-serif-cn text-sm font-semibold text-white truncate">{c.name}</span>
                            <span className="tag !py-0 !px-1.5">{c.kind}</span>
                          </div>
                          <p className="text-[11px] text-white/45 truncate">{c.theme}</p>
                          <div className="flex items-center gap-1 text-[10px] text-white/35 mt-1.5">
                            <Users className="w-3 h-3" />{c.memberCount} 人参与
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/25" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div>
                  <button onClick={() => setActiveTheme(null)} className="text-xs text-[#5fd4c4] mb-3 flex items-center gap-1 hover:underline">
                    <ChevronRight className="w-3 h-3 rotate-180" /> 返回主题列表
                  </button>
                  <h3 className="font-serif-cn text-xl text-white mb-4">
                    {store.collections.find(c => c.id === activeTheme)?.name}
                  </h3>
                  <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                    {themeRecords.map(r => <RecordCard key={r.id} record={r} onClick={() => setOpenId(r.id)} size="sm" />)}
                    {themeRecords.length === 0 && (
                      <div className="glass rounded-xl p-8 text-center text-sm text-white/45">
                        <Volume2 className="w-8 h-8 mx-auto mb-3 text-white/25" />
                        这个主题还在收集中，等你来填满。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {openRecord && <RecordPlayer record={openRecord} onClose={() => setOpenId(null)} />}
    </div>
  )
}
