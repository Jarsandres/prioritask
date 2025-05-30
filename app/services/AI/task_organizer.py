from sentence_transformers import SentenceTransformer, util
from typing import List, Dict

# Cargamos el modelo multilingüe localmente
modelo = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

def agrupar_tareas_por_similitud(titulos: List[str], umbral_similitud: float = 0.7) -> Dict[str, List[str]]:
    embeddings = modelo.encode(titulos)

    grupos = {}
    grupo_id = 1
    asignadas = set()

    for i, titulo in enumerate(titulos):
        if titulo in asignadas:
            continue

        grupo_actual = [titulo]
        asignadas.add(titulo)

        for j in range(i + 1, len(titulos)):
            if titulos[j] in asignadas:
                continue

            similitud = util.cos_sim(embeddings[i], embeddings[j])
            if similitud.item() >= umbral_similitud:
                grupo_actual.append(titulos[j])
                asignadas.add(titulos[j])

        grupos[f"Grupo {grupo_id}"] = grupo_actual
        grupo_id += 1

    return grupos
