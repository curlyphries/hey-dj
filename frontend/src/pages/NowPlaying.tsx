import { useRef, useState, useEffect, useCallback } from 'react'
import { SkipForward, Mic2, Music2, Volume2, VolumeX, Loader2, Play, Pause, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { useDJStore } from '../store'
import { api } from '../services/api'
import { useVisualizer, type VisualizerMode } from '../hooks/useVisualizer'
import { audioRef as layoutAudioRef, muteState } from '../components/Layout'


export default function NowPlaying() {
  const { currentTrack, mood, persona, wsConnected, setCurrentTrack, setMood, setPersona } = useDJStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [vizMode, setVizMode] = useState<VisualizerMode>('bars')
  const [vizActive, setVizActive] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [volume, setVolume] = useState(() => layoutAudioRef.current?.volume ?? 1)
  const [artSrc, setArtSrc] = useState<string | null>(null)
  const [artError, setArtError] = useState(false)
  const [lyrics, setLyrics] = useState<string | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [isMuted, setIsMutedLocal] = useState(muteState.isMuted)

  const { setup } = useVisualizer(layoutAudioRef, canvasRef, vizMode, vizActive && isPlaying)

  useEffect(() => {
    if (currentTrack?.id) {
      setArtSrc(api.tracks.artUrl(currentTrack.id))
      setArtError(false)
      setLyrics(null)
      setLyricsOpen(false)
    } else {
      setArtSrc(null)
    }
  }, [currentTrack?.id])

  const handleLyricsToggle = useCallback(async () => {
    if (!currentTrack?.id) return
    if (lyricsOpen) { setLyricsOpen(false); return }
    setLyricsOpen(true)
    if (lyrics !== null) return
    setLyricsLoading(true)
    try {
      const r = await api.tracks.lyrics(currentTrack.id)
      setLyrics(r.lyrics)
    } catch {
      setLyrics('')
    } finally {
      setLyricsLoading(false)
    }
  }, [currentTrack?.id, lyrics, lyricsOpen])

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

    // Reflect actual audio state on mount (e.g. navigating back to Now Playing)
    setIsPlaying(!audio.paused)

    const onPlay = () => { setIsPlaying(true); setVizActive(true) }
    const onPause = () => setIsPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => { audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause) }
  }, [])

  const handleSkip = useCallback(async () => {
    if (isSkipping) return
    setIsSkipping(true)
    const prevId = currentTrack?.id

    await api.playback.skip()

    // Reconnect audio as soon as the backend confirms the track has changed.
    // We poll playback state instead of relying on WS (which may be down through the dev proxy).
    const reconnectAudio = () => {
      const audio = layoutAudioRef.current
      if (!audio) return
      const wasPlaying = !audio.paused
      audio.src = `/stream?t=${Date.now()}`
      audio.load()
      if (wasPlaying) audio.play().catch(() => {})
    }

    // Poll until the backend reports a different track, max ~3s
    let elapsed = 0
    const poll = async () => {
      try {
        const s: any = await api.playback.state()
        if (s.current_track && s.current_track.id !== prevId) {
          if (s.current_track) setCurrentTrack(s.current_track)
          if (s.mood) setMood(s.mood)
          reconnectAudio()
          setIsSkipping(false)
          return
        }
      } catch (_) {}
      elapsed += 300
      if (elapsed < 3000) {
        setTimeout(poll, 300)
      } else {
        // Timed out — reconnect anyway and clear spinner
        reconnectAudio()
        setIsSkipping(false)
      }
    }
    setTimeout(poll, 300)
  }, [isSkipping, currentTrack?.id, setCurrentTrack, setMood])

  const unmute = () => {
    muteState.setMuted(false)
    setIsMutedLocal(false)
    const audio = layoutAudioRef.current
    if (audio) {
      audio.muted = false
      if (audio.paused) audio.play().catch(() => {})
    }
  }

  const handlePlayPause = async () => {
    const audio = layoutAudioRef.current
    if (!audio) return
    if (audio.paused) {
      unmute()
      audio.play().catch(() => {})
      api.playback.resume().catch(() => {})
    } else {
      audio.pause()
      api.playback.pause().catch(() => {})
    }
  }

  const handleVolume = (v: number) => {
    setVolume(v)
    const audio = layoutAudioRef.current
    if (!audio) return
    audio.volume = v
    if (v > 0) {
      audio.muted = false
      muteState.setMuted(false)
      setIsMutedLocal(false)
    }
  }
  const progress = 0

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-8 gap-6 max-w-lg mx-auto">
      {/* Album art */}
      <div className="relative w-64 h-64 rounded-2xl bg-surface-2 flex items-center justify-center glow-accent overflow-hidden">
        {artSrc && !artError ? (
          <img
            src={artSrc}
            alt="Album art"
            className="w-full h-full object-cover"
            onError={() => setArtError(true)}
          />
        ) : (
          <Music2 size={80} className="text-accent opacity-40" />
        )}
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

      {/* Controls */}
      <div className="flex flex-col items-center gap-4 w-full max-w-xs">
        {/* Play / Pause / Skip */}
        <div className="flex items-center gap-4">
          <button
            onClick={handlePlayPause}
            className="p-4 rounded-full bg-accent hover:bg-accent/80 transition-colors text-white shadow-lg relative"
            title={isPlaying ? (isMuted ? 'Unmute' : 'Pause') : 'Play'}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            {isMuted && isPlaying && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center">
                <VolumeX size={9} className="text-black" />
              </span>
            )}
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

      {/* Lyrics */}
      {currentTrack && (
        <div className="w-full max-w-xs">
          <button
            onClick={handleLyricsToggle}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors text-sm text-slate-400 hover:text-slate-200"
          >
            <FileText size={14} />
            <span className="flex-1 text-left">Lyrics</span>
            {lyricsLoading
              ? <Loader2 size={14} className="animate-spin" />
              : lyricsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />
            }
          </button>
          {lyricsOpen && (
            <div className="mt-1 px-3 py-3 rounded-lg bg-surface-1 max-h-64 overflow-y-auto text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {lyricsLoading
                ? <span className="text-slate-500">Fetching lyrics…</span>
                : lyrics
                  ? lyrics
                  : <span className="text-slate-500">No lyrics found for this track.</span>
              }
            </div>
          )}
        </div>
      )}

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

      {/* Connection status */}
      {!wsConnected && (
        <p className="text-xs text-red-400">Disconnected — reconnecting…</p>
      )}
    </div>
  )
}
