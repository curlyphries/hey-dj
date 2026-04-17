# Tasks: Local AI DJ v2

**Branch**: `001-local-ai-dj` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Legend: [P] = can run in parallel with other [P] tasks at same level

---

## Phase 0 — Project Scaffold

- [x] **T-001**: Initialize project structure — `backend/`, `frontend/`, `specs/`, `.env.example`, `.gitignore`, `docker-compose.yml`
- [x] **T-002**: Set up backend Python environment — `pyproject.toml` / `requirements.txt` with FastAPI, pydub, mutagen, watchdog, httpx, sqlalchemy, kokoro-onnx, pytest
- [ ] **T-003**: Set up frontend Vite + React + TypeScript + TailwindCSS + shadcn/ui + vite-plugin-pwa

## Phase 1 — Backend Core

- [ ] **T-004** [P]: DB setup — SQLAlchemy models for `Track`, `Queue`, `Request`, `Playlist`, `Session`, `DailyStats`; Alembic migration; init script
- [ ] **T-005** [P]: Config module — load `.env` / `config.yaml`; expose typed settings (music dir, port, Ollama URL/model, crossfade seconds, personas)

## Phase 2 — Library

- [ ] **T-006**: Library scanner — walk music folder, extract metadata via `mutagen`, upsert into `tracks` table; skip unchanged files via mtime
- [ ] **T-007**: File watcher — `watchdog` observer on music folder; trigger incremental re-scan on file create/modify/delete
- [ ] **T-008**: Library API routes — `GET /api/library` (paginated, filterable by genre/artist), `GET /api/library/search?q=`, `GET /api/library/genres`

## Phase 3 — LLM Client

- [ ] **T-009**: Ollama client — async `httpx` wrapper for `POST /api/generate`; timeout + retry; returns streamed or full text
- [ ] **T-010**: DJ commentary prompt templates — Jinja2 templates per persona (Smooth, Hype, Late Night) for track intro, mood change, song request acknowledgment
- [ ] **T-011**: Commentary generator — takes `(current_track, next_track, persona, mood)` → calls Ollama → returns commentary string; falls back to template on error

## Phase 4 — TTS

- [ ] **T-012**: Kokoro TTS wrapper — load `kokoro-onnx` model on startup; expose `synthesize(text) -> bytes` (WAV); cache recent outputs by text hash; log errors without crashing
- [ ] **T-013**: TTS route — `POST /api/tts/preview` (for testing voice in UI); returns audio/wav

## Phase 5 — Audio Engine

- [ ] **T-014**: Audio segment loader — given track file path, load via pydub; normalize to consistent sample rate + format; cache decoded segment (LRU, max 5 tracks in memory)
- [ ] **T-015**: Crossfade mixer — takes `(track_a_segment, track_b_segment, fade_ms)` → returns concatenated segment with linear volume crossfade at boundary
- [ ] **T-016**: Commentary injector — takes `(commentary_wav_bytes, next_track_segment, crossfade_ms)` → sequences commentary audio before next track with short fade in
- [ ] **T-017**: Audio stream generator — async generator that yields PCM/MP3 chunks; maintains internal state (current segment, position, next segment pre-loaded); triggered by DJ engine events
- [ ] **T-018**: Stream endpoint — `GET /stream` — chunked HTTP audio/mpeg response from stream generator; handles client connect/disconnect gracefully

## Phase 6 — DJ Engine

- [ ] **T-019**: Queue manager — in-memory + DB-backed queue; `push(track, source)`, `pop() -> track`, `peek_next()`, `insert_request(track)`; broadcasts queue state via WebSocket on change
- [ ] **T-020**: Mood selector — given mood string, queries DB for tracks matching genre/BPM profile; uses LLM scoring if genre tags are sparse; returns ordered candidate list
- [ ] **T-021**: Auto-pilot — background task that fills the queue when < 3 tracks ahead; selects next track based on current mood + genre continuity + avoid recent repeats
- [ ] **T-022**: DJ orchestrator — main background task loop: watches queue, pre-generates commentary + TTS for next track 15s before current track ends, signals audio engine
- [ ] **T-023**: Stats recorder — hooks into DJ orchestrator; records play/skip events to `sessions` + `daily_stats` tables

## Phase 7 — API & WebSocket

- [ ] **T-024**: WebSocket hub — FastAPI `/ws` endpoint; tracks connected clients; broadcasts `{type, payload}` events: `track_change`, `queue_update`, `request_ack`, `mood_change`, `stats_update`
- [ ] **T-025**: Playback API — `POST /api/playback/skip`, `POST /api/playback/pause`, `POST /api/playback/resume`, `GET /api/playback/state`
- [ ] **T-026**: Request API — `POST /api/requests` `{track_id}`, `GET /api/requests/queue`; validates track exists; pushes to queue manager; returns request ID
- [ ] **T-027**: Mood API — `POST /api/mood` `{mood}`, `GET /api/mood/options`
- [ ] **T-028**: Playlist API — `GET /api/playlists`, `POST /api/playlists`, `PUT /api/playlists/{id}`, `DELETE /api/playlists/{id}`, `POST /api/playlists/{id}/tracks`
- [ ] **T-029**: Stats API — `GET /api/stats/overview`, `GET /api/stats/tracks?limit=20`, `GET /api/stats/genres`, `GET /api/stats/sessions`
- [ ] **T-030**: Persona API — `GET /api/personas`, `POST /api/personas/select`

## Phase 8 — Frontend Shell & PWA

- [ ] **T-031**: App shell — React Router setup; layout with sidebar nav (Now Playing, Queue, Library, Stats, Settings); dark theme (Tailwind)
- [ ] **T-032**: WebSocket hook — `useWebSocket()` — connects to `/ws`, parses events, updates Zustand/context store
- [ ] **T-033**: Audio hook — `useAudio()` — manages `<audio>` element connected to `/stream`; exposes play/pause/skip controls
- [ ] **T-034**: PWA config — `vite-plugin-pwa` manifest (`name`, `short_name`, `display: standalone`, `theme_color`, icons 192+512px); Workbox cache strategy for shell assets
- [ ] **T-035**: Service worker — cache app shell; network-first for API; pre-cache static assets

## Phase 9 — UI Pages

- [ ] **T-036** [P]: Now Playing page — album art (generated placeholder if missing), track title/artist, DJ persona name, commentary text display, mood selector pill buttons, skip button; hooks into `useAudio` + WebSocket
- [ ] **T-037** [P]: Visualizer component — Web Audio API `AnalyserNode` connected to audio stream; bar spectrum + waveform modes; toggle button; canvas rendering with `requestAnimationFrame`
- [ ] **T-038** [P]: Queue page — live queue list from WebSocket; drag-to-reorder (future); search bar → library search → request button; pending requests list
- [ ] **T-039** [P]: Library page — paginated track list; filter by genre; search; click to request or add to playlist
- [ ] **T-040** [P]: Stats dashboard — cards for total listening time, top 10 tracks, genre breakdown (pie chart), session history table; data from `/api/stats/*`
- [ ] **T-041** [P]: Settings page — music folder path display, Ollama model selector, crossfade slider, persona toggle, port display, scan trigger button

## Phase 10 — Integration & Polish

- [ ] **T-042**: Backend integration tests — pytest: library scan, commentary generation (mock Ollama), TTS mock, queue operations, WebSocket events, stream start
- [ ] **T-043**: Frontend component tests — Vitest: Now Playing renders, queue updates on WebSocket event, request submission
- [ ] **T-044**: Docker setup — `Dockerfile` for backend (includes ffmpeg + Kokoro model download step); `docker-compose.yml` with volume mounts for music folder + data
- [ ] **T-045**: README — quickstart (Docker + bare metal), config reference, Android PWA install instructions, remote access guide (Nginx reverse proxy snippet)
