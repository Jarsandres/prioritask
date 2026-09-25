from fastapi import APIRouter, HTTPException
from sqlalchemy import text

router = APIRouter()


def execute_query(query, params=None):
    """Función auxiliar simulada para ejecutar consultas parametrizadas."""




@router.get("/users/{user_id}")
def get_user(user_id: str):
    # Consulta parametrizada para prevenir inyecciones SQL
    query = text("SELECT * FROM users WHERE id = :user_id")
    user = execute_query(query, params={"user_id": user_id})

    if not user:
        # Se lanza HTTPException en lugar de retornar un diccionario simple
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return user