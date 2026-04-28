import asyncio
import hmac
import os
import time
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db.database import get_db
from ..db.models import Track, QueueEntry, Request, Playlist, PlaylistTrack, Session as DJSession, DailyStat
from ..dj.queue_manager import queue_manager
from ..dj.mood import MOOD_GENRES, pick_next_track
from ..dj.orchestrator import orchestrator
from ..library.scanner import scan_library
from ..tts.kokoro_tts import synthesize as tts_synth, is_available as tts_available
from ..llm.templates import PERSONA_MODIFIERS
from ..llm.state import llm_state, validate_llm_url
from ..audio.engine import _load_segment, segment_to_mp3_bytes
from .websocket import hub

logger = logging.getLogger(__name__)
router = APIRouter()


def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> None:
    """Enforce admin-token auth on settings-mutation endpoints.

    When `settings.admin_token` is empty (default), the dependency permits
    all requests — preserving the open-by-default UX for local-only use.
    Once set, the request must include `X-Admin-Token: <token>` matching
    via constant-time comparison.
    """
    expected = settings.admin_token
    if not expected:
        return
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Admin token required")

# ─── WebSocket ────────────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        # Send current state immediately on connect
        state = orchestrator.get_state()
        await ws.send_json({"type": "state", "payload": state})
        queue = await queue_manager.list()
        await ws.send_json({"type": "queue_update", "payload": {"queue": queue}})

        while True:
            data = await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(ws)


# ─── Library ──────────────────────────────────────────────────────────────────

@router.get("/api/library")
async def list_library(
    page: int = 1,
    page_size: int = 50,
    genre: Optional[str] = None,
    artist: Optional[str] = None,
    album: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Track)
    if genre:
        query = query.where(Track.genre.ilike(f"%{genre}%"))
    if artist:
        query = query.where(Track.artist.ilike(f"%{artist}%"))
    if album:
        query = query.where(Track.album.ilike(f"%{album}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.order_by(Track.artist, Track.album, Track.title)
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    tracks = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "tracks": [_track_dict(t) for t in tracks],
    }


@router.get("/api/library/search")
async def search_library(q: str, limit: int = 20, db: AsyncSession = Depends(get_db)):
    pattern = f"%{q}%"
    result = await db.execute(
        select(Track).where(
            Track.title.ilike(pattern) |
            Track.artist.ilike(pattern) |
            Track.album.ilike(pattern)
        ).limit(limit)
    )
    tracks = result.scalars().all()
    return {"tracks": [_track_dict(t) for t in tracks]}


@router.get("/api/library/genres")
async def list_genres(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Track.genre, func.count(Track.id).label("count"))
        .where(Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(desc("count"))
    )
    return {"genres": [{"genre": r[0], "count": r[1]} for r in result]}


@router.post("/api/library/scan")
async def trigger_scan(db: AsyncSession = Depends(get_db)):
    result = await scan_library(db)
    await hub.broadcast({"type": "library_scanned", "payload": result})
    return result


# ─── Audio Stream ─────────────────────────────────────────────────────────────

CHUNK_SIZE = 4096   # 4 KB chunks
# Fallback rate when per-track rate cannot be computed (192 kbps nominal)
_FALLBACK_SLEEP = CHUNK_SIZE / 24_000  # ~0.171 s


async def _load_track_mp3(file_path: str) -> Optional[bytes]:
    """Decode any supported audio file and return MP3-encoded bytes."""
    loop = asyncio.get_running_loop()
    seg = await loop.run_in_executor(None, _load_segment, file_path)
    if seg is None:
        return None
    return await loop.run_in_executor(None, segment_to_mp3_bytes, seg)


@router.get("/stream")
async def audio_stream():
    async def generate():
        last_served_id = None   # ID of the last track whose file we finished

        while True:
            track = orchestrator.current_track
            if track is None or orchestrator.is_paused():
                await asyncio.sleep(0.3)
                continue

            if track.id == last_served_id:
                # Stream is ahead of orchestrator — wait for next track
                await asyncio.sleep(0.2)
                continue

            track_id = track.id
            file_path = track.file_path
            track_format = (track.format or "").lower()
            skip_version = orchestrator.skip_version()

            # ── DJ commentary ─────────────────────────────────────────────────
            transition = await orchestrator.consume_transition_for(
                track_id, skip_version, timeout=2.0
            )
            if transition is not None:
                yield transition
                await asyncio.sleep(0)

            # ── Track audio at realtime rate ──────────────────────────────────
            # MP3 files stream raw to avoid an unnecessary decode/re-encode.
            # All other formats are transcoded to MP3 in memory so the
            # `audio/mpeg` Content-Type stays accurate.
            try:
                if track_format == "mp3":
                    async for chunk in _stream_mp3_file(track, file_path, skip_version):
                        yield chunk
                else:
                    async for chunk in _stream_transcoded(track, file_path, skip_version):
                        yield chunk
            except Exception as e:
                logger.warning(f"Stream error on track {track_id} ({file_path}): {e}")
                await asyncio.sleep(1)

            last_served_id = track_id

    return StreamingResponse(
        generate(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"},
    )


async def _stream_mp3_file(track: Track, file_path: str, skip_version: int):
    try:
        file_size = os.path.getsize(file_path)
        dur = track.duration_s or 1
        per_chunk_sleep = CHUNK_SIZE / max(file_size / dur, 100)
    except OSError:
        per_chunk_sleep = _FALLBACK_SLEEP

    with open(file_path, 'rb') as fh:
        while True:
            if orchestrator.is_paused():
                await orchestrator.wait_until_resumed()
            if orchestrator.skip_version() != skip_version:
                return
            chunk = fh.read(CHUNK_SIZE)
            if not chunk:
                return
            yield chunk
            await asyncio.sleep(per_chunk_sleep)


async def _stream_transcoded(track: Track, file_path: str, skip_version: int):
    mp3_bytes = await _load_track_mp3(file_path)
    if not mp3_bytes:
        return

    dur = track.duration_s or 1
    per_chunk_sleep = CHUNK_SIZE / max(len(mp3_bytes) / dur, 100)

    for i in range(0, len(mp3_bytes), CHUNK_SIZE):
        if orchestrator.is_paused():
            await orchestrator.wait_until_resumed()
        if orchestrator.skip_version() != skip_version:
            return
        yield mp3_bytes[i:i + CHUNK_SIZE]
        await asyncio.sleep(per_chunk_sleep)


# ─── Playback ─────────────────────────────────────────────────────────────────

@router.get("/api/playback/state")
async def playback_state():
    return orchestrator.get_state()


@router.post("/api/playback/skip")
async def skip_track():
    orchestrator.skip()
    await hub.broadcast({"type": "skipped", "payload": {}})
    return {"ok": True}


@router.post("/api/playback/pause")
async def pause_playback():
    orchestrator.pause()
    await hub.broadcast({"type": "paused", "payload": {}})
    return {"ok": True}


@router.post("/api/playback/resume")
async def resume_playback():
    orchestrator.resume()
    await hub.broadcast({"type": "resumed", "payload": {}})
    return {"ok": True}


# ─── Queue & Requests ─────────────────────────────────────────────────────────

@router.get("/api/queue")
async def get_queue():
    return {"queue": await queue_manager.list()}


@router.delete("/api/queue/{queue_id}")
async def remove_queue_item(queue_id: int):
    removed = await queue_manager.remove(queue_id)
    if not removed:
        raise HTTPException(404, "Queue entry not found")
    queue = await queue_manager.list()
    await hub.broadcast({"type": "queue_update", "payload": {"queue": queue}})
    return {"ok": True}


@router.delete("/api/queue")
async def clear_queue():
    await queue_manager.clear()
    await hub.broadcast({"type": "queue_update", "payload": {"queue": []}})
    return {"ok": True}


class RequestBody(BaseModel):
    track_id: int
    session_id: str = Field(default="anonymous", max_length=64)


@router.post("/api/requests")
async def submit_request(body: RequestBody, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Track).where(Track.id == body.track_id))
    track = result.scalar_one_or_none()
    if track is None:
        raise HTTPException(404, "Track not found")

    req = Request(
        track_id=body.track_id,
        session_id=body.session_id,
        requested_at=time.time(),
    )
    db.add(req)
    await db.commit()

    await queue_manager.insert_next(body.track_id, source="request", session_id=body.session_id)

    queue = await queue_manager.list()
    await hub.broadcast({"type": "queue_update", "payload": {"queue": queue}})
    await hub.broadcast({
        "type": "request_received",
        "payload": {"track_id": body.track_id, "title": track.title, "artist": track.artist},
    })

    return {"ok": True, "request_id": req.id}


@router.get("/api/requests/queue")
async def get_requests(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Request, Track)
        .join(Track, Request.track_id == Track.id)
        .where(Request.acknowledged.is_(False))
        .order_by(Request.requested_at)
    )
    return {
        "requests": [
            {
                "id": r.id,
                "session_id": r.session_id,
                "requested_at": r.requested_at,
                "track": _track_dict(t),
            }
            for r, t in result.all()
        ]
    }


# ─── Mood ─────────────────────────────────────────────────────────────────────

class MoodBody(BaseModel):
    mood: str


@router.post("/api/mood")
async def set_mood(body: MoodBody):
    if body.mood not in MOOD_GENRES:
        raise HTTPException(400, f"Unknown mood. Options: {list(MOOD_GENRES.keys())}")
    orchestrator.set_mood(body.mood)
    await hub.broadcast({"type": "mood_change", "payload": {"mood": body.mood}})
    return {"ok": True, "mood": body.mood}


@router.get("/api/mood/options")
async def mood_options():
    return {"moods": list(MOOD_GENRES.keys())}


# ─── Personas ─────────────────────────────────────────────────────────────────

class PersonaBody(BaseModel):
    persona: str


@router.get("/api/personas")
async def list_personas():
    return {"personas": list(PERSONA_MODIFIERS.keys())}


@router.post("/api/personas/select")
async def select_persona(body: PersonaBody):
    if body.persona not in PERSONA_MODIFIERS:
        raise HTTPException(400, f"Unknown persona. Options: {list(PERSONA_MODIFIERS.keys())}")
    orchestrator.set_persona(body.persona)
    await hub.broadcast({"type": "persona_change", "payload": {"persona": body.persona}})
    return {"ok": True, "persona": body.persona}


# ─── LLM Settings ────────────────────────────────────────────────────────────

class LLMSettingsBody(BaseModel):
    url: str
    model: str
    api_key: str            # empty string = clear the key
    use_openai_compat: bool


@router.get("/api/llm/settings")
async def get_llm_settings():
    return llm_state.to_dict()


@router.post("/api/llm/settings", dependencies=[Depends(require_admin)])
async def update_llm_settings(body: LLMSettingsBody):
    try:
        llm_state.update(
            url=body.url,
            model=body.model,
            api_key=body.api_key,
            use_openai_compat=body.use_openai_compat,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    await hub.broadcast({"type": "llm_settings_change", "payload": llm_state.to_dict()})
    return {"ok": True}


# ─── DJ Settings ──────────────────────────────────────────────────────────────

class DJSettingsBody(BaseModel):
    enabled: bool
    every_n: int
    user_prompt: str


@router.get("/api/dj/settings")
async def get_dj_settings():
    return orchestrator.get_dj_settings()


@router.post("/api/dj/settings")
async def update_dj_settings(body: DJSettingsBody):
    orchestrator.set_dj_settings(body.enabled, body.every_n, body.user_prompt)
    await hub.broadcast({"type": "dj_settings_change", "payload": orchestrator.get_dj_settings()})
    return {"ok": True}


# ─── Playlists ────────────────────────────────────────────────────────────────

class PlaylistCreate(BaseModel):
    name: str


class PlaylistRename(BaseModel):
    name: str


class PlaylistAddTracks(BaseModel):
    track_ids: List[int]


def _pl_track_dict(pt: PlaylistTrack) -> dict:
    t = pt.track
    return {
        "playlist_track_id": f"{pt.playlist_id}:{pt.track_id}",
        "position": pt.position,
        "track": {
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "album": t.album,
            "genre": t.genre,
            "duration_s": t.duration_s,
        },
    }


@router.get("/api/playlists")
async def list_playlists(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Playlist, func.count(PlaylistTrack.track_id).label("track_count"))
        .outerjoin(PlaylistTrack, Playlist.id == PlaylistTrack.playlist_id)
        .group_by(Playlist.id)
        .order_by(Playlist.name)
    )
    return {
        "playlists": [
            {"id": p.id, "name": p.name, "created_at": p.created_at, "track_count": count}
            for p, count in result
        ]
    }


@router.post("/api/playlists", status_code=status.HTTP_201_CREATED)
async def create_playlist(body: PlaylistCreate, db: AsyncSession = Depends(get_db)):
    pl = Playlist(name=body.name.strip(), created_at=time.time())
    db.add(pl)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Playlist name already exists")
    await db.refresh(pl)
    return {"id": pl.id, "name": pl.name, "track_count": 0}


@router.get("/api/playlists/{pl_id}")
async def get_playlist(pl_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == pl_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(404, "Playlist not found")
    entries_result = await db.execute(
        select(PlaylistTrack)
        .where(PlaylistTrack.playlist_id == pl_id)
        .order_by(PlaylistTrack.position)
    )
    entries = entries_result.scalars().all()
    # eager-load tracks
    tracks_result = await db.execute(
        select(Track).where(Track.id.in_([e.track_id for e in entries]))
    )
    track_map = {t.id: t for t in tracks_result.scalars()}
    for e in entries:
        e.track = track_map.get(e.track_id)
    return {
        "id": pl.id,
        "name": pl.name,
        "created_at": pl.created_at,
        "tracks": [_pl_track_dict(e) for e in entries if e.track],
    }


@router.put("/api/playlists/{pl_id}")
async def rename_playlist(pl_id: int, body: PlaylistRename, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == pl_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(404, "Playlist not found")
    pl.name = body.name.strip()
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Playlist name already exists")
    return {"ok": True, "name": pl.name}


@router.delete("/api/playlists/{pl_id}")
async def delete_playlist(pl_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == pl_id))
    pl = result.scalar_one_or_none()
    if not pl:
        raise HTTPException(404, "Playlist not found")
    await db.delete(pl)
    await db.commit()
    return {"ok": True}


@router.post("/api/playlists/{pl_id}/tracks")
async def add_tracks_to_playlist(pl_id: int, body: PlaylistAddTracks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Playlist).where(Playlist.id == pl_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Playlist not found")

    existing_result = await db.execute(
        select(PlaylistTrack.track_id).where(PlaylistTrack.playlist_id == pl_id)
    )
    existing_ids = {row[0] for row in existing_result}

    max_pos_result = await db.execute(
        select(func.max(PlaylistTrack.position)).where(PlaylistTrack.playlist_id == pl_id)
    )
    next_pos = (max_pos_result.scalar() or -1) + 1

    added = 0
    for tid in body.track_ids:
        if tid not in existing_ids:
            db.add(PlaylistTrack(playlist_id=pl_id, track_id=tid, position=next_pos))
            next_pos += 1
            added += 1
    await db.commit()
    return {"ok": True, "added": added}


@router.delete("/api/playlists/{pl_id}/tracks/{track_id}")
async def remove_track_from_playlist(pl_id: int, track_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaylistTrack).where(
            PlaylistTrack.playlist_id == pl_id,
            PlaylistTrack.track_id == track_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Track not in playlist")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}


@router.post("/api/playlists/{pl_id}/queue")
async def queue_playlist(pl_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlaylistTrack)
        .where(PlaylistTrack.playlist_id == pl_id)
        .order_by(PlaylistTrack.position)
    )
    entries = result.scalars().all()
    if not entries:
        raise HTTPException(404, "Playlist is empty")
    for entry in entries:
        await queue_manager.push(entry.track_id, source="playlist")
    queue = await queue_manager.list()
    await hub.broadcast({"type": "queue_update", "payload": {"queue": queue}})
    return {"ok": True, "queued": len(entries)}


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get("/api/stats/overview")
async def stats_overview(db: AsyncSession = Depends(get_db)):
    total_plays = (await db.execute(select(func.sum(Track.play_count)))).scalar() or 0
    total_tracks = (await db.execute(select(func.count(Track.id)))).scalar() or 0
    total_ms = (await db.execute(select(func.sum(DailyStat.total_ms)))).scalar() or 0
    return {
        "total_plays": total_plays,
        "total_tracks": total_tracks,
        "total_listening_hours": round(total_ms / 3_600_000, 2),
    }


@router.get("/api/stats/tracks")
async def top_tracks(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Track).order_by(desc(Track.play_count)).limit(limit)
    )
    return {"tracks": [_track_dict(t) for t in result.scalars()]}


@router.get("/api/stats/genres")
async def genre_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Track.genre, func.sum(Track.play_count).label("plays"))
        .where(Track.genre.isnot(None))
        .group_by(Track.genre)
        .order_by(desc("plays"))
    )
    return {"genres": [{"genre": r[0], "plays": r[1]} for r in result]}


@router.get("/api/stats/sessions")
async def session_stats(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DJSession).order_by(desc(DJSession.started_at)).limit(limit)
    )
    sessions = result.scalars().all()
    return {
        "sessions": [
            {
                "id": s.id,
                "started_at": s.started_at,
                "ended_at": s.ended_at,
                "mood": s.mood,
                "persona": s.persona,
                "tracks_played": s.tracks_played,
                "total_minutes": round((s.total_ms or 0) / 60_000, 1),
            }
            for s in sessions
        ]
    }


# ─── TTS Preview ──────────────────────────────────────────────────────────────

class TTSPreviewBody(BaseModel):
    text: str


@router.post("/api/tts/preview")
async def tts_preview(body: TTSPreviewBody):
    if not tts_available():
        raise HTTPException(503, "Kokoro TTS not available")
    wav = await asyncio.get_running_loop().run_in_executor(None, tts_synth, body.text)
    if wav is None:
        raise HTTPException(500, "TTS synthesis failed")
    return StreamingResponse(iter([wav]), media_type="audio/wav")


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/api/health")
async def health():
    from ..llm.client import is_available as llm_ok
    return {
        "status": "ok",
        "tts": tts_available(),
        "llm": await llm_ok(),
        "ws_clients": hub.count(),
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _track_dict(t: Track) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "artist": t.artist,
        "album": t.album,
        "genre": t.genre,
        "duration_s": t.duration_s,
        "bpm": t.bpm,
        "format": t.format,
        "play_count": t.play_count,
        "skip_count": t.skip_count,
        "last_played": t.last_played,
    }
