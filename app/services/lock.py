import asyncio
import logging
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from app.core.config import settings

logger = logging.getLogger(__name__)


class DistributedLockBackend(ABC):
    """Abstract port for distributed lock implementations."""

    @abstractmethod
    async def acquire(self, name: str, timeout_seconds: int = 60) -> bool:
        """
        Attempt to acquire the lock.

        Returns:
            True if lock was successfully acquired, False otherwise.
        """
        ...

    @abstractmethod
    async def release(self, name: str) -> None:
        """Release the acquired lock."""
        ...


class InMemoryLock(DistributedLockBackend):
    """Thread-safe in-memory lock with automatic lease expiration."""

    def __init__(self) -> None:
        self._locks: dict[str, float] = {}  # name -> expiry timestamp
        self._mutex = asyncio.Lock()

    async def acquire(self, name: str, timeout_seconds: int = 60) -> bool:
        async with self._mutex:
            now = time.time()
            expiry = self._locks.get(name)
            if expiry is not None and now < expiry:
                return False

            self._locks[name] = now + timeout_seconds
            return True

    async def release(self, name: str) -> None:
        async with self._mutex:
            self._locks.pop(name, None)


class RedisLock(DistributedLockBackend):
    """
    Distributed lock backend backed by Redis with atomic token release.
    Falls back gracefully to InMemoryLock if Redis is unavailable or unconfigured.
    """

    LUA_RELEASE_SCRIPT = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self._redis_url = redis_url or settings.REDIS_URL
        self._fallback = InMemoryLock()
        self._tokens: dict[str, str] = {}
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
                    "Redis client initialization for lock failed (%s); using in-memory lock.",
                    exc,
                )
                self._connection_failed = True

    async def acquire(self, name: str, timeout_seconds: int = 60) -> bool:
        if not self._client or self._connection_failed:
            return await self._fallback.acquire(name, timeout_seconds=timeout_seconds)

        token = str(uuid.uuid4())
        lock_key = f"lock:{name}"

        try:
            acquired = await self._client.set(lock_key, token, ex=timeout_seconds, nx=True)
            if acquired:
                self._tokens[name] = token
                return True
            return False
        except Exception as exc:
            logger.warning(
                "Redis lock acquire failed (%s); falling back to in-memory lock.",
                exc,
            )
            return await self._fallback.acquire(name, timeout_seconds=timeout_seconds)

    async def release(self, name: str) -> None:
        if not self._client or self._connection_failed:
            await self._fallback.release(name)
            return

        lock_key = f"lock:{name}"
        token = self._tokens.pop(name, None)
        if not token:
            await self._fallback.release(name)
            return

        try:
            await self._client.eval(self.LUA_RELEASE_SCRIPT, 1, lock_key, token)
        except Exception as exc:
            logger.warning("Redis lock release failed (%s); releasing in fallback.", exc)
            await self._fallback.release(name)


def get_default_lock_backend() -> DistributedLockBackend:
    if settings.REDIS_URL:
        return RedisLock(settings.REDIS_URL)
    return InMemoryLock()


default_lock_backend: DistributedLockBackend = get_default_lock_backend()


@asynccontextmanager
async def distributed_lock(
    name: str,
    timeout_seconds: int = 60,
    backend: DistributedLockBackend | None = None,
) -> AsyncGenerator[bool, None]:
    """
    Context manager for distributed locking.

    Yields True if lock was acquired, False otherwise.
    Releases lock automatically on context exit if acquired.
    """
    lock_backend = backend or default_lock_backend
    acquired = await lock_backend.acquire(name, timeout_seconds=timeout_seconds)
    try:
        yield acquired
    finally:
        if acquired:
            try:
                await lock_backend.release(name)
            except Exception:
                logger.exception("Error releasing distributed lock %s", name)
