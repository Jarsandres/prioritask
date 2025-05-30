from transformers import pipeline

modelo = pipeline("text-classification", model="nlptown/bert-base-multilingual-uncased-sentiment")

def clasificar_prioridad(titulo: str) -> str:
    try:
        resultado = modelo(titulo)[0]
        label = resultado.get("label", "")
        score = resultado.get("score", 0.0)

        # Mapeo más robusto (usamos el score también como criterio)
        if "5" in label or "4" in label:
            return "alta" if score >= 0.6 else "media"
        elif "3" in label:
            return "media"
        elif "2" in label or "1" in label:
            return "baja"
        else:
            return "media"  # fallback
    except Exception as e:
        print(f" Error al clasificar tarea: {e}")
        return "media"  # default segura
