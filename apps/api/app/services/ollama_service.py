import json
import os
import time
from collections.abc import AsyncIterator

import httpx

from .base import ProviderRequestError


class OllamaService:
    name = "Ollama"

    def __init__(self) -> None:
        self.models = tuple(
            item.strip()
            for item in os.getenv("OLLAMA_MODELS", "qwen3,llama3.2").split(",")
            if item.strip()
        )
        self._selected_model: str | None = None
        self._selected_at = 0.0
        self._client = httpx.AsyncClient(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"),
            timeout=httpx.Timeout(float(os.getenv("OLLAMA_TIMEOUT", "60")), connect=3.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def stream(
        self, model: str, messages: list[dict[str, str]]
    ) -> AsyncIterator[str]:
        selected_model = await self._select_model()
        payload = {
            "model": selected_model,
            "messages": messages,
            "stream": True,
            "keep_alive": os.getenv("OLLAMA_KEEP_ALIVE", "10m"),
            "options": {
                "temperature": 0.35,
                "num_ctx": int(os.getenv("OLLAMA_NUM_CTX", "4096")),
                "num_predict": int(os.getenv("OLLAMA_NUM_PREDICT", "900")),
            },
        }
        try:
            async with self._client.stream("POST", "/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if isinstance(content, str) and content:
                        yield content
        except (httpx.HTTPError, json.JSONDecodeError) as exc:
            self._selected_model = None
            raise ProviderRequestError("Ollama is unavailable or returned an invalid response.") from exc

    async def _select_model(self) -> str:
        now = time.monotonic()
        if self._selected_model and now - self._selected_at < 300:
            return self._selected_model
        try:
            response = await self._client.get("/api/tags")
            response.raise_for_status()
            installed = [
                item["name"]
                for item in response.json().get("models", [])
                if isinstance(item, dict) and isinstance(item.get("name"), str)
            ]
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderRequestError("Ollama is not running or is not reachable.") from exc

        for preferred in self.models:
            for installed_model in installed:
                if installed_model == preferred or installed_model.startswith(f"{preferred}:"):
                    self._selected_model = installed_model
                    self._selected_at = now
                    return installed_model
        raise ProviderRequestError(
            "No supported Ollama model is installed. Pull qwen3 or llama3.2."
        )
