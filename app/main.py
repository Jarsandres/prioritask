import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1 import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)

tags_metadata = [
    {
        "name": "Autenticación y Sesiones",
        "description": "🔐 Autenticación de usuarios basada en JWT, gestión de sesiones, registro y renovación de tokens.",
    },
    {
        "name": "Hogar",
        "description": "🏠 Organización por hogares y espacios compartidos, gestión de membresías y distribución de tareas.",
    },
    {
        "name": "Gestión de tareas",
        "description": "📋 Ciclo de vida completo de tareas, asignación a colaboradores, filtrado y auditoría de eventos.",
    },
    {
        "name": "Tareas con IA",
        "description": "🤖 Servicios avanzados de inteligencia artificial: priorización contextual, agrupación semántica, reformulación y telemetría de circuit breaker.",
    },
    {
        "name": "Etiquetas",
        "description": "🏷️ Clasificación multidimensional mediante etiquetas personalizadas para tareas.",
    },
    {
        "name": "Usuarios (Admin)",
        "description": "👥 Operaciones de administración y supervisión de cuentas del sistema.",
    },
]

app = FastAPI(
    title="Prioritask API",
    version="1.0",
    description="Gestión inteligente de tareas con IA. Esta API permite a los usuarios gestionar tareas de manera eficiente, incluyendo la creación, actualización, eliminación y asignación de tareas. Además, ofrece funcionalidades avanzadas como la priorización, agrupación y reformulación de tareas utilizando inteligencia artificial.",
    openapi_tags=tags_metadata,
    contact={
        "name": "Equipo Prioritask",
        "email": "soporte@prioritask.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=tags_metadata,
        contact=app.contact,
        license_info=app.license_info,
    )
    components = openapi_schema.setdefault("components", {})
    security_schemes = components.setdefault("securitySchemes", {})
    bearer_scheme = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Ingrese el token JWT para autorizar peticiones protegidas.",
    }
    security_schemes["HTTPBearer"] = bearer_scheme
    security_schemes["bearerAuth"] = bearer_scheme
    openapi_schema["security"] = [{"bearerAuth": []}, {"HTTPBearer": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


# Global Exception Handlers
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error("Error de base de datos en %s: %s", request.url, exc, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Error interno de persistencia de datos.",
            "error_type": "database_error",
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Excepción no capturada en %s: %s", request.url, exc, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Ocurrió un error inesperado en el servidor.",
            "error_type": "internal_server_error",
        },
    )


# Registrar CORSMiddleware antes de cualquier otra configuración
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cargar el router de la API v1
app.include_router(api_router, prefix="/api/v1")
