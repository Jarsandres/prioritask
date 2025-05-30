from transformers import pipeline

# Cargamos el modelo solo una vez
parafraseador = pipeline("text2text-generation", model="humarin/chatgpt_paraphraser_on_T5_base")

def reformular_titulo(titulo: str) -> str:
    resultado = parafraseador(titulo, max_length=100, do_sample=True)
    reformulado = resultado[0]["generated_text"]
    if titulo not in reformulado:
        reformulado = f"{reformulado} ({titulo})"
    return reformulado
