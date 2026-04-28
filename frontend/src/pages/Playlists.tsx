import { useState, useEffect, useRef } from 'react'
import {
  ListMusic, Plus, Trash2, Play, X, Pencil, Check,
  Music2, ChevronRight, ListPlus, CheckCircle2,
} from 'lucide-react'
import { api } from '../services/api'

interface PlaylistMeta {
  id: number
  name: string
  track_count: number
  created_at: number
}

interface PlaylistTrackItem {
  playlist_track_id: string
  position: number
  track: {
    id: number
    title: string
    artist: string
    album: string
    genre: string
    duration_s: number
  }
}

export default function Playlists() {
  const [playlists, setPlaylists] = useState<PlaylistMeta[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [tracks, setTracks] = useState<PlaylistTrackItem[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [toast, setToast] = useState('')
  const [queuing, setQueuing] = useState(false)
  const createInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const loadPlaylists = async () => {
    const r = await api.playlists.list()
    setPlaylists(r.playlists)
  }

  useEffect(() => { loadPlaylists() }, [])

  useEffect(() => {
    if (creating) setTimeout(() => createInputRef.current?.focus(), 50)
  }, [creating])

  useEffect(() => {
    if (editingId !== null) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [editingId])

  const selectPlaylist = async (id: number, name: string) => {
    setSelected(id)
    setSelectedName(name)
    setLoadingTracks(true)
    try {
      const r = await api.playlists.get(id)
      setTracks(r.tracks)
    } finally {
      setLoadingTracks(false)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const pl = await api.playlists.create(name)
      await loadPlaylists()
      setNewName('')
      setCreating(false)
      showToast(`Playlist "${pl.name}" created`)
      selectPlaylist(pl.id, pl.name)
    } catch {
      await loadPlaylists()
      showToast('A playlist with that name already exists')
    }
  }

  const handleRename = async (id: number) => {
    const name = editName.trim()
    if (!name) { setEditingId(null); return }
    try {
      await api.playlists.rename(id, name)
      setPlaylists(prev =>
        prev.map(p => p.id === id ? { ...p, name } : p).sort((a, b) => a.name.localeCompare(b.name))
      )
      if (selected === id) setSelectedName(name)
      setEditingId(null)
      showToast('Playlist renamed')
    } catch {
      showToast('That name is already taken')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    await api.playlists.delete(id)
    setPlaylists(prev => prev.filter(p => p.id !== id))
    if (selected === id) { setSelected(null); setTracks([]) }
    showToast(`"${name}" deleted`)
  }

  const handleRemoveTrack = async (trackId: number, title: string) => {
    if (selected === null) return
    await api.playlists.removeTrack(selected, trackId)
    setTracks(prev => prev.filter(t => t.track.id !== trackId))
    setPlaylists(prev =>
      prev.map(p => p.id === selected ? { ...p, track_count: p.track_count - 1 } : p)
    )
    showToast(`Removed "${title}"`)
  }

  const handleQueueAll = async () => {
    if (selected === null) return
    setQueuing(true)
    try {
      const r = await api.playlists.queueAll(selected) as any
      showToast(`Added ${r.queued} tracks to queue`)
    } catch {
      showToast('Playlist is empty')
    } finally {
      setQueuing(false)
    }
  }

  const fmt = (s: number | null) => {
    if (!s) return ''
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  const totalDuration = tracks.reduce((sum, t) => sum + (t.track.duration_s || 0), 0)
  const fmtDuration = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="flex h-full">
      {/* ── Playlist list panel ── */}
      <div className={`flex flex-col bg-surface shrink-0 border-r border-surface-3 transition-all
        ${selected !== null ? 'w-64 hidden md:flex' : 'w-full md:w-72'}`}>
        <div className="p-4 border-b border-surface-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold">Playlists</h1>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-accent hover:bg-accent/80 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus size={13} /> New
            </button>
          </div>

          {/* Create form */}
          {creating && (
            <div className="flex gap-2 mt-2">
              <input
                ref={createInputRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                placeholder="Playlist name…"
                className="flex-1 bg-surface-2 border border-accent rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <button onClick={handleCreate} className="p-1.5 bg-accent rounded-lg text-white hover:bg-accent/80">
                <Check size={14} />
              </button>
              <button onClick={() => { setCreating(false); setNewName('') }} className="p-1.5 text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {toast && (
          <div className="mx-4 mt-3 px-3 py-2 bg-accent/20 border border-accent/40 rounded-lg text-xs text-accent-light flex items-center gap-2">
            <CheckCircle2 size={12} /> {toast}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {playlists.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <ListMusic size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No playlists yet</p>
              <p className="text-xs mt-1 text-slate-600">Click "+ New" to create one</p>
            </div>
          ) : (
            playlists.map(pl => (
              <div
                key={pl.id}
                onClick={() => selectPlaylist(pl.id, pl.name)}
                className={`flex items-center gap-2 px-4 py-3 cursor-pointer group transition-colors
                  ${selected === pl.id ? 'bg-accent/20 border-r-2 border-accent' : 'hover:bg-surface-2'}`}
              >
                <ListMusic size={15} className={selected === pl.id ? 'text-accent-light' : 'text-slate-500'} />
                <div className="flex-1 min-w-0">
                  {editingId === pl.id ? (
                    <input
                      ref={editInputRef}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter') handleRename(pl.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      className="w-full bg-surface-3 border border-accent rounded px-2 py-0.5 text-sm text-slate-100 focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{pl.name}</p>
                  )}
                  <p className="text-xs text-slate-500">{pl.track_count} track{pl.track_count !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setEditingId(pl.id); setEditName(pl.name) }}
                    className="p-1 text-slate-500 hover:text-slate-200 rounded"
                    title="Rename"
                  ><Pencil size={12} /></button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(pl.id, pl.name) }}
                    className="p-1 text-slate-500 hover:text-red-400 rounded"
                    title="Delete"
                  ><Trash2 size={12} /></button>
                </div>
                <ChevronRight size={14} className={`text-slate-600 shrink-0 ${selected === pl.id ? 'text-accent' : ''}`} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Playlist detail panel ── */}
      {selected !== null ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-surface-3 flex items-center gap-3 shrink-0">
            <button
              onClick={() => setSelected(null)}
              className="md:hidden p-1.5 text-slate-400 hover:text-slate-200"
            ><X size={16} /></button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{selectedName}</h2>
              {tracks.length > 0 && (
                <p className="text-xs text-slate-400">
                  {tracks.length} track{tracks.length !== 1 ? 's' : ''} · {fmtDuration(totalDuration)}
                </p>
              )}
            </div>
            <button
              onClick={handleQueueAll}
              disabled={queuing || tracks.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Play size={14} />
              <span>Play All</span>
            </button>
          </div>

          {/* Toast */}
          {toast && (
            <div className="mx-4 mt-3 px-3 py-2 bg-accent/20 border border-accent/40 rounded-lg text-sm text-accent-light flex items-center gap-2">
              <CheckCircle2 size={14} /> {toast}
            </div>
          )}

          {/* Track list */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingTracks ? (
              <div className="text-center py-12 text-slate-500">Loading…</div>
            ) : tracks.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Music2 size={40} className="mx-auto mb-3 opacity-30" />
                <p className="mb-1">No tracks yet</p>
                <p className="text-xs text-slate-600">
                  Go to <span className="text-accent-light">Library</span> and use the{' '}
                  <ListPlus size={12} className="inline" /> button to add songs here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-surface-3">
                {tracks.map((item, i) => (
                  <div key={item.playlist_track_id} className="flex items-center gap-3 py-2.5 group">
                    <span className="text-xs text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
                    <Music2 size={14} className="text-slate-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.track.title}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {item.track.artist}{item.track.album ? ` · ${item.track.album}` : ''}
                      </p>
                    </div>
                    {item.track.genre && (
                      <span className="text-xs text-slate-500 hidden sm:block shrink-0">{item.track.genre}</span>
                    )}
                    <span className="text-xs text-slate-500 shrink-0">{fmt(item.track.duration_s)}</span>
                    <button
                      onClick={() => handleRemoveTrack(item.track.id, item.track.title)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-red-400"
                      title="Remove from playlist"
                    ><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-slate-600">
          <div className="text-center">
            <ListMusic size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Select a playlist to view tracks</p>
          </div>
        </div>
      )}
    </div>
  )
}
