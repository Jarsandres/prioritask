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
- **Validación Criptográfica en Arranque (`validate_security_posture`)**: `Settings` bloquea claves JWT inseguras o por defecto (`INSECURE_JWT_SECRETS`), exige claves de al menos 32 caracteres (256 bits) en `ENVIRONMENT="production"` y prohíbe el uso de bases de datos SQLite en producción (CWE-798, CWE-321, CWE-287).
- **Criptografía Moderna (`PyJWT` + `bcrypt` nativo)**: Emisión y verificación de tokens mediante `PyJWT[crypto]>=2.8.0` y hashing de contraseñas no bloqueante (`asyncio.to_thread`) directo con `bcrypt>=4.0.1` (`BCRYPT_ROUNDS=12`), erradicando dependencias obsoletas (`python-jose`, `passlib`, CVE-2024-33663, CVE-2024-33664).
- **Aislamiento por Hogar (Multi-tenancy)**: Segregación contextual por `room_id` y control de pertenencia mediante `RoomMember`.
- **RBAC en Convivencia**: Roles contextuales `ADMIN` y `MEMBER` (`RoomMemberRole`). Solo administradores y propietarios pueden gestionar miembros o revocar accesos.
- **Prevención de IDOR**: Validación estricta de propiedad/membresía previa a cualquier mutación o consulta (`404` para no divulgación o `403` según matriz RBAC).
- **Protección CORS**: Mitigación CWE-942 activa en `core/config.py` y `main.py`, prohibiendo el comodín `*` en presencia de credenciales (`allow_credentials=True`).
- **Integridad de Datos**: Borrado lógico (Soft Delete) en tareas vía `Task.deleted_at` con índice único parcial para posibilitar la reutilización de títulos activos.

### 4. Inferencia IA Local Resiliente
- **Motor**: Ollama local (`qwen2.5:7b`) desacoplado mediante cliente HTTP asíncrono (`ollama_client.py`).
- **Estrategia de Fallback**: Todos los servicios de IA (`priority_classifier`, `reformulator`, `task_organizer`) disponen de degradación elegante determinista ante caídas de conexión, timeouts o JSONs malformados.
- **Blindaje Anti-Prompt Injection (OWASP LLM01 / CWE-77)**: Sanitización estricta de entradas de usuario mediante `sanitize_prompt_input` (eliminación de caracteres de control, escape de comillas y delimitadores, truncamiento a 200 caracteres), encapsulado en delimitadores estructurales `"""..."""` y separación de rol `system` en `generate_json`.
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

### Sprint 11: Hardening de Seguridad, Asincronía No Bloqueante, Offline Mutation Engine & A11y Testing — [COMPLETADO ✅]
- [x] **ASYNC-010**: Asincronía no bloqueante delegando I/O síncrono de disco y operaciones CPU-bound criptográficas a hilos de pool mediante `asyncio.to_thread` (`LocalStorageService`, `app/services/auth.py` con Bcrypt).
- [x] **SEC-050**: Revocación de Sesiones JWT y Blacklist con Redis (`POST /auth/logout`, `token_version` en `Usuario`, migración Alembic `e4c82d1b7a30`).
- [x] **SEC-060**: Middleware global de Cabeceras de Seguridad (`SecurityHeadersMiddleware` con CSP, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy).
- [x] **PERF-020**: Paginación estricta (`le=100`) en endpoints de listado (`/tasks/`, `/rooms/`, `/tags/`, `/subtasks/`, `/comments/`), mitigación DoS en búsqueda FTS SQL (truncamiento y sanitización de longitud) y 5 índices compuestos en BD.
- [x] **CLEAN-010**: Eliminación del hack `__getattribute__` en modelo `Task`, reemplazado por `getattr` seguro y propiedades estandarizadas.
- [x] **RATE-010**: Rate Limiting granular en endpoints críticos de autenticación, salas, adjuntos e inferencia IA.
- [x] **SSE-020**: Reactividad atómica in-place en cliente SSE (`prioritask-frontend`), eliminando parpadeos completos de listas, memoización de `TaskCard` y desacoplamiento de `ToastContext` (`ToastDispatchContext` y `ToastStateContext`).
- [x] **OFFLINE-020**: Motor de cola de mutaciones Offline con IndexedDB (`offlineQueue.ts`), captura y retención de operaciones fallidas por desconexión y sincronización secuencial FIFO en reconexión.
- [x] **TOUCH-010**: Experiencia táctil mobile con gestos Swipe en tarjetas de tareas, selector segmentado táctil de prioridades y modales adaptativos BottomSheet en viewport móvil.
- [x] **A11Y-010**: Accesibilidad WCAG 2.1 AA con hook `useA11yModal` (Focus Trap, restauración de foco, tecla Escape) y componente `ScreenReaderAnnouncer` con `aria-live="polite"` para notificaciones auditivas.
- [x] **TEST-010**: Elevación del umbral de cobertura en backend a `>= 70%` en CI (`pyproject.toml`, `.github/workflows/ci.yml`), 12 suites unitarias en Vitest + RTL (100% pass rate) y optimización de CI con caché para binarios Playwright (`actions/cache`).
- [x] **Quality Gate Consolidado**: 264 tests backend en verde (100% pass rate), cobertura >= 70%, 12 suites unitarias frontend en Vitest (100% pass rate), 0 errores Ruff/ESLint, build Vite limpio.

### Sprint 12: Motor de Alto Rendimiento, Escalabilidad, Redis Pub/Sub, Virtualización DOM & Web Workers — [COMPLETADO ✅]
- [x] **PERF-AI-010**: Concurrencia e IA de Alto Rendimiento: cliente persistente `httpx.AsyncClient` reutilizable en `OllamaClient`, control de concurrencia acotada con `asyncio.Semaphore(4)` y procesamiento paralelo en `task_organizer.py`.
- [x] **CACHE-SEM-010**: Caché Semántica Híbrida L1 (Memoria LRU con TTL) / L2 (Redis distribuido con `redis.asyncio`) con normalización de claves NFKC, sanitización de espacios y serialización JSON determinista.
- [x] **SQL-OPT-010**: Erradicación de consultas N+1 en analítica de hogar (`app/services/analytics.py`, `app/api/v1/endpoints/rooms.py`) mediante agregación pura SQL (`func.count`, `func.avg`, `case`) y Read-Through Cache con Redis (TTL 60s) e invalidación reactiva por mutación.
- [x] **INDEX-COV-010**: Covering Indexes de alto rendimiento en BD (`ix_task_room_analytics_covering` e `ix_gamification_leaderboard_covering`) vía migración Alembic `d1e2f3a4b5c6`.
- [x] **DIST-SSE-010**: Hub Server-Sent Events distribuido `DistributedRoomEventBroadcaster` con soporte de clustering Redis Pub/Sub, colas bounded Drop-Oldest (`maxsize=100`) para clientes lentos y keep-alive cada 15s.
- [x] **FTS-OPT-010**: Motor de Búsqueda FTS optimizado con autocompletado en tiempo real (`/api/v1/rooms/{room_id}/search/autocomplete`), límites acotados y sanitización contra inyecciones de comodines.
- [x] **FE-VIRT-010**: Virtualización DOM inteligente en `prioritask-frontend` con `@tanstack/react-virtual` (>40 tareas) en `TaskListView` y `TaskKanbanBoard`, manteniendo compatibilidad con modales, drag-and-drop y scroll fluido.
- [x] **FE-CACHE-010**: Gestor de Caché L1 SWR en cliente (`cacheManager.ts`) con política de revalidación en background, invalidación reactiva instantánea ante eventos SSE y 0ms de tiempo de espera percibido.
- [x] **FE-WORKER-010**: Procesamiento en background con Web Worker dedicado (`imageCompressor.worker.ts`) y `OffscreenCanvas` para compresión WebP sin bloquear el hilo principal (60 FPS garantizados).
- [x] **FE-SEARCH-010**: Búsqueda multi-capa y autocompletado en `CommandPaletteModal` (0ms caché en memoria + LRU + backend fallback) y debounce optimizado a 150ms.
- [x] **TEST-SCALE-010**: Expansión de suites de pruebas a 272 tests backend en verde (100%), suites de virtualización en Vitest y validación de calidad continua.
- [x] **Quality Gate Consolidado**: 272 tests backend en verde (100% pass rate), cobertura >= 70%, 0 errores Ruff/ESLint, build Vite limpio en 2.48s, auditoría de rendimiento y escalabilidad APROBADA.

### Sprint 13: Motor de Recurrencia Avanzado, Modos Fijo/Flotante, Remediación de Auditoría de Seguridad (v1.6.1) & Split-Screen Auth 21st.dev (v1.6.2) — [COMPLETADO ✅]
- [x] **REC-ENG-010**: Modos de recurrencia `FIXED` vs `FLOATING` (`RecurrenceMode`), anclaje mensual `anchor_day_of_month` y flag `reset_subtasks` en `RecurrenceRule` (migración Alembic `e5a9b1c2d3f4`).
- [x] **REC-CALC-010**: Algoritmo anti-deriva mensual (preservación de días 29/30/31 tras meses cortos), catch-up secuencial en modo `FIXED` y anclaje a `completed_at` en modo `FLOATING` (`every!`).
- [x] **REC-SUB-010**: Clonación automática de jerarquía de subtareas activas (`Subtask`) con reseteo `completada=False` y endpoint `POST /api/v1/tasks/{task_id}/advance` con difusión SSE.
- [x] **FE-REC-010**: Motor DSL bilingüe (`recurrenceEngine.ts`), previsualización interactiva de próximos ciclos (`previewNextOccurrences`) en `TaskForm.tsx` y avance reactivo en `TaskList.tsx`.
- [x] **SEC-AUD-010**: Remediación crítica de `auth-jwt-hardcoded-secret-key-fallback` (CRITICAL, CWE-798/CWE-321/CWE-287) eliminando el fallback `"dev-secret"` e incorporando `validate_security_posture` en `Settings`.
- [x] **SEC-AUD-020**: Remediación de `ai-prompt-injection-task-reformulation` (MEDIUM, OWASP LLM01 / CWE-77) mediante `sanitize_prompt_input`, delimitadores estructurales `"""..."""` y rol `system` en `OllamaClient`.
- [x] **SEC-AUD-030**: Remediación de `supply-chain-deprecated-crypto-libraries` (LOW, CWE-1104, CVE-2024-33663/33664) migrando de `python-jose` y `passlib` a `PyJWT[crypto]>=2.8.0` y `bcrypt>=4.0.1` directo.
- [x] **SEC-AUD-040**: Cierre de `db-sqlite-file-insecure-default` prohibiendo SQLite y exigiendo `len(JWT_SECRET_KEY) >= 32` en `ENVIRONMENT="production"`, además de blindaje en `.gitignore` y `.dockerignore`.
- [x] **FE-AUTH-010/020/030 (v1.6.2)**: Rediseño Split-Screen 21st.dev de `Login.tsx` y `Register.tsx` mediante la primitiva `SignInPage.tsx`, inputs translúcidos `GlassInputWrapper` reactivos al Theme Studio (`Auth.css`), escaparate de convivencia doméstica con insignias de gamificación (`PRIORITASK_TESTIMONIALS`), persistencia de `rememberMe` y suite unitaria `SignInPage.test.tsx`.
- [x] **Quality Gate Consolidado**: **316 tests backend en verde (100% pass rate)**, **cobertura >= 70%**, **22 suites unitarias frontend en Vitest (123 tests en verde)**, **0 errores Ruff/ESLint**, build Vite limpio, auditoría de seguridad Cloudflare 100% remediada y verificada.

### Sprint 14: Sincronización Offline-First Avanzada (HLC/OCC), Endpoint Batch Sync, Coordinación Multi-Pestaña con Líder Único & Recordatorios Accionables (v1.7.0 – v1.8.0) — [COMPLETADO ✅]
- [x] **REA-SYNC-010 / REA-ARCH-020**: Inspección estática y extracción de patrones arquitectónicos desde `todoist-electron@9.31.0` (`app.asar`): sobres de comandos IPC (`DesktopBridgeEnvelope`), elección de ventana líder (`We.mainLogicWindow`, `Gn(e)`, guardia `zi(e)`), reanudación tras suspensión (`powerMonitor.on("resume")` con settle delay de `500ms`), retención anti-GC de notificaciones (`Jt = new Map`) y acciones rápidas de posposición (`30m`, `3h`, `tomorrow9am`).
- [x] **FE-SYNC-010/020 (v1.7.0)**: Motor `OfflineSyncEngine` con mutación optimista (`OptimisticSnapshot`), soporte de `temp_id` con encadenamiento de comandos offline, persistencia IndexedDB (`prioritask_sync_engine_db`) y resolución de conflictos configurable.
- [x] **BE-SYNC-010 (v1.8.0)**: Control de Concurrencia Optimista (OCC), relojes lógicos híbridos por campo (`field_hlc: dict[str, str]`, `version: int`, `reminder_at: datetime | None` en `Task`), tabla de idempotencia `ProcessedSyncCommand` (`migración f9b2c3d4e5a6`) y endpoint transaccional `POST /api/v1/sync/batch` con fusión `field-hlc-merge`, mapeo `temp_id -> task.id`, validación Anti-IDOR y difusión SSE (`TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`).
- [x] **FE-HLC-010 (v1.8.0)**: Reloj Lógico Híbrido determinista (`HybridLogicalClock` en `src/sync/hlc.ts` con formato `<epoch_ms_13d>:<counter_hex_4d>:<node_id>`), transporte HTTP por lotes (`createHttpSyncTransport`), clasificador `isTransientNetworkError` y monitor de despertar del sistema (`attachSystemWakeupMonitor`).
- [x] **FE-TAB-010 (v1.8.0)**: Coordinador multi-pestaña con líder único (`TabLeaderCoordinator` en `src/sync/tabCoordinator.ts`) mediante Web Locks API (`navigator.locks.request`), fallback de latidos sobre `BroadcastChannel("prioritask_sync")`, guardia de emisor `isAuthorizedSender` y refactorización de `useRoomEvents.ts` para multiplexar una única conexión `EventSource` SSE desde la pestaña líder hacia las pestañas seguidoras con failover automático.
- [x] **FE-REM-010 (v1.8.0)**: Motor de recordatorios accionables en segundo plano (`BackgroundReminderScheduler` en `src/notifications/reminderScheduler.ts`) con persistencia IndexedDB (`prioritask_reminders_db`), retención anti-GC (`activeNotifications`), catch-up al despertar (`triggerWakeupCatchUp`), acciones rápidas (`action.complete`, `action.snooze.30m`, `action.snooze.3h`, `action.snooze.tomorrow9am`) y Service Worker `public/sw-reminders.js`.
- [x] **Quality Gate Consolidado**: **341 tests backend en verde (100% pass rate)**, **73.90% cobertura** (`100%` en `app/api/v1/endpoints/sync.py`), **34 suites Vitest / 173 tests** en verde, **0 errores Ruff/ESLint**, build Vite limpio y pipeline CI/CD completo en verde.

### Sprint 15: Centro de Ajustes Todoist (Settings Workspace), Store Normalizado O(1) `useTasksState` & Primitiva `TaskItem` WAI-ARIA Roving TabIndex (v1.8.0 – v1.9.0) — [COMPLETADO ✅]
- [x] **REA-UI-030**: Inspección estática y extracción de patrones UI/UX del renderer de `todoist-electron@9.31.0` (`app.asar` -> `webpack/src/app/`): normalización de entidades en diccionario indexado O(1), desacoplamiento entre estado de datos y estado de vistas/overlays, jerarquía semántica WAI-ARIA con *roving tabindex*, indicadores cromáticos P1–P4 y centro de ajustes de 7 secciones.
- [x] **FE-SET-010**: `SettingsContext.tsx` y rediseño integral de `Profile.tsx` como Centro de Ajustes y Perfil estilo Todoist con 7 secciones navegables (`Cuenta`, `General`, `Apariencia y Tema`, `Barra Lateral y Navegación`, `Productividad y Karma`, `Recordatorios y Notificaciones`, `Atajos y Acerca de`), sincronización con `PATCH /users/me/preferences` y control dinámico de módulos del `Sidebar.tsx`.
- [x] **FE-STORE-010 (`useTasksState.ts`)**: Hook y *reducer* normalizado O(1) (`byId: Record<string, Task>`, `ids: string[]`, `pendingById`, `ui`) con mutaciones optimistas atómicas (`toggleCompleteOptimistic`, `updateTaskOptimistic`, `setPriorityOptimistic`, `deleteTaskOptimistic`), registro `inFlightRef` para rollbacks por campo sin condiciones de carrera y conciliación SSE/IPC unificada (`TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `SUBTASK_TOGGLED`, `SUBTASK_CREATED`, `COMMENT_ADDED`, `COMMENT_DELETED`, `ATTACHMENT_ADDED`, `ATTACHMENT_DELETED`).
- [x] **FE-TASK-010 (`TaskItem.tsx` & `TaskListView.tsx`)**: Primitiva accesible de fila de tarea con `role="listitem"`, checkbox `role="checkbox"` con anillo cromático P1–P4 (`pesoToPriorityLevel`), gestión de foco espacial (*roving tabindex* con `↑`/`↓`/`Home`/`End`), atajos de una tecla (`Espacio`/`x` completar, `e`/`Enter` abrir Peek Drawer, `1`–`4` prioridad instantánea, `Shift+Espacio`/`s` selección múltiple, `Supr` eliminar), botón de avance de ciclo recurrente (`onAdvance`) y soporte para virtualización `@tanstack/react-virtual`.
- [x] **FE-PARITY-010 (`TaskList.tsx`, `RoomTasks.tsx` & `KeyboardShortcutsModal.tsx`)**: Unificación de `TaskList.tsx` y `RoomTasks.tsx` sobre `useTasksState`, manteniendo caché L1 SWR (`cacheManager`), celebración de confeti (`usePixelConfetti`), sincronización reactiva de `TaskPeekDrawer` sobre `byId` y documentación interactiva de los nuevos atajos en `KeyboardShortcutsModal.tsx`.
- [x] **Quality Gate Consolidado**: **37 suites unitarias frontend en Vitest** (`useTasksState.test.ts`, `TaskItem.test.tsx`, `RoomTasks.test.tsx`, `Profile.test.tsx`), tipado estricto TypeScript y verificación de grafo GitNexus.
