import re

from app.services.AI.ollama_client import generate_json

PALABRAS_URGENCIA = ["urgente", "hoy", "mañana", "examen", "prioritario", "inmediato", "rápido", "entregar", "última hora"]


def _fallback_prioridad(titulo: str) -> str:
    titulo_lower = titulo.lower()
    if any(re.search(rf"\b{palabra}\b", titulo_lower) for palabra in PALABRAS_URGENCIA):
        return "alta"
    return "media"


async def clasificar_prioridad(titulo: str) -> str:
    """Clasifica la prioridad de una tarea en 'alta', 'media' o 'baja'.

    Utiliza Ollama con el modelo qwen2.5:7b. En caso de fallo o timeout,
    utiliza una regla de fallback basada en palabras clave.
    """
    prompt = (
        f"Analiza el título de la tarea: '{titulo}'. "
        "Clasifica su prioridad estrictamente en una de las siguientes opciones: alta, media, baja. "
        "Responde en JSON con la clave 'prioridad'."
    )
    result = await generate_json(prompt)
    if result and isinstance(result, dict):
        prioridad = str(result.get("prioridad", "")).lower().strip()
        if prioridad in ("alta", "media", "baja"):
            return prioridad

    return _fallback_prioridad(titulo)
