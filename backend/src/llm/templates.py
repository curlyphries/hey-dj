from jinja2 import Environment

_env = Environment()

PERSONA_MODIFIERS = {
    "smooth": "You are a smooth, laid-back radio DJ with a warm voice and cool demeanor. Keep it chill and conversational.",
    "hype": "You are an energetic hype DJ. You're enthusiastic, punchy, and keep the crowd hyped up. Short, punchy sentences.",
    "latenight": "You are a late-night lounge DJ. Smooth, intimate, a bit mysterious. Like a jazz club at 2am.",
}

MOOD_CONTEXT = {
    "chill": "The vibe is relaxed and easy. Keep commentary calm and unhurried.",
    "hype": "The energy is high. Make it exciting and fast-paced.",
    "focus": "People are working or studying. Keep commentary minimal and non-distracting.",
    "party": "It's a party. Keep it fun, social, and upbeat.",
    "latenight": "Late night vibes. Intimate, smooth, introspective.",
    "morning": "Morning energy. Uplifting, warm, easing people into the day.",
}

TRACK_INTRO_TMPL = _env.from_string(
    """{{ persona_style }}
{{ mood_context }}
{% if user_instructions %}
Listener's personal request to you: {{ user_instructions }}
{% endif %}
You're about to introduce the next track. Write a SHORT (2-3 sentence) DJ intro.
Track: "{{ title }}" by {{ artist }}{% if genre %} — Genre: {{ genre }}{% endif %}{% if album %} — Album: {{ album }}{% endif %}

Previous track: "{{ prev_title }}" by {{ prev_artist }}

Rules:
- Sound natural, like a real radio DJ speaking
- Don't use hashtags or emojis
- Don't say "I'm going to play" — just introduce it
- Keep it under 40 words
- Only return the spoken commentary, nothing else
"""
)

REQUEST_ACK_TMPL = _env.from_string(
    """{{ persona_style }}
Write a SHORT (1-2 sentence) DJ shoutout acknowledging a song request.
Track: "{{ title }}" by {{ artist }}
Rules: Sound natural. Under 25 words. Only return the spoken commentary.
"""
)

MOOD_CHANGE_TMPL = _env.from_string(
    """{{ persona_style }}
Write a SHORT (1 sentence) DJ announcement that the vibe is shifting to "{{ mood }}" mode.
Rules: Sound natural. Under 20 words. Only return the spoken commentary.
"""
)

FALLBACK_INTROS = [
    "Up next, \"{title}\" by {artist}.",
    "Here's a track for you — \"{title}\" by {artist}.",
    "Coming up next, {artist} with \"{title}\".",
    "Let's keep it going with {artist} and \"{title}\".",
]

FALLBACK_REQUEST = "This one goes out to you — \"{title}\" by {artist}, coming right up."
FALLBACK_MOOD = "Alright, we're shifting the vibe now."


def render_track_intro(
    title: str, artist: str, prev_title: str, prev_artist: str,
    genre: str = "", album: str = "", persona: str = "smooth", mood: str = "chill",
    user_instructions: str = "",
) -> str:
    return TRACK_INTRO_TMPL.render(
        persona_style=PERSONA_MODIFIERS.get(persona, PERSONA_MODIFIERS["smooth"]),
        mood_context=MOOD_CONTEXT.get(mood, ""),
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


def fallback_intro(title: str, artist: str, index: int = 0) -> str:
    tmpl = FALLBACK_INTROS[index % len(FALLBACK_INTROS)]
    return tmpl.format(title=title, artist=artist)


def fallback_request(title: str, artist: str) -> str:
    return FALLBACK_REQUEST.format(title=title, artist=artist)
