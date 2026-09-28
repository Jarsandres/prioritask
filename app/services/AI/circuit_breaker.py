import threading
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from app.core.config import settings


class CircuitState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreaker:
    """Implementa el patrón Circuit Breaker para llamadas a servicios externos (ej. Ollama).

    Evita sobrecargar el servicio ante fallos recurrentes y permite recuperación
    gradual con un estado HALF_OPEN transitorio.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
    ) -> None:
        self.failure_threshold: int = failure_threshold
        self.recovery_timeout: float = recovery_timeout
        self.state: CircuitState = CircuitState.CLOSED
        self.failure_count: int = 0
        self.success_count: int = 0
        self.last_failure_time: datetime | None = None
        self._lock = threading.Lock()

    def can_execute(self) -> bool:
        """Determina si la llamada protegida puede ejecutarse.

        - CLOSED: Permite la ejecución.
        - OPEN: Verifica si transcurrió recovery_timeout. Si transcurrió, pasa a HALF_OPEN y permite prueba.
                Si no, rechaza inmediatamente (< 5ms).
        - HALF_OPEN: Permite la ejecución para evaluar si el servicio se recuperó.
        """
        with self._lock:
            if self.state == CircuitState.CLOSED:
                return True

            if self.state == CircuitState.OPEN:
                if self.last_failure_time is not None:
                    elapsed = (datetime.now(UTC) - self.last_failure_time).total_seconds()
                    if elapsed >= self.recovery_timeout:
                        self.state = CircuitState.HALF_OPEN
                        return True
                return False

            # CircuitState.HALF_OPEN
            return True

    def record_success(self) -> None:
        """Registra una ejecución exitosa.

        Si el circuito estaba en HALF_OPEN, se restablece a CLOSED y se resetea el contador de fallos.
        """
        with self._lock:
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
            self.success_count += 1

    def record_failure(self) -> None:
        """Registra un fallo en la ejecución.

        Actualiza last_failure_time e incrementa failure_count.
        Si estaba en HALF_OPEN o se alcanza el umbral de fallos, abre el circuito.
        """
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = datetime.now(UTC)
            if self.state == CircuitState.HALF_OPEN or self.failure_count >= self.failure_threshold:
                self.state = CircuitState.OPEN

    def get_metrics(self) -> dict[str, Any]:
        """Retorna telemetría y métricas operativas del Circuit Breaker."""
        with self._lock:
            status = "healthy" if self.state == CircuitState.CLOSED else "degraded"
            return {
                "status": status,
                "circuit_state": self.state.value,
                "failure_count": self.failure_count,
                "success_count": self.success_count,
                "last_failure": self.last_failure_time,
                "model": settings.OLLAMA_MODEL,
            }


circuit_breaker = CircuitBreaker()
