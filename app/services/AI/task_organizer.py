from collections import defaultdict

from app.models.task import Task
from app.services.AI.ollama_client import generate_json


def agrupar_por_categoria(tareas: list[Task]) -> dict[str, list[Task]]:
    """Agrupa las tareas directamente según su atributo de categoría (Enum/str)."""
    grupos: dict[str, list[Task]] = defaultdict(list)
    for tarea in tareas:
        categoria_str = str(getattr(tarea, "categoria", "General"))
        grupos[categoria_str].append(tarea)
    return dict(grupos)


async def agrupar_tareas_por_similitud(tareas: list[Task], umbral: float = 0.4) -> dict[str, list[Task]]:
    """Agrupa semánticamente una lista de tareas.

    Envía los títulos a Ollama para su clasificación temática.
    En caso de fallo o respuesta inválida, utiliza agrupar_por_categoria como fallback.
    """
    if not tareas:
        return {}

    titulos = [f"- {t.titulo}" for t in tareas]
    prompt = (
        "Agrupa semánticamente la siguiente lista de títulos de tareas en categorías temáticas nombradas. "
        "Responde en JSON donde cada clave sea el nombre del grupo temático y su valor sea una lista con los títulos pertenecientes a ese grupo:\n"
        + "\n".join(titulos)
    )

    result = await generate_json(prompt)

    if result and isinstance(result, dict):
        mapa_tareas = {t.titulo.strip().lower(): t for t in tareas}
        grupos_resultado: dict[str, list[Task]] = defaultdict(list)
        asignadas = set()

        for nombre_grupo, lista_titulos in result.items():
            if isinstance(lista_titulos, list):
                for tit in lista_titulos:
                    tit_str = str(tit).strip().lower()
                    if tit_str in mapa_tareas:
                        t = mapa_tareas[tit_str]
                        grupos_resultado[str(nombre_grupo)].append(t)
                        asignadas.add(t.id)

        # Si Ollama devolvió grupos válidos
        if grupos_resultado:
            # Asignar cualquier tarea no agrupada al grupo "General"
            sin_grupo = [t for t in tareas if t.id not in asignadas]
            if sin_grupo:
                grupos_resultado["General"].extend(sin_grupo)
            return dict(grupos_resultado)

    return agrupar_por_categoria(tareas)
