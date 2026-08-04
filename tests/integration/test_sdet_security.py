from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.services.auth import ALGORITHM, SECRET_KEY
from tests.utils import create_task, create_user_and_token


class TestSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_deleted_task_hidden_from_list(self, async_client):
        _user, token = await create_user_and_token(async_client)
        task = await create_task(async_client, token, {"titulo": "Tarea Activa", "categoria": "OTRO"})
        task_to_delete = await create_task(async_client, token, {"titulo": "Tarea Borrada", "categoria": "COMPRA"})
        headers = {"Authorization": f"Bearer {token}"}

        del_resp = await async_client.delete(f"/api/v1/tasks/{task_to_delete['id']}", headers=headers)
        assert del_resp.status_code == 204

        list_resp = await async_client.get("/api/v1/tasks", headers=headers)
        assert list_resp.status_code == 200
        tasks = list_resp.json()
        task_ids = [t["id"] for t in tasks]

        assert task["id"] in task_ids
        assert task_to_delete["id"] not in task_ids

    @pytest.mark.asyncio
    async def test_get_soft_deleted_task_returns_404(self, async_client):
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}
        task = await create_task(async_client, token, {"titulo": "Tarea para Soft Delete", "categoria": "LIMPIEZA"})

        await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)

        get_resp = await async_client.get(f"/api/v1/tasks/{task['id']}", headers=headers)
        assert get_resp.status_code == 404
        assert get_resp.json()["detail"] == "Tarea no encontrada"

    @pytest.mark.asyncio
    async def test_update_soft_deleted_task_returns_404(self, async_client):
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}
        task = await create_task(async_client, token, {"titulo": "Tarea antes de PUT", "categoria": "MANTENIMIENTO"})
        await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)

        put_resp = await async_client.put(
            f"/api/v1/tasks/{task['id']}",
            headers=headers,
            json={"titulo": "Intento de actualización", "categoria": "MANTENIMIENTO"}
        )
        assert put_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_already_deleted_task_returns_404(self, async_client):
        _user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}
        task = await create_task(async_client, token, {"titulo": "Tarea Borrar Dos Veces", "categoria": "OTRO"})

        first_del = await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
        assert first_del.status_code == 204

        second_del = await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
        assert second_del.status_code == 404

class TestIDORProtection:
    @pytest.mark.asyncio
    async def test_get_other_user_task_returns_403(self, async_client):
        _user_a, token_a = await create_user_and_token(async_client)
        _user_b, token_b = await create_user_and_token(async_client)
        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Confidencial A", "categoria": "OTRO"})

        resp = await async_client.get(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_update_other_user_task_returns_404(self, async_client):
        _user_a, token_a = await create_user_and_token(async_client)
        _user_b, token_b = await create_user_and_token(async_client)
        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Original A", "categoria": "OTRO"})

        resp = await async_client.put(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"titulo": "Hack por B", "categoria": "OTRO"}
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_other_user_task_returns_404(self, async_client):
        _user_a, token_a = await create_user_and_token(async_client)
        _user_b, token_b = await create_user_and_token(async_client)
        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Importante A", "categoria": "OTRO"})

        resp = await async_client.delete(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert resp.status_code == 404

class TestAuthenticationAnd401:
    @pytest.mark.asyncio
    async def test_missing_authorization_header_returns_401(self, async_client):
        endpoints = [
            ("GET", "/api/v1/auth/me"),
            ("GET", "/api/v1/tasks"),
            ("POST", "/api/v1/tasks"),
        ]

        for method, path in endpoints:
            response = await async_client.request(method, path)
            assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_format_returns_401(self, async_client):
        invalid_headers = [
            {"Authorization": "InvalidTokenWithoutBearer"},
            {"Authorization": "Bearer token_completamente_invalido_xyz123"},
        ]

        for headers in invalid_headers:
            resp = await async_client.get("/api/v1/tasks", headers=headers)
            assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_token_returns_401(self, async_client):
        user, _ = await create_user_and_token(async_client)
        expired_payload = {
            "sub": str(user["id"]),
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(hours=1)
        }
        expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)

        resp = await async_client.get(
            "/api/v1/tasks",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert resp.status_code == 401
