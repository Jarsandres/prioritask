from setfit import SetFitModel, Trainer
from datasets import Dataset
from pathlib import Path

# Ruta para guardar/cargar modelo
MODELO_PATH = Path("app/services/AI/modelos/prioridad")

def cargar_o_entrenar_modelo():
    if MODELO_PATH.exists():
        return SetFitModel.from_pretrained(str(MODELO_PATH))

    # Dataset de ejemplo inicial
    ejemplos = [
        {"text": "Enviar informe urgente", "label": "alta"},
        {"text": "Comprar pan", "label": "baja"},
        {"text": "Estudiar para el examen de mañana", "label": "alta"},
        {"text": "Llamar a mamá", "label": "media"},
        {"text": "Revisar correo electrónico", "label": "media"},
        {"text": "Pagar el alquiler hoy", "label": "alta"},
        {"text": "Sacar la basura", "label": "baja"},
    ]
    texts = [e["text"] for e in ejemplos]
    labels = [e["label"] for e in ejemplos]
    dataset = Dataset.from_dict({"text": texts, "label": labels})

    # Entrenamiento
    model = SetFitModel.from_pretrained("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    trainer = Trainer(model=model, train_dataset=dataset, eval_dataset=dataset, metric="accuracy")
    trainer.train()

    model.save_pretrained(str(MODELO_PATH))
    return model

# Cargar modelo una vez al importar
_modelo = cargar_o_entrenar_modelo()

def clasificar_prioridad(titulo: str) -> str:
    return _modelo.predict([titulo])[0]
