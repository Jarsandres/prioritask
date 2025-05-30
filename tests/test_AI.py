from  app.services.AI.reformulator import reformular_titulo
from app.services.AI.task_organizer import agrupar_tareas_por_similitud
from app.services.AI.priority_classifier import clasificar_prioridad

def test_reformulador_local():
    original = "Limpiar la cocina"
    reformulada = reformular_titulo(original)

    print("\n Original:", original)
    print(" Reformulado:", reformulada)

    assert isinstance(reformulada, str)
    assert reformulada.strip() != ""
    assert reformulada.lower() != original.lower()

def test_agrupador_local():
    tareas = [
        "Limpiar la cocina",
        "Organizar la cocina",
        "Revisar facturas del mes",
        "Pagar las facturas",
        "Preparar presentación",
        "Limpiar el baño"
    ]

    grupos = agrupar_tareas_por_similitud(tareas, umbral_similitud=0.65)

    print("\n Grupos detectados:")
    for nombre, grupo in grupos.items():
        print(f"{nombre}: {grupo}")

    assert isinstance(grupos, dict)
    assert len(grupos) > 1


def test_clasificador_prioridad_local():
    tareas = [
        "Revisar las finanzas del trimestre",
        "Comprar papel higiénico",
        "Enviar currículum a empresa urgente",
        "Organizar escritorio"
    ]

    for tarea in tareas:
        prioridad = clasificar_prioridad(tarea)
        print(f"\n '{tarea}' → Prioridad: {prioridad}")
        assert prioridad in ["alta", "media", "baja"]

