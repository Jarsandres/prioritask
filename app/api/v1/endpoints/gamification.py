from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.models.enums import RoomMemberRole
from app.models.gamification import HouseholdReward
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.user import Usuario
from app.schemas.gamification import (
    GamificationOverview,
    RedemptionRead,
    RewardCreate,
    RewardRead,
)
from app.services.auth import get_current_user
from app.services.gamification import (
    _verify_room_membership,
    get_gamification_overview,
    redeem_reward,
)

router = APIRouter(prefix="/rooms", tags=["Gamificación"])


async def _verify_admin_access(
    room_id: UUID,
    current_user: Usuario,
    session: AsyncSession,
) -> Room:
    """Verifica que el usuario sea propietario, superusuario o administrador del hogar."""
    room = await session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hogar no encontrado",
        )
    if room.owner_id == current_user.id or getattr(current_user, "is_superuser", False):
        return room

    member_stmt = select(RoomMember).where(
        RoomMember.room_id == room_id,
        RoomMember.user_id == current_user.id,
    )
    member = (await session.exec(member_stmt)).first()
    if not member or member.role != RoomMemberRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores del hogar pueden gestionar recompensas",
        )
    return room


@router.get(
    "/{room_id}/gamification",
    response_model=GamificationOverview,
    summary="Resumen de gamificación y clasificación",
    description="Obtiene el balance de puntos, racha del usuario y la tabla de clasificación del hogar.",
)
async def get_room_gamification(
    room_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    return await get_gamification_overview(
        room_id=room_id,
        current_user=current_user,
        session=session,
    )


@router.get(
    "/{room_id}/rewards",
    response_model=list[RewardRead],
    summary="Catálogo de recompensas",
    description="Lista todas las recompensas activas disponibles en el hogar.",
)
async def list_room_rewards(
    room_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    await _verify_room_membership(room_id, current_user.id, session)

    stmt = (
        select(HouseholdReward)
        .where(
            HouseholdReward.room_id == room_id,
            HouseholdReward.is_active.is_(True),
            HouseholdReward.deleted_at.is_(None),
        )
        .order_by(HouseholdReward.cost_points.asc())
    )
    rewards = (await session.exec(stmt)).all()
    return rewards


@router.post(
    "/{room_id}/rewards",
    response_model=RewardRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear recompensa",
    description="Crea una nueva recompensa en el hogar (requiere rol de administrador o dueño).",
)
async def create_room_reward(
    room_id: UUID,
    payload: RewardCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    await _verify_admin_access(room_id, current_user, session)

    reward = HouseholdReward(
        room_id=room_id,
        title=payload.title,
        description=payload.description,
        cost_points=payload.cost_points,
        icon_name=payload.icon_name or "gift",
        is_active=True,
    )
    session.add(reward)
    await session.commit()
    await session.refresh(reward)
    return reward


@router.post(
    "/{room_id}/rewards/{reward_id}/redeem",
    response_model=RedemptionRead,
    status_code=status.HTTP_200_OK,
    summary="Canjear recompensa",
    description="Canjea una recompensa descontando puntos de forma atómica.",
)
async def redeem_room_reward(
    room_id: UUID,
    reward_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: Usuario = Depends(get_current_user),
):
    return await redeem_reward(
        room_id=room_id,
        reward_id=reward_id,
        user=current_user,
        session=session,
    )
