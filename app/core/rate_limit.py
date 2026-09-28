import asyncio
import math
import os
import time
from collections import defaultdict
from collections.abc import Callable

from fastapi import HTTPException, Request, status


class InMemoryRateLimiter:
    """Thread-safe in-memory sliding window rate limiter."""

    def __init__(self) -> None:
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def check(
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


rate_limiter = InMemoryRateLimiter()


def rate_limit(
    max_requests: int = 10,
    window_seconds: int = 60,
    key_func: Callable[[Request], str] | None = None,
):
    """
    FastAPI dependency factory enforcing sliding-window rate limits.

    Supports bypass through:
    - Environment variable RATE_LIMIT_ENABLED=false
    - Request header X-Bypass-Rate-Limit: 1
    """

    async def dependency(request: Request) -> None:
        if os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("false", "0", "no"):
            return

        if request.headers.get("X-Bypass-Rate-Limit") == "1":
            return

        if key_func is not None:
            key = key_func(request)
        elif request.client and request.client.host:
            key = f"{request.client.host}:{request.url.path}"
        else:
            key = f"testclient:{request.url.path}"

        allowed, retry_after = await rate_limiter.check(
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
