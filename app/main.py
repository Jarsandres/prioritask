from fastapi import FastAPI
from app.api.v1 import api_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Prioritask API",
    version="1.0",
    description="Gestión inteligente de tareas con IA. Esta API permite a los usuarios gestionar tareas de manera eficiente, incluyendo la creación, actualización, eliminación y asignación de tareas. Además, ofrece funcionalidades avanzadas como la priorización, agrupación y reformulación de tareas utilizando inteligencia artificial.",
    contact={
        "name": "Equipo Prioritask",
        "email": "soporte@prioritask.com"
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT"
    }
)

# Registrar CORSMiddleware antes de cualquier otra configuración
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir todos los orígenes temporalmente para depuración
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Aquí sí cargamos el router de la API
app.include_router(api_router, prefix="/api/v1")

