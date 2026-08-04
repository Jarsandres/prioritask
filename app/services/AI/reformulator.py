from app.services.AI.ollama_client import generate_json


async def reformular_titulo_con_traduccion(titulo: str) -> dict[str, str | bool]:
    """Reescribe el título de una tarea para que sea más claro, conciso y profesional en español.

    Utiliza Ollama con qwen2.5:7b. En caso de fallo, retorna el título original.
    """
    prompt = (
        f"Reescribe este título de tarea para que sea más claro, conciso y profesional en español: '{titulo}'. "
        "Responde en JSON con la clave 'reformulada'."
    )
    result = await generate_json(prompt)

    if result and isinstance(result, dict) and "reformulada" in result:
        reformulada = str(result["reformulada"]).strip()
        if reformulada:
            cambio = reformulada.lower() != titulo.strip().lower()
            return {
                "reformulada": reformulada,
                "cambio": cambio,
                "motivo": "Reformulación generada mediante Ollama (qwen2.5:7b)." if cambio else "Sin cambios sugeridos.",
            }

    return {
        "reformulada": titulo,
        "cambio": False,
        "motivo": "Ollama no disponible o sin cambios sugeridos.",
    }
