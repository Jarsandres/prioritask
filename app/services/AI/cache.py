import asyncio
import hashlib
import time
from collections import OrderedDict
from typing import Any


def build_cache_key(model: str, prompt: str) -> str:
    """Genera una clave única en formato SHA-256 a partir del modelo y prompt suministrados."""
    raw = f"{model}:{prompt}".encode()
    return hashlib.sha256(raw).hexdigest()


class AICache:
    """Caché en memoria en proceso con expiración por TTL y desalojo FIFO/LRU."""

    def __init__(self, default_ttl: float = 300.0, maxsize: int = 1000) -> None:
        self.default_ttl: float = default_ttl
        self.maxsize: int = maxsize
        self._cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
        self.hits: int = 0
        self.misses: int = 0
        self._lock: asyncio.Lock | None = None

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

    async def get(self, key: str) -> Any | None:
        """Obtiene un valor de la caché si no ha expirado.

        Si expiró, lo elimina y devuelve None. Actualiza contadores hits/misses.
        """
        async with self.lock:
            if key not in self._cache:
                self.misses += 1
                return None

            value, expire_at = self._cache[key]
            if time.time() >= expire_at:
                del self._cache[key]
                self.misses += 1
                return None

            self.hits += 1
            return value

    async def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        """Almacena una entrada en la caché.

        Si la capacidad supera maxsize, desaloja la entrada más antigua.
        """
        async with self.lock:
            effective_ttl = ttl if ttl is not None else self.default_ttl
            expire_at = time.time() + effective_ttl

            if key in self._cache:
                del self._cache[key]
            elif len(self._cache) >= self.maxsize:
                # Desalojar la entrada más antigua (FIFO)
                self._cache.popitem(last=False)

            self._cache[key] = (value, expire_at)

    async def clear(self) -> None:
        """Limpia la caché completa y restablece métricas."""
        async with self.lock:
            self._cache.clear()
            self.hits = 0
            self.misses = 0

    async def stats(self) -> dict[str, int]:
        """Retorna las estadísticas actuales de la caché."""
        async with self.lock:
            return {
                "hits": self.hits,
                "misses": self.misses,
                "size": len(self._cache),
            }


ai_cache = AICache()
