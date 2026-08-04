from collections import defaultdict

from sentence_transformers import SentenceTransformer, util

from app.models.task import Task

model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

def agrupar_tareas_por_similitud(tareas: list[Task], umbral: float = 0.4) -> dict[str, list[Task]]:
    if not tareas:
        return {}

    # Convertir títulos a una lista de textos
    titulos = [t.titulo for t in tareas]

    # Calcular embeddings
    embeddings = model.encode(titulos, convert_to_tensor=True)

    grupos = defaultdict(list)
    usados = set()
    grupo_idx = 1

    for i, tarea in enumerate(tareas):
        if i in usados:
            continue
        grupo_actual = [tarea]
        usados.add(i)

        for j in range(i + 1, len(tareas)):
            if j in usados:
                continue
            similitud = util.cos_sim(embeddings[i], embeddings[j]).item()
            if similitud >= umbral:
                grupo_actual.append(tareas[j])
                usados.add(j)

        grupos[f"Grupo {grupo_idx}"] = grupo_actual
        grupo_idx += 1

    return grupos



def agrupar_por_categoria(tareas: list[Task]) -> dict[str, list[Task]]:

    grupos = defaultdict(list)
    for tarea in tareas:
        grupos[tarea.categoria].append(tarea)
    return grupos
