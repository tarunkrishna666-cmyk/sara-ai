import os

from .base import OpenAICompatibleProvider


class OpenRouterService(OpenAICompatibleProvider):
    def __init__(self) -> None:
        headers: dict[str, str] = {}
        if site_url := os.getenv("OPENROUTER_SITE_URL"):
            headers["HTTP-Referer"] = site_url
        headers["X-Title"] = os.getenv("OPENROUTER_APP_NAME", "sarA")
        super().__init__(
            name="OpenRouter",
            base_url=os.getenv(
                "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
            ),
            api_key=os.getenv("OPENROUTER_API_KEY"),
            timeout=float(os.getenv("OPENROUTER_TIMEOUT", "45")),
            extra_headers=headers,
        )
