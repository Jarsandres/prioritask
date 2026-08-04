"""
Batería de pruebas unitarias y de integración (SDET) para la API de Prioritask.
Cubre casos críticos:
1. Soft Delete: Inaccesibilidad de tareas eliminadas lógicamente.
2. IDOR (Insecure Direct Object Reference): Inaccesibilidad / aislamiento entre usuarios.
3. Autenticación y JWT: Respuestas HTTP 401 para tokens inválidos, expirados o malformados.
"""

from datetime import datetime, timedelta, timezone
import pytest
from uuid import uuid4
from jose import jwt

from app.services.auth import ALGORITHM, SECRET_KEY
from tests.utils import create_user_and_token, create_task


# ==============================================================================
# 1. PRUEBAS DE SOFT DELETE
# ==============================================================================
class TestSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_deleted_task_hidden_from_list(self, async_client):
        """Verifica que una tarea eliminada lógicamente no aparezca en la lista general."""
        user, token = await create_user_and_token(async_client)
        task = await create_task(async_client, token, {"titulo": "Tarea Activa", "categoria": "OTRO"})
        task_to_delete = await create_task(async_client, token, {"titulo": "Tarea Borrada", "categoria": "COMPRA"})

        headers = {"Authorization": f"Bearer {token}"}

        # Eliminar la segunda tarea
        del_resp = await async_client.delete(f"/api/v1/tasks/{task_to_delete['id']}", headers=headers)
        assert del_resp.status_code == 204

        # Listar tareas y verificar que la eliminada no esté presente
        list_resp = await async_client.get("/api/v1/tasks", headers=headers)
        assert list_resp.status_code == 200
        tasks = list_resp.json()
        task_ids = [t["id"] for t in tasks]

        assert task["id"] in task_ids
        assert task_to_delete["id"] not in task_ids

    @pytest.mark.asyncio
    async def test_get_soft_deleted_task_returns_404(self, async_client):
        """Verifica que intentar obtener por ID una tarea eliminada retorne HTTP 404."""
        user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea para Soft Delete", "categoria": "LIMPIEZA"})

        # Eliminar tarea
        await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)

        # GET directo a la tarea borrada debe devolver 404
        get_resp = await async_client.get(f"/api/v1/tasks/{task['id']}", headers=headers)
        assert get_resp.status_code == 404
        assert get_resp.json()["detail"] == "Tarea no encontrada"

    @pytest.mark.asyncio
    async def test_update_soft_deleted_task_returns_404(self, async_client):
        """Verifica que actualizar (PUT) una tarea eliminada retorne HTTP 404."""
        user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea antes de PUT", "categoria": "MANTENIMIENTO"})
        await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)

        put_resp = await async_client.put(
            f"/api/v1/tasks/{task['id']}",
            headers=headers,
            json={"titulo": "Intento de actualización", "categoria": "MANTENIMIENTO"}
        )
        assert put_resp.status_code == 404
        assert put_resp.json()["detail"] == "Tarea no encontrada"

    @pytest.mark.asyncio
    async def test_patch_soft_deleted_task_returns_404(self, async_client):
        """Verifica que modificar parcialmente (PATCH) una tarea eliminada retorne HTTP 404."""
        user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea antes de PATCH", "categoria": "OTRO"})
        await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)

        patch_resp = await async_client.patch(
            f"/api/v1/tasks/{task['id']}",
            headers=headers,
            json={"titulo": "Título Parcheado"}
        )
        assert patch_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_patch_status_soft_deleted_task_returns_404(self, async_client):
        """Verifica que cambiar el estado de una tarea eliminada retorne HTTP 404."""
        user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea Estado", "categoria": "OTRO"})
        await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)

        patch_status_resp = await async_client.patch(
            f"/api/v1/tasks/{task['id']}/status",
            headers=headers,
            json={"estado": "DONE"}
        )
        assert patch_status_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_already_deleted_task_returns_404(self, async_client):
        """Verifica que intentar eliminar por segunda vez una tarea eliminada retorne HTTP 404."""
        user, token = await create_user_and_token(async_client)
        headers = {"Authorization": f"Bearer {token}"}

        task = await create_task(async_client, token, {"titulo": "Tarea Borrar Dos Veces", "categoria": "OTRO"})

        first_del = await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
        assert first_del.status_code == 204

        second_del = await async_client.delete(f"/api/v1/tasks/{task['id']}", headers=headers)
        assert second_del.status_code == 404


# ==============================================================================
# 2. PRUEBAS DE PROTECCIÓN CONTRA IDOR (Insecure Direct Object Reference)
# ==============================================================================
class TestIDORProtection:
    @pytest.mark.asyncio
    async def test_get_other_user_task_returns_403(self, async_client):
        """Verifica que un usuario no pueda leer la tarea de otro usuario (403 Forbidden)."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Confidencial de User A", "categoria": "OTRO"})

        # User B intenta acceder a la tarea de User A
        resp = await async_client.get(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert resp.status_code == 403
        assert "No tienes permiso" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_update_other_user_task_returns_404(self, async_client):
        """Verifica que un usuario no pueda actualizar (PUT) la tarea de otro usuario (404 Not Found)."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Original User A", "categoria": "OTRO"})

        # User B intenta editar la tarea de User A
        resp = await async_client.put(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"titulo": "Hack por User B", "categoria": "OTRO"}
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_patch_other_user_task_returns_404(self, async_client):
        """Verifica que un usuario no pueda hacer PATCH a la tarea de otro usuario (404 Not Found)."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        task_a = await create_task(async_client, token_a, {"titulo": "Tarea PATCH User A", "categoria": "LIMPIEZA"})

        resp = await async_client.patch(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"titulo": "Hack PATCH"}
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_patch_status_other_user_task_returns_404(self, async_client):
        """Verifica que un usuario no pueda modificar el estado de la tarea de otro usuario."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Estado User A", "categoria": "LIMPIEZA"})

        resp = await async_client.patch(
            f"/api/v1/tasks/{task_a['id']}/status",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"estado": "DONE"}
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_other_user_task_returns_404(self, async_client):
        """Verifica que un usuario no pueda eliminar la tarea de otro usuario (404 Not Found)."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Importante User A", "categoria": "OTRO"})

        # User B intenta borrar la tarea de User A
        resp = await async_client.delete(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert resp.status_code == 404

        # Verificar que la tarea de User A siga existiendo intacta
        get_a = await async_client.get(
            f"/api/v1/tasks/{task_a['id']}",
            headers={"Authorization": f"Bearer {token_a}"}
        )
        assert get_a.status_code == 200

    @pytest.mark.asyncio
    async def test_list_tasks_does_not_leak_other_user_tasks(self, async_client):
        """Verifica que el listado de tareas filtre strictly por el usuario autenticado."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        task_a = await create_task(async_client, token_a, {"titulo": "Tarea Exclusiva A", "categoria": "OTRO"})
        task_b = await create_task(async_client, token_b, {"titulo": "Tarea Exclusiva B", "categoria": "COMPRA"})

        # User A consulta la lista
        resp_a = await async_client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {token_a}"})
        assert resp_a.status_code == 200
        tasks_a_ids = [t["id"] for t in resp_a.json()]
        assert task_a["id"] in tasks_a_ids
        assert task_b["id"] not in tasks_a_ids

        # User B consulta la lista
        resp_b = await async_client.get("/api/v1/tasks", headers={"Authorization": f"Bearer {token_b}"})
        assert resp_b.status_code == 200
        tasks_b_ids = [t["id"] for t in resp_b.json()]
        assert task_b["id"] in tasks_b_ids
        assert task_a["id"] not in tasks_b_ids

    @pytest.mark.asyncio
    async def test_history_does_not_leak_other_user_events(self, async_client):
        """Verifica que el historial general de tareas no filtre eventos de otros usuarios."""
        user_a, token_a = await create_user_and_token(async_client)
        user_b, token_b = await create_user_and_token(async_client)

        await create_task(async_client, token_a, {"titulo": "Tarea Historial A", "categoria": "OTRO"})
        await create_task(async_client, token_b, {"titulo": "Tarea Historial B", "categoria": "COMPRA"})

        resp_b = await async_client.get("/api/v1/tasks/history", headers={"Authorization": f"Bearer {token_b}"})
        assert resp_b.status_code == 200
        history_b = resp_b.json()
        for item in history_b:
            assert item["user_id"] == user_b["id"]


# ==============================================================================
# 3. PRUEBAS DE AUTENTICACIÓN Y MANEJO DE TOKENS (CÓDIGO HTTP 401)
# ==============================================================================
class TestAuthenticationAnd401:
    @pytest.mark.asyncio
    async def test_missing_authorization_header_returns_401(self, async_client):
        """Petición a un endpoint protegido sin cabecera Authorization debe devolver HTTP 401."""
        endpoints = [
            ("GET", "/api/v1/auth/me"),
            ("POST", "/api/v1/auth/refresh"),
            ("GET", "/api/v1/tasks"),
            ("POST", "/api/v1/tasks"),
        ]

        for method, path in endpoints:
            response = await async_client.request(method, path)
            assert response.status_code == 401, f"Falló {method} {path}: se esperaba 401, se obtuvo {response.status_code}"

    @pytest.mark.asyncio
    async def test_invalid_token_format_returns_401(self, async_client):
        """Petición con token malformado o sin formato 'Bearer <token>' debe devolver HTTP 401."""
        invalid_headers = [
            {"Authorization": "InvalidTokenWithoutBearer"},
            {"Authorization": "Bearer token_completamente_invalido_xyz123"},
            {"Authorization": "Basic text_base64_fake"},
        ]

        for headers in invalid_headers:
            resp = await async_client.get("/api/v1/tasks", headers=headers)
            assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_token_returns_401(self, async_client):
        """Un token JWT cuya fecha de expiración ('exp') haya pasado debe devolver HTTP 401."""
        user, _ = await create_user_and_token(async_client)

        # Crear un token expirado manualmente (exp hace 1 hora)
        expired_payload = {
            "sub": str(user["id"]),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1)
        }
        expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)

        resp = await async_client.get(
            "/api/v1/tasks",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_token_signed_with_wrong_secret_returns_401(self, async_client):
        """Un token firmado con una clave secreta incorrecta debe ser rechazado con HTTP 401."""
        user, _ = await create_user_and_token(async_client)

        payload = {
            "sub": str(user["id"]),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1)
        }
        wrong_secret_token = jwt.encode(payload, "clave-secreta-falsa-12345", algorithm=ALGORITHM)

        resp = await async_client.get(
            "/api/v1/tasks",
            headers={"Authorization": f"Bearer {wrong_secret_token}"}
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_token_nonexistent_user_returns_401(self, async_client):
        """Un token JWT válido pero con un ID de usuario inexistente en la BD debe ser rechazado con HTTP 401."""
        random_user_id = str(uuid4())
        payload = {
            "sub": random_user_id,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1)
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

        resp = await async_client.get(
            "/api/v1/tasks",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401_on_task_detail(self, async_client):
        """Verifica que acceder por ID a una tarea con un token inválido devuelva HTTP 401."""
        random_task_id = str(uuid4())
        resp = await async_client.get(
            f"/api/v1/tasks/{random_task_id}",
            headers={"Authorization": "Bearer token_invalido"}
        )
        assert resp.status_code == 401
