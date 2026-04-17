import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import NowPlaying from './pages/NowPlaying'
import Queue from './pages/Queue'
import Library from './pages/Library'
import Stats from './pages/Stats'
import Settings from './pages/Settings'
import Playlists from './pages/Playlists'
import Widget from './pages/Widget'
import { useWebSocket } from './hooks/useWebSocket'
import { useDJStore } from './store'
import { api } from './services/api'

function AppInner() {
  useWebSocket()
  const { setStatus } = useDJStore()

  useEffect(() => {
    const poll = async () => {
      try {
        const h = await api.health()
        setStatus(h.llm, h.tts)
      } catch (_) {}
    }
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [setStatus])

  return (
    <Routes>
      <Route path="widget" element={<Widget />} />
      <Route element={<Layout />}>
        <Route index element={<NowPlaying />} />
        <Route path="queue" element={<Queue />} />
        <Route path="library" element={<Library />} />
        <Route path="playlists" element={<Playlists />} />
        <Route path="stats" element={<Stats />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
