# Feature Specification: Local AI DJ v2

**Feature Branch**: `001-local-ai-dj`  
**Created**: 2026-04-15  
**Status**: Ready for Planning  
**Input**: User description: "Local AI DJ with Kokoro TTS, Ollama LLM, full mixing and crossfade, PWA for Android"

---

## Overview

A fully self-hosted, privacy-first AI DJ application that reads music from a local folder, generates human-sounding spoken commentary between tracks using on-device text-to-speech, manages song requests, builds mood/genre-aware playlists, and performs audio crossfade mixing — all accessible via a web browser on any device on the local network or remotely, and installable as a Progressive Web App on Android with no app store required.

---

## User Scenarios & Testing

### Primary User Story
A user opens the AI DJ web interface from their phone, tablet, or desktop browser. They see a now-playing view with a visualizer, the current DJ persona speaking between songs, and controls to request songs, change the mood, or let the DJ auto-pilot. The DJ introduces tracks, shares commentary about the artist or genre, smoothly crossfades between songs, and maintains listener stats over time. Everything runs locally — no internet required after setup.

### Acceptance Scenarios

1. **Given** the server is running and the music folder is configured, **When** a user navigates to the web address from any browser on the network, **Then** the DJ interface loads and music begins playing within 5 seconds.

2. **Given** the DJ is playing a song, **When** the current track nears its end, **Then** the DJ speaks a generated commentary intro for the next track and audio crossfades smoothly into it without silence gaps.

3. **Given** the interface is open on an Android device, **When** the user selects "Add to Home Screen" from the browser menu, **Then** the app installs as a PWA icon and launches in full-screen mode like a native app.

4. **Given** a user submits a song request via the interface, **When** the current track finishes, **Then** the requested song plays next and the DJ acknowledges the request aloud.

5. **Given** the user selects a mood (e.g., "Chill", "Hype", "Focus"), **When** the DJ queues the next tracks, **Then** all queued songs match that mood/genre based on metadata and audio characteristics.

6. **Given** the DJ has been running for a session, **When** the user views the stats panel, **Then** they see play counts, most-played genres, skipped tracks, total listening time, and session history.

7. **Given** the server is accessible from outside the local network (via configured remote access), **When** a remote user opens the URL, **Then** the full interface is available and controllable with no degradation in experience.

8. **Given** the music folder contains a mix of formats (MP3, FLAC, AAC, OGG), **When** the DJ scans the library, **Then** all supported formats are indexed and playable.

### Edge Cases
- What happens when the music folder is empty or has no playable files? → DJ displays a clear empty-state message and waits for files to be added.
- What happens when Ollama is not running or unreachable? → DJ falls back to pre-written commentary templates with the track/artist name inserted; user is notified via the UI.
- What happens when Kokoro TTS fails to generate audio? → Track plays without commentary for that transition; error is logged.
- What happens when a requested song is not found in the library? → User receives an in-UI notification that the track was not found; DJ continues.
- What happens when two users submit requests simultaneously? → Requests are queued in order received; both are acknowledged.
- What happens if the library is very large (10,000+ tracks)? → Indexing runs in the background; the UI remains usable during scanning with a progress indicator.

---

## Requirements

### Functional Requirements

**Music Library**
- **FR-001**: The system MUST scan a configurable local folder path and index all supported audio files (MP3, FLAC, AAC, OGG, WAV, M4A).
- **FR-002**: The system MUST extract and store track metadata (title, artist, album, genre, duration, BPM if available) from audio file tags.
- **FR-003**: The system MUST detect when new files are added to the music folder and re-index without a full restart.
- **FR-004**: The system MUST support library sizes of at least 10,000 tracks without UI degradation.

**DJ Engine & Playback**
- **FR-005**: The system MUST stream audio to the browser client in real time.
- **FR-006**: The system MUST perform audio crossfade between tracks with a configurable overlap duration (default 4 seconds).
- **FR-007**: The system MUST generate DJ commentary for each track transition using a locally-running LLM (Ollama), including artist name, track title, genre context, and personality-driven remarks.
- **FR-008**: The system MUST synthesize the generated commentary into natural-sounding speech using Kokoro TTS, running fully on-device with no external API calls.
- **FR-009**: The system MUST play the TTS commentary audio mixed or sequenced with the music transition.
- **FR-010**: The system MUST support at least 3 configurable DJ personas (e.g., "Smooth", "Hype", "Late Night") that influence commentary tone and music selection.
- **FR-011**: The system MUST auto-queue the next track based on current mood/genre context when no request is pending.

**Song Requests**
- **FR-012**: Users MUST be able to search the music library by title, artist, or album from the web interface.
- **FR-013**: Users MUST be able to submit a song request that places the track next in the queue.
- **FR-014**: The DJ MUST acknowledge the song request in spoken commentary ("Next up, by request...").
- **FR-015**: The request queue MUST be visible to all connected users in real time.

**Mood & Playlist Generation**
- **FR-016**: Users MUST be able to select a mood from a predefined list (e.g., Chill, Hype, Focus, Party, Late Night, Morning).
- **FR-017**: The system MUST filter and rank tracks matching the selected mood based on genre tags, BPM, and LLM-assisted scoring.
- **FR-018**: The system MUST allow users to create and save named playlists from the interface.

**Audio Visualizer**
- **FR-019**: The web interface MUST display a real-time audio visualizer that reacts to the currently playing track.
- **FR-020**: At least 2 visualizer styles MUST be available (e.g., bar spectrum, waveform), user-selectable.

**Listener Stats**
- **FR-021**: The system MUST record per-session and cumulative play counts per track.
- **FR-022**: The system MUST display a stats dashboard showing: most-played tracks, most-played genres, total listening time, skip rate, and session history.
- **FR-023**: Stats MUST persist across server restarts.

**Web Interface & Access**
- **FR-024**: The web interface MUST be fully functional from any modern browser (Chrome, Firefox, Safari, Edge) on desktop and mobile without installing native software.
- **FR-025**: The interface MUST be responsive and touch-optimized for phones and tablets.
- **FR-026**: The application MUST be installable as a PWA on Android devices via the browser's "Add to Home Screen" function, launching in full-screen standalone mode.
- **FR-027**: The PWA MUST cache the shell interface for offline viewing (playback still requires server connection).
- **FR-028**: The server MUST be accessible remotely over a configurable port, with optional reverse-proxy support documented.
- **FR-029**: Multiple users MUST be able to connect simultaneously; playback state MUST be synchronized across all sessions in real time.

**Configuration**
- **FR-030**: All key settings (music folder path, Ollama model, DJ personas, crossfade duration, port) MUST be configurable via a single environment/config file without code changes.

### Key Entities

- **Track**: A single audio file — title, artist, album, genre, BPM, duration, file path, format, play count, skip count, last played.
- **Queue**: The ordered list of upcoming tracks — entries include source (auto/request), requester session ID, position.
- **Request**: A user-submitted song request — track ID, session ID, timestamp, acknowledgment status.
- **Session**: A listening session — start time, end time, tracks played, total duration, mood in effect.
- **Persona**: A DJ personality profile — name, tone descriptors, prompt modifier, preferred genres.
- **Playlist**: A named, user-curated ordered list of tracks.
- **Stats**: Aggregated listening data — per-track counts, per-genre totals, session history.

---

## Success Criteria

1. A user can open the web interface from a mobile browser and have music playing with DJ commentary within 60 seconds of first launch.
2. Track-to-track transitions with crossfade and spoken commentary complete with zero silence gaps 95% of the time.
3. TTS commentary generation completes within 3 seconds of the previous track ending, so commentary is never delayed noticeably.
4. The library scanner indexes 1,000 tracks in under 30 seconds on typical desktop hardware.
5. The PWA installs successfully on Android devices running Chrome 90+ and launches in standalone mode.
6. Song requests submitted by a user appear acknowledged by the DJ within 2 track transitions.
7. The interface remains responsive and usable on a screen as small as 360px wide.
8. All features function with no outbound internet connection after initial Kokoro and Ollama model downloads.
9. Stats data persists correctly across at least 10 server restart cycles.
10. At least 2 simultaneous browser sessions can be connected with synchronized playback state.

---

## Assumptions

- User has a Linux-based machine capable of running Ollama (CPU or GPU) and Kokoro TTS.
- Music folder contains audio files with reasonably complete ID3/FLAC tags.
- Remote access is achieved via port forwarding or a reverse proxy (Nginx/Caddy) — VPN or tunnel setup is out of scope.
- Android PWA install uses Chrome or Chromium-based browser; iOS Safari PWA limitations are acknowledged but not a primary target.
- No user authentication is required for v1 (single-household / trusted-network use case).
- Kokoro TTS and Ollama models are downloaded once during setup; no re-download required per session.

---

## Out of Scope (v1)

- User login / multi-user access control
- Lyrics display
- Podcast or internet radio support
- CD ripping or audio format conversion
- Cloud sync or backup of stats/playlists
- iOS PWA feature parity (install experience varies)
- BPM-matched beat mixing / DJ-grade beatmatch crossfade

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation
When creating this spec from a user prompt:
1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies  
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
[Describe the main user journey in plain language]

### Acceptance Scenarios
1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

### Edge Cases
- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]  
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*
- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*
- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed

### Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous  
- [ ] Success criteria are measurable
- [ ] Scope is clearly bounded
- [ ] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [ ] User description parsed
- [ ] Key concepts extracted
- [ ] Ambiguities marked
- [ ] User scenarios defined
- [ ] Requirements generated
- [ ] Entities identified
- [ ] Review checklist passed

---
