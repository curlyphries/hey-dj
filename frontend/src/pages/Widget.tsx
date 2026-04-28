import { useState, useEffect, useRef } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

interface TrackInfo {
  title: string
  artist: string
  album?: string
  genre?: string
}

function getParam(key: string, fallback = '') {
  return new URLSearchParams(window.location.search).get(key) ?? fallback
}

export default function Widget() {
  const backendOrigin = getParam('backend')
  const size = getParam('size', 'standard') as 'mini' | 'standard' | 'full'
  const label = getParam('label', 'Hey DJ')

  const devBackend = `${location.hostname}:8010`
  const wsBase = backendOrigin
    ? backendOrigin.replace(/^http/, 'ws')
    : import.meta.env.DEV
      ? `ws://${devBackend}`
      : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
  const streamUrl = backendOrigin
    ? `${backendOrigin}/stream`
    : import.meta.env.DEV ? `http://${devBackend}/stream` : '/stream'
  const apiBase = backendOrigin || (import.meta.env.DEV ? `http://${devBackend}` : '')

  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [connected, setConnected] = useState(false)
  const [muted, setMuted] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const audio = new Audio(streamUrl)
    audio.muted = true
    audioRef.current = audio
    audio.play().catch(() => {})

    const connect = () => {
      const ws = new WebSocket(`${wsBase}/ws`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000) }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'track_change' || msg.type === 'now_playing') {
            const p = msg.payload
            setTrack({
              title: p.title ?? p.track?.title ?? 'Unknown',
              artist: p.artist ?? p.track?.artist ?? '',
              album: p.album ?? p.track?.album,
              genre: p.genre ?? p.track?.genre,
            })
          }
        } catch {}
      }
    }
    connect()

    fetch(`${apiBase}/api/playback/state`)
      .then(r => r.json())
      .then(d => {
        if (d.current_track) {
          setTrack({
            title: d.current_track.title ?? 'Unknown',
            artist: d.current_track.artist ?? '',
            album: d.current_track.album,
            genre: d.current_track.genre,
          })
        }
      })
      .catch(() => {})

    return () => { wsRef.current?.close(); audio.pause() }
  }, [])

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    if (muted) {
      audio.muted = false
      audio.play().catch(() => {})
      setMuted(false)
    } else {
      audio.muted = true
      setMuted(true)
    }
  }

  const isMini = size === 'mini'
  const isFull = size === 'full'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: isMini ? '10px 14px' : '12px 18px',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: '0',
        userSelect: 'none',
      }}
    >
      {/* Live indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? '#7c3aed' : '#475569',
            boxShadow: connected ? '0 0 8px #7c3aed' : 'none',
            animation: connected ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span style={{ fontSize: '9px', color: connected ? '#a78bfa' : '#64748b', fontWeight: 600, letterSpacing: '0.05em' }}>
          {connected ? 'LIVE' : 'OFF'}
        </span>
      </div>

      {/* Track info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {track ? (
          <>
            <div style={{
              fontSize: isMini ? '13px' : '14px',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: '#f1f5f9',
              lineHeight: 1.3,
            }}>
              {track.title}
            </div>
            <div style={{
              fontSize: '11px',
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '2px',
            }}>
              {track.artist}
              {!isMini && track.album && (
                <span style={{ color: '#64748b' }}> · {track.album}</span>
              )}
            </div>
            {isFull && track.genre && (
              <div style={{
                display: 'inline-block',
                marginTop: '4px',
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'rgba(124,58,237,0.2)',
                color: '#a78bfa',
                border: '1px solid rgba(124,58,237,0.3)',
              }}>
                {track.genre}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '13px', color: '#475569' }}>Connecting…</div>
        )}
      </div>

      {/* Label */}
      {!isMini && (
        <div style={{
          fontSize: '10px',
          color: '#475569',
          fontWeight: 600,
          letterSpacing: '0.05em',
          flexShrink: 0,
          textAlign: 'center',
          lineHeight: 1.3,
        }}>
          {label.split(' ').map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Play/Mute button */}
      <button
        onClick={toggleMute}
        title={muted ? 'Unmute' : 'Mute'}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: isMini ? '32px' : '38px',
          height: isMini ? '32px' : '38px',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: muted ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#7c3aed,#5b21b6)',
          color: muted ? '#94a3b8' : '#fff',
          transition: 'all 0.2s',
          boxShadow: muted ? 'none' : '0 0 12px rgba(124,58,237,0.5)',
        }}
      >
        {muted
          ? <VolumeX size={isMini ? 14 : 16} />
          : <Volume2 size={isMini ? 14 : 16} />
        }
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
