from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.gamification import (
    HouseholdReward,
    PointTransaction,
    RewardRedemption,
    UserRoomGamification,
)
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.task import Task
from app.models.user import Usuario
from app.schemas.gamification import GamificationOverview, LeaderboardEntry
from app.services.events import event_broadcaster
from app.services.lock import distributed_lock


async def get_or_create_user_gamification(
    room_id: UUID,
    user_id: UUID,
    session: AsyncSession,
) -> UserRoomGamification:
    """Obtiene o inicializa el registro de gamificación de un usuario en un hogar."""
    stmt = select(UserRoomGamification).where(
        UserRoomGamification.room_id == room_id,
        UserRoomGamification.user_id == user_id,
    )
    result = await session.exec(stmt)
    gam = result.one_or_none()
    if not gam:
        gam = UserRoomGamification(
            room_id=room_id,
            user_id=user_id,
            points_balance=0,
            lifetime_points=0,
            current_streak=0,
            longest_streak=0,
            streak_freeze_available=1,
            last_completed_date=None,
        )
        session.add(gam)
        await session.flush()
    return gam


async def _verify_room_membership(
    room_id: UUID,
    user_id: UUID,
    session: AsyncSession,
) -> Room:
    """Verifica si el usuario es dueño o miembro activo del hogar."""
    room = await session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado",
        )
    if room.owner_id == user_id:
        return room

    member_stmt = select(RoomMember).where(
        RoomMember.room_id == room_id,
        RoomMember.user_id == user_id,
    )
    member = (await session.exec(member_stmt)).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a este hogar",
        )
    return room


async def award_task_points(
    task: Task,
    user: Usuario,
    session: AsyncSession,
) -> int:
    """
    Calcula y otorga puntos al completar una tarea de un hogar.
    Aplica multiplicador de puntualidad (1.2x antes de plazo, 1.0x a tiempo, 0.8x atrasado).
    Actualiza racha diaria con soporte de Streak Freeze y protege contra double-spending con distributed_lock.
    """
    if not task.room_id:
        return 0

    lock_name = f"gamification:{task.room_id}:{user.id}"
    async with distributed_lock(lock_name):
        # 1. Comprobación anti-double spending en el libro contable inmutable
        existing_tx = await session.exec(
            select(PointTransaction).where(
                PointTransaction.task_id == task.id,
                PointTransaction.user_id == user.id,
                PointTransaction.action_type == "TASK_COMPLETED",
            )
        )
        if existing_tx.first() is not None:
            return 0

        # 2. Multiplicador de puntualidad
        now = datetime.now(UTC)
        today = now.date()
        multiplier = 1.0

        if task.due_date is not None:
            due_date = task.due_date if task.due_date.tzinfo else task.due_date.replace(tzinfo=UTC)
            due_day = due_date.date()
            if today < due_day:
                multiplier = 1.2
            elif today == due_day:
                multiplier = 1.0
            else:
                multiplier = 0.8

        base_points = 10
        awarded_points = max(1, round(base_points * multiplier))


        # 3. Lógica de rachas diarias y consumo de Streak Freeze
        gam = await get_or_create_user_gamification(task.room_id, user.id, session)

        if gam.last_completed_date is None:
            gam.current_streak = 1
        elif gam.last_completed_date == today:
            # Ya completó tareas hoy; la racha se preserva sin incremento
            pass
        elif gam.last_completed_date == today - timedelta(days=1):
            # Día inmediatamente consecutivo
            gam.current_streak += 1
        elif gam.last_completed_date == today - timedelta(days=2):
            # Omitió un día: verificar Streak Freeze
            if gam.streak_freeze_available > 0:
                gam.streak_freeze_available -= 1
                gam.current_streak += 1
            else:
                gam.current_streak = 1
        else:
            # Omitió dos o más días
            gam.current_streak = 1

        gam.longest_streak = max(gam.longest_streak, gam.current_streak)
        gam.last_completed_date = today

        # 4. Actualización atómica de balances
        gam.points_balance += awarded_points
        gam.lifetime_points += awarded_points
        gam.updated_at = now
        session.add(gam)

        # 5. Registro contable inmutable
        tx = PointTransaction(
            room_id=task.room_id,
            user_id=user.id,
            task_id=task.id,
            action_type="TASK_COMPLETED",
            points=awarded_points,
            created_at=now,
        )
        session.add(tx)

        await session.commit()
        await session.refresh(gam)

        # 6. Notificaciones reactivas vía SSE
        await event_broadcaster.broadcast(
            task.room_id,
            "POINTS_AWARDED",
            {
                "user_id": str(user.id),
                "points": awarded_points,
                "task_id": str(task.id),
                "new_balance": gam.points_balance,
            },
        )
        await event_broadcaster.broadcast(
            task.room_id,
            "STREAK_UPDATED",
            {
                "user_id": str(user.id),
                "current_streak": gam.current_streak,
                "longest_streak": gam.longest_streak,
            },
        )

        return awarded_points


async def redeem_reward(
    room_id: UUID,
    reward_id: UUID,
    user: Usuario,
    session: AsyncSession,
) -> RewardRedemption:
    """Canjea una recompensa del catálogo deduciendo puntos atómicamente."""
    await _verify_room_membership(room_id, user.id, session)

    reward = await session.get(HouseholdReward, reward_id)
    if not reward or reward.room_id != room_id or reward.deleted_at is not None or not reward.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recompensa no encontrada o inactiva",
        )

    lock_name = f"gamification:{room_id}:{user.id}"
    async with distributed_lock(lock_name):
        gam = await get_or_create_user_gamification(room_id, user.id, session)
        if gam.points_balance < reward.cost_points:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Puntos insuficientes ({gam.points_balance} disponibles, {reward.cost_points} requeridos)",
            )

        now = datetime.now(UTC)
        gam.points_balance -= reward.cost_points
        gam.updated_at = now
        session.add(gam)

        tx = PointTransaction(
            room_id=room_id,
            user_id=user.id,
            task_id=None,
            action_type="REWARD_REDEEMED",
            points=-reward.cost_points,
            created_at=now,
        )
        session.add(tx)

        redemption = RewardRedemption(
            reward_id=reward.id,
            room_id=room_id,
            user_id=user.id,
            status="APPROVED",
            points_spent=reward.cost_points,
            created_at=now,
        )
        session.add(redemption)

        await session.commit()
        await session.refresh(redemption)

        await event_broadcaster.broadcast(
            room_id,
            "REWARD_REDEEMED",
            {
                "redemption_id": str(redemption.id),
                "reward_id": str(reward.id),
                "reward_title": reward.title,
                "user_id": str(user.id),
                "points_spent": reward.cost_points,
                "new_balance": gam.points_balance,
            },
        )

        return redemption


async def get_gamification_overview(
    room_id: UUID,
    current_user: Usuario,
    session: AsyncSession,
) -> GamificationOverview:
    """Retorna el estado de gamificación del usuario actual y la tabla de clasificación del hogar."""
    room = await _verify_room_membership(room_id, current_user.id, session)

    user_gam = await get_or_create_user_gamification(room_id, current_user.id, session)

    # Identificar todos los miembros del hogar
    member_stmts = select(RoomMember.user_id).where(RoomMember.room_id == room_id)
    member_user_ids = set((await session.exec(member_stmts)).all())
    member_user_ids.add(room.owner_id)

    users_stmt = select(Usuario).where(Usuario.id.in_(member_user_ids))
    users = (await session.exec(users_stmt)).all()
    user_name_map = {u.id: u.nombre or "Usuario" for u in users}

    gam_stmt = select(UserRoomGamification).where(
        UserRoomGamification.room_id == room_id,
        UserRoomGamification.user_id.in_(member_user_ids),
    )
    all_gams = (await session.exec(gam_stmt)).all()
    gam_by_user = {g.user_id: g for g in all_gams}

    leaderboard: list[LeaderboardEntry] = []
    for uid, name in user_name_map.items():
        g = gam_by_user.get(uid)
        p_balance = g.points_balance if g else 0
        l_points = g.lifetime_points if g else 0
        c_streak = g.current_streak if g else 0
        level = max(1, (l_points // 50) + 1)
        leaderboard.append(
            LeaderboardEntry(
                user_id=uid,
                nombre=name,
                points_balance=p_balance,
                lifetime_points=l_points,
                current_streak=c_streak,
                level=level,
            )
        )

    # Ordenar por lifetime_points desc, points_balance desc
    leaderboard.sort(key=lambda x: (x.lifetime_points, x.points_balance), reverse=True)

    return GamificationOverview(
        user_balance=user_gam.points_balance,
        user_current_streak=user_gam.current_streak,
        user_longest_streak=user_gam.longest_streak,
        streak_freeze_available=user_gam.streak_freeze_available,
        last_completed_date=user_gam.last_completed_date,
        leaderboard=leaderboard,
    )
