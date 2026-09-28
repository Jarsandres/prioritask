import logging
import re
from datetime import UTC, datetime, timedelta

from app.models.task import Task
from app.services.AI.circuit_breaker import circuit_breaker
from app.services.AI.ollama_client import generate_json

logger = logging.getLogger(__name__)

PALABRAS_URGENCIA = [
    "urgente",
    "hoy",
    "mañana",
    "examen",
    "prioritario",
    "inmediato",
    "rápido",
    "entregar",
    "última hora",
]


def _contiene_urgencia(texto: str | None) -> bool:
    if not texto:
        return False
    texto_lower = texto.lower()
    for palabra in PALABRAS_URGENCIA:
        if palabra.endswith("o"):
            patron = rf"\b{re.escape(palabra[:-1])}[oa]s?\b"
        elif palabra.endswith("e"):
            patron = rf"\b{re.escape(palabra)}s?\b"
        else:
            patron = rf"\b{re.escape(palabra)}\b"
        if re.search(patron, texto_lower):
            return True
    return False


def _fallback_prioridad(titulo: str) -> str:
    if _contiene_urgencia(titulo):
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


def _formatear_motivo(prioridad: str, factores: list[str]) -> str:
    if not factores:
        return f"Prioridad {prioridad}: Sin factores de urgencia relevantes."

    if len(factores) == 1:
        detalle = factores[0]
    else:
        ultimo = factores[-1].strip().lower()
        conj = "e" if ultimo.startswith(("i", "hi")) and not ultimo.startswith(("hie", "hia")) else "y"
        if len(factores) == 2:
            detalle = f"{factores[0]} {conj} {factores[1]}"
        else:
            detalle = f"{', '.join(factores[:-1])} {conj} {factores[-1]}"

    detalle = detalle[0].upper() + detalle[1:]
    return f"Prioridad {prioridad}: {detalle}."


async def evaluar_prioridad_contextual(task: Task) -> tuple[str, str]:
    """Evalúa la prioridad contextual multivariable de una tarea.

    Calcula un score numérico base combinando:
    1. Fecha límite (due_date)
    2. Palabras clave de urgencia (PALABRAS_URGENCIA)
    3. Recurrencia (task.is_recurring)
    4. Colaboración / Tarea compartida (task.colaboradores)
    5. Peso explícito (task.peso)
    6. Inferencia Semántica por IA (Ollama)

    Retorna:
        tuple[str, str]: (prioridad, motivo)
    """
    score: float = 0.0
    factores: list[str] = []

    # 1. Fecha límite (due_date)
    due_date = task.due_date
    if due_date is not None:
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=UTC)
        now = datetime.now(UTC)
        delta = due_date - now

        if delta <= timedelta(hours=24):
            score += 40
            factores.append("fecha límite inminente (<24h)")
        elif delta <= timedelta(hours=48):
            score += 25
            factores.append("fecha límite próxima (24-48h)")
        elif delta <= timedelta(days=7):
            score += 10
            factores.append("fecha límite en los próximos 7 días")

    # 4. Colaboración / Tarea Compartida
    try:
        colaboradores = getattr(task, "colaboradores", None)
    except Exception:
        colaboradores = getattr(task, "__dict__", {}).get("colaboradores")

    if colaboradores and len(colaboradores) > 0:
        score += 10
        factores.append("tarea compartida")

    # 3. Recurrencia (task.is_recurring)
    try:
        is_recurring = bool(getattr(task, "is_recurring", False))
    except Exception:
        is_recurring = bool(getattr(task, "__dict__", {}).get("is_recurring", False))

    if is_recurring:
        score += 15

    # 2. Palabras clave de urgencia (PALABRAS_URGENCIA)
    urgencia_titulo = _contiene_urgencia(task.titulo)
    urgencia_desc = _contiene_urgencia(task.descripcion)
    tiene_urgencia = urgencia_titulo or urgencia_desc

    if tiene_urgencia:
        score += 30
        if urgencia_titulo:
            factores.append("palabra clave de urgencia detectada en el título")
        else:
            factores.append("palabra clave de urgencia detectada en la descripción")
        if score < 50:
            score = 50.0

    # 5. Peso explícito (task.peso)
    peso = getattr(task, "peso", None)
    if peso is None:
        peso = 1.0
    score += peso * 10
    if peso >= 2.0:
        factores.append("alto peso asignado")

    # 6. Inferencia Semántica por IA (Ollama)
    ia_clasificacion: str | None = None
    if not tiene_urgencia and circuit_breaker.can_execute():
        try:
            res_ia = await clasificar_prioridad(task.titulo)
            if res_ia:
                res_str = str(res_ia).lower().strip()
                if res_str in ("alta", "media", "baja"):
                    ia_clasificacion = res_str
        except Exception as exc:
            logger.warning("Error en clasificación semántica por IA para '%s': %s", task.titulo, exc)
            ia_clasificacion = None

    if ia_clasificacion == "alta":
        score += 25
    elif ia_clasificacion == "media":
        score += 15
    elif ia_clasificacion == "baja":
        score += 5

    # Integración de factores de recurrencia e IA en el motivo
    if is_recurring and ia_clasificacion == "media":
        factores.append("rutina recurrente de importancia moderada evaluada por IA")
    else:
        if is_recurring:
            factores.append("rutina recurrente activa")
        if ia_clasificacion == "alta":
            factores.append("alta urgencia evaluada por IA")
        elif ia_clasificacion == "media":
            factores.append("importancia moderada evaluada por IA")
        elif ia_clasificacion == "baja":
            factores.append("baja urgencia evaluada por IA")

    # Mapeo de Puntuación a Prioridad
    if score >= 50:
        prioridad = "alta"
    elif score >= 25:
        prioridad = "media"
    else:
        prioridad = "baja"

    motivo = _formatear_motivo(prioridad, factores)
    return prioridad, motivo

