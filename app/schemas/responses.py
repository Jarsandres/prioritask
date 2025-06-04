from fastapi.responses import JSONResponse

# Errores comunes
# ERROR_ROOM_DUPLICATE: Indica que ya existe una sala con el mismo nombre para el usuario.
ERROR_ROOM_DUPLICATE = JSONResponse(
    status_code=422,
    content={"detail": "Ya existe una sala con este nombre para el usuario."}
)

# ERROR_ROOM_NOT_FOUND: Indica que la sala especificada no fue encontrada.
ERROR_ROOM_NOT_FOUND = JSONResponse(
    status_code=404,
    content={"detail": "Sala no encontrada."}
)

# ERROR_BAD_REQUEST: Indica que la solicitud enviada es inválida.
ERROR_BAD_REQUEST = JSONResponse(
    status_code=400,
    content={"detail": "Solicitud inválida."}
)

# ERROR_UNAUTHORIZED: Indica que el usuario no está autorizado para realizar la acción.
ERROR_UNAUTHORIZED = JSONResponse(
    status_code=401,
    content={"detail": "No autorizado. Por favor, proporcione un token válido."}
)

# ERROR_FORBIDDEN: Indica que el usuario no tiene permisos para realizar la acción.
ERROR_FORBIDDEN = JSONResponse(
    status_code=403,
    content={"detail": "Acceso prohibido. No tiene permisos para realizar esta acción."}
)

# ERROR_TASK_HISTORY_NOT_FOUND: Indica que el historial de la tarea no fue encontrado.
ERROR_TASK_HISTORY_NOT_FOUND = JSONResponse(
    status_code=404,
    content={"detail": "Historial de tarea no encontrado."}
)

# ERROR_INTERNAL_SERVER_ERROR: Indica que ocurrió un problema inesperado en el servidor.
ERROR_INTERNAL_SERVER_ERROR = JSONResponse(
    status_code=500,
    content={"detail": "Error interno del servidor. Por favor, inténtelo más tarde."}
)

# Ejemplos de respuesta
# TASK_READ_EXAMPLE: Ejemplo de respuesta para el modelo TaskRead.
TASK_READ_EXAMPLE = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "titulo": "Comprar comida",
    "descripcion": "Comprar alimentos para la semana",
    "categoria": "OTRO",
    "estado": "TODO",
    "peso": 1.0,
    "due_date": "2025-06-01T12:00:00",
    "created_at": "2025-05-27T12:00:00"
}

# ROOM_READ_EXAMPLE: Ejemplo de respuesta para el modelo RoomRead.
ROOM_READ_EXAMPLE = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "nombre": "Sala de reuniones",
    "owner_id": "123e4567-e89b-12d3-a456-426614174001",
    "owner": "Juan Pérez"
}

# TAG_READ_EXAMPLE: Ejemplo de respuesta para el modelo TagRead.
TAG_READ_EXAMPLE = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "nombre": "Urgente"
}

# USUARIO_READ_EXAMPLE: Ejemplo de respuesta para el modelo UsuarioRead.
USUARIO_READ_EXAMPLE = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "usuario@ejemplo.com",
    "nombre": "Juan Pérez",
    "is_active": True
}

# PRIORITIZED_TASK_EXAMPLE: Ejemplo de respuesta para el modelo PrioritizedTask.
PRIORITIZED_TASK_EXAMPLE = {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "titulo": "Comprar comida",
    "prioridad": "Alta",
    "motivo": "Es urgente y tiene una fecha límite cercana."
}

# GROUPED_TASKS_EXAMPLE: Ejemplo de respuesta para el modelo GroupedTasksResponse.
GROUPED_TASKS_EXAMPLE = {
    "grupos": {
        "Trabajo": [
            {"id": "123e4567-e89b-12d3-a456-426614174001", "titulo": "Enviar currículum"},
            {"id": "123e4567-e89b-12d3-a456-426614174002", "titulo": "Preparar presentación"}
        ],
        "Personal": [
            {"id": "123e4567-e89b-12d3-a456-426614174003", "titulo": "Comprar comida"}
        ]
    }
}

# REWRITTEN_TASK_EXAMPLE: Ejemplo de respuesta para el modelo RewrittenTask.
REWRITTEN_TASK_EXAMPLE = [
    {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "original": "Comprar comida",
        "reformulada": "Adquirir alimentos para la semana"
    },
    {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "original": "Enviar currículum",
        "reformulada": "Mandar CV actualizado a empresas"
    }
]
