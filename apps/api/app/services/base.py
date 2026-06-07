import json
from collections.abc import AsyncIterator
from typing import Any

import httpx


SYSTEM_PROMPT = (
    "You are sarA, a concise, capable AI assistant. Help with chat, coding, and debugging. "
    "Give accurate, practical answers and complete code when requested."
)
MAX_HISTORY_MESSAGES = 10
MAX_HISTORY_CHARS = 12000


class AIServiceError(Exception):
    """Base error for AI provider failures."""


class ProviderConfigurationError(AIServiceError):
    """Raised when a provider is selected but is not configured."""


class ProviderRequestError(AIServiceError):
    """Raised when a provider request fails."""


class EmptyProviderResponseError(AIServiceError):
    """Raised when a provider returns no text."""


def build_messages(message: str, history: list[dict[str, Any]]) -> list[dict[str, str]]:
    selected: list[dict[str, str]] = []
    total_chars = 0

    for item in reversed(history[-MAX_HISTORY_MESSAGES:]):
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            continue
        content = content.strip()
        if not content or total_chars + len(content) > MAX_HISTORY_CHARS:
            break
        selected.append({"role": role, "content": content})
        total_chars += len(content)

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        *reversed(selected),
        {"role": "user", "content": message.strip()},
    ]


class OpenAICompatibleProvider:
    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        api_key: str | None,
        timeout: float,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self.api_key = api_key
        headers = {"Content-Type": "application/json", **(extra_headers or {})}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(timeout, connect=5.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def stream(
        self, model: str, messages: list[dict[str, str]]
    ) -> AsyncIterator[str]:
        if not self.api_key:
            raise ProviderConfigurationError(f"{self.name} API key is not configured.")

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.35,
            "max_tokens": 900,
        }
        try:
            async with self._client.stream(
                "POST", "/chat/completions", json=payload
            ) as response:
                if response.is_error:
                    detail = (await response.aread()).decode(errors="replace")[:500]
                    raise ProviderRequestError(
                        f"{self.name} returned HTTP {response.status_code}: {detail}"
                    )
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    chunk = self._parse_chunk(data)
                    if chunk:
                        yield chunk
        except AIServiceError:
            raise
        except httpx.TimeoutException as exc:
            raise ProviderRequestError(f"{self.name} timed out.") from exc
        except httpx.HTTPError as exc:
            raise ProviderRequestError(f"{self.name} request failed.") from exc

    def _parse_chunk(self, data: str) -> str:
        try:
            payload = json.loads(data)
            content = payload["choices"][0]["delta"].get("content", "")
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise ProviderRequestError(f"{self.name} returned an invalid stream.") from exc
        return content if isinstance(content, str) else ""
