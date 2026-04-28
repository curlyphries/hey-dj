import asyncio
import os
import time
import uuid
import logging
from typing import Optional

from sqlalchemy import select

from ..config import settings
from ..db.database import AsyncSessionLocal
from ..db.models import Track, Session as DJSession, DailyStat, Request
from ..llm import client as llm_client
from ..llm.templates import (
    render_track_intro, render_request_ack,
    fallback_intro, fallback_request,
)
from ..tts.kokoro_tts import synthesize as tts_synthesize
from ..audio.engine import wav_to_mp3_bytes
from .queue_manager import queue_manager
from .mood import pick_next_track

logger = logging.getLogger(__name__)

MIN_QUEUE_SIZE = 3
RECENT_TRACK_MEMORY = 20


class DJOrchestrator:
    def __init__(self):
        self.current_track: Optional[Track] = None
        self.next_track: Optional[Track] = None
        self.mood: str = settings.default_mood
        self.persona: str = settings.default_persona
        self.session_id: str = str(uuid.uuid4())
        self.session_start: float = time.time()
        self.recent_ids: list = []
        self._running: bool = False
        self._ws_broadcast = None
        self._skip_event: asyncio.Event = asyncio.Event()
        self._paused: bool = False
        self._resume_event: asyncio.Event = asyncio.Event()
        self._resume_event.set()
        self.transition_bytes: Optional[bytes] = None
        self.transition_for_track_id: Optional[int] = None
        self._skip_count: int = 0
        self.dj_enabled: bool = True
        self.commentary_every_n: int = 1
        self.dj_user_prompt: str = ""
        self._tracks_since_commentary: int = 0

    def skip(self):
        self._skip_count += 1
        self._skip_event.set()

    def set_dj_settings(self, enabled: bool, every_n: int, user_prompt: str) -> None:
        self.dj_enabled = enabled
        self.commentary_every_n = max(1, every_n)
        self.dj_user_prompt = user_prompt

    def get_dj_settings(self) -> dict:
        return {
            "enabled": self.dj_enabled,
            "every_n": self.commentary_every_n,
            "user_prompt": self.dj_user_prompt,
        }

    def pause(self):
        self._paused = True
        self._resume_event.clear()

    def resume(self):
        self._paused = False
        self._resume_event.set()

    def set_ws_broadcast(self, fn):
        self._ws_broadcast = fn

    async def _broadcast(self, event_type: str, payload: dict):
        if self._ws_broadcast:
            await self._ws_broadcast({"type": event_type, "payload": payload})

    async def _ensure_queue(self):
        size = await queue_manager.size()
        while size < MIN_QUEUE_SIZE:
            async with AsyncSessionLocal() as db:
                track = await pick_next_track(db, self.mood, recent_ids=self.recent_ids)
            if track is None:
                break
            await queue_manager.push(track.id, source="auto")
            size += 1

    async def _record_play(self, track: Track):
        today = time.strftime("%Y-%m-%d")
        added_ms = int((track.duration_s or 0) * 1000)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DailyStat).where(
                    DailyStat.date == today,
                    DailyStat.track_id == track.id,
                )
            )
            stat = result.scalar_one_or_none()
            if stat is None:
                stat = DailyStat(date=today, track_id=track.id, play_count=0, skip_count=0, total_ms=0)
                db.add(stat)
            stat.play_count += 1
            stat.total_ms += added_ms

            track_result = await db.execute(select(Track).where(Track.id == track.id))
            t = track_result.scalar_one_or_none()
            if t:
                t.play_count += 1
                t.last_played = time.time()

            session_result = await db.execute(
                select(DJSession).where(DJSession.id == self.session_id)
            )
            session = session_result.scalar_one_or_none()
            if session is not None:
                session.tracks_played += 1
                session.total_ms += added_ms
                session.mood = self.mood
                session.persona = self.persona

            await db.commit()

    async def _start_session(self) -> None:
        """Insert a row in the sessions table for this run."""
        async with AsyncSessionLocal() as db:
            db.add(DJSession(
                id=self.session_id,
                started_at=self.session_start,
                mood=self.mood,
                persona=self.persona,
                tracks_played=0,
                total_ms=0,
            ))
            await db.commit()

    async def end_session(self) -> None:
        """Finalize the current session row by setting ended_at."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DJSession).where(DJSession.id == self.session_id)
            )
            session = result.scalar_one_or_none()
            if session is not None and session.ended_at is None:
                session.ended_at = time.time()
                await db.commit()

    async def _generate_commentary(self, current: Track, next_track: Track, is_request: bool = False) -> Optional[bytes]:
        try:
            if is_request:
                prompt = render_request_ack(
                    next_track.title or "Unknown", next_track.artist or "Unknown Artist",
                    persona=self.persona,
                )
            else:
                prompt = render_track_intro(
                    title=next_track.title or "Unknown",
                    artist=next_track.artist or "Unknown Artist",
                    prev_title=current.title or "Unknown",
                    prev_artist=current.artist or "Unknown Artist",
                    genre=next_track.genre or "",
                    persona=self.persona,
                    mood=self.mood,
                    user_instructions=self.dj_user_prompt,
                )

            ollama_ok = await llm_client.is_available()
            if ollama_ok:
                text = await llm_client.generate(prompt)
            else:
                logger.warning("Ollama unavailable, using fallback commentary")
                if is_request:
                    text = fallback_request(next_track.title or "Unknown", next_track.artist or "Unknown Artist")
                else:
                    text = fallback_intro(next_track.title or "Unknown", next_track.artist or "Unknown Artist")

            if not text:
                text = fallback_intro(next_track.title or "Unknown", next_track.artist or "Unknown Artist")

            return await asyncio.get_running_loop().run_in_executor(None, tts_synthesize, text)
        except Exception as e:
            logger.error(f"Commentary generation failed: {e}")
            return None

    async def _play_track(self, track: Track) -> Optional[Track]:
        """Play one track. Returns the next track to play, or None when the queue is empty."""
        self.current_track = track
        await self._record_play(track)
        if track.id not in self.recent_ids:
            self.recent_ids.append(track.id)
            if len(self.recent_ids) > RECENT_TRACK_MEMORY:
                self.recent_ids.pop(0)

        await self._broadcast("track_change", {
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "genre": track.genre,
            "duration_s": track.duration_s,
            "mood": self.mood,
            "persona": self.persona,
        })

        # Use duration from DB; fall back to file size estimate only if missing
        if track.duration_s:
            duration_s = track.duration_s
        else:
            loop = asyncio.get_running_loop()
            try:
                size = await loop.run_in_executor(None, os.path.getsize, track.file_path)
                duration_s = size / (192000 / 8)
            except Exception:
                duration_s = 240  # safe fallback

        # Start LLM+TTS ~45s before end; generation takes ~30s
        prep_before_end = 45
        sleep_time = max(0, duration_s - prep_before_end)
        self._skip_event.clear()
        was_skipped = False
        try:
            await asyncio.wait_for(self._skip_event.wait(), timeout=sleep_time)
            was_skipped = True
        except asyncio.TimeoutError:
            pass

        await self._ensure_queue()
        next_track = await queue_manager.pop()
        if next_track is None:
            return None

        # Skip: signal commentary is incoming and generate TTS in background.
        if was_skipped:
            self._set_pending_transition(next_track.id, None)
            asyncio.create_task(self._fill_skip_commentary(next_track))
            return next_track

        is_request = await self._consume_request(next_track.id)

        self._tracks_since_commentary += 1
        should_comment = (
            self.dj_enabled
            and self._tracks_since_commentary >= self.commentary_every_n
        )

        commentary_wav = (
            await self._generate_commentary(track, next_track, is_request=is_request)
            if should_comment else None
        )
        if commentary_wav:
            self._tracks_since_commentary = 0
            loop = asyncio.get_running_loop()
            commentary_mp3 = await loop.run_in_executor(None, wav_to_mp3_bytes, commentary_wav)
            self._set_pending_transition(next_track.id, commentary_mp3)
        else:
            self._set_pending_transition(None, None)

        self.next_track = next_track
        return next_track

    async def _consume_request(self, track_id: int) -> bool:
        """Mark a pending request for the given track as acknowledged. Returns True if one existed."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Request).where(
                    Request.track_id == track_id,
                    Request.acknowledged.is_(False),
                ).order_by(Request.requested_at).limit(1)
            )
            req = result.scalar_one_or_none()
            if req is None:
                return False
            req.acknowledged = True
            req.acknowledged_at = time.time()
            await db.commit()
            return True

    async def _fill_skip_commentary(self, track: Track) -> None:
        """Generate fast fallback TTS for a skip; called as a background task."""
        text = fallback_intro(
            track.title or "Unknown",
            track.artist or "Unknown Artist",
        )
        loop = asyncio.get_running_loop()
        wav = await loop.run_in_executor(None, tts_synthesize, text)
        if not wav or self.transition_for_track_id != track.id:
            return
        mp3 = await loop.run_in_executor(None, wav_to_mp3_bytes, wav)
        if mp3 and self.transition_for_track_id == track.id:
            self.transition_bytes = mp3

    def _set_pending_transition(self, track_id: Optional[int], data: Optional[bytes]) -> None:
        """Atomic set of the transition state (no awaits)."""
        self.transition_for_track_id = track_id
        self.transition_bytes = data

    async def consume_transition_for(
        self, track_id: int, skip_version: int, timeout: float = 2.0
    ) -> Optional[bytes]:
        """Wait briefly for a pending transition for `track_id`, then atomically read-and-clear it."""
        if self.transition_for_track_id != track_id:
            return None
        step = 0.05
        elapsed = 0.0
        while self.transition_bytes is None and elapsed < timeout:
            if self._skip_count != skip_version:
                return None
            await asyncio.sleep(step)
            elapsed += step
        if self.transition_bytes is None or self._skip_count != skip_version:
            return None
        data = self.transition_bytes
        self.transition_bytes = None
        self.transition_for_track_id = None
        return data

    def is_paused(self) -> bool:
        return self._paused

    async def wait_until_resumed(self) -> None:
        await self._resume_event.wait()

    def skip_version(self) -> int:
        return self._skip_count

    async def run(self):
        self._running = True
        await self._start_session()
        try:
            await self._ensure_queue()
            track = await queue_manager.pop()
            while track is not None and self._running:
                track = await self._play_track(track)
        finally:
            await self.end_session()

    def set_mood(self, mood: str):
        self.mood = mood

    def set_persona(self, persona: str):
        self.persona = persona

    def get_state(self) -> dict:
        t = self.current_track
        return {
            "current_track": {
                "id": t.id if t else None,
                "title": t.title if t else None,
                "artist": t.artist if t else None,
                "album": t.album if t else None,
                "genre": t.genre if t else None,
                "duration_s": t.duration_s if t else None,
            } if t else None,
            "mood": self.mood,
            "persona": self.persona,
            "session_id": self.session_id,
        }


orchestrator = DJOrchestrator()
