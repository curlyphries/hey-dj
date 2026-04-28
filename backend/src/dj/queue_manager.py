import asyncio
import time
import logging
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from ..db.models import Track, QueueEntry
from ..db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


class QueueManager:
    def __init__(self):
        self._lock = asyncio.Lock()

    async def _next_position(self, db: AsyncSession) -> int:
        result = await db.execute(select(func.max(QueueEntry.position)))
        max_pos = result.scalar()
        return (max_pos or 0) + 1

    async def push(self, track_id: int, source: str = "auto", session_id: str = "") -> QueueEntry:
        async with self._lock:
            async with AsyncSessionLocal() as db:
                pos = await self._next_position(db)
                entry = QueueEntry(
                    track_id=track_id,
                    position=pos,
                    source=source,
                    session_id=session_id,
                    added_at=time.time(),
                )
                db.add(entry)
                await db.commit()
                await db.refresh(entry)
                return entry

    async def insert_next(self, track_id: int, source: str = "request", session_id: str = "") -> QueueEntry:
        async with self._lock:
            async with AsyncSessionLocal() as db:
                # Insert below the current minimum so this track plays next.
                # Using min - 1 keeps positions as integers and handles
                # multiple consecutive inserts correctly (each one goes lower).
                result = await db.execute(select(func.min(QueueEntry.position)))
                min_pos = result.scalar() or 0
                insert_at = min_pos - 1

                entry = QueueEntry(
                    track_id=track_id,
                    position=insert_at,
                    source=source,
                    session_id=session_id,
                    added_at=time.time(),
                )
                db.add(entry)
                await db.commit()
                await db.refresh(entry)
                return entry

    async def pop(self) -> Optional[Track]:
        async with self._lock:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(QueueEntry).order_by(QueueEntry.position).limit(1)
                )
                entry = result.scalar_one_or_none()
                if entry is None:
                    return None
                track_result = await db.execute(select(Track).where(Track.id == entry.track_id))
                track = track_result.scalar_one_or_none()
                await db.delete(entry)
                await db.commit()
                return track

    async def peek(self) -> Optional[Track]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(QueueEntry).order_by(QueueEntry.position).limit(1)
            )
            entry = result.scalar_one_or_none()
            if entry is None:
                return None
            track_result = await db.execute(select(Track).where(Track.id == entry.track_id))
            return track_result.scalar_one_or_none()

    async def list(self) -> List[dict]:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(QueueEntry, Track)
                .join(Track, QueueEntry.track_id == Track.id)
                .order_by(QueueEntry.position)
            )
            rows = result.all()
            return [
                {
                    "queue_id": e.id,
                    "position": e.position,
                    "source": e.source,
                    "session_id": e.session_id,
                    "track": {
                        "id": t.id,
                        "title": t.title,
                        "artist": t.artist,
                        "album": t.album,
                        "genre": t.genre,
                        "duration_s": t.duration_s,
                    },
                }
                for e, t in rows
            ]

    async def size(self) -> int:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(func.count(QueueEntry.id)))
            return result.scalar() or 0

    async def remove(self, queue_id: int) -> bool:
        async with self._lock:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(QueueEntry).where(QueueEntry.id == queue_id))
                entry = result.scalar_one_or_none()
                if entry is None:
                    return False
                await db.delete(entry)
                await db.commit()
                return True

    async def clear(self):
        async with AsyncSessionLocal() as db:
            await db.execute(delete(QueueEntry))
            await db.commit()


queue_manager = QueueManager()
