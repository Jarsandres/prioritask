import asyncio
import json
import logging
import re
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

_async_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


def sanitize_prompt_input(text: str, max_length: int = 200) -> str:
    """Sanitiza y trunca texto de entrada de usuario antes de interpolarlo en un prompt de LLM."""
    if not text:
        return ""
    cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]+", " ", str(text))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = cleaned.replace('"""', "'''")
    cleaned = cleaned.replace('"', '\\"')
    cleaned = cleaned.replace("<", "&lt;").replace(">", "&gt;")
    return cleaned[:max_length].strip()


def get_ollama_client() -> httpx.AsyncClient:
    """Obtiene o inicializa el cliente persistente AsyncClient con pool de conexiones optimizado."""
    global _async_client
    if _async_client is None or _async_client.is_closed:
        _async_client = httpx.AsyncClient(
            timeout=OLLAMA_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )
    return _async_client


async def close_ollama_client() -> None:
    """Cierra el pool de conexiones del cliente HTTP de Ollama."""
    global _async_client
    if _async_client is not None and not _async_client.is_closed:
        await _async_client.aclose()
        _async_client = None


async def generate_json(
    prompt: str,
    model: str = OLLAMA_MODEL,
    system: str | None = None,
) -> dict[str, Any] | None:
    """Envía un prompt a la API de Ollama local solicitando respuesta estructurada en JSON.

    Implementa:
    1. Caché multinivel L1 (memoria LRU) + L2 (Redis) con texto normalizado y SHA-256.
    2. Circuit Breaker para responder rápidamente con fallback (< 5ms) si el servicio está degradado.
    3. Reintentos automáticos con backoff exponencial.
    4. Pool de conexiones persistente con httpx.AsyncClient singleton.
    """
    cache_prompt = f"{system}::{prompt}" if system is not None else prompt
    cache_key = build_cache_key(model, cache_prompt)
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
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }
    if system is not None:
        payload["system"] = system

    client = get_ollama_client()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
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
                    attempt,
                    MAX_RETRIES,
                    url,
                    exc,
                    sleep_time,
                )
                await asyncio.sleep(sleep_time)
            else:
                logger.warning(
                    "Fallo persistente tras %d intentos al comunicarse con Ollama (%s): %s",
                    MAX_RETRIES,
                    url,
                    exc,
                )
                circuit_breaker.record_failure()
                return None

    circuit_breaker.record_failure()
    return None

