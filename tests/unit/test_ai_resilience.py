import asyncio
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import settings
from app.services.AI.cache import AICache, build_cache_key
from app.services.AI.circuit_breaker import CircuitBreaker, CircuitState
from app.services.AI.ollama_client import generate_json


@pytest.mark.asyncio
async def test_circuit_breaker_transitions():
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute() is True

    # 1st failure
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 1
    assert cb.can_execute() is True

    # 2nd failure
    cb.record_failure()
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 2
    assert cb.can_execute() is True

    # 3rd failure -> should open
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.failure_count == 3
    assert cb.can_execute() is False

    # Simulate timeout elapsed
    cb.last_failure_time = datetime.now(UTC) - timedelta(seconds=2)
    assert cb.can_execute() is True
    assert cb.state == CircuitState.HALF_OPEN

    # In HALF_OPEN, failure reopens immediately
    cb.record_failure()
    assert cb.state == CircuitState.OPEN
    assert cb.can_execute() is False

    # Timeout again -> HALF_OPEN -> success -> CLOSED
    cb.last_failure_time = datetime.now(UTC) - timedelta(seconds=2)
    assert cb.can_execute() is True
    assert cb.state == CircuitState.HALF_OPEN

    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.failure_count == 0
    assert cb.success_count == 1


def test_circuit_breaker_metrics():
    cb = CircuitBreaker(failure_threshold=2)
    metrics = cb.get_metrics()
    assert metrics["status"] == "healthy"
    assert metrics["circuit_state"] == "CLOSED"
    assert metrics["failure_count"] == 0
    assert metrics["success_count"] == 0
    assert metrics["last_failure"] is None
    assert metrics["model"] == settings.OLLAMA_MODEL

    cb.record_failure()
    cb.record_failure()
    metrics_degraded = cb.get_metrics()
    assert metrics_degraded["status"] == "degraded"
    assert metrics_degraded["circuit_state"] == "OPEN"
    assert metrics_degraded["failure_count"] == 2
    assert metrics_degraded["last_failure"] is not None


@pytest.mark.asyncio
async def test_ai_cache_operations():
    cache = AICache(default_ttl=0.1, maxsize=2)
    key1 = build_cache_key("modelA", "prompt1")
    key2 = build_cache_key("modelA", "prompt2")
    key3 = build_cache_key("modelA", "prompt3")

    # Miss
    assert await cache.get(key1) is None
    stats = await cache.stats()
    assert stats["misses"] == 1
    assert stats["hits"] == 0

    # Set and hit
    await cache.set(key1, {"response": 1})
    val = await cache.get(key1)
    assert val == {"response": 1}
    stats = await cache.stats()
    assert stats["hits"] == 1

    # TTL expiration
    await asyncio.sleep(0.15)
    assert await cache.get(key1) is None
    stats = await cache.stats()
    assert stats["misses"] == 2
    assert stats["size"] == 0

    # Eviction on maxsize
    await cache.set(key1, "val1", ttl=60)
    await cache.set(key2, "val2", ttl=60)
    assert (await cache.stats())["size"] == 2

    # Inserting 3rd entry evicts oldest (key1)
    await cache.set(key3, "val3", ttl=60)
    assert (await cache.stats())["size"] == 2
    assert await cache.get(key1) is None
    assert await cache.get(key2) == "val2"
    assert await cache.get(key3) == "val3"

    # Clear
    await cache.clear()
    assert (await cache.stats()) == {"hits": 0, "misses": 0, "size": 0}


@pytest.mark.asyncio
async def test_ollama_client_cache_and_circuit_breaker_integration():
    from app.services.AI.cache import ai_cache
    from app.services.AI.circuit_breaker import circuit_breaker

    await ai_cache.clear()
    circuit_breaker.state = CircuitState.CLOSED
    circuit_breaker.failure_count = 0
    circuit_breaker.success_count = 0
    circuit_breaker.last_failure_time = None

    prompt = f"unique-test-prompt-{time.time()}"
    mock_payload = {"result": "ok"}

    # 1. Successful HTTP call populates cache
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"response": '{"result": "ok"}'}
        mock_post.return_value = mock_response

        res1 = await generate_json(prompt)
        assert res1 == mock_payload
        assert mock_post.call_count == 1
        assert circuit_breaker.success_count >= 1

    # 2. Subsequent call should hit cache without calling HTTP
    with patch("httpx.AsyncClient.post") as mock_post:
        res2 = await generate_json(prompt)
        assert res2 == mock_payload
        mock_post.assert_not_called()

    # 3. Circuit breaker open aborts immediately (< 5ms)
    circuit_breaker.state = CircuitState.OPEN
    circuit_breaker.last_failure_time = datetime.now(UTC)

    new_prompt = f"new-prompt-{time.time()}"
    with patch("httpx.AsyncClient.post") as mock_post:
        start = time.perf_counter()
        res3 = await generate_json(new_prompt)
        elapsed_ms = (time.perf_counter() - start) * 1000
        assert res3 is None
        assert elapsed_ms < 50.0  # Fast fallback
        mock_post.assert_not_called()

    # Reset circuit breaker
    circuit_breaker.state = CircuitState.CLOSED
    circuit_breaker.failure_count = 0
