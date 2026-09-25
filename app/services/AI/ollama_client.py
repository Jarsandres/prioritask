import asyncio
import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

OLLAMA_HOST = settings.OLLAMA_HOST
OLLAMA_MODEL = settings.OLLAMA_MODEL
OLLAMA_TIMEOUT = settings.OLLAMA_TIMEOUT
MAX_RETRIES = 3
INITIAL_BACKOFF = 0.5  # segundos


async def generate_json(prompt: str, model: str = OLLAMA_MODEL) -> dict[str, Any] | None:
    """Envía un prompt a la API de Ollama local solicitando respuesta estructurada en JSON.

    Implementa reintentos automáticos con backoff exponencial para mayor resiliencia.
    Retorna un diccionario si la solicitud es exitosa y la respuesta es JSON válido.
    En caso de error persistente de conexión, timeout o formato inválido, retorna None (fallback).
    """
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
                    return None

                return json.loads(raw_response)
        except Exception as exc:
            if attempt < MAX_RETRIES:
                sleep_time = INITIAL_BACKOFF * (2 ** (attempt - 1))
                logger.warning(
                    "Intento %d/%d fallido al comunicarse con Ollama (%s): %s. Reintentando en %.1fs...",
                    attempt, MAX_RETRIES, url, exc, sleep_time
                )
                await asyncio.sleep(sleep_time)
            else:
                logger.warning(
                    "Fallo persistente tras %d intentos al comunicarse con Ollama (%s): %s",
                    MAX_RETRIES, url, exc
                )
                return None

