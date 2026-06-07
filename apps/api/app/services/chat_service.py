import asyncio
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

from .ai_router import Brain, Route, route_message
from .base import AIServiceError, EmptyProviderResponseError, build_messages
from .groq_service import GroqService
from .ollama_service import OllamaService
from .openrouter_service import OpenRouterService
from .response_cache import ResponseCache

logger = logging.getLogger("sara.ai")


class RoutedChatService:
    def __init__(self) -> None:
        self.providers = {
            Brain.GROQ: GroqService(),
            Brain.OPENROUTER: OpenRouterService(),
            Brain.OLLAMA: OllamaService(),
        }
        self.cache = ResponseCache(
            ttl_seconds=int(os.getenv("RESPONSE_CACHE_TTL", "300")),
            max_entries=int(os.getenv("RESPONSE_CACHE_MAX_ENTRIES", "256")),
        )

    async def close(self) -> None:
        await asyncio.gather(*(provider.close() for provider in self.providers.values()))

    async def generate_reply(
        self, message: str, history: list[dict[str, Any]] | None = None
    ) -> str:
        chunks = [chunk async for chunk in self.stream_reply(message, history or [])]
        response = "".join(chunks).strip()
        if not response:
            raise EmptyProviderResponseError("All AI providers returned an empty response.")
        return response

    async def stream_reply(
        self, message: str, history: list[dict[str, Any]] | None = None
    ) -> AsyncIterator[str]:
        primary = route_message(message)
        async for chunk in self._stream_reply(message, history or [], primary):
            yield chunk

    async def _stream_reply(
        self, message: str, history: list[dict[str, Any]], primary: Route
    ) -> AsyncIterator[str]:
        messages = build_messages(message, history)
        cache_key = self.cache.key(primary.model, messages)
        if cached := self.cache.get(cache_key):
            yield cached
            return

        errors: list[str] = []
        for route in self._fallback_chain(primary):
            chunks: list[str] = []
            try:
                logger.info("AI route start: brain=%s model=%s intent=%s", route.brain.value, route.model, route.intent)
                async for chunk in self.providers[route.brain].stream(route.model, messages):
                    chunks.append(chunk)
                    yield chunk
                response = "".join(chunks).strip()
                if not response:
                    raise EmptyProviderResponseError(
                        f"{route.brain.value} returned an empty response."
                    )
                self.cache.set(cache_key, response)
                logger.info("AI route success: brain=%s model=%s", route.brain.value, route.model)
                return
            except AIServiceError as exc:
                logger.warning("AI route failed: brain=%s model=%s error=%s", route.brain.value, route.model, exc)
                errors.append(str(exc))
                if chunks:
                    raise AIServiceError(
                        f"{route.brain.value} failed after streaming began."
                    ) from exc

        raise AIServiceError("All AI providers failed: " + " | ".join(errors))

    @staticmethod
    def _fallback_chain(primary: Route) -> list[Route]:
        routes = [primary]
        if primary.brain == Brain.GROQ:
            routes.append(Route("fallback-chat", Brain.OPENROUTER, "openai/gpt-oss-20b:free"))
        routes.append(Route("local-fallback", Brain.OLLAMA, "auto"))
        return routes


# Compatibility name for older imports.
OllamaChatService = RoutedChatService
