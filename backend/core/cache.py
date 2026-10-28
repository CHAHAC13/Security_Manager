import asyncio
import os
from typing import Any

from cachetools import TTLCache
from dotenv import load_dotenv

from .config import get_settings


class DiscoveryCache:
    """Small process-local TTL cache for discovery responses."""

    def __init__(self) -> None:
        settings = get_settings()
        self._ttl = settings.discovery_cache_ttl_seconds
        self._cache: TTLCache[str, Any] = TTLCache(
            maxsize=settings.discovery_cache_max_entries,
            ttl=max(1, settings.discovery_cache_ttl_seconds),
        )
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        if self._ttl == 0:
            return None
        async with self._lock:
            return self._cache.get(key)

    async def set(self, key: str, value: Any) -> None:
        if self._ttl == 0:
            return
        async with self._lock:
            self._cache[key] = value

    async def clear(self) -> int:
        async with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count


discovery_cache = DiscoveryCache()