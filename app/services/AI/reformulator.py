from transformers import pipeline

# Cargar modelos
traductor_es_en = pipeline("translation", model="Helsinki-NLP/opus-mt-es-en")
traductor_en_es = pipeline("translation", model="Helsinki-NLP/opus-mt-en-es")
parafraseador_en = pipeline("text2text-generation", model="humarin/chatgpt_paraphraser_on_T5_base")

def reformular_titulo_con_traduccion(titulo: str) -> dict:
    try:
        # ES → EN
        traducido_en = traductor_es_en(titulo, max_length=100)[0]["translation_text"]

        # Parafrasear en inglés
        prompt = f"paraphrase: {traducido_en}"
        parafraseado_en = parafraseador_en(prompt, max_length=100, do_sample=True)[0]["generated_text"].strip()

        # EN → ES
        reformulado_es = traductor_en_es(parafraseado_en, max_length=100)[0]["translation_text"].strip()

        # Validación mínima
        if reformulado_es.lower() == titulo.strip().lower():
            return {
                "reformulada": reformulado_es,
                "cambio": False,
                "motivo": "No se sugirieron cambios por la IA (traducción y reformulación)."
            }
        else:
            return {
                "reformulada": reformulado_es,
                "cambio": True,
                "motivo": "Reformulación generada mediante traducción y IA."
            }

    except Exception as e:
        return {
            "reformulada": titulo,
            "cambio": False,
            "motivo": f"Error durante la reformulación: {e}"
        }
