from sqlalchemy import (
    Column, Integer, Float, String, Text, Boolean,
    ForeignKey, UniqueConstraint, Index, create_engine
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_path = Column(Text, unique=True, nullable=False)
    title = Column(Text)
    artist = Column(Text)
    album = Column(Text)
    genre = Column(Text)
    duration_s = Column(Float)
    bpm = Column(Float)
    format = Column(String(10))
    file_mtime = Column(Float)
    play_count = Column(Integer, default=0, nullable=False)
    skip_count = Column(Integer, default=0, nullable=False)
    last_played = Column(Float)

    queue_entries = relationship("QueueEntry", back_populates="track", cascade="all, delete-orphan")
    requests = relationship("Request", back_populates="track", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_tracks_genre", "genre"),
        Index("idx_tracks_artist", "artist"),
        Index("idx_tracks_play_count", "play_count"),
    )


class QueueEntry(Base):
    __tablename__ = "queue"

    id = Column(Integer, primary_key=True, autoincrement=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    position = Column(Integer, nullable=False)
    source = Column(String(20), nullable=False, default="auto")
    session_id = Column(Text)
    added_at = Column(Float)

    track = relationship("Track", back_populates="queue_entries")

    __table_args__ = (
        Index("idx_queue_position", "position"),
    )


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    session_id = Column(Text, nullable=False)
    requested_at = Column(Float, nullable=False)
    acknowledged = Column(Boolean, default=False, nullable=False)
    acknowledged_at = Column(Float)

    track = relationship("Track", back_populates="requests")


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, unique=True, nullable=False)
    created_at = Column(Float)

    entries = relationship("PlaylistTrack", back_populates="playlist", cascade="all, delete-orphan")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    playlist_id = Column(Integer, ForeignKey("playlists.id"), primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), primary_key=True)
    position = Column(Integer)

    playlist = relationship("Playlist", back_populates="entries")
    track = relationship("Track")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Text, primary_key=True)
    started_at = Column(Float, nullable=False)
    ended_at = Column(Float)
    mood = Column(Text)
    persona = Column(Text)
    tracks_played = Column(Integer, default=0, nullable=False)
    total_ms = Column(Integer, default=0, nullable=False)


class DailyStat(Base):
    __tablename__ = "daily_stats"

    date = Column(Text, primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), primary_key=True)
    play_count = Column(Integer, default=0)
    skip_count = Column(Integer, default=0)
    total_ms = Column(Integer, default=0)
