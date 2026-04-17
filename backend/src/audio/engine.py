import asyncio
import io
import logging
import time
from collections import OrderedDict
from pathlib import Path
from typing import Optional, AsyncIterator

from pydub import AudioSegment

from ..config import settings

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
CHANNELS = 2
BITRATE = "192k"
CHUNK_SIZE = 4096  # bytes per stream chunk

_segment_cache: OrderedDict = OrderedDict()
MAX_CACHE = 5


def _load_segment(file_path: str) -> Optional[AudioSegment]:
    if file_path in _segment_cache:
        _segment_cache.move_to_end(file_path)
        return _segment_cache[file_path]

    try:
        seg = AudioSegment.from_file(file_path)
        seg = seg.set_frame_rate(SAMPLE_RATE).set_channels(CHANNELS)
        _segment_cache[file_path] = seg
        if len(_segment_cache) > MAX_CACHE:
            _segment_cache.popitem(last=False)
        return seg
    except Exception as e:
        logger.error(f"Failed to load audio {file_path}: {e}")
        return None


def _load_wav_segment(wav_bytes: bytes) -> Optional[AudioSegment]:
    try:
        buf = io.BytesIO(wav_bytes)
        seg = AudioSegment.from_wav(buf)
        return seg.set_frame_rate(SAMPLE_RATE).set_channels(CHANNELS)
    except Exception as e:
        logger.error(f"Failed to load WAV segment: {e}")
        return None


def crossfade_segments(
    seg_a: AudioSegment,
    seg_b: AudioSegment,
    fade_ms: int,
) -> AudioSegment:
    fade_ms = min(fade_ms, len(seg_a), len(seg_b))
    return seg_a.append(seg_b, crossfade=fade_ms)


def build_transition(
    current_path: str,
    next_path: str,
    commentary_wav: Optional[bytes],
    crossfade_ms: int,
    tail_ms: int = 8000,
) -> Optional[AudioSegment]:
    seg_current = _load_segment(current_path)
    seg_next = _load_segment(next_path)

    if seg_current is None or seg_next is None:
        return None

    # Take the tail of the current track
    tail = seg_current[-tail_ms:] if len(seg_current) > tail_ms else seg_current

    # Build: tail → silence pad → commentary → crossfade into next
    if commentary_wav:
        commentary_seg = _load_wav_segment(commentary_wav)
        if commentary_seg:
            # Fade out tail slightly, fade in commentary
            tail = tail.fade_out(800)
            commentary_seg = commentary_seg.fade_in(200).fade_out(300)
            # Short silence between tail and commentary
            silence = AudioSegment.silent(duration=400, frame_rate=SAMPLE_RATE).set_channels(CHANNELS)
            bridge = tail + silence + commentary_seg + silence
        else:
            bridge = tail
    else:
        bridge = tail

    # Crossfade bridge into next track
    result = crossfade_segments(bridge, seg_next, crossfade_ms)
    return result


def segment_to_mp3_bytes(seg: AudioSegment) -> bytes:
    buf = io.BytesIO()
    seg.export(buf, format="mp3", bitrate=BITRATE)
    return buf.getvalue()


def wav_to_mp3_bytes(wav_bytes: bytes) -> Optional[bytes]:
    try:
        seg = AudioSegment.from_wav(io.BytesIO(wav_bytes))
        seg = seg.set_frame_rate(SAMPLE_RATE).set_channels(CHANNELS)
        buf = io.BytesIO()
        seg.export(buf, format="mp3", bitrate=BITRATE)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"wav_to_mp3_bytes failed: {e}")
        return None


async def stream_track(file_path: str) -> AsyncIterator[bytes]:
    loop = asyncio.get_event_loop()
    seg = await loop.run_in_executor(None, _load_segment, file_path)
    if seg is None:
        return

    mp3_bytes = await loop.run_in_executor(None, segment_to_mp3_bytes, seg)
    for i in range(0, len(mp3_bytes), CHUNK_SIZE):
        yield mp3_bytes[i:i + CHUNK_SIZE]
        await asyncio.sleep(0)


async def stream_transition(
    current_path: str,
    next_path: str,
    commentary_wav: Optional[bytes],
    crossfade_ms: int,
) -> AsyncIterator[bytes]:
    loop = asyncio.get_event_loop()
    transition = await loop.run_in_executor(
        None, build_transition, current_path, next_path, commentary_wav, crossfade_ms, 8000
    )
    if transition is None:
        return

    mp3_bytes = await loop.run_in_executor(None, segment_to_mp3_bytes, transition)
    for i in range(0, len(mp3_bytes), CHUNK_SIZE):
        yield mp3_bytes[i:i + CHUNK_SIZE]
        await asyncio.sleep(0)
