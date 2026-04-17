import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, CheckCircle, XCircle, Server, Mic2, Zap, Moon, Coffee, Brain, Sun, Cpu, Eye, EyeOff, Code2, Copy, Check } from 'lucide-react'
import { api } from '../services/api'

const PRESETS = [
  {
    id: 'smooth',
    label: 'Smooth',
    icon: <Mic2 size={16} />,
    desc: 'Laid-back radio host, chill vibes',
    persona: 'smooth',
    mood: 'chill',
    prompt: 'Keep it warm and unhurried. Drop a little fun fact about the artist when you can.',
  },
  {
    id: 'hype',
    label: 'Hype',
    icon: <Zap size={16} />,
    desc: 'High-energy, crowd-hype DJ',
    persona: 'hype',
    mood: 'party',
    prompt: 'Punch it up! Short, electric, keep the energy sky-high.',
  },
  {
    id: 'latenight',
    label: 'Late Night',
    icon: <Moon size={16} />,
    desc: 'Intimate jazz-club at 2 am',
    persona: 'latenight',
    mood: 'latenight',
    prompt: 'Whisper it in. Late night intimacy — like you\'re the only two people awake.',
  },
  {
    id: 'morning',
    label: 'Morning',
    icon: <Sun size={16} />,
    desc: 'Warm and uplifting start to the day',
    persona: 'smooth',
    mood: 'morning',
    prompt: 'Bright and gentle. Help ease people into the day with warmth.',
  },
  {
    id: 'focus',
    label: 'Focus',
    icon: <Brain size={16} />,
    desc: 'Minimal, non-distracting commentary',
    persona: 'smooth',
    mood: 'focus',
    prompt: 'One sentence max. People are working — be brief and get out of the way.',
  },
  {
    id: 'coffee',
    label: 'Café',
    icon: <Coffee size={16} />,
    desc: 'Casual neighbourhood coffee shop',
    persona: 'smooth',
    mood: 'chill',
    prompt: 'Casual and conversational, like a barista chatting between songs.',
  },
]

const FREQ_OPTIONS = [
  { value: 1, label: 'Every song' },
  { value: 2, label: 'Every 2nd' },
  { value: 3, label: 'Every 3rd' },
  { value: 5, label: 'Every 5th' },
]

export default function Settings() {
  const [health, setHealth] = useState<{ status: string; tts: boolean; llm: boolean; ws_clients: number } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ added: number; updated: number; removed: number } | null>(null)

  const [llmMode, setLlmMode] = useState<'ollama' | 'openai'>('ollama')
  const [llmUrl, setLlmUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmApiKeySet, setLlmApiKeySet] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const llmSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [djEnabled, setDjEnabled] = useState(true)
  const [everyN, setEveryN] = useState(1)
  const [userPrompt, setUserPrompt] = useState('')
  const [saved, setSaved] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
    api.llm.settings().then((s: any) => {
      setLlmMode(s.use_openai_compat ? 'openai' : 'ollama')
      setLlmUrl(s.url || '')
      setLlmModel(s.model || '')
      setLlmApiKeySet(s.api_key_set || false)
    }).catch(() => {})
    api.dj.settings().then((s: any) => {
      setDjEnabled(s.enabled)
      setEveryN(s.every_n)
      setUserPrompt(s.user_prompt || '')
    }).catch(() => {})
  }, [])

  const persistLlm = useCallback((mode: 'ollama' | 'openai', url: string, model: string, key: string) => {
    if (llmSaveTimer.current) clearTimeout(llmSaveTimer.current)
    llmSaveTimer.current = setTimeout(async () => {
      await api.llm.update({
        url,
        model,
        api_key: key,
        use_openai_compat: mode === 'openai',
      }).catch(() => {})
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }, 400)
  }, [])

  const handleLlmMode = (m: 'ollama' | 'openai') => {
    setLlmMode(m)
    persistLlm(m, llmUrl, llmModel, llmApiKey)
  }

  const handleLlmUrl = (v: string) => {
    setLlmUrl(v)
    persistLlm(llmMode, v, llmModel, llmApiKey)
  }

  const handleLlmModel = (v: string) => {
    setLlmModel(v)
    persistLlm(llmMode, llmUrl, v, llmApiKey)
  }

  const handleLlmApiKey = (v: string) => {
    setLlmApiKey(v)
    setLlmApiKeySet(v.length > 0)
    persistLlm(llmMode, llmUrl, llmModel, v)
  }

  const persist = useCallback((enabled: boolean, n: number, prompt: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await api.dj.update({ enabled, every_n: n, user_prompt: prompt }).catch(() => {})
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }, 400)
  }, [])

  const handleToggle = () => {
    const v = !djEnabled
    setDjEnabled(v)
    persist(v, everyN, userPrompt)
  }

  const handleFreq = (n: number) => {
    setEveryN(n)
    persist(djEnabled, n, userPrompt)
  }

  const handlePrompt = (v: string) => {
    setUserPrompt(v)
    persist(djEnabled, everyN, v)
  }

  const applyPreset = async (p: typeof PRESETS[0]) => {
    setUserPrompt(p.prompt)
    setDjEnabled(true)
    setEveryN(1)
    await Promise.all([
      api.personas.select(p.persona).catch(() => {}),
      api.mood.set(p.mood).catch(() => {}),
      api.dj.update({ enabled: true, every_n: 1, user_prompt: p.prompt }).catch(() => {}),
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const handleScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const r = await api.library.scan() as any
      setScanResult(r)
    } finally {
      setScanning(false)
    }
  }

  const StatusPill = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
      ${ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
      {ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
      {label}
    </div>
  )

  return (
    <div className="p-4 max-w-lg mx-auto pb-12">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* ── DJ Controls ───────────────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Mic2 size={14} className="text-accent-light" /> DJ Controls
          </h2>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-400">Saved</span>}
            <button
              onClick={handleToggle}
              className={`relative w-11 h-6 rounded-full transition-colors ${djEnabled ? 'bg-accent' : 'bg-surface-3'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${djEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* Presets */}
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Presets</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className="flex flex-col items-center gap-1 p-2.5 rounded-lg bg-surface-3 hover:bg-accent/20 hover:text-accent-light transition-colors text-center"
            >
              <span className="text-accent-light">{p.icon}</span>
              <span className="text-xs font-medium">{p.label}</span>
              <span className="text-[10px] text-slate-500 leading-tight">{p.desc}</span>
            </button>
          ))}
        </div>

        {/* Frequency */}
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">How often</p>
        <div className="flex gap-2 mb-4">
          {FREQ_OPTIONS.map(f => (
            <button
              key={f.value}
              onClick={() => handleFreq(f.value)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${everyN === f.value ? 'bg-accent text-white' : 'bg-surface-3 text-slate-400 hover:bg-surface-3/80'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Custom instructions */}
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Custom instructions to the DJ</p>
        <textarea
          value={userPrompt}
          onChange={e => handlePrompt(e.target.value)}
          placeholder={`e.g. "Only play 90s R&B tonight" or "Tell me interesting facts about each artist" or "Keep it short and sweet"`}
          rows={3}
          className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </section>

      {/* ── AI Provider ───────────────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Cpu size={14} className="text-accent-light" /> AI Provider
        </h2>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          {(['ollama', 'openai'] as const).map(m => (
            <button
              key={m}
              onClick={() => handleLlmMode(m)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors
                ${llmMode === m ? 'bg-accent text-white' : 'bg-surface-3 text-slate-400 hover:bg-surface-3/80'}`}
            >
              {m === 'ollama' ? 'Ollama (local)' : 'OpenAI-compatible'}
            </button>
          ))}
        </div>

        {llmMode === 'ollama' ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Ollama URL</p>
              <input
                value={llmUrl}
                onChange={e => handleLlmUrl(e.target.value)}
                placeholder="http://localhost:11434  (leave blank for default)"
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Model</p>
              <input
                value={llmModel}
                onChange={e => handleLlmModel(e.target.value)}
                placeholder="llama3.2:3b  (leave blank for default)"
                list="ollama-models"
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <datalist id="ollama-models">
                {['llama3.2:3b','llama3.2:1b','qwen2.5:1.5b','qwen2.5:0.5b','gemma3:1b','mistral:7b'].map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-surface-3 rounded-lg text-xs text-slate-400 leading-relaxed">
              Works with any OpenAI-compatible API — OpenRouter, Groq, Together, LM Studio, and more.
              The DJ uses <code className="text-accent-light">/v1/chat/completions</code>.
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">API Base URL</p>
              <input
                value={llmUrl}
                onChange={e => handleLlmUrl(e.target.value)}
                placeholder="https://openrouter.ai/api"
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Model</p>
              <input
                value={llmModel}
                onChange={e => handleLlmModel(e.target.value)}
                placeholder="meta-llama/llama-3.2-3b-instruct"
                list="openai-models"
                className="w-full bg-surface-3 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <datalist id="openai-models">
                {[
                  'meta-llama/llama-3.2-3b-instruct',
                  'meta-llama/llama-3.1-8b-instruct',
                  'google/gemma-3-4b-it',
                  'mistralai/mistral-7b-instruct',
                  'llama-3.1-70b-versatile',
                  'llama3-8b-8192',
                ].map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">API Key</p>
              <div className="relative">
                <input
                  value={llmApiKey}
                  onChange={e => handleLlmApiKey(e.target.value)}
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={llmApiKeySet ? '••••••••  (key saved — type to replace)' : 'sk-...'}
                  className="w-full bg-surface-3 rounded-lg px-3 py-2 pr-9 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                <button
                  onClick={() => setShowApiKey(v => !v)}
                  className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {llmApiKeySet && (
                <button
                  onClick={() => handleLlmApiKey('')}
                  className="mt-1.5 text-xs text-red-400 hover:text-red-300"
                >
                  Clear saved key
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Service status ────────────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Server size={14} className="text-accent-light" /> Service Status
        </h2>
        {health ? (
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={health.status === 'ok'} label="Backend" />
            <StatusPill ok={health.llm} label="Ollama LLM" />
            <StatusPill ok={health.tts} label="Kokoro TTS" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-surface-3 text-slate-400">
              <span>{health.ws_clients}</span>
              <span>listener{health.ws_clients !== 1 ? 's' : ''}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Loading…</p>
        )}
      </section>

      {/* ── Library scan ──────────────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Library</h2>
        <p className="text-xs text-slate-400 mb-3">
          Trigger a full rescan of your music folder to pick up new files or updated metadata.
        </p>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : 'Scan Music Folder'}
        </button>
        {scanResult && (
          <p className="mt-3 text-sm text-slate-300">
            Done — <span className="text-green-400">+{scanResult.added} added</span>,{' '}
            <span className="text-yellow-400">~{scanResult.updated} updated</span>,{' '}
            <span className="text-red-400">-{scanResult.removed} removed</span>
          </p>
        )}
      </section>

      {/* ── Android PWA ───────────────────────────────────────────────────── */}
      <section className="bg-surface-2 rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-2">Android PWA</h2>
        <p className="text-xs text-slate-400">
          Open this page in <strong className="text-slate-300">Chrome on Android</strong>, tap the browser menu (⋮), and select{' '}
          <strong className="text-slate-300">"Add to Home Screen"</strong>. The app will install as a full-screen standalone app — no app store required.
        </p>
      </section>

      {/* ── Embed Widget ──────────────────────────────────────────────────── */}
      <EmbedSection />
    </div>
  )
}

function EmbedSection() {
  const SIZES = [
    { id: 'mini',     label: 'Mini',     w: 320,  h: 60  },
    { id: 'standard', label: 'Standard', w: 480,  h: 90  },
    { id: 'full',     label: 'Full',     w: 600,  h: 110 },
  ] as const

  const [size, setSize] = useState<'mini'|'standard'|'full'>('standard')
  const [customHost, setCustomHost] = useState('')
  const [widgetLabel, setWidgetLabel] = useState('Hey DJ')
  const [copied, setCopied] = useState(false)

  const sel = SIZES.find(s => s.id === size)!
  const origin = customHost.trim() || window.location.origin

  const params = new URLSearchParams({ size })
  if (widgetLabel !== 'Hey DJ') params.set('label', widgetLabel)
  if (customHost.trim()) params.set('backend', customHost.trim())

  const widgetUrl = `${window.location.origin}/widget?${params}`
  const embedCode = `<iframe\n  src="${widgetUrl}"\n  width="${sel.w}"\n  height="${sel.h}"\n  frameborder="0"\n  scrolling="no"\n  style="border-radius:12px;overflow:hidden;"\n></iframe>`

  const copyEmbed = async () => {
    await navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="bg-surface-2 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Code2 size={16} className="text-accent-light" />
        <h2 className="text-sm font-semibold">Embed Widget</h2>
      </div>

      {/* Preview */}
      <div className="mb-4">
        <p className="text-xs text-slate-400 mb-2">Preview</p>
        <div className="rounded-xl overflow-hidden border border-surface-3" style={{ width: sel.w, maxWidth: '100%', height: sel.h }}>
          <iframe
            key={widgetUrl}
            src={`/widget?${new URLSearchParams({ size, label: widgetLabel })}`}
            width="100%"
            height={sel.h}
            frameBorder={0}
            scrolling="no"
            title="Widget preview"
          />
        </div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Size</label>
          <div className="flex gap-1">
            {SIZES.map(s => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors
                  ${size === s.id ? 'bg-accent text-white' : 'bg-surface-3 text-slate-400 hover:text-slate-200'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Label</label>
          <input
            value={widgetLabel}
            onChange={e => setWidgetLabel(e.target.value)}
            placeholder="Hey DJ"
            className="w-full bg-surface-3 border border-surface-3 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Backend URL <span className="text-slate-600">(cross-origin only)</span></label>
          <input
            value={customHost}
            onChange={e => setCustomHost(e.target.value)}
            placeholder={window.location.origin}
            className="w-full bg-surface-3 border border-surface-3 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Embed code */}
      <div className="relative">
        <pre className="bg-surface-3 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto whitespace-pre font-mono leading-relaxed">{embedCode}</pre>
        <button
          onClick={copyEmbed}
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-xs bg-surface-2 hover:bg-surface-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Paste into any webpage. Listeners must be able to reach this server's <code className="text-slate-500">/stream</code> endpoint.
      </p>
    </section>
  )
}
