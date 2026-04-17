"""
Runtime-mutable LLM configuration.

Values here override the .env defaults without requiring a server restart.
The orchestrator and client always read from this module, falling back to
the settings object when fields are empty.
"""
from dataclasses import dataclass, field
from ..config import settings


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
        self.url = url.strip()
        self.model = model.strip()
        if api_key != "":           # empty string means "clear"; sentinel "UNCHANGED" not needed
            self.api_key = api_key
        self.use_openai_compat = use_openai_compat


# Singleton accessed by client.py and routes.py
llm_state = LLMRuntimeState()
