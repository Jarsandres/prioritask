import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1 import api_router

logger = logging.getLogger(__name__)

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

# Global Exception Handlers
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error("Error de base de datos en %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Error interno de persistencia de datos.",
            "error_type": "database_error"
        }
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Excepción no capturada en %s: %s", request.url, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Ocurrió un error inesperado en el servidor.",
            "error_type": "internal_server_error"
        }
    )

# Registrar CORSMiddleware antes de cualquier otra configuración
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permitir todos los orígenes en entorno local
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cargar el router de la API v1
app.include_router(api_router, prefix="/api/v1")


