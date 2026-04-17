import { useState } from 'react'
import { Search, ListPlus, Music2, Radio, X, Trash2, CheckCircle2 } from 'lucide-react'
import { useDJStore, type Track } from '../store'
import { api } from '../services/api'

export default function Queue() {
  const { queue, currentTrack, setQueue } = useDJStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const handleSearch = async (q: string) => {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await api.library.search(q)
      setResults(res.tracks)
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async (track: Track) => {
    setAdding(track.id)
    try {
      await api.requests.submit(track.id)
      showToast(`Added "${track.title}" to queue`)
      setResults([])
      setQuery('')
    } finally {
      setAdding(null)
    }
  }

  const handleRemove = async (queueId: number, title: string) => {
    setRemoving(queueId)
    try {
      await api.queue.remove(queueId)
      setQueue(queue.filter(i => i.queue_id !== queueId))
      showToast(`Removed "${title}"`)
    } finally {
      setRemoving(null)
    }
  }

  const handleClear = async () => {
    await api.queue.clear()
    setQueue([])
    showToast('Queue cleared')
  }

  const fmt = (s: number | null) => {
    if (!s) return ''
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  }

  return (
    <div className="p-4 max-w-2xl mx-auto pb-12">
      <h1 className="text-2xl font-bold mb-6">Queue</h1>

      {/* Search to add */}
      <div className="mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search to add a song to the queue…"
            className="w-full bg-surface-2 border border-surface-3 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent transition-colors"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {results.length > 0 && (
          <div className="mt-2 bg-surface-1 border border-surface-3 rounded-xl overflow-hidden divide-y divide-surface-3">
            {results.slice(0, 8).map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 transition-colors">
                <Music2 size={14} className="text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 truncate">{t.artist}{t.album ? ` · ${t.album}` : ''}</p>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{fmt(t.duration_s ?? null)}</span>
                <button
                  onClick={() => handleAdd(t)}
                  disabled={adding === t.id}
                  className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent hover:bg-accent/80 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <ListPlus size={13} />
                  <span>Add</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="mb-4 px-4 py-2 bg-accent/20 border border-accent/40 rounded-lg text-sm text-accent-light flex items-center gap-2">
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Now playing */}
      {currentTrack && (
        <div className="mb-4 flex items-center gap-3 bg-surface-2 rounded-xl px-3 py-3 border border-accent/30">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-accent-light font-medium uppercase tracking-wide mb-0.5">Now Playing</p>
            <p className="text-sm font-medium truncate">{currentTrack.title}</p>
            <p className="text-xs text-slate-400 truncate">{currentTrack.artist}</p>
          </div>
          <Radio size={16} className="text-accent shrink-0" />
        </div>
      )}

      {/* Queue header */}
      {queue.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
            Up next · {queue.length} track{queue.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} /> Clear all
          </button>
        </div>
      )}

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Music2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="mb-1">Queue is empty</p>
          <p className="text-xs text-slate-600">The DJ is auto-piloting — search above to queue a song</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-3">
          {queue.map((item, i) => (
            <div key={item.queue_id} className="flex items-center gap-3 py-2.5 group">
              <span className="text-xs text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
              <Music2 size={14} className="text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.track.title}</p>
                <p className="text-xs text-slate-400 truncate">
                  {item.track.artist}{item.track.album ? ` · ${item.track.album}` : ''}
                </p>
              </div>
              {item.source === 'request' && (
                <span className="text-xs bg-beat/20 text-beat px-2 py-0.5 rounded-full shrink-0">Queued</span>
              )}
              <span className="text-xs text-slate-500 shrink-0">{fmt(item.track.duration_s ?? null)}</span>
              <button
                onClick={() => handleRemove(item.queue_id, item.track.title || '')}
                disabled={removing === item.queue_id}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-500 hover:text-red-400 disabled:opacity-30"
                title="Remove from queue"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
