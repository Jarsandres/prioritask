from unittest.mock import AsyncMock

import pytest

from app.core.rate_limit import (
    InMemoryRateLimiter,
    RateLimiterBackend,
    RedisRateLimiter,
)


def test_backends_implement_rate_limiter_interface():
    assert issubclass(InMemoryRateLimiter, RateLimiterBackend)
    assert issubclass(RedisRateLimiter, RateLimiterBackend)


@pytest.mark.asyncio
async def test_redis_rate_limiter_fallback_without_redis():
    limiter = RedisRateLimiter(redis_url=None)
    key = "test_unconfigured_redis_key"

    for _ in range(3):
        allowed, retry_after = await limiter.check_rate_limit(key, max_requests=3, window_seconds=60)
        assert allowed is True
        assert retry_after == 0

    # 4th should exceed limit via in-memory fallback
    allowed, retry_after = await limiter.check_rate_limit(key, max_requests=3, window_seconds=60)
    assert allowed is False
    assert retry_after > 0


@pytest.mark.asyncio
async def test_redis_rate_limiter_graceful_fallback_on_exception():
    limiter = RedisRateLimiter(redis_url="redis://localhost:6379/0")
    # Mock client pipeline that throws
    mock_client = AsyncMock()
    mock_pipe = AsyncMock()
    mock_pipe.execute.side_effect = ConnectionError("Redis server down")
    mock_client.pipeline.return_value = mock_pipe
    limiter._client = mock_client

    key = "failing_redis_op_key"
    allowed, retry_after = await limiter.check_rate_limit(key, max_requests=2, window_seconds=30)
    assert allowed is True
    assert retry_after == 0

    allowed2, _ = await limiter.check_rate_limit(key, max_requests=2, window_seconds=30)
    assert allowed2 is True

    # 3rd request blocked by in-memory fallback
    allowed3, retry_after3 = await limiter.check_rate_limit(key, max_requests=2, window_seconds=30)
    assert allowed3 is False
    assert retry_after3 > 0


@pytest.mark.asyncio
async def test_redis_rate_limiter_clear():
    limiter = RedisRateLimiter(redis_url=None)
    key = "clear_test_key"

    for _ in range(2):
        await limiter.check_rate_limit(key, max_requests=2, window_seconds=60)

    blocked, _ = await limiter.check_rate_limit(key, max_requests=2, window_seconds=60)
    assert blocked is False

    limiter.clear()

    allowed, _ = await limiter.check_rate_limit(key, max_requests=2, window_seconds=60)
    assert allowed is True
