import io
import logging
from collections import OrderedDict
from typing import Optional

from pydub import AudioSegment

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
CHANNELS = 2
BITRATE = "192k"

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
