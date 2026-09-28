import asyncio
import json
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.services.AI.cache import ai_cache, build_cache_key
from app.services.AI.circuit_breaker import circuit_breaker

logger = logging.getLogger(__name__)

OLLAMA_HOST = settings.OLLAMA_HOST
OLLAMA_MODEL = settings.OLLAMA_MODEL
OLLAMA_TIMEOUT = settings.OLLAMA_TIMEOUT
MAX_RETRIES = 3
INITIAL_BACKOFF = 0.5  # segundos


async def generate_json(prompt: str, model: str = OLLAMA_MODEL) -> dict[str, Any] | None:
    """Envía un prompt a la API de Ollama local solicitando respuesta estructurada en JSON.

    Implementa:
    1. Caché en memoria con TTL para responder llamadas idénticas de forma instantánea.
    2. Circuit Breaker para evitar sobrecarga y responder rápidamente con fallback (< 5ms) si el servicio está degradado.
    3. Reintentos automáticos con backoff exponencial.
    """
    cache_key = build_cache_key(model, prompt)
    cached_value = await ai_cache.get(cache_key)
    if cached_value is not None:
        logger.debug("Hit en caché IA para key %s", cache_key)
        return cached_value

    if not circuit_breaker.can_execute():
        logger.warning(
            "Circuit breaker para Ollama está abierto. Ejecutando fallback inmediato (< 5ms)."
        )
        return None

    url = f"{OLLAMA_HOST.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()

                raw_response = data.get("response", "")
                if not raw_response:
                    if attempt < MAX_RETRIES:
                        sleep_time = INITIAL_BACKOFF * (2 ** (attempt - 1))
                        await asyncio.sleep(sleep_time)
                        continue
                    circuit_breaker.record_failure()
                    return None

                result = json.loads(raw_response)
                circuit_breaker.record_success()
                await ai_cache.set(cache_key, result)
                return result
        except Exception as exc:
            if attempt < MAX_RETRIES:
                sleep_time = INITIAL_BACKOFF * (2 ** (attempt - 1))
                logger.warning(
                    "Intento %d/%d fallido al comunicarse con Ollama (%s): %s. Reintentando en %.1fs...",
                    attempt, MAX_RETRIES, url, exc, sleep_time,
                )
                await asyncio.sleep(sleep_time)
            else:
                logger.warning(
                    "Fallo persistente tras %d intentos al comunicarse con Ollama (%s): %s",
                    MAX_RETRIES, url, exc,
                )
                circuit_breaker.record_failure()
                return None

    circuit_breaker.record_failure()
    return None

