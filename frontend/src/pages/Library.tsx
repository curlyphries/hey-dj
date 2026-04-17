import { useState, useEffect, useRef } from 'react'
import { Search, Music2, ListPlus, CheckCircle2, BookmarkPlus, X } from 'lucide-react'
import { api } from '../services/api'
import type { Track } from '../store'

interface PlaylistMeta { id: number; name: string; track_count: number }

type SearchField = 'all' | 'title' | 'artist' | 'album'

const FIELD_TABS: { value: SearchField; label: string }[] = [
  { value: 'all',    label: 'All' },
  { value: 'title',  label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album',  label: 'Album' },
]

export default function Library() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [field, setField] = useState<SearchField>('all')
  const [filterGenre, setFilterGenre] = useState('')
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [playlists, setPlaylists] = useState<PlaylistMeta[]>([])
  const [plDropdown, setPlDropdown] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { api.library.genres().then(r => setGenres(r.genres)) }, [])
  useEffect(() => { api.playlists.list().then(r => setPlaylists(r.playlists)) }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPlDropdown(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        if (query.length >= 2) {
          if (field === 'all') {
            const r = await api.library.search(query)
            setTracks(r.tracks); setTotal(r.tracks.length)
          } else {
            const artistQ = field === 'artist' ? query : undefined
            const albumQ  = field === 'album'  ? query : undefined
            const titleQ  = field === 'title'  ? query : undefined
            if (titleQ) {
              const r = await api.library.search(query)
              const filtered = r.tracks.filter(t => t.title?.toLowerCase().includes(query.toLowerCase()))
              setTracks(filtered); setTotal(filtered.length)
            } else {
              const r = await api.library.list(1, filterGenre || undefined, artistQ, albumQ)
              setTracks(r.tracks); setTotal(r.total)
            }
          }
        } else {
          const r = await api.library.list(page, filterGenre || undefined)
          setTracks(r.tracks); setTotal(r.total)
        }
      } finally { setLoading(false) }
    }, 200)
  }, [query, field, page, filterGenre])

  const handleAddToQueue = async (t: Track) => {
    await api.requests.submit(t.id)
    setAdded(t.id)
    setToast(`Added "${t.title}" to queue`)
    setTimeout(() => { setAdded(null); setToast('') }, 2500)
  }

  const handleAddToPlaylist = async (track: Track, plId: number, plName: string) => {
    setPlDropdown(null)
    await api.playlists.addTracks(plId, [track.id!])
    setPlaylists(prev => prev.map(p => p.id === plId ? { ...p, track_count: p.track_count + 1 } : p))
    setToast(`Added "${track.title}" to ${plName}`)
    setTimeout(() => setToast(''), 2500)
  }

  const fmt = (s: number | null) => {
    if (!s) return ''
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  return (
    <div className="p-4 max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Library</h1>
        <span className="text-sm text-slate-400">{total.toLocaleString()} tracks</span>
      </div>

      {/* Search field */}
      <div className="relative mb-2">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); setFilterGenre('') }}
          placeholder={
            field === 'artist' ? 'Search by artist name…' :
            field === 'album'  ? 'Search by album name…' :
            field === 'title'  ? 'Search by song title…' :
                                 'Search title, artist, album…'
          }
          className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Filter tabs + genre */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-surface-3 shrink-0">
          {FIELD_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => { setField(tab.value); setPage(1) }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${field === tab.value ? 'bg-accent text-white' : 'bg-surface-2 text-slate-400 hover:text-slate-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={filterGenre}
          onChange={e => { setFilterGenre(e.target.value); setPage(1) }}
          className="bg-surface-2 border border-surface-3 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent"
        >
          <option value="">All genres</option>
          {(query.length >= 2 && tracks.length > 0
            ? Array.from(new Set(tracks.map(t => t.genre).filter(Boolean))).sort() as string[]
            : genres.slice(0, 20).map(g => g.genre)
          ).map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      {toast && (
        <div className="mb-3 px-4 py-2 bg-accent/20 border border-accent/40 rounded-lg text-sm text-accent-light flex items-center gap-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Track list */}
      {loading ? (
        <div className="text-center py-12 text-slate-500">Loading…</div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Music2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No tracks found</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-3">
          {tracks.map(t => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 group">
              <Music2 size={14} className="text-slate-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-xs text-slate-400 truncate">
                  <span
                    className="hover:text-accent-light cursor-pointer"
                    onClick={() => { setField('artist'); setQuery(t.artist || ''); setPage(1) }}
                  >{t.artist}</span>
                  {t.album && (
                    <>
                      <span className="mx-1 text-slate-600">·</span>
                      <span
                        className="hover:text-accent-light cursor-pointer"
                        onClick={() => { setField('album'); setQuery(t.album || ''); setPage(1) }}
                      >{t.album}</span>
                    </>
                  )}
                </p>
              </div>
              {t.genre && (
                <span className="text-xs text-slate-500 hidden sm:block shrink-0">{t.genre}</span>
              )}
              <span className="text-xs text-slate-500 shrink-0">{fmt(t.duration_s ?? null)}</span>
              <button
                onClick={() => handleAddToQueue(t)}
                disabled={added === t.id}
                className={`opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                  ${added === t.id ? 'bg-green-500/20 text-green-400 opacity-100' : 'bg-accent hover:bg-accent/80 text-white'}`}
                title="Add to Queue"
              >
                {added === t.id ? <CheckCircle2 size={12} /> : <ListPlus size={12} />}
                <span className="hidden sm:inline">{added === t.id ? 'Added' : 'Add to Queue'}</span>
              </button>

              {/* Playlist picker */}
              <div className="relative opacity-0 group-hover:opacity-100 transition-opacity" ref={plDropdown === t.id ? dropdownRef : undefined}>
                <button
                  onClick={e => { e.stopPropagation(); setPlDropdown(plDropdown === t.id ? null : t.id!) }}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-100 hover:bg-surface-3 transition-colors"
                  title="Add to Playlist"
                >
                  <BookmarkPlus size={14} />
                </button>
                {plDropdown === t.id && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-surface-1 border border-surface-3 rounded-xl shadow-xl min-w-[180px] overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-surface-3">
                      <span className="text-xs text-slate-400 font-medium">Add to playlist</span>
                      <button onClick={() => setPlDropdown(null)} className="text-slate-600 hover:text-slate-300"><X size={12} /></button>
                    </div>
                    {playlists.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-500">No playlists yet — create one first</div>
                    ) : (
                      playlists.map(pl => (
                        <button
                          key={pl.id}
                          onClick={() => handleAddToPlaylist(t, pl.id, pl.name)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-surface-2 hover:text-slate-100 transition-colors text-left"
                        >
                          <BookmarkPlus size={13} className="text-slate-500 shrink-0" />
                          <span className="flex-1 truncate">{pl.name}</span>
                          <span className="text-xs text-slate-600">{pl.track_count}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!query && total > 50 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm bg-surface-2 rounded-lg disabled:opacity-40 hover:bg-surface-3 transition-colors"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-400">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 50)}
            className="px-3 py-1.5 text-sm bg-surface-2 rounded-lg disabled:opacity-40 hover:bg-surface-3 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
