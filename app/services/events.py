import asyncio
import json
import logging
from collections import defaultdict
from typing import Any
from uuid import UUID

from app.core.config import settings

logger = logging.getLogger(__name__)

INVALIDATING_EVENTS = {
    "TASK_CREATED",
    "TASK_UPDATED",
    "TASK_DELETED",
    "POINTS_AWARDED",
    "SUBTASK_TOGGLED",
    "COMMENT_ADDED",
    "TASK_ASSIGNED",
    "MEMBER_JOINED",
    "MEMBER_EVICTED",
}


class DistributedRoomEventBroadcaster:
    """Gestor distribuido de Server-Sent Events (SSE) con Redis Pub/Sub,

    colas de clientes acotadas (maxsize=100) con política Drop-Oldest,
    y fallback transparente en memoria.
    """

    def __init__(self, redis_url: str | None = None) -> None:
        self._subscribers: dict[UUID, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._redis_url = redis_url if redis_url is not None else settings.REDIS_URL
        self._pub_client = None
        self._sub_client = None
        self._consumer_task: asyncio.Task | None = None
        self._running: bool = False

    async def _get_pub_client(self):
        if self._pub_client is None and self._redis_url:
            try:
                import redis.asyncio as aioredis

                self._pub_client = aioredis.from_url(
                    self._redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
            except Exception as exc:
                logger.warning("Fallo al inicializar Redis publisher para SSE (%s)", exc)
                self._pub_client = None
        return self._pub_client

    async def start(self) -> None:
        """Inicia el suscriptor Pub/Sub en segundo plano si Redis está disponible."""
        if self._running or not self._redis_url:
            return

        self._running = True
        self._consumer_task = asyncio.create_task(self._redis_consumer_loop())
        logger.info("DistributedRoomEventBroadcaster iniciado con Redis Pub/Sub.")

    async def stop(self) -> None:
        """Detiene el consumidor en segundo plano y cierra conexiones."""
        self._running = False
        if self._consumer_task and not self._consumer_task.done():
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                logger.debug("Distributed consumer task cancelled cleanly.")
            self._consumer_task = None

        if self._pub_client:
            try:
                await self._pub_client.aclose()
            except Exception as exc:
                logger.debug("Error closing pub client: %s", exc)
            self._pub_client = None

        if self._sub_client:
            try:
                await self._sub_client.aclose()
            except Exception as exc:
                logger.debug("Error closing sub client: %s", exc)
            self._sub_client = None

        logger.info("DistributedRoomEventBroadcaster detenido.")

    async def _redis_consumer_loop(self) -> None:
        """Bucle consumidor asíncrono para mensajes distribuidos vía Redis Pub/Sub."""
        import redis.asyncio as aioredis

        while self._running:
            try:
                if self._sub_client is None:
                    self._sub_client = aioredis.from_url(
                        self._redis_url,
                        encoding="utf-8",
                        decode_responses=True,
                    )
                pubsub = self._sub_client.pubsub()
                await pubsub.psubscribe("events:room:*")

                while self._running:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if msg and msg.get("type") in ("pmessage", "message"):
                        channel = msg.get("channel", "")
                        room_id_str = channel.split(":")[-1]
                        try:
                            room_id = UUID(room_id_str)
                            payload = json.loads(msg.get("data", "{}"))
                            self._deliver_local(room_id, payload)
                        except Exception as e:
                            logger.debug("Error procesando mensaje Redis PubSub: %s", e)
                    await asyncio.sleep(0.01)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("Reconectando consumidor Redis Pub/Sub tras error: %s", exc)
                self._sub_client = None
                await asyncio.sleep(1.0)

    async def subscribe(self, room_id: UUID) -> asyncio.Queue:
        """Suscribe un cliente con cola acotada (maxsize=100)."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers[room_id].add(queue)
        logger.debug(
            "Cliente suscrito a sala %s. Total suscriptores locales: %d",
            room_id,
            len(self._subscribers[room_id]),
        )
        return queue

    async def unsubscribe(self, room_id: UUID, queue: asyncio.Queue) -> None:
        """Desuscribe y libera la cola local."""
        async with self._lock:
            if room_id in self._subscribers:
                self._subscribers[room_id].discard(queue)
                if not self._subscribers[room_id]:
                    del self._subscribers[room_id]
        logger.debug("Cliente desuscrito de sala %s", room_id)

    def _deliver_local(self, room_id: UUID, message: dict[str, Any]) -> None:
        """Entrega un mensaje a los suscriptores locales aplicando política Drop-Oldest si la cola está llena."""
        queues = list(self._subscribers.get(room_id, []))
        for q in queues:
            if q.full():
                try:
                    q.get_nowait()  # Drop-Oldest: descartar el evento más antiguo
                except (asyncio.QueueEmpty, Exception) as exc:
                    logger.debug("Drop-oldest queue evict notice: %s", exc)
            try:
                q.put_nowait(message)
            except (asyncio.QueueFull, Exception) as e:
                logger.warning("Error entregando a cola SSE de sala %s: %s", room_id, e)

    async def _invalidate_analytics(self, room_id: UUID, event_type: str) -> None:
        if event_type in INVALIDATING_EVENTS:
            try:
                from app.services.analytics import invalidate_room_analytics_cache

                await invalidate_room_analytics_cache(room_id)
            except Exception as exc:
                logger.debug("Fallo invalidando analítica tras evento %s: %s", event_type, exc)

    async def broadcast(self, room_id: UUID, event_type: str, data: dict[str, Any]) -> None:
        """Emite un evento a través de Redis Pub/Sub o localmente si Redis no está activo."""
        message = {
            "event": event_type,
            "data": data,
        }

        # 1. Invalidación reactiva de analítica
        await self._invalidate_analytics(room_id, event_type)

        # 2. Publicación distribuida en Redis o fallback local
        pub = await self._get_pub_client()
        if pub is not None and self._running:
            try:
                channel = f"events:room:{room_id}"
                await pub.publish(channel, json.dumps(message))
                return
            except Exception as exc:
                logger.warning("Fallo en Redis Pub/Sub broadcast (%s); fallback local.", exc)

        # Fallback local
        self._deliver_local(room_id, message)

    def count_subscribers(self, room_id: UUID) -> int:
        """Retorna la cantidad de suscriptores activos en el nodo local."""
        return len(self._subscribers.get(room_id, set()))


RoomEventBroadcaster = DistributedRoomEventBroadcaster

# Singleton del bus de eventos
event_broadcaster = DistributedRoomEventBroadcaster()
