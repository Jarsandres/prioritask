import asyncio
from uuid import uuid4

import pytest

from app.services.events import RoomEventBroadcaster


@pytest.mark.asyncio
async def test_room_event_broadcaster_subscribe_and_unsubscribe():
    broadcaster = RoomEventBroadcaster()
    room_id = uuid4()

    assert broadcaster.count_subscribers(room_id) == 0

    queue = await broadcaster.subscribe(room_id)
    assert broadcaster.count_subscribers(room_id) == 1

    await broadcaster.unsubscribe(room_id, queue)
    assert broadcaster.count_subscribers(room_id) == 0


@pytest.mark.asyncio
async def test_room_event_broadcaster_delivery():
    broadcaster = RoomEventBroadcaster()
    room1 = uuid4()
    room2 = uuid4()

    q1 = await broadcaster.subscribe(room1)
    q2 = await broadcaster.subscribe(room1)
    q_other = await broadcaster.subscribe(room2)

    event_payload = {"task_id": "123", "title": "Prueba"}
    await broadcaster.broadcast(room1, "TASK_CREATED", event_payload)

    # Ambos suscriptores de room1 deben recibir el evento
    msg1 = await asyncio.wait_for(q1.get(), timeout=1.0)
    assert msg1["event"] == "TASK_CREATED"
    assert msg1["data"] == event_payload

    msg2 = await asyncio.wait_for(q2.get(), timeout=1.0)
    assert msg2["event"] == "TASK_CREATED"
    assert msg2["data"] == event_payload

    # El suscriptor de room2 no debe recibir nada
    assert q_other.empty()

    await broadcaster.unsubscribe(room1, q1)
    await broadcaster.unsubscribe(room1, q2)
    await broadcaster.unsubscribe(room2, q_other)


@pytest.mark.asyncio
async def test_room_event_broadcaster_no_subscribers_safe():
    broadcaster = RoomEventBroadcaster()
    room_id = uuid4()
    # No debe fallar al emitir sin suscriptores
    await broadcaster.broadcast(room_id, "TASK_UPDATED", {"info": "test"})
