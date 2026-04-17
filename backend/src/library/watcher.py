import asyncio
import logging
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent, FileDeletedEvent

from ..config import settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac"}


class MusicFolderHandler(FileSystemEventHandler):
    def __init__(self, loop: asyncio.AbstractEventLoop, rescan_callback):
        super().__init__()
        self._loop = loop
        self._rescan = rescan_callback
        self._pending: set = set()

    def _schedule(self, path: str):
        if Path(path).suffix.lower() not in SUPPORTED_EXTENSIONS:
            return
        if path not in self._pending:
            self._pending.add(path)
            self._loop.call_soon_threadsafe(
                self._loop.create_task, self._debounced_rescan(path)
            )

    async def _debounced_rescan(self, path: str):
        await asyncio.sleep(1.5)
        self._pending.discard(path)
        await self._rescan(path)

    def on_created(self, event):
        if not event.is_directory:
            self._schedule(event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._schedule(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self._loop.call_soon_threadsafe(
                self._loop.create_task, self._rescan(event.src_path)
            )


_observer: Observer = None


def start_watcher(loop: asyncio.AbstractEventLoop, rescan_callback):
    global _observer
    import os
    os.makedirs(settings.music_dir, exist_ok=True)
    try:
        handler = MusicFolderHandler(loop, rescan_callback)
        _observer = Observer()
        _observer.schedule(handler, settings.music_dir, recursive=True)
        _observer.start()
        logger.info(f"Watching music folder: {settings.music_dir}")
    except Exception as e:
        logger.warning(f"File watcher could not start: {e}")


def stop_watcher():
    global _observer
    if _observer:
        _observer.stop()
        _observer.join()
        _observer = None
