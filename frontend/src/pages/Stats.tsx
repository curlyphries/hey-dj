import { useState, useEffect } from 'react'
import { BarChart2, Clock, Music2, TrendingUp } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'
import { api } from '../services/api'

const PIE_COLORS = ['#7c3aed', '#a78bfa', '#ec4899', '#f97316', '#22c55e', '#06b6d4', '#eab308', '#ef4444']

export default function Stats() {
  const [overview, setOverview] = useState<{ total_plays: number; total_tracks: number; total_listening_hours: number } | null>(null)
  const [topTracks, setTopTracks] = useState<any[]>([])
  const [genres, setGenres] = useState<{ genre: string; plays: number }[]>([])
  const [sessions, setSessions] = useState<any[]>([])

  useEffect(() => {
    api.stats.overview().then(setOverview)
    api.stats.tracks(10).then(r => setTopTracks(r.tracks))
    api.stats.genres().then(r => setGenres(r.genres.slice(0, 8)))
    api.stats.sessions().then(r => setSessions(r.sessions.slice(0, 10)))
  }, [])

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Stats</h1>

      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-surface-2 rounded-xl p-4">
          <div className="flex items-center gap-2 text-accent-light mb-1">
            <Music2 size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">Total Plays</span>
          </div>
          <p className="text-2xl font-bold">{overview?.total_plays.toLocaleString() ?? '—'}</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-4">
          <div className="flex items-center gap-2 text-beat mb-1">
            <Clock size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">Hours</span>
          </div>
          <p className="text-2xl font-bold">{overview?.total_listening_hours.toLocaleString() ?? '—'}</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <TrendingUp size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">Tracks</span>
          </div>
          <p className="text-2xl font-bold">{overview?.total_tracks.toLocaleString() ?? '—'}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Genre pie */}
        {genres.length > 0 && (
          <div className="bg-surface-2 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <BarChart2 size={14} className="text-accent-light" /> Genre Breakdown
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={genres} dataKey="plays" nameKey="genre" cx="50%" cy="50%" outerRadius={70}>
                  {genres.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e1e38', border: 'none', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v.toLocaleString(), 'plays']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {genres.map((g, i) => (
                <div key={g.genre} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs text-slate-400 capitalize">{g.genre}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top tracks bar chart */}
        {topTracks.length > 0 && (
          <div className="bg-surface-2 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <TrendingUp size={14} className="text-beat" /> Top Tracks
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topTracks.slice(0, 8)} layout="vertical" margin={{ left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={80}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
                />
                <Tooltip
                  contentStyle={{ background: '#1e1e38', border: 'none', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [v, 'plays']}
                />
                <Bar dataKey="play_count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="bg-surface-2 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-4">Recent Sessions</h2>
          <div className="divide-y divide-surface-3">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300">{new Date(s.started_at * 1000).toLocaleDateString()}</p>
                  <p className="text-xs text-slate-500">
                    {s.tracks_played} tracks · {s.total_minutes} min
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  {s.mood && <span className="bg-accent/20 text-accent-light px-2 py-0.5 rounded-full capitalize">{s.mood}</span>}
                  {s.persona && <span className="bg-beat/20 text-beat px-2 py-0.5 rounded-full capitalize">{s.persona}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!overview && (
        <div className="text-center py-12 text-slate-500">Loading stats…</div>
      )}
    </div>
  )
}
