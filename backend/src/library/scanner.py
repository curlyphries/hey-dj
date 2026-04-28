import asyncio
import os
import time
import logging
from pathlib import Path
from typing import Optional

from mutagen import File as MutagenFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from ..db.models import Track
from ..config import settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac"}


def _extract_metadata(file_path: str) -> dict:
    meta = {
        "title": None,
        "artist": None,
        "album": None,
        "genre": None,
        "duration_s": None,
        "bpm": None,
        "format": Path(file_path).suffix.lstrip(".").lower(),
    }
    try:
        audio = MutagenFile(file_path, easy=True)
        if audio is None:
            return meta

        def _get(tag):
            val = audio.get(tag)
            return val[0] if val else None

        meta["title"] = _get("title") or Path(file_path).stem
        meta["artist"] = _get("artist")
        meta["album"] = _get("album")
        meta["genre"] = _get("genre")

        if hasattr(audio, "info") and hasattr(audio.info, "length"):
            meta["duration_s"] = round(audio.info.length, 2)

        bpm_raw = _get("bpm")
        if bpm_raw:
            try:
                meta["bpm"] = float(bpm_raw)
            except (ValueError, TypeError):
                pass
    except Exception as e:
        logger.debug(f"Metadata error for {file_path}: {e}")
    return meta


async def scan_library(db: AsyncSession, full: bool = False) -> dict:
    music_path = Path(settings.music_dir)
    if not music_path.exists():
        logger.warning(f"Music dir does not exist: {music_path}")
        return {"added": 0, "updated": 0, "removed": 0}

    # Run all blocking file I/O off the event loop
    raw_files: list[tuple[str, float, dict]] = await asyncio.to_thread(
        _collect_files_with_meta, music_path, full
    )

    # Load all existing tracks in one query
    existing_result = await db.execute(select(Track))
    existing: dict[str, Track] = {t.file_path: t for t in existing_result.scalars()}

    found_paths: set[str] = set()
    added = updated = removed = 0

    for fpath, mtime, meta in raw_files:
        found_paths.add(fpath)
        track = existing.get(fpath)

        if track is None:
            db.add(Track(file_path=fpath, file_mtime=mtime, **meta))
            added += 1
        elif full or track.file_mtime != mtime:
            for k, v in meta.items():
                setattr(track, k, v)
            track.file_mtime = mtime
            updated += 1

    # Remove tracks whose files no longer exist
    for fpath, track in existing.items():
        if fpath not in found_paths:
            await db.delete(track)
            removed += 1

    await db.commit()
    logger.info(f"Library scan done: +{added} ~{updated} -{removed}")
    return {"added": added, "updated": updated, "removed": removed}


def _collect_files_with_meta(music_path: Path, full: bool) -> list[tuple[str, float, dict]]:
    """Walk the music directory and extract metadata for every supported file.

    Runs synchronously — called via asyncio.to_thread.
    """
    results = []
    for root, _, files in os.walk(music_path):
        for fname in files:
            ext = Path(fname).suffix.lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue
            fpath = str(Path(root) / fname)
            mtime = os.path.getmtime(fpath)
            meta = _extract_metadata(fpath)
            results.append((fpath, mtime, meta))
    return results


async def scan_single(db: AsyncSession, file_path: str) -> Optional[Track]:
    if not os.path.exists(file_path):
        return None
    mtime, meta = await asyncio.to_thread(_stat_and_extract, file_path)

    result = await db.execute(select(Track).where(Track.file_path == file_path))
    existing = result.scalar_one_or_none()

    if existing:
        for k, v in meta.items():
            setattr(existing, k, v)
        existing.file_mtime = mtime
    else:
        existing = Track(file_path=file_path, file_mtime=mtime, **meta)
        db.add(existing)

    await db.commit()
    await db.refresh(existing)
    return existing


def _stat_and_extract(file_path: str) -> tuple[float, dict]:
    return os.path.getmtime(file_path), _extract_metadata(file_path)
