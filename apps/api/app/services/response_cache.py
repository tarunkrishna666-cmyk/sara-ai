import hashlib
import json
import time
from collections import OrderedDict


class ResponseCache:
    def __init__(self, ttl_seconds: int = 300, max_entries: int = 256) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._items: OrderedDict[str, tuple[float, str]] = OrderedDict()

    def key(self, model: str, messages: list[dict[str, str]]) -> str:
        encoded = json.dumps(
            {"model": model, "messages": messages},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(encoded).hexdigest()

    def get(self, key: str) -> str | None:
        item = self._items.get(key)
        if not item:
            return None
        created_at, value = item
        if time.monotonic() - created_at > self.ttl_seconds:
            self._items.pop(key, None)
            return None
        self._items.move_to_end(key)
        return value

    def set(self, key: str, value: str) -> None:
        self._items[key] = (time.monotonic(), value)
        self._items.move_to_end(key)
        while len(self._items) > self.max_entries:
            self._items.popitem(last=False)
