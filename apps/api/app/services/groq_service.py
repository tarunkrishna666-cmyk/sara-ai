import os

from .base import OpenAICompatibleProvider


class GroqService(OpenAICompatibleProvider):
    def __init__(self) -> None:
        super().__init__(
            name="Groq",
            base_url=os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            api_key=os.getenv("GROQ_API_KEY"),
            timeout=float(os.getenv("GROQ_TIMEOUT", "30")),
        )
