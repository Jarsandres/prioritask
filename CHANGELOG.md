# 📋 CHANGELOG & QA AUDIT RELEASE NOTES — Prioritask Backend

Todos los cambios notables realizados en el backend de Prioritask se documentan en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## 🚀 Versión 0.2.1-alpha (Mitigación CORS CWE-942 y Autenticación en Inferencia IA) — [2026-09-25]

### 🔴 Correcciones Críticas y Seguridad (Security & Critical Fixes)
- **[BE-SEC-005] Mitigación de Política CORS Permisiva (CWE-942) en `app/main.py` y `app/core/config.py`**:
  - Eliminación del comodín `*` hardcodeado junto con `allow_credentials=True`.
  - Normalización de URLs de origen (eliminación de espacios en blanco y barras finales/trailing slashes) en `Settings.CORS_ORIGINS`.
  - Validación estricta que rechaza `*` cuando las credenciales están activas (`allow_credentials=True`), previniendo configuraciones inseguras de acuerdo al estándar W3C.
- **[BE-SEC-006] Protección contra Abuso y DoS Anónimo en Inferencia IA (`app/api/v1/endpoints/tasks_ai.py`)**:
  - Endpoint `POST /tasks/ai/suggest` protegido obligatoriamente con `current_user: Usuario = Depends(get_current_user)`.
  - Mitigación de ataques de denegación de servicio (DoS) anónimo y agotamiento de recursos en el motor de inferencia local Ollama.
  - Nuevas pruebas de integración y seguridad SDET en `tests/integration/test_ai_endpoints.py` y `tests/integration/test_sdet_security.py`.

---

## 🚀 Versión 0.2.0-alpha / [1.1.0-rc] (Refactorización de Seguridad, Base de Datos, IA Local con Ollama y Pruebas) — [2026-08-04]

### 🔴 Correcciones Críticas y Seguridad (Security & Critical Fixes)
- **[BE-SEC-001 / BE-002 / BE-003] Endpoint `/auth/refresh` Vulnerable a Sesiones Infinitas (`app/api/v1/endpoints/auth.py`, `app/services/security.py`)**:
  - **Problema**: El endpoint `/refresh` utilizaba `verify_exp=False` por defecto y solo verificaba expiración si `token_type == "refresh"`, permitiendo renovar sesiones indefinidamente mediante tokens de acceso caducados.
  - **Solución**: Refactorizado el flujo de autenticación para exigir un `refresh_token` válido, verificando el tipo de token (`type == "refresh"`) e inspeccionando siempre la expiración (`verify_exp=True`).
- **[BE-SEC-002 / BE-009] Vulnerabilidad IDOR y Validación de Propiedad en Historial (`app/api/v1/endpoints/tasks.py`)**:
  - **Problema**: `GET /api/v1/tasks/{task_id}/history` permitía consultar el historial de cualquier tarea sin verificar la pertenencia al usuario autenticado (`user_id == current_user.id`).
  - **Solución**: Agregada validación estricta de propiedad de la tarea (retornando `403 Forbidden` o `404 Not Found` en caso de discrepancia) y filtrado de tareas eliminadas.
- **[BE-SEC-003 / BE-006] Fuga de Datos en Consultas Globales por Falta de Filtro Soft Delete (`app/api/v1/endpoints/tasks.py`, `tags.py`, `tasks_ai.py`, `task_assignment.py`)**:
  - **Problema**: `GET /api/v1/tasks/history`, `get_assigned_tasks` y los endpoints de IA consultaban registros de tareas eliminadas por falta de la condición `Task.deleted_at.is_(None)`.
  - **Solución**: Refactorizadas todas las consultas SQLModel/SQLAlchemy aplicando `.where(Task.deleted_at.is_(None))` de forma consistente.
- **[BE-SEC-004] Reemplazo de Retornos de Tupla por `raise HTTPException` (`app/api/v1/endpoints/auth.py`)**:
  - **Problema**: Los endpoints de autenticación retornaban tuplas como `({"detail": "..."}, 401)` en lugar de lanzar excepciones estándar de FastAPI, impidiendo que el framework gestione los status codes HTTP adecuadamente.
  - **Solución**: Reemplazados todos los retornos manuales de tuplas por `raise HTTPException(status_code=401, detail="...")`.

### 🟡 Base de Datos y Modelo de Datos (Database & Models)
- **[BE-DB-001] Implementación de Soft Delete en Eliminación de Tareas (`app/api/v1/endpoints/tasks.py`)**:
  - **Problema**: `DELETE /api/v1/tasks/{task_id}` realizaba borrado físico (`session.delete(task)`), rompiendo las restricciones de clave foránea en la tabla de historial `TaskHistory`.
  - **Solución**: Implementado Soft Delete estableciendo `task.deleted_at = datetime.now(timezone.utc)` y creando un registro de historial del tipo `DELETED`.
- **[BE-DB-002 / BE-004] Índice Único Parcial para Títulos Reutilizables (`app/models/task.py`)**:
  - **Problema**: La restricción `UniqueConstraint("user_id", "titulo")` impedía a los usuarios crear nuevas tareas con el mismo título que una tarea previamente eliminada mediante Soft Delete.
  - **Solución**: Sustituido `UniqueConstraint` por un índice único parcial en PostgreSQL/SQLite: `Index("unique_user_active_task_title", "user_id", "titulo", unique=True, postgresql_where=text("deleted_at IS NULL"), sqlite_where=text("deleted_at IS NULL"))`.
- **[BE-DB-003] Aislamiento de Base de Datos de Pruebas (`tests/conftest.py`)**:
  - **Problema**: La suite de pruebas ejecutaba `os.remove("prioritask.db")`, sobreescribiendo y destruyendo la base de datos SQLite local de desarrollo.
  - **Solución**: Configurada la base de datos de pruebas en memoria pura (`sqlite+aiosqlite:///:memory:`) con `StaticPool` y `override_get_session` en FastAPI.

### 🤖 Migración de IA Local a Ollama (`qwen2.5:7b`)
- **[BE-AI-001] Cliente Asíncrono Unificado (`app/services/AI/ollama_client.py`)**:
  - Implementado cliente asíncrono con `httpx.AsyncClient` consumiendo `http://localhost:11434/api/generate` con `"format": "json"`.
  - Estrategia de **fallback y resiliencia** que captura excepciones de red/timeout y retorna `None` sin romper peticiones en vuelo.
- **[BE-AI-002] Clasificador de Prioridad (`app/services/AI/priority_classifier.py`)**:
  - Eliminados `setfit`, `datasets` y el entrenamiento en frío al importar el módulo.
  - Conectado a Ollama para clasificar la prioridad en `"alta"`, `"media"` o `"baja"`. Fallback determinista por palabras clave de urgencia.
- **[BE-AI-003] Reformulador de Títulos (`app/services/AI/reformulator.py`)**:
  - Eliminados los 3 pipelines pesados de traducción cruzada (Helsinki ES-EN / EN-ES y T5).
  - Reescribe títulos en español directamente con Ollama. Fallback: retorna el título original.
- **[BE-AI-004] Agrupador Semántico (`app/services/AI/task_organizer.py`)**:
  - Eliminados `SentenceTransformer` y PyTorch.
  - Agrupa semánticamente listas de tareas mediante Ollama. Fallback: agrupación determinista por categoría (`tarea.categoria`).
- **[BE-AI-005] Eliminación de Dependencias Pesadas en `pyproject.toml`**:
  - Removidos `sentence-transformers`, `setfit`, `sentencepiece`, `sacremoses`, `torch` y `datasets`, aligerando el footprint del proyecto.

### 🟢 Refactorización y Estandarización de Suite de Pruebas (Pytest & AsyncClient)
- **[BE-TEST-001 / BE-010] Reorganización Estructurada y Cobertura Expandida (`tests/unit/` y `tests/integration/`)**:
  - Reorganizados 26 archivos de tests en carpetas especializadas `unit/` e `integration/`.
- **[BE-TEST-002] Descubrimiento de Tests Huérfanos**:
  - Renombrado e integrado `tests_delete_task.py` para asegurar que pytest ejecute las pruebas de borrado lógico e historial.
- **[BE-TEST-003] Migración Integral a `httpx.AsyncClient`**:
  - Eliminado `TestClient` sincrónico en módulos de `rooms` y `auth`, estandarizando todas las pruebas de integración con `AsyncClient` y `asyncio: mode=AUTO`.
- **[BE-TEST-004] Limpieza de Tests Obsoletos**:
  - Eliminados `test_sample.py` y `test_get_task_history.py`. Eliminadas funciones duplicadas como `test_room_create_with_parent_id`.
- **[BE-TEST-005] Sobreescritura Dinámica de Dependencias de DB en Pruebas**:
  - Añadido `app.dependency_overrides[get_session] = override_get_session` y fixture `reset_test_db` en scope `function` con `create_all`/`drop_all` para garantizar independencia total entre tests.
- **[BE-TEST-006 / BE-012] Pinning de Compatibilidad en `pyproject.toml`**:
  - Fijada la versión `bcrypt==4.0.1` para resolver conflictos de hashing con `passlib`.

---

## 📌 Versiones Anteriores

## 📦 Versión 0.1.0 (Lanzamiento Inicial de API Backend) — [2026-07-31]
- **API REST de Autenticación**: Endpoints `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`.
- **API REST de Tareas**: Endpoints CRUD completos para gestión de tareas, estado, prioridades y fechas límite.
- **Gestión de Hogares / Rooms**: Endpoints para estructurar tareas dentro de salas y salas padre.
- **Gestión de Etiquetas / Tags**: Endpoints para etiquetado múltiple de tareas.
- **Asignación Colaborativa de Tareas**: Endpoints para asignar tareas entre usuarios registrados.
- **Integración Inicial de Inteligencia Artificial**: Endpoints `POST /api/v1/tasks/ai/prioritize`, `/group`, `/rewrite`, `/suggest`.
- **Configuración de CORS y Entorno**: Soporte para orígenes dinámicos CORS y archivo `.env`.
