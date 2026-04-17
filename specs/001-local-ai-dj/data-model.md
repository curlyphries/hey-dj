# Data Model: Local AI DJ v2

## Entities

### Track
```sql
tracks (
  id          INTEGER PRIMARY KEY,
  file_path   TEXT UNIQUE NOT NULL,
  title       TEXT,
  artist      TEXT,
  album       TEXT,
  genre       TEXT,
  duration_s  REAL,
  bpm         REAL,
  format      TEXT,          -- mp3, flac, ogg, wav, m4a
  file_mtime  REAL,          -- for change detection
  play_count  INTEGER DEFAULT 0,
  skip_count  INTEGER DEFAULT 0,
  last_played REAL           -- unix timestamp
)
```

### Queue
```sql
queue (
  id           INTEGER PRIMARY KEY,
  track_id     INTEGER REFERENCES tracks(id),
  position     INTEGER NOT NULL,
  source       TEXT NOT NULL,    -- 'auto' | 'request'
  session_id   TEXT,
  added_at     REAL
)
```

### Request
```sql
requests (
  id               INTEGER PRIMARY KEY,
  track_id         INTEGER REFERENCES tracks(id),
  session_id       TEXT NOT NULL,
  requested_at     REAL NOT NULL,
  acknowledged     INTEGER DEFAULT 0,   -- bool
  acknowledged_at  REAL
)
```

### Playlist
```sql
playlists (
  id         INTEGER PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  created_at REAL
)

playlist_tracks (
  playlist_id  INTEGER REFERENCES playlists(id),
  track_id     INTEGER REFERENCES tracks(id),
  position     INTEGER,
  PRIMARY KEY (playlist_id, track_id)
)
```

### Session
```sql
sessions (
  id            TEXT PRIMARY KEY,   -- UUID
  started_at    REAL NOT NULL,
  ended_at      REAL,
  mood          TEXT,
  persona       TEXT,
  tracks_played INTEGER DEFAULT 0,
  total_ms      INTEGER DEFAULT 0
)
```

### Stats (derived view + materialized daily)
```sql
daily_stats (
  date          TEXT,     -- YYYY-MM-DD
  track_id      INTEGER,
  play_count    INTEGER,
  skip_count    INTEGER,
  total_ms      INTEGER,
  PRIMARY KEY (date, track_id)
)
```

## Relationships
- `Queue` → `Track` (many-to-one)
- `Request` → `Track` (many-to-one)
- `Playlist` ↔ `Track` (many-to-many via `playlist_tracks`)
- `Session` has many plays (tracked via `Track.play_count` increments during session)

## State Transitions

### Queue Item lifecycle
```
PENDING → PLAYING → COMPLETED
                  → SKIPPED
```

### Request lifecycle
```
SUBMITTED → QUEUED → ACKNOWLEDGED_BY_DJ → PLAYED
          → NOT_FOUND (track missing from library)
```

## Indexes
```sql
CREATE INDEX idx_tracks_genre ON tracks(genre);
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_play_count ON tracks(play_count DESC);
CREATE INDEX idx_queue_position ON queue(position ASC);
```
