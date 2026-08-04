from fastapi import APIRouter

router = APIRouter()

@router.get("/users/{user_id}")
def get_user(user_id: str):
    # Simulando una consulta a la base de datos
    query = f"SELECT * FROM users WHERE id = {user_id}" # ¡Peligro grave de inyección SQL!
    
    user = execute_query(query)
    
    if not user:
        # Mala práctica: retornar un diccionario en lugar de lanzar HTTPException
        return {"error": "Usuario no encontrado"}
        
    return user