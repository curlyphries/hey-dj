import logging
import httpx
from .state import llm_state

logger = logging.getLogger(__name__)

TIMEOUT = 30.0  # 3rd-party APIs may need more headroom


async def generate(prompt: str) -> str:
    url = llm_state.effective_url()
    model = llm_state.effective_model()
    headers = {}
    if llm_state.api_key:
        headers["Authorization"] = f"Bearer {llm_state.api_key}"

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            if llm_state.use_openai_compat:
                resp = await client.post(
                    f"{url}/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.85,
                        "max_tokens": 120,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()
            else:
                resp = await client.post(
                    f"{url}/api/generate",
                    headers=headers,
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.85, "num_predict": 120},
                    },
                )
                resp.raise_for_status()
                return resp.json().get("response", "").strip()
    except Exception as e:
        logger.warning(f"LLM request failed: {e}")
        return ""


async def is_available() -> bool:
    url = llm_state.effective_url()
    headers = {}
    if llm_state.api_key:
        headers["Authorization"] = f"Bearer {llm_state.api_key}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            if llm_state.use_openai_compat:
                resp = await client.get(f"{url}/v1/models", headers=headers)
            else:
                resp = await client.get(f"{url}/api/tags")
            return resp.status_code == 200
    except Exception:
        return False
