const BASE = ''

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  health: () => req<{ status: string; tts: boolean; llm: boolean; ws_clients: number }>('/api/health'),

  playback: {
    state: () => req('/api/playback/state'),
    skip: () => req('/api/playback/skip', { method: 'POST' }),
    pause: () => req('/api/playback/pause', { method: 'POST' }),
    resume: () => req('/api/playback/resume', { method: 'POST' }),
  },

  tracks: {
    artUrl: (id: number) => `/api/tracks/${id}/art`,
    lyrics: (id: number) => req<{ lyrics: string; source: string }>(`/api/tracks/${id}/lyrics`),
  },

  library: {
    list: (page = 1, genre?: string, artist?: string, album?: string) => {
      const p = new URLSearchParams({ page: String(page), page_size: '50' })
      if (genre) p.set('genre', genre)
      if (artist) p.set('artist', artist)
      if (album) p.set('album', album)
      return req<{ total: number; tracks: any[] }>(`/api/library?${p}`)
    },
    search: (q: string) => req<{ tracks: any[] }>(`/api/library/search?q=${encodeURIComponent(q)}`),
    genres: () => req<{ genres: { genre: string; count: number }[] }>('/api/library/genres'),
    scan: () => req('/api/library/scan', { method: 'POST' }),
  },

  queue: {
    list: () => req<{ queue: any[] }>('/api/queue'),
    remove: (queueId: number) => req(`/api/queue/${queueId}`, { method: 'DELETE' }),
    clear: () => req('/api/queue', { method: 'DELETE' }),
  },

  requests: {
    submit: (track_id: number, session_id = 'web') =>
      req('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id, session_id }),
      }),
    list: () => req('/api/requests/queue'),
  },

  mood: {
    options: () => req<{ moods: string[] }>('/api/mood/options'),
    set: (mood: string) =>
      req('/api/mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood }),
      }),
  },

  personas: {
    list: () => req<{ personas: string[] }>('/api/personas'),
    select: (persona: string) =>
      req('/api/personas/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      }),
  },

  llm: {
    settings: () => req<{
      url: string; model: string; api_key_set: boolean;
      use_openai_compat: boolean; effective_url: string; effective_model: string;
    }>('/api/llm/settings'),
    update: (s: { url: string; model: string; api_key: string; use_openai_compat: boolean }) =>
      req('/api/llm/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      }),
  },

  dj: {
    settings: () => req<{ enabled: boolean; every_n: number; user_prompt: string; intro_style: string }>('/api/dj/settings'),
    update: (s: { enabled: boolean; every_n: number; user_prompt: string; intro_style?: string }) =>
      req('/api/dj/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      }),
  },

  playlists: {
    list: () => req<{ playlists: any[] }>('/api/playlists'),
    get: (id: number) => req<{ id: number; name: string; tracks: any[] }>(`/api/playlists/${id}`),
    create: (name: string) =>
      req<{ id: number; name: string; track_count: number }>('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    rename: (id: number, name: string) =>
      req(`/api/playlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    delete: (id: number) => req(`/api/playlists/${id}`, { method: 'DELETE' }),
    addTracks: (id: number, track_ids: number[]) =>
      req(`/api/playlists/${id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_ids }),
      }),
    removeTrack: (playlistId: number, trackId: number) =>
      req(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),
    queueAll: (id: number) =>
      req(`/api/playlists/${id}/queue`, { method: 'POST' }),
  },

  stats: {
    overview: () => req<{ total_plays: number; total_tracks: number; total_listening_hours: number }>('/api/stats/overview'),
    tracks: (limit = 20) => req<{ tracks: any[] }>(`/api/stats/tracks?limit=${limit}`),
    genres: () => req<{ genres: { genre: string; plays: number }[] }>('/api/stats/genres'),
    sessions: () => req<{ sessions: any[] }>('/api/stats/sessions'),
  },
}
