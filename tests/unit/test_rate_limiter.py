from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.rate_limit import InMemoryRateLimiter, rate_limiter


@pytest.mark.asyncio
async def test_in_memory_rate_limiter_allows_within_limit():
    limiter = InMemoryRateLimiter()
    key = "user-ip-123"

    for _ in range(5):
        allowed, retry_after = await limiter.check(key, max_requests=5, window_seconds=60)
        assert allowed is True
        assert retry_after == 0


@pytest.mark.asyncio
async def test_in_memory_rate_limiter_blocks_over_limit():
    limiter = InMemoryRateLimiter()
    key = "user-ip-block"

    for _ in range(3):
        allowed, retry_after = await limiter.check(key, max_requests=3, window_seconds=30)
        assert allowed is True
        assert retry_after == 0

    # 4th request must be blocked
    allowed, retry_after = await limiter.check(key, max_requests=3, window_seconds=30)
    assert allowed is False
    assert retry_after > 0
    assert retry_after <= 30


@pytest.mark.asyncio
async def test_in_memory_rate_limiter_window_expiry():
    limiter = InMemoryRateLimiter()
    key = "user-ip-expiry"

    base_time = 1000.0

    with patch("time.time", return_value=base_time):
        for _ in range(2):
            allowed, retry_after = await limiter.check(key, max_requests=2, window_seconds=10)
            assert allowed is True

        # Exceeded at base_time
        allowed, retry_after = await limiter.check(key, max_requests=2, window_seconds=10)
        assert allowed is False
        assert retry_after == 10

    # Advance time beyond window
    with patch("time.time", return_value=base_time + 11.0):
        allowed, retry_after = await limiter.check(key, max_requests=2, window_seconds=10)
        assert allowed is True
        assert retry_after == 0


@pytest.mark.asyncio
async def test_in_memory_rate_limiter_clear():
    limiter = InMemoryRateLimiter()
    key = "user-ip-clear"

    for _ in range(2):
        await limiter.check(key, max_requests=2, window_seconds=60)

    allowed, _ = await limiter.check(key, max_requests=2, window_seconds=60)
    assert allowed is False

    limiter.clear()

    allowed, retry_after = await limiter.check(key, max_requests=2, window_seconds=60)
    assert allowed is True
    assert retry_after == 0


@pytest.mark.asyncio
async def test_rate_limit_endpoint_http_429_and_retry_after(async_client: AsyncClient):
    rate_limiter.clear()

    # POST /api/v1/auth/register has limit of 5 requests per 60s
    for i in range(5):
        resp = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": f"ratelimit-{i}-{uuid4()}@example.com",
                "nombre": f"RateUser {i}",
                "password": "validPassword123",
            },
        )
        assert resp.status_code == 201

    # 6th request should hit 429 Too Many Requests
    blocked_resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"ratelimit-blocked-{uuid4()}@example.com",
            "nombre": "Blocked User",
            "password": "validPassword123",
        },
    )
    assert blocked_resp.status_code == 429
    assert blocked_resp.json()["detail"] == "Demasiadas peticiones. Por favor, espere antes de reintentar."
    assert "Retry-After" in blocked_resp.headers
    retry_after = int(blocked_resp.headers["Retry-After"])
    assert retry_after > 0


@pytest.mark.asyncio
async def test_rate_limit_bypass_header_rejected(async_client: AsyncClient):
    """Verify that external X-Bypass-Rate-Limit header does NOT bypass rate limiting (SEC-040)."""
    rate_limiter.clear()

    # Exhaust 5 requests
    for i in range(5):
        resp = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": f"bypass-{i}-{uuid4()}@example.com",
                "nombre": f"BypassUser {i}",
                "password": "validPassword123",
            },
        )
        assert resp.status_code == 201

    # 6th request with external bypass header MUST be rejected with 429
    bypass_resp = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"bypass-attempt-{uuid4()}@example.com",
            "nombre": "Bypass Attempt",
            "password": "validPassword123",
        },
        headers={"X-Bypass-Rate-Limit": "1"},
    )
    assert bypass_resp.status_code == 429
    assert bypass_resp.json()["detail"] == "Demasiadas peticiones. Por favor, espere antes de reintentar."


@pytest.mark.asyncio
async def test_rate_limit_disabled_via_settings(async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    """Verify that rate limiting can only be bypassed via controlled server configuration."""
    rate_limiter.clear()
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)

    # 6 requests should all succeed because rate limiting is disabled by configuration
    for i in range(6):
        resp = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": f"settings-disabled-{i}-{uuid4()}@example.com",
                "nombre": f"ConfigUser {i}",
                "password": "validPassword123",
            },
        )
        assert resp.status_code == 201
