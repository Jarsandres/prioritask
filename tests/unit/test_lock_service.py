from unittest.mock import AsyncMock, patch

import pytest

from app.services.lock import (
    InMemoryLock,
    RedisLock,
    distributed_lock,
)


@pytest.mark.asyncio
async def test_in_memory_lock_acquire_and_release():
    lock = InMemoryLock()
    lock_name = "test_resource_1"

    # Acquire initial lock
    acquired = await lock.acquire(lock_name, timeout_seconds=10)
    assert acquired is True

    # Concurrent acquire fails
    second_acquire = await lock.acquire(lock_name, timeout_seconds=10)
    assert second_acquire is False

    # Release lock
    await lock.release(lock_name)

    # Acquire succeeds after release
    reacquired = await lock.acquire(lock_name, timeout_seconds=10)
    assert reacquired is True


@pytest.mark.asyncio
async def test_in_memory_lock_expiration():
    lock = InMemoryLock()
    lock_name = "test_resource_expiry"

    base_time = 1000.0
    with patch("time.time", return_value=base_time):
        acquired = await lock.acquire(lock_name, timeout_seconds=5)
        assert acquired is True

        # Still within timeout
        assert await lock.acquire(lock_name, timeout_seconds=5) is False

    # Advance time past lease expiration
    with patch("time.time", return_value=base_time + 6.0):
        assert await lock.acquire(lock_name, timeout_seconds=5) is True


@pytest.mark.asyncio
async def test_redis_lock_fallback_when_unconfigured():
    # When redis_url is None, it uses InMemoryLock fallback
    lock = RedisLock(redis_url=None)
    acquired = await lock.acquire("unconfigured_redis_lock", timeout_seconds=10)
    assert acquired is True

    # Lock held in fallback
    assert await lock.acquire("unconfigured_redis_lock", timeout_seconds=10) is False
    await lock.release("unconfigured_redis_lock")
    assert await lock.acquire("unconfigured_redis_lock", timeout_seconds=10) is True


@pytest.mark.asyncio
async def test_redis_lock_handles_redis_connection_exception():
    lock = RedisLock(redis_url="redis://invalid-host:6379/0")
    # Simulate failed redis client
    mock_client = AsyncMock()
    mock_client.set.side_effect = ConnectionError("Cannot reach Redis")
    lock._client = mock_client

    # Should gracefully fall back to InMemoryLock without raising
    acquired = await lock.acquire("failing_redis_lock", timeout_seconds=10)
    assert acquired is True
    # In-memory fallback holds the lock
    assert await lock.acquire("failing_redis_lock", timeout_seconds=10) is False
    await lock.release("failing_redis_lock")


@pytest.mark.asyncio
async def test_distributed_lock_context_manager():
    lock_name = "ctx_manager_resource"

    async with distributed_lock(lock_name, timeout_seconds=10) as acquired1:
        assert acquired1 is True

        # Inner attempt should fail to acquire
        async with distributed_lock(lock_name, timeout_seconds=10) as acquired2:
            assert acquired2 is False

    # After exiting outer context manager, lock is released
    async with distributed_lock(lock_name, timeout_seconds=10) as acquired3:
        assert acquired3 is True
