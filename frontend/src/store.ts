import { create } from 'zustand'

export interface Track {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  genre: string | null
  duration_s: number | null
  bpm?: number | null
  format?: string | null
  play_count?: number
  skip_count?: number
  last_played?: number | null
}

export interface QueueItem {
  queue_id: number
  position: number
  source: 'auto' | 'request'
  session_id: string
  track: Track
}

interface DJStore {
  currentTrack: Track | null
  queue: QueueItem[]
  mood: string
  persona: string
  commentary: string
  wsConnected: boolean
  llmOnline: boolean
  ttsOnline: boolean

  setCurrentTrack: (t: Track | null) => void
  setQueue: (q: QueueItem[]) => void
  setMood: (m: string) => void
  setPersona: (p: string) => void
  setCommentary: (c: string) => void
  setWsConnected: (v: boolean) => void
  setStatus: (llm: boolean, tts: boolean) => void
}

export const useDJStore = create<DJStore>((set) => ({
  currentTrack: null,
  queue: [],
  mood: 'chill',
  persona: 'smooth',
  commentary: '',
  wsConnected: false,
  llmOnline: false,
  ttsOnline: false,

  setCurrentTrack: (t) => set({ currentTrack: t }),
  setQueue: (q) => set({ queue: q }),
  setMood: (m) => set({ mood: m }),
  setPersona: (p) => set({ persona: p }),
  setCommentary: (c) => set({ commentary: c }),
  setWsConnected: (v) => set({ wsConnected: v }),
  setStatus: (llm, tts) => set({ llmOnline: llm, ttsOnline: tts }),
}))
