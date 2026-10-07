from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.enums import CategoriaTarea
from app.models.gamification import HouseholdReward
from app.models.room import Room
from app.models.task import Task
from app.models.user import Usuario
from app.services.gamification import (
    award_task_points,
    get_gamification_overview,
    get_or_create_user_gamification,
    redeem_reward,
)


@pytest.mark.asyncio

async def test_award_points_timeliness_multipliers(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Verifica que el multiplicador de puntualidad aplique correctamente (1.2x antes, 1.0x a tiempo, 0.8x tarde)."""
    now = datetime.now(UTC)

    # 1. Antes de fecha límite (early) -> 1.2x base 10 = 12 puntos
    task_early = Task(
        titulo="Tarea Anticipada",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        due_date=now + timedelta(days=2),
    )
    # 2. A tiempo (mismo día) -> 1.0x base 10 = 10 puntos
    task_ontime = Task(
        titulo="Tarea A Tiempo",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        due_date=now,
    )
    # 3. Tarde (retrasada) -> 0.8x base 10 = 8 puntos
    task_late = Task(
        titulo="Tarea Retrasada",
        categoria=CategoriaTarea.LIMPIEZA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
        due_date=now - timedelta(days=2),
    )
    session.add_all([task_early, task_ontime, task_late])
    await session.commit()

    pts_early = await award_task_points(task_early, user_a, session)
    assert pts_early == 12

    pts_ontime = await award_task_points(task_ontime, user_a, session)
    assert pts_ontime == 10

    pts_late = await award_task_points(task_late, user_a, session)
    assert pts_late == 8

    # Verificar balance acumulado: 12 + 10 + 8 = 30
    gam = await get_or_create_user_gamification(room_owner_a.id, user_a.id, session)
    assert gam.points_balance == 30
    assert gam.lifetime_points == 30


@pytest.mark.asyncio
async def test_anti_double_spending(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Verifica que no se pueda recibir puntos dos veces por la misma tarea."""
    task = Task(
        titulo="Tarea Unica",
        categoria=CategoriaTarea.COMPRA,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task)
    await session.commit()

    # Primer intento
    first_pts = await award_task_points(task, user_a, session)
    assert first_pts == 10

    # Segundo intento (misma tarea y usuario) -> debe retornar 0
    second_pts = await award_task_points(task, user_a, session)
    assert second_pts == 0

    gam = await get_or_create_user_gamification(room_owner_a.id, user_a.id, session)
    assert gam.points_balance == 10


@pytest.mark.asyncio
async def test_streak_calculation_and_freeze(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Verifica el cálculo de rachas diarias y el consumo de Streak Freeze."""
    today = datetime.now(UTC).date()
    gam = await get_or_create_user_gamification(room_owner_a.id, user_a.id, session)

    # Simular que completó ayer (día consecutivo)
    gam.last_completed_date = today - timedelta(days=1)
    gam.current_streak = 3
    gam.streak_freeze_available = 1
    session.add(gam)
    await session.commit()

    task1 = Task(
        titulo="Tarea Hoy",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task1)
    await session.commit()

    await award_task_points(task1, user_a, session)
    await session.refresh(gam)
    assert gam.current_streak == 4
    assert gam.streak_freeze_available == 1

    # Simular omisión de 1 día (antier) con freeze disponible
    gam.last_completed_date = today - timedelta(days=2)
    session.add(gam)
    await session.commit()

    task2 = Task(
        titulo="Tarea Tras Freeze",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task2)
    await session.commit()

    await award_task_points(task2, user_a, session)
    await session.refresh(gam)
    # Racha debe salvarse e incrementarse, consumiendo el freeze
    assert gam.current_streak == 5
    assert gam.streak_freeze_available == 0

    # Simular otra omisión de 1 día SIN freeze disponible -> reinicio de racha a 1
    gam.last_completed_date = today - timedelta(days=2)
    session.add(gam)
    await session.commit()

    task3 = Task(
        titulo="Tarea Tras Racha Rota",
        categoria=CategoriaTarea.OTRO,
        user_id=user_a.id,
        room_id=room_owner_a.id,
    )
    session.add(task3)
    await session.commit()

    await award_task_points(task3, user_a, session)
    await session.refresh(gam)
    assert gam.current_streak == 1


@pytest.mark.asyncio
async def test_reward_redemption_flow(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Verifica el flujo completo de canje de recompensas y control de saldo insuficiente."""
    reward = HouseholdReward(
        room_id=room_owner_a.id,
        title="Noche de Películas",
        cost_points=25,
        is_active=True,
    )
    session.add(reward)

    # Otorgar saldo de 30 puntos a user_a
    gam = await get_or_create_user_gamification(room_owner_a.id, user_a.id, session)
    gam.points_balance = 30
    session.add(gam)
    await session.commit()
    await session.refresh(reward)

    # Canje exitoso
    redemption = await redeem_reward(room_owner_a.id, reward.id, user_a, session)
    assert redemption.points_spent == 25
    assert redemption.status == "APPROVED"

    await session.refresh(gam)
    assert gam.points_balance == 5  # 30 - 25

    # Segundo intento sin saldo suficiente (tiene 5, cuesta 25)
    with pytest.raises(HTTPException) as exc_info:
        await redeem_reward(room_owner_a.id, reward.id, user_a, session)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_gamification_overview_and_leaderboard(
    session: AsyncSession,
    user_a: Usuario,
    room_owner_a: Room,
):
    """Verifica el resumen de gamificación y la estructura del leaderboard."""
    gam = await get_or_create_user_gamification(room_owner_a.id, user_a.id, session)
    gam.points_balance = 50
    gam.lifetime_points = 120
    gam.current_streak = 5
    gam.longest_streak = 7
    session.add(gam)
    await session.commit()

    overview = await get_gamification_overview(room_owner_a.id, user_a, session)
    assert overview.user_balance == 50
    assert overview.user_current_streak == 5
    assert overview.user_longest_streak == 7
    assert len(overview.leaderboard) >= 1

    entry = next(e for e in overview.leaderboard if e.user_id == user_a.id)
    assert entry.points_balance == 50
    assert entry.lifetime_points == 120
    assert entry.level == 3  # (120 // 50) + 1 = 3
