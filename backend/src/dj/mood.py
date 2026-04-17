import random
import logging
from typing import List, Optional

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Track

logger = logging.getLogger(__name__)

MOOD_GENRES = {
    "chill": ["chill", "ambient", "lo-fi", "jazz", "bossa nova", "acoustic", "soul", "r&b", "indie"],
    "hype": ["hip hop", "rap", "trap", "edm", "electronic", "dance", "pop", "dubstep", "dnb"],
    "focus": ["classical", "ambient", "instrumental", "post-rock", "study", "lo-fi", "new age"],
    "party": ["pop", "dance", "hip hop", "edm", "funk", "disco", "latin", "afrobeats"],
    "latenight": ["jazz", "blues", "soul", "r&b", "lo-fi", "neo-soul", "trip-hop"],
    "morning": ["folk", "acoustic", "indie pop", "soft rock", "country", "singer-songwriter"],
}

MOOD_BPM_RANGE = {
    "chill": (60, 100),
    "hype": (120, 180),
    "focus": (50, 100),
    "party": (110, 150),
    "latenight": (60, 100),
    "morning": (80, 120),
}


async def get_tracks_for_mood(
    db: AsyncSession,
    mood: str,
    exclude_ids: Optional[List[int]] = None,
    limit: int = 20,
) -> List[Track]:
    genres = MOOD_GENRES.get(mood, [])
    bpm_min, bpm_max = MOOD_BPM_RANGE.get(mood, (60, 180))

    query = select(Track)

    if genres:
        genre_filters = [Track.genre.ilike(f"%{g}%") for g in genres]
        genre_clause = or_(*genre_filters)
        query = query.where(or_(genre_clause, Track.genre.is_(None)))

    if exclude_ids:
        query = query.where(~Track.id.in_(exclude_ids))

    query = query.order_by(func.random()).limit(limit * 3)
    result = await db.execute(query)
    candidates = result.scalars().all()

    # Score by genre match + BPM fit
    def score(t: Track) -> float:
        s = 0.0
        if t.genre:
            for g in genres:
                if g.lower() in t.genre.lower():
                    s += 2.0
                    break
        if t.bpm and bpm_min <= t.bpm <= bpm_max:
            s += 1.0
        return s + random.uniform(0, 0.5)

    candidates.sort(key=score, reverse=True)
    return candidates[:limit]


async def pick_next_track(
    db: AsyncSession,
    mood: str,
    current_track_id: Optional[int] = None,
    recent_ids: Optional[List[int]] = None,
) -> Optional[Track]:
    exclude = list(recent_ids or [])
    if current_track_id:
        exclude.append(current_track_id)

    tracks = await get_tracks_for_mood(db, mood, exclude_ids=exclude, limit=10)
    if not tracks:
        # Fallback: any random track
        result = await db.execute(select(Track).order_by(func.random()).limit(1))
        return result.scalar_one_or_none()
    return tracks[0]
