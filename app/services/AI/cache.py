import asyncio
import hashlib
import json
import logging
import time
import unicodedata
from collections import OrderedDict
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def normalize_prompt(prompt: str) -> str:
    """Normaliza un texto utilizando compatibilidad NFKC, minúsculas y recorte de espacios."""
    if not prompt:
        return ""
    normalized = unicodedata.normalize("NFKC", prompt).lower().strip()
    return " ".join(normalized.split())


def build_cache_key(model: str, prompt: str) -> str:
    """Genera una clave determinista ai:cache:v1:<model>:<normalized_hash> tras normalizar el texto."""
    norm_model = (model or "").strip().lower()
    norm_prompt = normalize_prompt(prompt)
    hash_hex = hashlib.sha256(norm_prompt.encode("utf-8")).hexdigest()
    return f"ai:cache:v1:{norm_model}:{hash_hex}"


class AICache:
    """Caché multinivel para IA:

    - L1: En memoria en proceso con política LRU y expiración TTL.
    - L2: Distribuida en Redis (ai:cache:v1:<model>:<normalized_hash>) con fallback transparente.
    """

    def __init__(
        self,
        default_ttl: float = 300.0,
        maxsize: int = 1000,
        redis_url: str | None = None,
    ) -> None:
        self.default_ttl: float = default_ttl
        self.maxsize: int = maxsize
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self.hits: int = 0
        self.misses: int = 0
        self._lock: asyncio.Lock | None = None
        self._redis_url = redis_url if redis_url is not None else settings.REDIS_URL
        self._redis = None
        self._redis_initialized = False

    @property
    def lock(self) -> asyncio.Lock:
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if self._lock is None or (
            hasattr(self._lock, "_loop") and self._lock._loop is not None and self._lock._loop != current_loop
        ):
            self._lock = asyncio.Lock()
        return self._lock

    def _get_redis(self):
        if not self._redis_initialized:
            self._redis_initialized = True
            if self._redis_url:
                try:
                    import redis.asyncio as aioredis

                    self._redis = aioredis.from_url(
                        self._redis_url,
                        encoding="utf-8",
                        decode_responses=True,
                    )
                except Exception as exc:
                    logger.warning(
                        "No se pudo inicializar cliente Redis para L2 AICache (%s); usando solo L1.",
                        exc,
                    )
                    self._redis = None
        return self._redis

    async def get(self, key: str) -> Any | None:
        """Obtiene un valor de la caché (L1 -> L2).

        Actualiza contadores hits/misses y mantiene el orden LRU en L1.
        """
        async with self.lock:
            # 1. Comprobar L1 en memoria
            if key in self._cache:
                value, expire_at = self._cache[key]
                if time.time() < expire_at:
                    self._cache.move_to_end(key)
                    self.hits += 1
                    return value
                del self._cache[key]

            # 2. Comprobar L2 en Redis
            redis_client = self._get_redis()
            if redis_client is not None:
                try:
                    raw_data = await redis_client.get(key)
                    if raw_data is not None:
                        val = json.loads(raw_data)
                        ttl = await redis_client.ttl(key)
                        effective_ttl = float(ttl) if ttl and ttl > 0 else self.default_ttl
                        self._put_l1(key, val, effective_ttl)
                        self.hits += 1
                        return val
                except Exception as exc:
                    logger.debug("Fallo lectura L2 Redis AICache (%s): %s", key, exc)

            self.misses += 1
            return None

    def _put_l1(self, key: str, value: Any, ttl: float) -> None:
        expire_at = time.time() + ttl
        if key in self._cache:
            del self._cache[key]
        elif len(self._cache) >= self.maxsize:
            self._cache.popitem(last=False)  # Desalojo LRU
        self._cache[key] = (value, expire_at)

    async def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Almacena una entrada en L1 y en L2 (si Redis está configurado)."""
        async with self.lock:
            effective_ttl = ttl if ttl is not None else self.default_ttl
            self._put_l1(key, value, effective_ttl)

            redis_client = self._get_redis()
            if redis_client is not None:
                try:
                    await redis_client.set(
                        key,
                        json.dumps(value),
                        ex=max(1, int(effective_ttl)),
                    )
                except Exception as exc:
                    logger.debug("Fallo escritura L2 Redis AICache (%s): %s", key, exc)

    async def clear(self) -> None:
        """Limpia la caché completa (L1 y L2) y restablece métricas."""
        async with self.lock:
            self._cache.clear()
            self.hits = 0
            self.misses = 0

            redis_client = self._get_redis()
            if redis_client is not None:
                try:
                    async for k in redis_client.scan_iter("ai:cache:v1:*"):
                        await redis_client.delete(k)
                except Exception as exc:
                    logger.debug("Fallo clear L2 Redis AICache: %s", exc)

    async def stats(self) -> dict[str, int]:
        """Retorna las estadísticas actuales de la caché."""
        async with self.lock:
            return {
                "hits": self.hits,
                "misses": self.misses,
                "size": len(self._cache),
            }


ai_cache = AICache()
