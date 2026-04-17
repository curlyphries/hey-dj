import io
import hashlib
import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf

from ..config import settings

logger = logging.getLogger(__name__)

_pipeline = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        try:
            from kokoro_onnx import Kokoro
            _pipeline = Kokoro("kokoro-v1_0.onnx", "voices.bin")
            logger.info("Kokoro TTS pipeline loaded")
        except Exception as e:
            logger.error(f"Failed to load Kokoro: {e}")
            _pipeline = None
    return _pipeline


@lru_cache(maxsize=64)
def _cached_synth(text: str, voice: str, speed: float) -> Optional[bytes]:
    pipeline = _get_pipeline()
    if pipeline is None:
        return None
    try:
        samples, sample_rate = pipeline.create(text, voice=voice, speed=speed)
        buf = io.BytesIO()
        sf.write(buf, samples, sample_rate, format="WAV")
        return buf.getvalue()
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}")
        return None


def synthesize(text: str) -> Optional[bytes]:
    if not text or not text.strip():
        return None
    return _cached_synth(
        text.strip(),
        settings.kokoro_voice,
        settings.kokoro_speed,
    )


def is_available() -> bool:
    return _get_pipeline() is not None
