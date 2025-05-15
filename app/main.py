from fastapi import FastAPI
from app.api.v1 import api_router

app = FastAPI(title="Prioritask API")

@app.get("/")
def read_root():
    return {"message": "¡Prioritask está funcionando!"}

# Aquí sí cargamos el router de la API
app.include_router(api_router, prefix="/api/v1")
