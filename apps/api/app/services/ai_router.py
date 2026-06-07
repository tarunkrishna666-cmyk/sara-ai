from dataclasses import dataclass
from enum import Enum
import re


class Brain(str, Enum):
    GROQ = "groq"
    OPENROUTER = "openrouter"
    OLLAMA = "ollama"


@dataclass(frozen=True)
class Route:
    intent: str
    brain: Brain
    model: str


DEBUG_WORDS = {"bug", "fix", "debug", "traceback", "exception", "crash"}
CODE_WORDS = {
    "code",
    "build",
    "create",
    "develop",
    "function",
    "error",
    "implement",
    "refactor",
    "javascript",
    "js",
    "typescript",
    "python",
    "html",
    "css",
    "react",
    "node",
}
COMPLEX_PHRASES = {
    "complex",
    "reason",
    "analyze",
    "architecture",
    "tradeoff",
    "trade-off",
    "step by step",
    "compare",
    "design a system",
}


def route_message(message: str) -> Route:
    normalized = message.lower()
    words = set(re.findall(r"[a-z0-9.+#-]+", normalized))

    if words & DEBUG_WORDS:
        return Route("debugging", Brain.OPENROUTER, "deepseek/deepseek-r1:free")
    if words & CODE_WORDS:
        return Route("coding", Brain.OPENROUTER, "poolside/laguna-m.1:free")
    if len(message) > 1200 or any(phrase in normalized for phrase in COMPLEX_PHRASES):
        return Route("reasoning", Brain.GROQ, "llama-3.1-70b-versatile")
    return Route("chat", Brain.GROQ, "llama-3.1-8b-instant")
