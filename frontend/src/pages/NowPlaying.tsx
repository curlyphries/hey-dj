import { useRef, useState, useEffect, useCallback } from 'react'
import { SkipForward, Mic2, Music2, Volume2, VolumeX, Loader2, Play, Pause } from 'lucide-react'
import { useDJStore } from '../store'
import { api } from '../services/api'
import { useVisualizer, type VisualizerMode } from '../hooks/useVisualizer'
import { audioRef as layoutAudioRef, muteState } from '../components/Layout'

const MOODS = ['chill', 'hype', 'focus', 'party', 'latenight', 'morning']
const PERSONAS = ['smooth', 'hype', 'latenight']

export default function NowPlaying() {
  const { currentTrack, mood, persona, wsConnected, setCurrentTrack, setMood, setPersona } = useDJStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [vizMode, setVizMode] = useState<VisualizerMode>('bars')
  const [vizActive, setVizActive] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMutedLocal] = useState(muteState.isMuted)

  const { setup } = useVisualizer(layoutAudioRef, canvasRef, vizMode, vizActive && isPlaying)

  useEffect(() => {
    api.playback.state().then((s: any) => {
      if (s.current_track) setCurrentTrack(s.current_track)
      if (s.mood) setMood(s.mood)
      if (s.persona) setPersona(s.persona)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const audio = layoutAudioRef.current
    if (!audio) return
    if (!isPlaying && audio.paused) {
      audio.play().then(() => { setIsPlaying(true); setVizActive(true); setup() }).catch(() => {})
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => { audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause) }
  }, [])

  const handleSkip = useCallback(async () => {
    if (isSkipping) return
    setIsSkipping(true)
    await api.playback.skip()
    // 300ms: _play_track fires immediately so current_track is already updated
    setTimeout(() => {
      const audio = layoutAudioRef.current
      if (audio) {
        const wasPlaying = !audio.paused
        audio.src = `/stream?skip=${Date.now()}`
        audio.load()
        if (wasPlaying) audio.play().catch(() => {})
      }
    }, 300)
    setTimeout(async () => {
      try {
        const s: any = await api.playback.state()
        if (s.current_track) setCurrentTrack(s.current_track)
        if (s.mood) setMood(s.mood)
      } catch (_) {}
      setIsSkipping(false)
    }, 800)
  }, [isSkipping, setCurrentTrack, setMood])

  const unmute = () => {
    muteState.setMuted(false)
    setIsMutedLocal(false)
    if (layoutAudioRef.current) layoutAudioRef.current.muted = false
  }

  const handlePlayPause = async () => {
    const audio = layoutAudioRef.current
    if (!audio) return
    // First click unmutes if muted
    if (muteState.isMuted) {
      unmute()
      if (audio.paused) audio.play().catch(() => {})
      return
    }
    if (audio.paused) {
      audio.play().catch(() => {})
      api.playback.resume().catch(() => {})
    } else {
      audio.pause()
      api.playback.pause().catch(() => {})
    }
  }

  const handleVolume = (v: number) => {
    setVolume(v)
    if (v > 0 && muteState.isMuted) unmute()
    if (layoutAudioRef.current) {
      layoutAudioRef.current.volume = v
      if (v > 0) layoutAudioRef.current.muted = false
    }
  }
  const handleMood = async (m: string) => { await api.mood.set(m) }
  const handlePersona = async (p: string) => { await api.personas.select(p) }

  const progress = 0

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-8 gap-6 max-w-lg mx-auto">
      {/* Album art placeholder */}
      <div className="relative w-64 h-64 rounded-2xl bg-surface-2 flex items-center justify-center glow-accent overflow-hidden">
        <Music2 size={80} className="text-accent opacity-40" />
        {isPlaying && (
          <div className="absolute inset-0 bg-gradient-to-t from-surface-1/80 to-transparent" />
        )}
        <div className={`absolute inset-0 rounded-2xl border-2 border-accent/30 ${isPlaying ? 'animate-pulse' : ''}`} />
      </div>

      {/* Track info */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-100 truncate max-w-xs">
          {currentTrack?.title ?? 'Waiting for track…'}
        </h1>
        <p className="text-slate-400 mt-1">{currentTrack?.artist ?? '—'}</p>
        {currentTrack?.album && <p className="text-slate-500 text-sm">{currentTrack.album}</p>}
      </div>

      {/* DJ badge */}
      <div className="flex items-center gap-2 bg-surface-2 rounded-full px-4 py-1.5">
        <Mic2 size={14} className="text-accent-light" />
        <span className="text-xs font-medium text-accent-light capitalize">{persona} DJ</span>
        <span className="w-px h-3 bg-surface-3" />
        <span className="text-xs text-slate-400 capitalize">{mood}</span>
      </div>

      {/* Unmute banner — shown until user interacts */}
      {isMuted && (
        <button
          onClick={handlePlayPause}
          className="w-full max-w-xs flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-white font-semibold text-sm animate-pulse shadow-lg"
        >
          <Volume2 size={18} /> Tap to start audio
        </button>
      )}

      {/* Controls */}
      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        {/* Play / Pause / Skip */}
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayPause}
            className="p-4 rounded-full bg-accent hover:bg-accent/80 transition-colors text-white shadow-lg"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={handleSkip}
            disabled={isSkipping}
            className="p-3 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors text-slate-300 hover:text-white disabled:opacity-50"
            title="Skip"
          >
            {isSkipping ? <Loader2 size={22} className="animate-spin" /> : <SkipForward size={22} />}
          </button>
        </div>
        {isSkipping && <p className="text-xs text-slate-500">Loading next track…</p>}

        {/* Volume */}
        <div className="flex items-center gap-2 w-full">
          <button onClick={() => handleVolume(volume === 0 ? 1 : 0)} className="text-slate-400 hover:text-white shrink-0">
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range" min={0} max={1} step={0.02} value={volume}
            onChange={e => handleVolume(parseFloat(e.target.value))}
            className="flex-1 accent-accent h-1 cursor-pointer"
          />
          <span className="text-xs text-slate-500 w-8 text-right shrink-0">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* Visualizer */}
      <div className="w-full bg-surface-1 rounded-xl overflow-hidden relative">
        <canvas ref={canvasRef} width={600} height={80} className="w-full h-20" />
        <button
          onClick={() => setVizMode(v => v === 'bars' ? 'waveform' : 'bars')}
          className="absolute top-1 right-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {vizMode === 'bars' ? 'Waveform' : 'Bars'}
        </button>
      </div>

      {/* Mood selector */}
      <div className="w-full">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">Mood</p>
        <div className="flex flex-wrap gap-2">
          {MOODS.map(m => (
            <button
              key={m}
              onClick={() => handleMood(m)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize
                ${mood === m ? 'bg-accent text-white' : 'bg-surface-2 text-slate-400 hover:text-slate-100 hover:bg-surface-3'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Persona selector */}
      <div className="w-full">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">DJ Persona</p>
        <div className="flex gap-2">
          {PERSONAS.map(p => (
            <button
              key={p}
              onClick={() => handlePersona(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors capitalize
                ${persona === p ? 'bg-beat text-white' : 'bg-surface-2 text-slate-400 hover:text-slate-100 hover:bg-surface-3'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Connection status */}
      {!wsConnected && (
        <p className="text-xs text-red-400">Disconnected — reconnecting…</p>
      )}
    </div>
  )
}
