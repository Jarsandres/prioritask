import asyncio
import logging
import math
import os
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger(__name__)


class RateLimiterBackend(ABC):
    """Abstract port for rate limiter backends."""

    @abstractmethod
    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        """
        Check if key is allowed another request in current sliding window.

        Returns:
            (True, 0) if request is allowed,
            (False, retry_after) if rate limit is exceeded.
        """
        ...

    async def check(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        """Backward-compatible alias for check_rate_limit."""
        return await self.check_rate_limit(key, max_requests, window_seconds)

    def clear(self) -> None:
        """Reset or clear recorded limits."""


class InMemoryRateLimiter(RateLimiterBackend):
    """Thread-safe in-memory sliding window rate limiter."""

    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        """
        Check if key is allowed another request in current sliding window.

        Returns:
            (True, 0) if request is allowed,
            (False, retry_after) if rate limit is exceeded.
        """
        async with self._lock:
            now = time.time()
            cutoff = now - window_seconds
            timestamps = [t for t in self._requests[key] if t > cutoff]
            self._requests[key] = timestamps

            if len(timestamps) >= max_requests:
                retry_after = max(1, math.ceil(window_seconds - (now - timestamps[0])))
                return False, retry_after

            timestamps.append(now)
            return True, 0

    def clear(self) -> None:
        """Reset all recorded request timestamps."""
        self._requests.clear()


class RedisRateLimiter(RateLimiterBackend):
    """
    Sliding window rate limiter using Redis sorted sets (ZSET).
    Gracefully falls back to InMemoryRateLimiter if Redis is unavailable or unconfigured.
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self._redis_url = redis_url or settings.REDIS_URL
        self._fallback = InMemoryRateLimiter()
        self._client = None
        self._connection_failed = False

        if self._redis_url:
            try:
                import redis.asyncio as aioredis

                self._client = aioredis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
            except Exception as exc:
                logger.warning(
                    "Redis client initialization failed (%s); using in-memory fallback.",
                    exc,
                )
                self._connection_failed = True

    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        if not self._client or self._connection_failed:
            return await self._fallback.check_rate_limit(key, max_requests, window_seconds)

        now = time.time()
        cutoff = now - window_seconds
        redis_key = f"ratelimit:{key}"

        try:
            pipe = self._client.pipeline()
            pipe.zremrangebyscore(redis_key, 0, cutoff)
            pipe.zcard(redis_key)
            pipe.zrange(redis_key, 0, 0, withscores=True)
            results = await pipe.execute()

            current_count = results[1]
            oldest_entries = results[2]

            if current_count >= max_requests:
                if oldest_entries:
                    oldest_ts = float(oldest_entries[0][1])
                    retry_after = max(1, math.ceil(window_seconds - (now - oldest_ts)))
                else:
                    retry_after = window_seconds
                return False, retry_after

            pipe = self._client.pipeline()
            pipe.zadd(redis_key, {f"{now}": now})
            pipe.expire(redis_key, window_seconds + 5)
            await pipe.execute()
            return True, 0

        except Exception as exc:
            logger.warning(
                "Redis rate limit check failed (%s); falling back to in-memory limiter.",
                exc,
            )
            return await self._fallback.check_rate_limit(key, max_requests, window_seconds)

    def clear(self) -> None:
        self._fallback.clear()


def get_default_rate_limiter() -> RateLimiterBackend:
    if settings.REDIS_URL:
        return RedisRateLimiter(settings.REDIS_URL)
    return InMemoryRateLimiter()


rate_limiter: RateLimiterBackend = get_default_rate_limiter()


def rate_limit(
    max_requests: int = 10,
    window_seconds: int = 60,
    key_func: Callable[[Request], str] | None = None,
):
    """
    FastAPI dependency factory enforcing sliding-window rate limits.

    Supports bypass strictly through controlled server-side configuration:
    - Environment variable RATE_LIMIT_ENABLED=false
    - Settings setting RATE_LIMIT_ENABLED=False
    """

    async def dependency(request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED or os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("false", "0", "no"):
            return

        if key_func is not None:
            key = key_func(request)
        elif request.client and request.client.host:
            key = f"{request.client.host}:{request.url.path}"
        else:
            key = f"testclient:{request.url.path}"

        allowed, retry_after = await rate_limiter.check_rate_limit(
            key=key,
            max_requests=max_requests,
            window_seconds=window_seconds,
        )

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas peticiones. Por favor, espere antes de reintentar.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
