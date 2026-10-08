from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel

from app.main import app
from app.services.auth import (
    SECRET_KEY,
    TokenBlacklist,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password_async,
    is_token_revoked,
    revoke_token,
    token_blacklist,
    verify_password_async,
)


@pytest.mark.asyncio
async def test_async_password_hashing_and_verification():
    raw_password = "SecurePassword123!"
    hashed = await hash_password_async(raw_password)

    assert hashed != raw_password
    assert hashed.startswith("$2")  # bcrypt prefix

    is_valid = await verify_password_async(raw_password, hashed)
    assert is_valid is True

    is_invalid = await verify_password_async("WrongPassword", hashed)
    assert is_invalid is False


@pytest.mark.asyncio
async def test_token_creation_has_jti_and_version():
    user_id = uuid4()
    access = create_access_token(user_id, SECRET_KEY, token_version=2)
    refresh = create_refresh_token(user_id, SECRET_KEY, token_version=2)

    access_data = decode_token(access, SECRET_KEY)
    refresh_data = decode_token(refresh, SECRET_KEY)

    assert "jti" in access_data
    assert access_data["token_version"] == 2
    assert access_data["type"] == "access"

    assert "jti" in refresh_data
    assert refresh_data["token_version"] == 2
    assert refresh_data["type"] == "refresh"


@pytest.mark.asyncio
async def test_token_revocation_blacklist_lifecycle():
    bl = TokenBlacklist(redis_url=None)  # in-memory fallback
    test_jti = str(uuid4())

    assert await bl.is_token_revoked(test_jti) is False

    await bl.revoke_token(test_jti, exp_seconds=3600)
    assert await bl.is_token_revoked(test_jti) is True

    # Global helper
    another_jti = str(uuid4())
    assert await is_token_revoked(another_jti) is False
    await revoke_token(another_jti, exp_seconds=10)
    assert await is_token_revoked(another_jti) is True

    token_blacklist.clear()
    assert await is_token_revoked(another_jti) is False


@pytest.mark.asyncio
async def test_security_headers_middleware_injection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/openapi.json")
        assert response.status_code == 200

        # Verify all mandatory security headers
        assert response.headers.get("x-frame-options") == "DENY"
        assert response.headers.get("x-content-type-options") == "nosniff"
        assert "strict-transport-security" in response.headers
        assert "max-age=31536000" in response.headers["strict-transport-security"]
        assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert "geolocation=()" in response.headers.get("permissions-policy", "")


def test_composite_indexes_metadata():
    tables = SQLModel.metadata.tables

    # 1. TaskHistory (task_id, timestamp)
    th_table = tables.get("taskhistory")
    assert th_table is not None
    th_indexes = {idx.name: [c.name for c in idx.columns] for idx in th_table.indexes}
    assert "ix_task_history_task_id_timestamp" in th_indexes
    assert th_indexes["ix_task_history_task_id_timestamp"] == ["task_id", "timestamp"]

    # 2. PointTransaction (room_id, user_id, created_at)
    pt_table = tables.get("pointtransaction")
    assert pt_table is not None
    pt_indexes = {idx.name: [c.name for c in idx.columns] for idx in pt_table.indexes}
    assert "ix_point_tx_room_user_created" in pt_indexes
    assert pt_indexes["ix_point_tx_room_user_created"] == ["room_id", "user_id", "created_at"]

    # 3. TaskAttachment (task_id, deleted_at, created_at)
    ta_table = tables.get("task_attachment")
    assert ta_table is not None
    ta_indexes = {idx.name: [c.name for c in idx.columns] for idx in ta_table.indexes}
    assert "ix_task_attachment_task_deleted_created" in ta_indexes
    assert ta_indexes["ix_task_attachment_task_deleted_created"] == ["task_id", "deleted_at", "created_at"]

    # 4. Subtask (task_id, deleted_at, orden)
    st_table = tables.get("subtask")
    assert st_table is not None
    st_indexes = {idx.name: [c.name for c in idx.columns] for idx in st_table.indexes}
    assert "ix_subtask_task_deleted_orden" in st_indexes
    assert st_indexes["ix_subtask_task_deleted_orden"] == ["task_id", "deleted_at", "orden"]

    # 5. Task (room_id, deleted_at, completed, created_at)
    task_table = tables.get("task")
    assert task_table is not None
    task_indexes = {idx.name: [c.name for c in idx.columns] for idx in task_table.indexes}
    assert "ix_task_room_deleted_completed_created" in task_indexes
    assert task_indexes["ix_task_room_deleted_completed_created"] == ["room_id", "deleted_at", "completed", "created_at"]
