from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from pathlib import Path
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    music_dir: str = "./music"
    host: str = "0.0.0.0"
    port: int = 8000

    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"

    kokoro_voice: str = "af_heart"
    kokoro_speed: float = 1.0

    crossfade_ms: int = 4000
    default_mood: str = "chill"
    default_persona: str = "smooth"

    data_dir: str = "./data"
    cors_origins: str = "*"

    # Optional shared secret protecting settings-mutation endpoints.
    # When empty, those endpoints remain open (default for local-only use).
    admin_token: str = ""

    @field_validator("music_dir", "data_dir", mode="before")
    @classmethod
    def expand_path(cls, v: str) -> str:
        return str(Path(v).expanduser().resolve())

    @property
    def db_path(self) -> str:
        p = Path(self.data_dir)
        p.mkdir(parents=True, exist_ok=True)
        return str(p / "dj.db")

    @property
    def cors_origins_list(self) -> List[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",")]

settings = Settings()
