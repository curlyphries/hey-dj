"""Unit tests for non-HTTP code paths: queue manager, orchestrator helpers,
URL validation, and scanner.
"""
import os
import time
from pathlib import Path

import pytest
import pytest_asyncio

from src.db.database import init_db, AsyncSessionLocal
from src.db.models import Track, QueueEntry
from src.dj.queue_manager import QueueManager, queue_manager
from src.dj.orchestrator import DJOrchestrator
from src.llm.state import validate_llm_url
from src.library.scanner import _extract_metadata
from sqlalchemy import select, delete


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _init_schema():
    await init_db()
    yield


@pytest_asyncio.fixture
async def fresh_queue():
    async with AsyncSessionLocal() as db:
        await db.execute(delete(QueueEntry))
        await db.commit()
    yield queue_manager
    async with AsyncSessionLocal() as db:
        await db.execute(delete(QueueEntry))
        await db.commit()


@pytest_asyncio.fixture
async def seeded_tracks():
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(Track).limit(3))).scalars().all()
        if len(existing) >= 3:
            yield [t.id for t in existing[:3]]
            return
        added_ids = []
        for i in range(3):
            t = Track(
                file_path=f"/tmp/__test_track_{i}.mp3",
                title=f"Test {i}",
                artist="Tester",
                duration_s=60.0,
                format="mp3",
                play_count=0,
                skip_count=0,
            )
            db.add(t)
            await db.flush()
            added_ids.append(t.id)
        await db.commit()
    yield added_ids


# ─── QueueManager ─────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_queue_push_then_pop_fifo(fresh_queue, seeded_tracks):
    a, b, c = seeded_tracks
    await fresh_queue.push(a)
    await fresh_queue.push(b)
    await fresh_queue.push(c)

    first = await fresh_queue.pop()
    second = await fresh_queue.pop()
    third = await fresh_queue.pop()
    assert first.id == a
    assert second.id == b
    assert third.id == c
    assert await fresh_queue.pop() is None


@pytest.mark.anyio
async def test_queue_insert_next_jumps_ahead(fresh_queue, seeded_tracks):
    a, b, c = seeded_tracks
    await fresh_queue.push(a)
    await fresh_queue.push(b)
    await fresh_queue.insert_next(c)  # should pop before a and b

    first = await fresh_queue.pop()
    second = await fresh_queue.pop()
    third = await fresh_queue.pop()
    assert first.id == c
    assert second.id == a
    assert third.id == b


@pytest.mark.anyio
async def test_queue_insert_next_stacks_lifo(fresh_queue, seeded_tracks):
    a, b, c = seeded_tracks
    await fresh_queue.push(a)
    await fresh_queue.insert_next(b)
    await fresh_queue.insert_next(c)  # most recent insert_next plays first

    assert (await fresh_queue.pop()).id == c
    assert (await fresh_queue.pop()).id == b
    assert (await fresh_queue.pop()).id == a


@pytest.mark.anyio
async def test_queue_remove_returns_false_for_missing(fresh_queue):
    assert await fresh_queue.remove(99999) is False


# ─── DJOrchestrator helpers ───────────────────────────────────────────────────

@pytest.mark.anyio
async def test_orchestrator_pause_resume_state():
    orc = DJOrchestrator()
    assert orc.is_paused() is False
    orc.pause()
    assert orc.is_paused() is True
    orc.resume()
    assert orc.is_paused() is False


@pytest.mark.anyio
async def test_orchestrator_skip_bumps_version():
    orc = DJOrchestrator()
    v0 = orc.skip_version()
    orc.skip()
    assert orc.skip_version() == v0 + 1
    orc.skip()
    assert orc.skip_version() == v0 + 2


@pytest.mark.anyio
async def test_consume_transition_returns_none_for_wrong_track():
    orc = DJOrchestrator()
    orc._set_pending_transition(123, b"data")
    result = await orc.consume_transition_for(456, orc.skip_version(), timeout=0.1)
    assert result is None
    # Original state untouched
    assert orc.transition_for_track_id == 123
    assert orc.transition_bytes == b"data"


@pytest.mark.anyio
async def test_consume_transition_clears_state_on_match():
    orc = DJOrchestrator()
    orc._set_pending_transition(42, b"audio")
    result = await orc.consume_transition_for(42, orc.skip_version(), timeout=0.1)
    assert result == b"audio"
    assert orc.transition_for_track_id is None
    assert orc.transition_bytes is None


@pytest.mark.anyio
async def test_consume_transition_aborts_on_skip():
    orc = DJOrchestrator()
    orc._set_pending_transition(7, None)  # bytes not yet ready
    snapshot = orc.skip_version()
    orc.skip()  # bumps version
    result = await orc.consume_transition_for(7, snapshot, timeout=0.5)
    assert result is None


# ─── URL validation ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("good_url", [
    "http://localhost:11434",
    "https://api.openai.com",
    "http://192.168.1.10:11434",
])
def test_validate_llm_url_accepts_http_https(good_url):
    assert validate_llm_url(good_url) == good_url


@pytest.mark.parametrize("bad_url", [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "ftp://example.com",
    "not-a-url",
    "://no-scheme",
])
def test_validate_llm_url_rejects_other_schemes(bad_url):
    with pytest.raises(ValueError):
        validate_llm_url(bad_url)


def test_validate_llm_url_passes_empty():
    """Empty string is allowed — it means 'use the .env default'."""
    assert validate_llm_url("") == ""
    assert validate_llm_url("   ") == ""


# ─── Scanner metadata extraction ──────────────────────────────────────────────

def test_extract_metadata_handles_missing_file(tmp_path):
    """Mutagen returns None for nonexistent files; scanner falls back to defaults."""
    fake = str(tmp_path / "doesnotexist.mp3")
    meta = _extract_metadata(fake)
    assert meta["format"] == "mp3"
    assert meta["title"] is None or isinstance(meta["title"], str)
