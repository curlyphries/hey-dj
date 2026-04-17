# Troubleshooting

Quick diagnostic first — if `curl http://localhost:8000/api/health` returns something like:

```json
{"status":"ok","tts":true,"llm":true,"ws_clients":0}
```

the backend is healthy. If it fails or shows `tts: false` / `llm: false`, see the relevant section below.

---

## No audio / dead air

**Check 1 — is a track loaded?**
```bash
curl http://localhost:8000/api/playback/state
```
If `current_track` is `null`, the library is empty. Run a scan:
```bash
curl -X POST http://localhost:8000/api/library/scan
```

**Check 2 — does the stream deliver bytes?**
```bash
curl -s --max-time 5 -o /dev/null -w "bytes=%{size_download} code=%{http_code}\n" \
  http://localhost:8000/stream
```
Should show `code=200` and `bytes > 0`. If bytes = 0, check backend logs:
```bash
tail -50 /tmp/aidj-backend.log
```

**Check 3 — is the music dir reachable?**

The backend must be able to read files at the path set in `MUSIC_DIR`. If you're using an SSHFS mount or NAS, confirm it's mounted:
```bash
ls "$MUSIC_DIR" | head
```

**Check 4 — browser muted / autoplay blocked?**

Browsers block autoplay until the user interacts with the page. Click the play button (or the album art) once. The first click unmutes.

---

## DJ not speaking

**The DJ speaks between tracks, not mid-song.** It needs at least one full track to have played (or a skip to have been initiated).

**Check 1 — is the DJ enabled?**

Go to Settings → DJ Controls — confirm the toggle is ON.

**Check 2 — is Ollama running?**
```bash
curl http://localhost:11434/api/tags
```
If this fails, start Ollama:
```bash
ollama serve
```
If Ollama is on a different host, update `OLLAMA_URL` in `.env`.

**Check 3 — is the model pulled?**
```bash
ollama list
```
The model listed in `OLLAMA_MODEL` (default `llama3.2:3b`) must be present. Pull it:
```bash
ollama pull llama3.2:3b
```

**Check 4 — on slow/CPU-only hardware, skip commentary may time out**

The stream waits up to 2 seconds for commentary after a skip. If your LLM takes longer than that, commentary is skipped silently. Solutions:

- Switch to a faster model: `OLLAMA_MODEL=llama3.2:1b`
- Wait for natural track endings instead — the DJ gets a 45-second prep window there
- Increase the timeout in `backend/src/api/routes.py` line ~142 (`2.0` → `5.0`)

**Check 5 — is Kokoro TTS loaded?**

`curl http://localhost:8000/api/health` — if `tts: false`, Kokoro failed to load. Common causes:

- Model files not downloaded (see below)
- Missing `onnxruntime` or `soundfile` Python package
- Check logs: `grep -i kokoro /tmp/aidj-backend.log`

---

## Kokoro TTS not loading / model files missing

On first run the backend auto-downloads `kokoro-v1_0.onnx` (~88 MB) and `voices.bin` (~27 MB) from Hugging Face into `backend/`. If that failed:

```bash
cd backend
source .venv/bin/activate
python - <<'EOF'
from huggingface_hub import hf_hub_download
hf_hub_download("hexgrad/Kokoro-82M-ONNX", "kokoro-v1_0.onnx", local_dir=".")
hf_hub_download("hexgrad/Kokoro-82M-ONNX", "voices.bin", local_dir=".")
print("Done")
EOF
```

Requires internet access on first download. Files are cached locally — no re-download after that.

---

## Music library is empty after scan

**Check 1 — MUSIC_DIR is set correctly**
```bash
grep MUSIC_DIR .env
ls "$(grep MUSIC_DIR .env | cut -d= -f2)"
```

**Check 2 — file formats**

Supported: `.mp3`, `.flac`, `.ogg`, `.wav`, `.m4a`, `.aac`. Other formats are ignored.

**Check 3 — ffmpeg installed**
```bash
ffmpeg -version
```
pydub requires ffmpeg to read non-MP3 files. Install: `sudo apt install ffmpeg`

**Check 4 — metadata extraction errors**

Check logs for `mutagen` errors:
```bash
grep -i "mutagen\|scan\|error" /tmp/aidj-backend.log | tail -20
```
Files with corrupted tags are skipped. They'll still play but may show "Unknown" artist/title.

---

## Stream stutters or buffers constantly

**Cause 1 — music is on a slow NAS/SSHFS**

The stream reads files at realtime rate (computed from file size ÷ duration). SSHFS over a slow link can cause read stalls. Options:
- Move music to local storage
- Use a faster NAS connection
- Pre-copy frequently played files locally

**Cause 2 — server CPU overloaded**

When LLM + TTS are generating in the background, CPU spikes can cause asyncio latency. Reducing `OLLAMA_MODEL` to a smaller model helps.

**Cause 3 — browser buffering too aggressively**

Try a hard refresh (Ctrl+Shift+R). The `Cache-Control: no-cache` header should prevent stale stream responses.

---

## WebSocket disconnects / UI not updating

The WebSocket at `/ws` reconnects automatically. The error `Firefox can't establish a connection to ws://localhost:5173/ws` is a **Vite dev server HMR notice** — harmless, not the app's WebSocket.

The app's WebSocket is `ws://localhost:PORT/ws`. If it fails:
- Confirm the backend is running
- If using a reverse proxy, ensure it passes `Upgrade` headers and sets `proxy_buffering off`

---

## Docker: Ollama not reachable

The container connects to Ollama via `host.docker.internal`. On Linux this requires Docker 20.10+ or the `extra_hosts` mapping in `docker-compose.yml` (already present).

```bash
# Test from inside the container
docker compose exec backend curl http://host.docker.internal:11434/api/tags
```

If that fails, set `OLLAMA_URL=http://172.17.0.1:11434` (Docker bridge IP) in `.env`.

---

## Port already in use

```
ERROR: [Errno 98] Address already in use
```

Find and kill the conflicting process:
```bash
sudo lsof -i :8000
kill -9 <PID>
```

Or change `PORT=8001` in `.env`.

---

## Python version errors

The backend requires Python 3.11+. Check:
```bash
python --version   # or python3 --version
```

On systems with multiple Python versions use `python3.11 -m venv .venv` explicitly.

---

## Resetting everything

```bash
# Clear the database (track history, queue, stats)
rm -f data/dj.db

# Re-scan the library
curl -X POST http://localhost:8000/api/library/scan

# Clear the TTS cache (forces re-synthesis)
# Restart the backend — the lru_cache is in-memory only
pkill -f "uvicorn main:app"
```
