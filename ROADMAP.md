# 🗺️ ROADMAP & ARQUITECTURA TÉCNICA — Prioritask

Fuente de la Verdad única (Single Source of Truth) para la gobernanza, estándares y evolución del sistema Prioritask.

---

## 🏛️ Estándares de Calidad y Gobernanza

### 1. Backend (FastAPI + SQLModel)
- **Framework**: FastAPI (>=0.115.0) con SQLModel (~0.0.24) integrando SQLAlchemy async y Pydantic.
- **Base de Datos**: SQLite asíncrono con `aiosqlite` en desarrollo y tests; arquitectura compatible con PostgreSQL.
- **ORM & Modelado**: Relaciones bidireccionales explícitas con guardas `if TYPE_CHECKING:` para garantizar cero importaciones circulares en tiempo de inicialización de mappers.
- **Migraciones**: Alembic con `env.py` blindado que importa exhaustivamente todos los modelos (`Tag`, `TaskTag`, `TaskHistory`, `Room`, `RoomMember`, `Task`, `Usuario`, etc.) para prevenir sentencias destructivas (`DROP TABLE`) accidentales.
- **Naming Conventions**: Conservación estricta del naming en español (`titulo`, `descripcion`, `categoria`, `estado`) por consistencia con la base instalada y contratos históricos de la API.

### 2. Cobertura y Estrategia de Pruebas
- **Umbral Mínimo**: Cobertura global obligatoria >= 65% (definida en `pyproject.toml` con `fail_under = 65`).
- **Framework**: `pytest` + `pytest-asyncio` + `httpx.AsyncClient`.
- **Aislamiento**: Base de datos de pruebas en memoria aislada (`sqlite+aiosqlite:///:memory:`) con `StaticPool` y fixtures con reset por función (`create_all` / `drop_all`).
- **Estructura**: `tests/unit/` (persistencia y servicios) y `tests/integration/` (flujos HTTP y seguridad).

### 3. Seguridad y Multi-tenancy
- **Zero Trust**: Todos los endpoints de datos e inferencia protegidos obligatoriamente con JWT (`Depends(get_current_user)`).
- **Aislamiento por Hogar (Multi-tenancy)**: Segregación contextual por `room_id` y control de pertenencia mediante `RoomMember`.
- **RBAC en Convivencia**: Roles contextuales `ADMIN` y `MEMBER` (`RoomMemberRole`). Solo administradores y propietarios pueden gestionar miembros o revocar accesos.
- **Prevención de IDOR**: Validación estricta de propiedad/membresía previa a cualquier mutación o consulta (`404` para no divulgación o `403` según matriz RBAC).
- **Protección CORS**: Mitigación CWE-942 activa en `core/config.py` y `main.py`, prohibiendo el comodín `*` en presencia de credenciales (`allow_credentials=True`).
- **Integridad de Datos**: Borrado lógico (Soft Delete) en tareas vía `Task.deleted_at` con índice único parcial para posibilitar la reutilización de títulos activos.

### 4. Inferencia IA Local Resiliente
- **Motor**: Ollama local (`qwen2.5:7b`) desacoplado mediante cliente HTTP asíncrono (`ollama_client.py`).
- **Estrategia de Fallback**: Todos los servicios de IA (`priority_classifier`, `reformulator`, `task_organizer`) disponen de degradación elegante determinista ante caídas de conexión, timeouts o JSONs malformados.
- **Timeouts**: Timeout estricto y reintentos con backoff exponencial.

---

## 📜 Principios de Gobernanza Obligatorios

1. **Cero Alucinaciones**: Toda planificación, endpoint y modelo debe fundamentarse exclusivamente en este archivo y en el código real inspeccionado.
2. **Compatibilidad Hacia Atrás**: Prohibidas migraciones destructivas o alteraciones a esquemas en producción sin estrategia previa de preservación de datos y respaldo de base de datos (`.db.bak`).
3. **Quality Gates Innegociables**: Ningún ticket se cierra ante el usuario si `pytest` falla, la cobertura desciende del 65% o `ruff` reporta errores de formato o tipos.
4. **Skills GitNexus Obligatorias**: Toda delegación de desarrollo debe invocar la skill de área correspondiente (`gitnexus-area-endpoints`, `gitnexus-area-services`, `gitnexus-area-schemas`, etc.) y ejecutar análisis de radio de impacto (`gitnexus-impact-analysis`).

---

## 🚀 Estado de los Sprints

### Sprint 1: Núcleo Relacional Colaborativo (Core DB) — [COMPLETADO ✅]
- [x] Modelo many-to-many `RoomMember` con roles `ADMIN` y `MEMBER` (`RoomMemberRole`).
- [x] Campo `is_recurring: bool` en `Task` (preparación para motor de IA y rutinas).
- [x] Relaciones bidireccionales en `Usuario` (`rooms_member`), `Room` (`tasks`, `members`) y `Task` (`room`).
- [x] Migración Alembic `75cee56d2723` aplicada sin drops y con retrocompatibilidad SQLite.
- [x] Tests unitarios de persistencia asíncrona (`test_room_member_persistence.py`).
- [x] Auditoría QA-Sentinel aprobada: 129 tests pasando, 67% cobertura, 0 errores en Ruff.

### Sprint 2: Motor de Rutinas y Membresía de Hogares — [COMPLETADO ✅]
- [x] **S2-T1**: Schemas Pydantic para `RoomMember` (`RoomMemberRead`, `RoomMemberCreate`, `RoomMemberUpdate`) y enriquecimiento de `RoomRead` para incluir lista de convivientes y rol actual del usuario.
- [x] **S2-T2**: Endpoints CRUD de gestión de miembros (`/rooms/{room_id}/members`) con validación RBAC (solo `owner` o `ADMIN` pueden añadir/eliminar miembros).
- [x] **S2-T3**: Refactorización de `GET /rooms` para devolver tanto hogares en propiedad como hogares donde el usuario es miembro activo con visibilidad de sus compañeros.
- [x] **S2-T4**: Modelo `RecurrenceRule` (frecuencia, intervalo, fechas) y migración Alembic.
- [x] **S2-T5**: Servicio de cálculo de recurrencia (`app/services/recurrence.py`) para avanzar tareas recurrentes y recalcular fechas límite.
- [x] **S2-T6**: Suite de tests de integración para membresía, control de acceso y cálculo de recurrencia.
- [x] **Quality Gate**: 144 tests pasando (100%), 65% cobertura, 0 errores en Ruff, auditoría de seguridad APROBADA.

### Sprint 3: IA Resiliente y Contextual — [COMPLETADO ✅]
- [x] Circuit breaker para Ollama client con métricas de salud (`app/services/AI/circuit_breaker.py`, `GET /tasks/ai/health`).
- [x] Caché semántica en memoria con TTL (`app/services/AI/cache.py`).
- [x] Priorización contextual aprovechando fechas límite, tareas recurrentes, colaboradores y pesos (`evaluar_prioridad_contextual`).
- [x] **Quality Gate**: 164 tests pasando (100%), 70% cobertura global, 0 errores en Ruff, auditoría de seguridad y resiliencia APROBADA.

### Sprint 4: Sincronización e Integración Frontend — [COMPLETADO ✅]
- [x] Integración de contratos de miembros y recurrencia en `prioritask-frontend` (React 19 + TypeScript).
- [x] Componente visual retro de gestión de convivientes (`RoomMembersModal.tsx`) y selector de hogares compartidos en `Dashboard.tsx`.
- [x] Visualización de badges de tareas recurrentes (`RecurringBadge`) en `TaskCard` y control en `TaskForm`, además de monitor `AIHealthBadge`.
- [x] **Quality Gate**: Build de Vite y ESLint 100% limpios, 164 tests backend en verde (100%), 70% cobertura global, 0 errores en Ruff, auditoría de seguridad y CORS APROBADA.

### Sprint 5: Hardening, CI/CD y Preparación para Producción — [COMPLETADO ✅]
- [x] Pipeline automatizado de GitHub Actions con quality gate estricto dual (Ruff + Pytest + Cov >= 65% y ESLint + Vite build).
- [x] Rate limiting en endpoints sensibles (`/auth/login`, `/auth/register`, `/tasks/ai/*`) y auditoría expandida en `TaskHistory` (`CREATED`, `RECURRENCE_ADVANCED`).
- [x] Documentación OpenAPI interactiva enriquecida con tags descriptivos y esquema de seguridad `HTTPBearer` (botón Authorize).
- [x] **Quality Gate**: 172 tests en verde (100%), 70% cobertura global, 0 errores en Ruff, build de Vite exitoso en 3.07s, auditoría de seguridad y hardening APROBADA.

