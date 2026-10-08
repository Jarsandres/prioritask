import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import httpx
import pytest
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.v1.endpoints.tasks_ai import clasificar_prioridad_batch
from app.models.enums import CategoriaTarea
from app.models.room import Room
from app.models.room_member import RoomMember
from app.models.task import Task
from app.models.user import Usuario
from app.services.AI.cache import AICache, build_cache_key, normalize_prompt
from app.services.AI.ollama_client import (
    close_ollama_client,
    get_ollama_client,
)
from app.services.analytics import (
    compute_room_analytics,
)
from app.services.events import DistributedRoomEventBroadcaster
from app.services.search import SearchEngineService


# 1. AI Cache & Normalization
def test_prompt_normalization_and_cache_key():
    raw_prompt_1 = "  Café   CON LECHE\n "
    raw_prompt_2 = "café con leche"
    assert normalize_prompt(raw_prompt_1) == "café con leche"

    key1 = build_cache_key("qwen2.5:7b", raw_prompt_1)
    key2 = build_cache_key("QWEN2.5:7B", raw_prompt_2)
    assert key1 == key2
    assert key1.startswith("ai:cache:v1:qwen2.5:7b:")


@pytest.mark.asyncio
async def test_ai_cache_l1_lru_and_stats():
    cache = AICache(default_ttl=10.0, maxsize=2)
    k1 = "ai:cache:v1:test:1"
    k2 = "ai:cache:v1:test:2"
    k3 = "ai:cache:v1:test:3"

    await cache.set(k1, {"val": 1})
    await cache.set(k2, {"val": 2})

    # Access k1 to make k2 the least recently used
    assert await cache.get(k1) == {"val": 1}

    # Inserting k3 should evict k2
    await cache.set(k3, {"val": 3})

    assert await cache.get(k1) == {"val": 1}
    assert await cache.get(k2) is None  # evicted
    assert await cache.get(k3) == {"val": 3}

    stats = await cache.stats()
    assert stats["size"] == 2
    assert stats["hits"] == 3
    assert stats["misses"] == 1


# 2. Ollama Client Persistent Singleton
@pytest.mark.asyncio
async def test_ollama_persistent_singleton_client():
    client1 = get_ollama_client()
    client2 = get_ollama_client()
    assert client1 is client2
    assert isinstance(client1, httpx.AsyncClient)
    assert not client1.is_closed

    await close_ollama_client()
    assert client1.is_closed
    client3 = get_ollama_client()
    assert client3 is not client1
    assert not client3.is_closed
    await close_ollama_client()


# 3. AI Bounded Concurrency with Semaphore(4)
@pytest.mark.asyncio
async def test_bounded_concurrency_batch_eval():
    tasks = [
        Task(
            id=uuid4(),
            user_id=uuid4(),
            room_id=uuid4(),
            titulo=f"Tarea Concurrente {i}",
            categoria=CategoriaTarea.OTRO,
        )
        for i in range(10)
    ]

    max_concurrent = 0
    active_concurrent = 0
    lock = asyncio.Lock()

    async def mock_eval(task: Task):
        nonlocal max_concurrent, active_concurrent
        async with lock:
            active_concurrent += 1
            max_concurrent = max(max_concurrent, active_concurrent)
        await asyncio.sleep(0.05)
        async with lock:
            active_concurrent -= 1
        return "alta", "Motivo prueba"

    with patch(
        "app.api.v1.endpoints.tasks_ai.evaluar_prioridad_contextual",
        side_effect=mock_eval,
    ):
        results = await clasificar_prioridad_batch(tasks)
        assert len(results) == 10
        assert max_concurrent <= 4


# 4. SQL Aggregated Analytics & Read-Through Cache
@pytest.mark.asyncio
async def test_compute_room_analytics_sql_aggregation(session: AsyncSession):
    user_owner = Usuario(
        id=uuid4(),
        email=f"owner_{uuid4().hex[:6]}@example.com",
        hashed_password="pw",
        nombre="Propietario",
    )
    user_member = Usuario(
        id=uuid4(),
        email=f"member_{uuid4().hex[:6]}@example.com",
        hashed_password="pw",
        nombre="Compañero",
    )
    session.add_all([user_owner, user_member])
    await session.commit()

    room = Room(id=uuid4(), nombre="Casa Agregada", owner_id=user_owner.id)
    session.add(room)
    await session.commit()

    rm = RoomMember(room_id=room.id, user_id=user_member.id, role="MEMBER")
    session.add(rm)
    await session.commit()

    now = datetime.now(UTC)
    t1 = Task(
        titulo="Tarea Activa Vencida",
        categoria=CategoriaTarea.LIMPIEZA,
        room_id=room.id,
        user_id=user_owner.id,
        due_date=now - timedelta(hours=2),
        completed=False,
    )
    t2 = Task(
        titulo="Tarea Completada",
        categoria=CategoriaTarea.COMPRA,
        room_id=room.id,
        user_id=user_member.id,
        completed=True,
        peso=2.5,
    )
    session.add_all([t1, t2])
    await session.commit()

    analytics = await compute_room_analytics(room, session)

    assert analytics.room_id == room.id
    assert analytics.total_tareas_activas == 1
    assert analytics.total_tareas_completadas == 1
    assert analytics.tareas_vencidas == 1
    assert analytics.tasa_completitud == 50.0
    assert analytics.distribucion_por_categoria["LIMPIEZA"] == 1
    assert analytics.distribucion_por_categoria["COMPRA"] == 1

    workloads = {m.user_id: m for m in analytics.distribucion_por_miembro}
    assert user_owner.id in workloads
    assert user_member.id in workloads
    assert workloads[user_member.id].tareas_completadas == 1
    assert workloads[user_member.id].peso_total_completado == 2.5


# 5. Distributed SSE Broadcaster with Drop-Oldest Policy
@pytest.mark.asyncio
async def test_distributed_broadcaster_drop_oldest():
    broadcaster = DistributedRoomEventBroadcaster(redis_url=None)
    room_id = uuid4()
    queue = await broadcaster.subscribe(room_id)

    # Fill queue up to maxsize (100)
    for i in range(100):
        await broadcaster.broadcast(room_id, "TASK_UPDATED", {"seq": i})

    assert queue.qsize() == 100

    # 101st event should drop seq=0 and keep queue bounded
    await broadcaster.broadcast(room_id, "TASK_UPDATED", {"seq": 100})
    assert queue.qsize() == 100

    # First event popped should now be seq=1
    first_msg = await queue.get()
    assert first_msg["data"]["seq"] == 1

    await broadcaster.unsubscribe(room_id, queue)


# 6. Autocomplete in Search Engine
@pytest.mark.asyncio
async def test_search_autocomplete_command_palette(session: AsyncSession):
    user = Usuario(
        id=uuid4(),
        email=f"search_{uuid4().hex[:6]}@example.com",
        hashed_password="pw",
    )
    session.add(user)
    await session.commit()

    room = Room(id=uuid4(), nombre="Sala Search", owner_id=user.id)
    session.add(room)
    await session.commit()

    t1 = Task(
        titulo="Pagar factura de luz",
        categoria=CategoriaTarea.OTRO,
        room_id=room.id,
        user_id=user.id,
    )
    t2 = Task(
        titulo="Pagar alquiler",
        categoria=CategoriaTarea.OTRO,
        room_id=room.id,
        user_id=user.id,
    )
    session.add_all([t1, t2])
    await session.commit()

    suggestions = await SearchEngineService.autocomplete(
        query="Pagar",
        current_user=user,
        session=session,
        room_id=room.id,
    )
    assert len(suggestions) >= 2
    assert "Pagar factura de luz" in suggestions
    assert "Pagar alquiler" in suggestions


# 7. Metadata Verification of Covering Indexes
def test_covering_indexes_metadata():
    tables = SQLModel.metadata.tables

    task_table = tables.get("task")
    assert task_table is not None
    task_indexes = {idx.name: [c.name for c in idx.columns] for idx in task_table.indexes}
    assert "ix_task_room_analytics_covering" in task_indexes
    assert task_indexes["ix_task_room_analytics_covering"] == [
        "room_id",
        "deleted_at",
        "completed",
        "estado",
        "peso",
        "due_date",
        "user_id",
    ]

    gamification_table = tables.get("userroomgamification")
    assert gamification_table is not None
    gamification_indexes = {
        idx.name: [c.name for c in idx.columns] for idx in gamification_table.indexes
    }
    assert "ix_gamification_leaderboard_covering" in gamification_indexes
    assert gamification_indexes["ix_gamification_leaderboard_covering"] == [
        "room_id",
        "lifetime_points",
        "points_balance",
        "user_id",
    ]
