import { useState } from 'react'
import { Disc3, Home, User, Users, Mic2, RotateCcw } from 'lucide-react'
import { StoreProvider, useStore } from '@/lib/store'
import { HomePage } from '@/sections/HomePage'
import { MinePage } from '@/sections/MinePage'
import { CommunityPage } from '@/sections/CommunityPage'
import { CreateFlow } from '@/components/CreateFlow'
import './App.css'

type Page = 'home' | 'mine' | 'community'

function Shell() {
  const [page, setPage] = useState<Page>('home')
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoc, setCreateLoc] = useState<string | null>(null)
  const store = useStore()
  const unread = store.inbox.filter(m => !m.read).length

  const openCreate = (loc?: string) => {
    setCreateLoc(loc ?? null)
    setCreateOpen(true)
  }

  const nav: { id: Page; label: string; icon: typeof Home }[] = [
    { id: 'home', label: '主页', icon: Home },
    { id: 'mine', label: '我的', icon: User },
    { id: 'community', label: '社区', icon: Users },
  ]

  return (
    <div className="app-bg min-h-screen relative">
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <button onClick={() => setPage('home')} className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-full vinyl-disc flex items-center justify-center relative">
              <div className="w-3 h-3 rounded-full bg-[#5fd4c4]" />
            </div>
            <div className="text-left">
              <div className="font-serif-cn text-lg text-white leading-tight group-hover:text-[#5fd4c4] transition">声景地图</div>
              <div className="text-[9px] tracking-[0.22em] text-white/35 uppercase">Soundscape Map</div>
            </div>
          </button>

          <nav className="hidden sm:flex items-center gap-1 glass rounded-xl p-1">
            {nav.map(n => {
              const Icon = n.icon
              return (
                <button key={n.id} onClick={() => setPage(n.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition ${
                    page === n.id ? 'bg-[#5fd4c4]/15 text-[#5fd4c4] font-semibold' : 'text-white/55 hover:bg-white/5 hover:text-white'
                  }`}>
                  <Icon className="w-4 h-4" />{n.label}
                  {n.id === 'mine' && unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500" />}
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => store.reset()} title="重置示例数据"
              className="hidden md:flex p-2 rounded-lg text-white/35 hover:bg-white/5 hover:text-white transition">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={() => openCreate()} className="flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl btn-primary text-sm">
              <Mic2 className="w-4 h-4" /><span className="hidden sm:inline">录制唱片</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {page === 'home' && <HomePage onCreate={openCreate} />}
        {page === 'mine' && <MinePage onCreate={openCreate} />}
        {page === 'community' && <CommunityPage />}
      </main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-white/10 flex items-center justify-around px-2 py-2">
        {nav.map(n => {
          const Icon = n.icon
          return (
            <button key={n.id} onClick={() => setPage(n.id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg ${page === n.id ? 'text-[#5fd4c4]' : 'text-white/45'}`}>
              <Icon className="w-5 h-5" /><span className="text-[10px]">{n.label}</span>
            </button>
          )
        })}
        <button onClick={() => openCreate()} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[#e9b26f]">
          <Mic2 className="w-5 h-5" /><span className="text-[10px]">录制</span>
        </button>
      </nav>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center hidden sm:block">
        <div className="flex items-center justify-center gap-2 text-white/25 text-xs">
          <Disc3 className="w-4 h-4" /> 声景地图 · 把北航的声音，留给未来
        </div>
      </footer>

      {createOpen && <CreateFlow onClose={() => setCreateOpen(false)} initialLocationId={createLoc} />}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
