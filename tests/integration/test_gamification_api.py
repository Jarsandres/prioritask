import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea, RoomMemberRole
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.task import Task
from app.models.user import Usuario


@pytest.mark.asyncio

async def test_gamification_endpoints_lifecycle(
    async_client: AsyncClient,
    session: AsyncSession,
    user_a: Usuario,
    user_a_headers: dict[str, str],
    user_b: Usuario,
    user_b_headers: dict[str, str],
    room_owner_a: Room,
):
    """
    Prueba el ciclo de vida completo de gamificación vía API:
    1. Consultar resumen de gamificación inicial.
    2. Crear recompensa como admin/dueño del hogar.
    3. Completar tarea y verificar otorgamiento de puntos y racha.
    4. Canjear recompensa con puntos acumulados.
    """
    # Agregar user_b como miembro ordinario
    member_b = RoomMember(room_id=room_owner_a.id, user_id=user_b.id, role=RoomMemberRole.MEMBER)
    session.add(member_b)
    await session.commit()

    # 1. Consultar resumen inicial de user_a
    res_overview = await async_client.get(
        f"/api/v1/rooms/{room_owner_a.id}/gamification",
        headers=user_a_headers,
    )
    assert res_overview.status_code == 200
    overview_data = res_overview.json()
    assert overview_data["user_balance"] == 0
    assert overview_data["streak_freeze_available"] == 1

    # 2. Intentar crear recompensa como miembro ordinario (user_b) -> 403 Forbidden
    res_forbidden = await async_client.post(
        f"/api/v1/rooms/{room_owner_a.id}/rewards",
        json={"title": "Tarde Libre", "cost_points": 10},
        headers=user_b_headers,
    )
    assert res_forbidden.status_code == 403

    # Crear recompensa como dueño (user_a) -> 201 Created
    res_reward = await async_client.post(
        f"/api/v1/rooms/{room_owner_a.id}/rewards",
        json={"title": "Cena Especial", "cost_points": 10, "icon_name": "pizza"},
        headers=user_a_headers,
    )
    assert res_reward.status_code == 201
    reward_data = res_reward.json()
    reward_id = reward_data["id"]
    assert reward_data["title"] == "Cena Especial"
    assert reward_data["cost_points"] == 10

    # Listar catálogo de recompensas
    res_catalog = await async_client.get(
        f"/api/v1/rooms/{room_owner_a.id}/rewards",
        headers=user_a_headers,
    )
    assert res_catalog.status_code == 200
    assert len(res_catalog.json()) == 1

    # 3. Crear una tarea para user_a y completarla
    task = Task(
        titulo="Limpiar el salón a fondo",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)

    # Completar la tarea vía PATCH /tasks/{task_id}/status
    patch_resp = await async_client.patch(
        f"/api/v1/tasks/{task.id}/status",
        json={"estado": "DONE"},
        headers=user_a_headers,
    )
    assert patch_resp.status_code == 200

    # Verificar que el usuario recibió puntos y actualizó racha
    res_overview2 = await async_client.get(
        f"/api/v1/rooms/{room_owner_a.id}/gamification",
        headers=user_a_headers,
    )
    assert res_overview2.status_code == 200
    data2 = res_overview2.json()
    assert data2["user_balance"] == 10  # 10 puntos base a tiempo
    assert data2["user_current_streak"] == 1

    # 4. Canjear recompensa (cuesta 10 puntos, usuario tiene 10)
    res_redeem = await async_client.post(
        f"/api/v1/rooms/{room_owner_a.id}/rewards/{reward_id}/redeem",
        headers=user_a_headers,
    )
    assert res_redeem.status_code == 200
    redeem_data = res_redeem.json()
    assert redeem_data["status"] == "APPROVED"
    assert redeem_data["points_spent"] == 10

    # Verificar que el balance quedó en 0
    res_overview3 = await async_client.get(
        f"/api/v1/rooms/{room_owner_a.id}/gamification",
        headers=user_a_headers,
    )
    assert res_overview3.json()["user_balance"] == 0

    # 5. Intentar canjear de nuevo sin saldo -> 400 Bad Request
    res_redeem_fail = await async_client.post(
        f"/api/v1/rooms/{room_owner_a.id}/rewards/{reward_id}/redeem",
        headers=user_a_headers,
    )
    assert res_redeem_fail.status_code == 400
