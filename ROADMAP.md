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

### Sprint 6: Remediación Crítica, Subtareas y Hardening SAST — [COMPLETADO ✅]
- [x] **SEC-040**: Remediación crítica de Rate Limiter (`app/core/rate_limit.py`) con blindaje contra spoofing de cabeceras, soporte para proxies seguros y almacenamiento thread-safe con ventana deslizante.
- [x] **SUB-010**: Modelo relacional `SubTask` (`app/models/subtask.py`) con gobernanza Soft-delete (`deleted_at`), índices parciales y migraciones Alembic `4a781b2c9e31` y `b8c41d9e2f50`.
- [x] **SUB-020**: Endpoints CRUD de subtareas (`/api/v1/tasks/{task_id}/subtasks`) con validación de propiedad IDOR y componentes reactivos en UI (`TaskChecklist.tsx`).
- [x] **UI-060**: Unificación del sistema de Toasts y notificaciones retro-consistentes en la interfaz de usuario.
- [x] **SEC-SAST**: Pipeline SAST en GitHub Actions reforzado con auditoría de dependencias (`pip-audit` y `npm audit`).
- [x] **Quality Gate**: Tests unitarios y de integración para subtareas y rate limiter aprobados al 100%.

### Sprint 7: Tiempo Real (SSE), Colaboración y Vista Calendario — [COMPLETADO ✅]
- [x] **REAL-010**: Hub Server-Sent Events (SSE) en tiempo real (`app/services/events.py`, `/api/v1/rooms/{room_id}/events`) con difusión asíncrona segregada por hogar y heartbeat keep-alive.
- [x] **SYNC-010**: Cliente reactivo multi-pestaña en frontend (`useRoomEvents.ts`) con reconexión exponencial y actualización automática de estado sin recarga.
- [x] **VIEW-010**: Vista Calendario y Agenda cronológica (`TaskCalendarView.tsx`, `TaskViewSwitcher.tsx`) con filtros temporales y navegación mensual/semanal.
- [x] **COM-010**: Modelo relacional `TaskComment` (`app/models/comment.py`), migración Alembic `e9d52f1a8c30` y endpoints `/api/v1/tasks/{task_id}/comments` con control de acceso y autoría inmutable.
- [x] **COM-020**: Sección interactiva de comentarios en tiempo real (`TaskCommentsSection.tsx`) integrada en el detalle de tareas.
- [x] **Quality Gate**: Tests de integración para SSE (`test_sse_events.py`), comentarios (`test_comments_api.py`) y calendario pasando al 100%.

### Sprint 8: Infraestructura Escalable, Analítica y Resiliencia Distribuida — [COMPLETADO ✅]
- [x] **INFRA-010**: Connection pooling avanzado en PostgreSQL/SQLAlchemy (`app/db/session.py`, `app/core/config.py`) con `pool_pre_ping=True`, reciclaje periódico y dimensionamiento configurable.
- [x] **DIST-010**: Arquitectura hexagonal para Rate Limiter y Distributed Lock (`app/services/lock.py`, `app/core/rate_limit.py`) con adaptadores duales para Redis y memoria local.
- [x] **ANLY-010**: Motor de analítica y métricas de hogar (`/api/v1/rooms/{room_id}/analytics`) con distribución por prioridad, ratios de compleción y rendimiento por miembro.
- [x] **ANLY-020**: Dashboard analítico retro en frontend con métricas visuales del hogar (`RoomAnalyticsModal.tsx`, `src/types/analytics.ts`).
- [x] **LOAD-010**: PWA Offline-First (`manifest.webmanifest`, `useNetworkStatus.ts`, `OfflineBanner.tsx`) y suite de pruebas de carga Locust (`tests/load/locustfile.py`).
- [x] **Quality Gate**: Tests unitarios de pool DB, lock service, rate limiter Redis y analítica de hogar pasando al 100%.

### Sprint 9: Motor de Búsqueda FTS, Command Palette y Gamificación Retro — [COMPLETADO ✅]
- [x] **FTS-010**: Motor de Búsqueda de Texto Completo (Full-Text Search) ponderado (`app/services/search.py`, `/api/v1/rooms/{room_id}/search`) con ranking por título, descripción y etiquetas.
- [x] **CMD-010**: Command Palette global `Ctrl+K` / `Cmd+K` (`CommandPaletteModal.tsx`, `CommandPaletteModal.css`) para navegación ultrarrápida y ejecución de acciones.
- [x] **GAME-010**: Sistema de Gamificación con protección anti double-spending y rachas (`app/models/gamification.py`, `app/services/gamification.py`, `/api/v1/rooms/{room_id}/gamification`) otorgando XP y niveles por compleción de tareas.
- [x] **GAME-020**: Celebración visual retro con audio sintetizado chiptune (`retroAudio.ts`) y confeti pixelado (`usePixelConfetti.ts`).
- [x] **E2E-010**: Suite de pruebas End-to-End con Playwright (`prioritask-frontend/e2e/`, `playwright.config.ts`) integrada en el pipeline de CI.
- [x] **Quality Gate**: Tests unitarios y de integración para FTS, gamificación y E2E aprobados al 100%.

### Sprint 10: Almacenamiento Hexagonal, Privacidad GDPR y Optimización Bundle — [COMPLETADO ✅]
- [x] **ATT-010/011/012**: Arquitectura hexagonal de almacenamiento de adjuntos (`app/services/storage/`), validación Zero Trust con Magic Bytes (`security.py`), modelo `TaskAttachment` y endpoints `/api/v1/tasks/{task_id}/attachments`.
- [x] **ATT-020**: Dropzone drag-and-drop, captura directa por cámara móvil y compresión client-side a WebP (`attachmentUtils.ts`, `TaskAttachmentsSection.tsx`).
- [x] **ATT-021**: Modal Lightbox retro pixel-art (`AttachmentLightboxModal.tsx`) con previsualización segura de imágenes y PDFs.
- [x] **GDPR-010/020**: Cumplimiento GDPR con exportación en streaming JSON/CSV de datos del hogar (`/api/v1/rooms/{room_id}/export`) y plantilla imprimible A4 para nevera (`FridgeTemplateModal.tsx`).
- [x] **PERF-010**: Code-splitting en Vite (`vite.config.ts`) con chunks dinámicos manuales, reduciendo el bundle JS inicial a 183 kB.
- [x] **E2E-020**: Suite E2E ampliada con flujos completos de adjuntos, búsqueda, gamificación y exportación.
- [x] **Quality Gate Consolidado**: 241 tests backend (100% pass), cobertura >= 65% (69.54%), 0 errores Ruff/ESLint, suite Playwright E2E completa, auditoría de seguridad Zero Trust APROBADA.

### Sprint de Calidad, Hardening y Optimización de Testing — [COMPLETADO ✅]
- [x] **PERF-TEST-01**: Aceleración drástica de la suite de pruebas backend a ~37.1s (-70% de tiempo de ejecución) optimizando rondas de Bcrypt (`rounds=4` en fixture de conftest), mocks asíncronos para inferencia IA y corte inmediato de streams SSE.
- [x] **HARD-010**: Endurecimiento arquitectónico de 6 defectos críticos:
  1. Serialización y deserialización consistente de `TaskRead` en tareas vencidas (`due_date` retroactivo).
  2. Transaccionalidad y commit atómico en operaciones de subtareas (`SubTask`).
  3. Compensación física `delete_file` en almacenamiento hexagonal ante fallos en persistencia de base de datos de adjuntos.
  4. Validación estricta de propiedad de candados distribuidos (`acquired=True`), retornando `409 Conflict` cuando otro proceso retiene el lock.
  5. Sanitización de comodines SQL (`%`, `_`) y soporte de emojis/símbolos multibyte en búsqueda Full-Text Search (`FTS`).
  6. Integridad referencial y cascada controlada en la eliminación de hogares compartidos (`Room`).
- [x] **FE-TEST-01**: Adopción de Vitest + React Testing Library en `prioritask-frontend` (`vitest.config.ts`, `src/test/setup.ts`, script `test:unit`), implementando 5 suites unitarias (34 tests en verde).
- [x] **FE-HARD-01**: Mapeo estricto de errores Axios (413 Payload Too Large, 415 Unsupported Media Type, errores offline), optimización de memoria en compresión WebP vía `createObjectURL` y Audio Unlocker pasivo para navegadores móviles (iOS/Chrome).
- [x] **Quality Gate Consolidado**: 255 tests backend pasando al 100%, elevación de cobertura a >82.5% con branch coverage (`--cov-branch`), cobertura en capa endpoints superior al >92%, 5 suites unitarias frontend (34 tests), suites E2E Playwright activas, 0 errores en Ruff y 0 errores en ESLint.



