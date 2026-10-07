import asyncio
import logging
from collections import defaultdict
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)


class RoomEventBroadcaster:
    """
    Gestor de eventos en memoria desacoplado para Server-Sent Events (SSE).
    Gestiona colas asyncio.Queue por suscriptor vinculado a un room_id.
    """

    def __init__(self) -> None:
        self._subscribers: dict[UUID, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, room_id: UUID) -> asyncio.Queue:
        """Suscribe un cliente al canal de eventos de una sala y retorna su cola."""
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._subscribers[room_id].add(queue)
        logger.debug(
            "Cliente suscrito a la sala %s. Suscriptores activos: %d",
            room_id,
            len(self._subscribers[room_id]),
        )
        return queue

    async def unsubscribe(self, room_id: UUID, queue: asyncio.Queue) -> None:
        """Desuscribe y libera la cola del broadcaster para evitar fugas de memoria."""
        async with self._lock:
            if room_id in self._subscribers:
                self._subscribers[room_id].discard(queue)
                if not self._subscribers[room_id]:
                    del self._subscribers[room_id]
        logger.debug("Cliente desuscrito de la sala %s", room_id)

    async def broadcast(self, room_id: UUID, event_type: str, data: dict[str, Any]) -> None:
        """Emite un evento a todos los clientes suscritos al room_id indicado."""
        async with self._lock:
            queues = list(self._subscribers.get(room_id, []))

        if not queues:
            return

        message = {
            "event": event_type,
            "data": data,
        }

        for q in queues:
            try:
                q.put_nowait(message)
            except Exception as e:
                logger.warning("Error enviando evento a la cola de la sala %s: %s", room_id, e)

    def count_subscribers(self, room_id: UUID) -> int:
        """Retorna la cantidad de suscriptores activos para una sala."""
        return len(self._subscribers.get(room_id, set()))


# Singleton del bus de eventos
event_broadcaster = RoomEventBroadcaster()
