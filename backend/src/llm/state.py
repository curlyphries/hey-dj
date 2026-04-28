"""
Runtime-mutable LLM configuration.

Values here override the .env defaults without requiring a server restart.
The orchestrator and client always read from this module, falling back to
the settings object when fields are empty.
"""
from dataclasses import dataclass
from urllib.parse import urlparse

from ..config import settings


def validate_llm_url(url: str) -> str:
    """Validate and normalize an LLM endpoint URL.

    Rejects non-http(s) schemes (file://, javascript:, etc.) and malformed
    URLs. This is a basic SSRF-mitigation: combined with the optional admin
    token, it limits the surface for redirecting the backend at arbitrary
    services. Returns the stripped URL on success; raises ValueError on
    invalid input.
    """
    cleaned = (url or "").strip()
    if not cleaned:
        return ""
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must use http:// or https://")
    if not parsed.netloc:
        raise ValueError("URL must include a host")
    return cleaned


@dataclass
class LLMRuntimeState:
    url: str = ""                    # empty → use settings.ollama_url
    model: str = ""                  # empty → use settings.ollama_model
    api_key: str = ""                # empty → Ollama native mode
    use_openai_compat: bool = False  # True → /v1/chat/completions with Bearer auth

    def effective_url(self) -> str:
        return self.url.rstrip("/") if self.url else settings.ollama_url.rstrip("/")

    def effective_model(self) -> str:
        return self.model if self.model else settings.ollama_model

    def to_dict(self) -> dict:
        return {
            "url": self.url,
            "model": self.model,
            "api_key_set": bool(self.api_key),
            "use_openai_compat": self.use_openai_compat,
            "effective_url": self.effective_url(),
            "effective_model": self.effective_model(),
        }

    def update(self, url: str, model: str, api_key: str, use_openai_compat: bool) -> None:
        self.url = validate_llm_url(url)
        self.model = model.strip()
        if api_key != "":           # empty string means "clear"; sentinel "UNCHANGED" not needed
            self.api_key = api_key
        self.use_openai_compat = use_openai_compat


# Singleton accessed by client.py and routes.py
llm_state = LLMRuntimeState()
