import json
import logging
from app.core.config import settings
from typing import Any
import httpx

logger = logging.getLogger(__name__)

OLLAMA_HOST = settings.OLLAMA_HOST
OLLAMA_MODEL = settings.OLLAMA_MODEL
OLLAMA_TIMEOUT = settings.OLLAMA_TIMEOUT


async def generate_json(prompt: str, model: str = OLLAMA_MODEL) -> dict[str, Any] | None:
    """Envía un prompt a la API de Ollama local solicitando respuesta estructurada en JSON.

    Retorna un diccionario si la solicitud es exitosa y la respuesta es JSON válido.
    En caso de error de conexión, timeout o formato inválido, retorna None (fallback).
    """
    url = f"{OLLAMA_HOST.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
    }

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
        logger.warning("Fallo al comunicarse con Ollama (%s): %s", url, exc)
        return None
