import { useEffect, useRef } from 'react'
import { useDJStore } from '../store'
import { audioRef } from '../components/Layout'

// Connect directly to the backend — bypasses Vite's WS proxy which is
// unreliable when the page is served through a secondary proxy (e.g. Windsurf preview).
// For production the backend serves the frontend itself so location.host is correct.
const BACKEND_PORT = 8010
const WS_URL = import.meta.env.DEV
  ? `ws://${location.hostname}:${BACKEND_PORT}/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const store = useDJStore()

  const connect = () => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    const socket = new WebSocket(WS_URL)
    ws.current = socket

    socket.onopen = () => store.setWsConnected(true)

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case 'state':
            if (msg.payload.current_track) store.setCurrentTrack(msg.payload.current_track)
            if (msg.payload.mood) store.setMood(msg.payload.mood)
            if (msg.payload.persona) store.setPersona(msg.payload.persona)
            break
          case 'track_change':
            store.setCurrentTrack(msg.payload)
            store.setMood(msg.payload.mood || store.mood)
            store.setPersona(msg.payload.persona || store.persona)
            // No audio reconnect here — stream delivers transitions inline
            break
          case 'queue_update':
            store.setQueue(msg.payload.queue || [])
            break
          case 'mood_change':
            store.setMood(msg.payload.mood)
            break
          case 'persona_change':
            store.setPersona(msg.payload.persona)
            break
        }
      } catch (_) {}
    }

    socket.onclose = () => {
      store.setWsConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    socket.onerror = () => socket.close()
  }

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [])
}
