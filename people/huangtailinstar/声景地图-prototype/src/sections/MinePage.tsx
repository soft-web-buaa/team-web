import { useMemo, useState } from 'react'
import { MapPin, Heart, Users, Inbox as InboxIcon, Disc3, Bell, Sparkles } from 'lucide-react'
import { useStore } from '@/lib/store'
import { MapCanvas } from '@/components/MapCanvas'
import { RecordCard } from '@/components/RecordCard'
import { RecordPlayer } from '@/components/RecordPlayer'
import { Vinyl } from '@/components/Vinyl'

type Tab = 'map' | 'fav' | 'together' | 'inbox'

export function MinePage({ onCreate }: { onCreate: (loc?: string) => void }) {
  const store = useStore()
  const [tab, setTab] = useState<Tab>('map')
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const mine = useMemo(() => store.records.filter(r => r.isMine), [store.records])
  const atLocation = useMemo(() => mine.filter(r => r.locationId === selectedLoc), [mine, selectedLoc])
  const favorites = useMemo(() => store.records.filter(r => r.favorite), [store.records])
  const together = useMemo(() => mine.filter(r => r.collectionId || r.authorName.includes('&')), [mine])
  const unread = store.inbox.filter(m => !m.read).length
  const openRecord = openId ? store.getRecord(openId) : undefined

  const tabs: { id: Tab; label: string; icon: typeof MapPin }[] = [
    { id: 'map', label: '我的地图', icon: MapPin },
    { id: 'fav', label: '收藏馆', icon: Heart },
    { id: 'together', label: '共建唱片', icon: Users },
    { id: 'inbox', label: '收件箱', icon: InboxIcon },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 rise-in">
      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-7">
        <div>
          <h1 className="font-serif-cn text-3xl md:text-4xl text-white mb-2">我的声景角落</h1>
          <p className="text-sm text-white/50">你走过的路，都以声音的形式被收藏在这里。</p>
        </div>
        <div className="flex gap-3">
          <div className="glass rounded-xl px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-xl font-bold text-[#5fd4c4]">{mine.length}</div>
            <div className="text-[10px] text-white/45">我的唱片</div>
          </div>
          <div className="glass rounded-xl px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-xl font-bold text-[#e9b26f]">{favorites.length}</div>
            <div className="text-[10px] text-white/45">收藏</div>
          </div>
          <div className="glass rounded-xl px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-xl font-bold text-rose-300">{mine.reduce((s, r) => s + r.likedBy.length, 0)}</div>
            <div className="text-[10px] text-white/45">被打动</div>
          </div>
        </div>
      </div>

      {/* 标签 */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap border transition ${
                tab === t.id ? 'bg-[#5fd4c4] text-[#06241f] border-[#5fd4c4]' : 'bg-white/[0.04] text-white/60 border-white/10 hover:bg-white/10'
              }`}>
              <Icon className="w-4 h-4" />{t.label}
              {t.id === 'inbox' && unread > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center">{unread}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 我的地图 */}
      {tab === 'map' && (
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 rise-in">
          <div>
            <MapCanvas records={mine} mode="original" className="aspect-[1038/1076] max-h-[620px]"
              selectedId={selectedLoc} onSelect={setSelectedLoc} />
            <p className="text-xs text-white/40 mt-3 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#5fd4c4]" />点击地图上的标记，查看该地点你创建的唱片
            </p>
          </div>
          <div>
            {selectedLoc ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif-cn text-xl text-white">{atLocation.length > 0 ? atLocation[0].locationName : '这个地点'}的唱片</h2>
                  <button onClick={() => onCreate(selectedLoc)} className="text-xs text-[#5fd4c4] hover:underline">+ 在这里再录一张</button>
                </div>
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {atLocation.map(r => <RecordCard key={r.id} record={r} onClick={() => setOpenId(r.id)} />)}
                  {atLocation.length === 0 && (
                    <div className="glass rounded-2xl p-10 text-center text-white/45 text-sm">
                      这里还没有你的唱片。<button onClick={() => onCreate(selectedLoc)} className="text-[#5fd4c4] ml-1 hover:underline">录一张？</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="glass rounded-2xl p-8 h-full flex flex-col items-center justify-center text-center">
                <Disc3 className="w-14 h-14 text-[#5fd4c4]/50 mb-4 spin-slow" />
                <h3 className="font-serif-cn text-xl text-white mb-2">选择地图上的一个地点</h3>
                <p className="text-sm text-white/45 mb-6">看看你曾在这里留下过哪些声音</p>
                <button onClick={() => setSelectedLoc('lake')} className="px-4 py-2 rounded-lg btn-primary text-sm">查看示例：绿园湖畔</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 收藏馆 */}
      {tab === 'fav' && (
        <div className="rise-in">
          <div className="mb-5 flex items-center gap-2 text-sm text-white/55">
            <Heart className="w-4 h-4 text-amber-300" fill="currentColor" />
            收藏了你和他人的 {favorites.length} 张唱片
          </div>
          {favorites.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {favorites.map(r => <RecordCard key={r.id} record={r} onClick={() => setOpenId(r.id)} />)}
            </div>
          ) : <Empty text="还没有收藏，去社区发现打动你的声音吧" />}
        </div>
      )}

      {/* 共建唱片 */}
      {tab === 'together' && (
        <div className="rise-in">
          <div className="mb-5 flex items-center gap-2 text-sm text-white/55">
            <Users className="w-4 h-4 text-[#9a9fe0]" />
            与他人共同创建的唱片
          </div>
          {together.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {together.map(r => <RecordCard key={r.id} record={r} onClick={() => setOpenId(r.id)} />)}
            </div>
          ) : <Empty text="还没有共建的唱片" />}
        </div>
      )}

      {/* 收件箱 */}
      {tab === 'inbox' && (
        <div className="rise-in max-w-3xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 text-sm text-white/55">
              <Bell className="w-4 h-4 text-rose-300" />
              他人对你放到社区的唱片的反馈
            </div>
            {unread > 0 && <button onClick={store.markAllRead} className="text-xs text-[#5fd4c4] hover:underline">全部标为已读</button>}
          </div>
          <div className="space-y-3">
            {store.inbox.map(m => {
              const rec = store.getRecord(m.recordId)
              return (
                <button key={m.id} onClick={() => {
                  store.markRead(m.id)
                  if (rec && !m.recordId.startsWith('c')) setOpenId(m.recordId)
                }}
                  className={`w-full glass rounded-2xl p-4 flex items-start gap-4 text-left card-hover ${
                    !m.read ? 'border-[#5fd4c4]/25' : 'opacity-70'
                  }`}>
                  <div className="relative shrink-0">
                    {rec ? <Vinyl record={rec} size={56} showText={false} />
                      : <div className="w-14 h-14 rounded-full bg-[#e9b26f]/15 flex items-center justify-center"><Sparkles className="w-6 h-6 text-[#e9b26f]" /></div>}
                    {!m.read && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-[#0d1a29]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-white">{m.from}</span>
                      <span className="tag !py-0 !px-1.5">{m.type}</span>
                      <span className="text-[10px] text-white/35 ml-auto">
                        {new Date(m.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm text-white/65 leading-relaxed">{m.text}</p>
                    {rec && <p className="text-xs text-[#5fd4c4]/70 mt-1.5 truncate">↳ 《{rec.title}》</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {openRecord && <RecordPlayer record={openRecord} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="glass rounded-2xl p-14 text-center">
      <Disc3 className="w-12 h-12 mx-auto text-white/20 mb-4" />
      <p className="text-sm text-white/45">{text}</p>
    </div>
  )
}
