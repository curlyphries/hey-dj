import { useRef, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Radio, ListMusic, Library, BarChart2, Settings, Wifi, WifiOff, BookMarked } from 'lucide-react'
import { useDJStore } from '../store'

const nav = [
  { to: '/',          icon: Radio,       label: 'Now Playing' },
  { to: '/queue',     icon: ListMusic,   label: 'Queue'       },
  { to: '/library',   icon: Library,     label: 'Library'     },
  { to: '/playlists', icon: BookMarked,  label: 'Playlists'   },
  { to: '/stats',     icon: BarChart2,   label: 'Stats'       },
  { to: '/settings',  icon: Settings,    label: 'Settings'    },
]

export const audioRef = { current: null as HTMLAudioElement | null }
export const muteState = { isMuted: true, setMuted: (_: boolean) => {} }

export default function Layout() {
  const { wsConnected, llmOnline, ttsOnline, currentTrack, queue } = useDJStore()
  const ref = useRef<HTMLAudioElement>(null)
  const [isMuted, setIsMuted] = useState(true)

  // Wire muteState so NowPlaying can read/set it
  muteState.isMuted = isMuted
  muteState.setMuted = setIsMuted

  useEffect(() => {
    audioRef.current = ref.current
    if (ref.current) {
      ref.current.muted = true   // muted autoplay is permitted by all browsers
      ref.current.src = '/stream'
      ref.current.play().catch(() => {})
    }
  }, [])

  // Sync muted state to the element
  useEffect(() => {
    if (ref.current) ref.current.muted = isMuted
  }, [isMuted])

  // When the first track appears after a cold start, kick off playback
  // (handles the case where autoplay fired before the orchestrator had a track)
  useEffect(() => {
    const audio = ref.current
    if (!audio || !currentTrack?.id) return
    if (audio.paused) audio.play().catch(() => {})
  }, [currentTrack?.id === undefined ? null : 'ready'])

  return (
    <div className="flex flex-col h-screen bg-surface text-slate-100 md:flex-row">
      <audio ref={ref} hidden />
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-surface-1 border-r border-surface-3 py-6 px-3 gap-1 shrink-0">
        <div className="px-3 mb-6">
          <span className="text-xl font-bold text-gradient">Hey DJ</span>
          <div className="flex items-center gap-2 mt-1">
            {wsConnected ? <Wifi size={12} className="text-green-400" /> : <WifiOff size={12} className="text-red-400" />}
            <span className="text-xs text-slate-400">{wsConnected ? 'Live' : 'Disconnected'}</span>
            {llmOnline && <span className="text-xs text-accent-light">LLM</span>}
            {ttsOnline && <span className="text-xs text-beat">TTS</span>}
          </div>
        </div>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
               ${isActive ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-surface-2'}`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {to === '/queue' && queue.length > 0 && (
              <span className="ml-auto text-xs bg-accent/80 text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
                {queue.length}
              </span>
            )}
          </NavLink>
        ))}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-surface-1 border-t border-surface-3 flex justify-around py-2 z-50">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium transition-colors
               ${isActive ? 'text-accent-light' : 'text-slate-500'}`
            }
          >
            <Icon size={20} />
            {to === '/queue' && queue.length > 0 && (
              <span className="absolute -top-0.5 right-1 text-[9px] bg-accent text-white px-1 rounded-full min-w-[14px] text-center">
                {queue.length}
              </span>
            )}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
