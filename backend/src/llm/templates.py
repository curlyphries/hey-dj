from jinja2 import Environment

_env = Environment()

PERSONA_MODIFIERS = {
    "smooth": (
        "PERSONA: Smooth Radio Host\n"
        "Voice: Deep, warm, unhurried. You own every pause. Never rushed.\n"
        "Vocabulary: 'silky', 'classic', 'legendary', 'smooth as midnight', 'timeless', 'straight fire'\n"
        "Sentence style: Long, flowing. Let words breathe. One smooth thought.\n"
        "Example output: 'Coming out of that silky groove from Rocky Burnette... "
        "we stay in the pocket with a stone-cold classic. Pat Benatar — Hit Me With Your Best Shot.'\n"
        "NEVER use exclamation marks. NEVER sound excited. Sound effortlessly cool."
    ),
    "hype": (
        "PERSONA: Hype DJ / Hypeman\n"
        "Voice: LOUD energy. Punchy. Electric. Like you're on a festival main stage.\n"
        "Vocabulary: 'LET'S GO', 'FIRE', 'BANGER', 'this is INSANE', 'the crowd is LOSING IT', 'TURN IT UP'\n"
        "Sentence style: Short. Punchy. Fragmented. ALL CAPS energy even in lowercase.\n"
        "Example output: 'YO. We are NOT slowing down. Rocky Burnette just set it OFF — "
        "now Pat Benatar comes in SWINGING. Hit Me With Your Best Shot — TURN. IT. UP.'\n"
        "Use at least one ALL-CAPS word. Sound like the room is on fire."
    ),
    "latenight": (
        "PERSONA: Late Night Jazz/Soul Radio Host\n"
        "Voice: Intimate. Hushed. Like a secret shared at 2am. Slightly poetic.\n"
        "Vocabulary: 'the witching hour', 'settle in', 'close your eyes', 'just you and me', "
        "'the city's asleep', 'let this one wash over you', 'something rare'\n"
        "Sentence style: Short, quiet sentences. Poetic. Leave space. Feel cinematic.\n"
        "Example output: 'Rocky Burnette fades out... and we breathe. "
        "It's late. The city's quiet. Pat Benatar now — let this one find you.'\n"
        "NEVER sound energetic. Speak like a whisper. Make the listener feel alone with the music."
    ),
}

MOOD_CONTEXT = {
    "chill": "MOOD: Chill. Relaxed pace. No urgency. Let moments breathe.",
    "hype": "MOOD: Maximum energy. The crowd is live. Every word builds momentum.",
    "focus": "MOOD: Focus mode. One sentence only — introduce and get out of the way immediately.",
    "party": "MOOD: Party. Celebratory. Fun and social. Get people moving and smiling.",
    "latenight": "MOOD: Late night intimacy. Quiet, personal, cinematic.",
    "morning": "MOOD: Morning. Warm, gentle, optimistic. Ease people into the day.",
}

INTRO_STYLE_CONTEXT = {
    "genre": (
        "Lead with the GENRE or ERA first — set the scene before you name the track. "
        "Example style: 'We're diving deep into [genre/era] territory now — [artist] takes us there with...' "
        "Make the genre feel like a destination the listener is about to arrive at."
    ),
    "artist": (
        "Lead with the ARTIST — celebrate who they are before naming the song. "
        "Drop a quick fact, a feeling, or a reputation. "
        "Example style: '[Artist] — one of the [adjective] voices in [genre] — coming at you with...' "
    ),
    "vibe": (
        "Lead with the FEELING or VIBE the track creates. "
        "Paint the emotional picture first, then reveal the track. "
        "Example style: 'If [mood/feeling] had a soundtrack, this would be it — [artist] with...' "
    ),
    "classic": (
        "Straight classic radio DJ style — smooth segue from the previous track, name the artist and title with confidence. "
        "Maybe a quick one-liner about why this track matters. Keep it tight."
    ),
}

TRACK_INTRO_TMPL = _env.from_string(
    """You are a DJ on live radio. Speak ONLY in your character voice below. No narration, no explanation — just the words you would say on air.

{{ persona_style }}

{{ mood_context }}

{% if intro_style_context %}
INTRO STYLE: {{ intro_style_context }}
{% endif %}

{% if user_instructions %}
SPECIAL INSTRUCTION: {{ user_instructions }}
{% endif %}

Previous track: "{{ prev_title }}" by {{ prev_artist }}
Next track: "{{ title }}" by {{ artist }}{% if genre %} ({{ genre }}){% endif %}

Write your DJ intro for the next track. 2-4 sentences. Under 60 words.
FORBIDDEN PHRASES — never use these: "that was", "up next", "coming up", "I'm going to play", "next we have", "here is", "let me play"
Only output the spoken words. No quotes around the output.
"""
)

REQUEST_ACK_TMPL = _env.from_string(
    """{{ persona_style }}

You just got a song request. Give it a proper DJ shoutout — acknowledge the request with personality, then lead into the track.

REQUESTED TRACK: "{{ title }}" by {{ artist }}

RULES:
- Sound like a DJ who genuinely loves taking requests
- 1-2 sentences, under 30 words
- Only output the spoken commentary
"""
)

MOOD_CHANGE_TMPL = _env.from_string(
    """{{ persona_style }}

Announce that the vibe is shifting to "{{ mood }}" mode. Make it feel intentional — like a DJ reading the room and making a move.

RULES:
- 1 sentence, under 20 words
- Only output the spoken commentary
"""
)

FALLBACK_INTROS = [
    "That was {prev_artist} — now let's keep it moving with {artist} and \"{title}\".",
    "Coming up next — {artist} with \"{title}\". Let it ride.",
    "From {prev_artist} straight into {artist} — \"{title}\" is up next.",
    "Staying in the groove with {artist} — this is \"{title}\".",
    "{artist} takes the floor now with \"{title}\" — enjoy.",
]

FALLBACK_REQUEST = "A request coming in hot — {artist} with \"{title}\". This one's for you."
FALLBACK_MOOD = "Alright, we're shifting the vibe. Buckle in."


def render_track_intro(
    title: str, artist: str, prev_title: str, prev_artist: str,
    genre: str = "", album: str = "", persona: str = "smooth", mood: str = "chill",
    user_instructions: str = "", intro_style: str = "classic",
) -> str:
    return TRACK_INTRO_TMPL.render(
        persona_style=PERSONA_MODIFIERS.get(persona, PERSONA_MODIFIERS["smooth"]),
        mood_context=MOOD_CONTEXT.get(mood, ""),
        intro_style_context=INTRO_STYLE_CONTEXT.get(intro_style, ""),
        title=title, artist=artist, prev_title=prev_title, prev_artist=prev_artist,
        genre=genre or "", album=album or "",
        user_instructions=user_instructions.strip(),
    )


def render_request_ack(title: str, artist: str, persona: str = "smooth") -> str:
    return REQUEST_ACK_TMPL.render(
        persona_style=PERSONA_MODIFIERS.get(persona, PERSONA_MODIFIERS["smooth"]),
        title=title, artist=artist,
    )


def render_mood_change(mood: str, persona: str = "smooth") -> str:
    return MOOD_CHANGE_TMPL.render(
        persona_style=PERSONA_MODIFIERS.get(persona, PERSONA_MODIFIERS["smooth"]),
        mood=mood,
    )


def fallback_intro(title: str, artist: str, prev_artist: str = "the last artist", index: int = 0) -> str:
    tmpl = FALLBACK_INTROS[index % len(FALLBACK_INTROS)]
    return tmpl.format(title=title, artist=artist, prev_artist=prev_artist)


def fallback_request(title: str, artist: str) -> str:
    return FALLBACK_REQUEST.format(title=title, artist=artist)
