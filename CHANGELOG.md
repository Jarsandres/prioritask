# 📋 CHANGELOG & QA AUDIT RELEASE NOTES — Prioritask Backend

Todos los cambios notables realizados en el backend de Prioritask se documentan en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## 🚀 Versión 1.2.0 (Hardening, Tiempo Real, Analítica, Búsqueda FTS, Gamificación, Adjuntos, GDPR & E2E — Sprints 6 a 10) — [2026-10-07]

### 🛡️ Sprint 6: Remediación Crítica, Subtareas y Hardening SAST
- **[SEC-040] Remediación Crítica de Rate Limiter (`app/core/rate_limit.py`)**:
  - Prevención de bypass por cabeceras `X-Forwarded-For` no confiables mediante validación estricta de IPs y soporte para proxies seguros.
  - Desacoplamiento de almacenamiento de marcas de tiempo y control de concurrencia thread-safe con ventana deslizante determinista.
- **[SUB-010] Modelo Relacional SubTask con Gobernanza Soft-Delete (`app/models/subtask.py`)**:
  - Creación del modelo `SubTask(SQLModel, table=True)` con campos `id`, `tarea_id`, `titulo`, `completada`, `created_at`, `updated_at` y `deleted_at`.
  - Migraciones Alembic `4a781b2c9e31_add_subtask_model.py` y `b8c41d9e2f50_add_deleted_at_to_subtask.py` con índice parcial en SQLite y PostgreSQL para títulos activos reutilizables.
- **[SUB-020] Endpoints y Checklists Reactivos (`app/api/v1/endpoints/subtasks.py`, `TaskChecklist.tsx`)**:
  - Endpoints CRUD completos `/api/v1/tasks/{task_id}/subtasks` con protección IDOR estricta contra acceso no autorizado.
  - Componente frontend interactivo `TaskChecklist.tsx` con marcado instantáneo de progreso y feedback visual retro.
- **[UI-060] Unificación del Sistema de Toasts**:
  - Consolidación de alertas y mensajes de feedback visual con estética retro pixel-art y temporización controlada.
- **[SEC-SAST] Pipeline SAST con `pip-audit` y `npm audit` (`.github/workflows/ci.yml`)**:
  - Integración de escaneos estáticos automatizados contra bases de datos de vulnerabilidades conocidas (CVE) para dependencias de backend y frontend en cada Pull Request.

### ⚡ Sprint 7: Hub SSE en Tiempo Real, Sincronización y Vista Calendario
- **[REAL-010] Hub Server-Sent Events (SSE) en Tiempo Real (`app/services/events.py`, `app/api/v1/endpoints/rooms.py`)**:
  - Implementación de `RoomEventBroadcaster` con canales asíncronos en memoria (`asyncio.Queue`) segregados por identificador de hogar (`room_id`).
  - Endpoint `GET /api/v1/rooms/{room_id}/events` emitiendo eventos de ciclo de vida (`task_created`, `task_updated`, `task_deleted`, `comment_created`) con heartbeat keep-alive automático para prevenir desconexiones por inactividad.
- **[SYNC-010] Cliente Reactivo Multi-Pestaña (`src/hooks/useRoomEvents.ts`)**:
  - Hook reactivo frontend para consumo de SSE con reconexión exponencial y difusión de eventos a través de `BroadcastChannel` para sincronización instantánea entre pestañas del navegador sin duplicar conexiones HTTP.
- **[VIEW-010] Vista Calendario / Agenda Cronológica (`TaskCalendarView.tsx`, `TaskViewSwitcher.tsx`)**:
  - Módulo de visualización en vista de cuadrícula mensual y agenda semanal, ordenando tareas según fecha límite (`due_date`) y nivel de urgencia/prioridad.
- **[COM-010 / COM-020] Notas y Comentarios Relacionales (`app/models/comment.py`, `app/api/v1/endpoints/comments.py`, `TaskCommentsSection.tsx`)**:
  - Modelo relacional `TaskComment` y migración Alembic `e9d52f1a8c30_add_taskcomment_model.py`.
  - Endpoints `/api/v1/tasks/{task_id}/comments` protegidos con validación IDOR y preservación de autoría inmutable.
  - Sección interactiva en frontend con carga asíncrona de comentarios y formateo retro de fechas.

### 📊 Sprint 8: Infraestructura Escalable, Analítica y Resiliencia Distribuida
- **[INFRA-010] Connection Pooling en PostgreSQL/SQLAlchemy (`app/db/session.py`, `app/core/config.py`)**:
  - Configuración optimizada de `create_async_engine` con `pool_pre_ping=True`, tamaño de pool (`pool_size=10`), desbordamiento (`max_overflow=20`), timeout (`pool_timeout=30s`) y reciclaje periódico (`pool_recycle=1800s`), manteniendo compatibilidad transparente con `aiosqlite` en entornos locales y tests.
- **[DIST-010] Rate Limiter Hexagonal y Distributed Lock con Redis/Memoria (`app/services/lock.py`, `app/core/rate_limit.py`)**:
  - Patrón hexagonal con adaptadores para backend distribuido (Redis vía `redis.asyncio`) y fallback transparente en memoria para entornos autónomos o desarrollo local.
  - Implementación de locks distribuidos con expiración TTL para evitar condiciones de carrera en operaciones críticas.
- **[ANLY-010 / ANLY-020] Analítica de Hogar (`app/schemas/analytics.py`, `app/api/v1/endpoints/rooms.py`, `RoomAnalyticsModal.tsx`)**:
  - Endpoint `GET /api/v1/rooms/{room_id}/analytics` calculando distribución por prioridad, tasa de compleción global, tiempos promedio y ranking de colaboración por conviviente.
  - Modal interactivo de analítica con gráficos de barra en CSS puro y estética pixel-art.
- **[LOAD-010] PWA Offline-First y Suite Locust (`public/manifest.webmanifest`, `useNetworkStatus.ts`, `OfflineBanner.tsx`, `tests/load/locustfile.py`)**:
  - Manifiesto de PWA configurable para instalación móvil y de escritorio, hook de detección de conectividad en tiempo real y banner visual de trabajo offline.
  - Suite de pruebas de carga Locust emulando usuarios concurrentes realizando operaciones concurrentes en la API.

### 🔍 Sprint 9: Motor de Búsqueda FTS, UX Turbo y Gamificación Retro
- **[FTS-010] Motor de Búsqueda FTS Ponderado (`app/services/search.py`, `app/api/v1/endpoints/rooms.py`)**:
  - Búsqueda de texto completo ponderada con normalización de caracteres, soporte para prefijos y cálculo de relevancia (título x3, etiquetas x2, descripción x1).
  - Endpoint `GET /api/v1/rooms/{room_id}/search` con soporte de filtrado opcional por categoría y estado.
- **[CMD-010] Command Palette Global Ctrl+K (`CommandPaletteModal.tsx`, `CommandPaletteModal.css`)**:
  - Paleta de comandos invocable con `Ctrl+K` / `Cmd+K` para navegación instantánea entre hogares, búsqueda en vivo de tareas y ejecución de atajos rápidos con navegación por teclado accesible.
- **[GAME-010] Gamificación Anti Double-Spending y Rachas (`app/models/gamification.py`, `app/services/gamification.py`, `app/api/v1/endpoints/gamification.py`)**:
  - Modelos `UserGamificationProfile`, `UserStreak` y `GamificationActionLog` con migración Alembic `f2a71b3e8c40_add_gamification_models.py`.
  - Otorgamiento de puntos de experiencia (XP) por compleción de tareas según prioridad, cálculo de rachas diarias continuas y salvaguarda estricta contra doble puntuación (*anti double-spending*).
- **[GAME-020] Celebración Visual Retro con Chiptune y Confeti Pixelado (`retroAudio.ts`, `usePixelConfetti.ts`)**:
  - Generador de audio chiptune de 8-bits utilizando Web Audio API sin dependencias de audio externas pesadas.
  - Efecto de partículas de confeti en lienzo HTML5 con gravedad y dispersión pixel-art al completar hitos y tareas.
- **[E2E-010] Suite Playwright E2E en CI (`prioritask-frontend/e2e/`, `prioritask-frontend/playwright.config.ts`)**:
  - Configuración e integración de tests End-to-End con Playwright automatizando los flujos de inicio de sesión, creación de tareas, cambio de estado y apertura de paleta de comandos.

### 📎 Sprint 10: Almacenamiento Hexagonal de Adjuntos, GDPR y Optimización Bundle
- **[ATT-010 / ATT-011 / ATT-012] Almacenamiento Hexagonal y Magic Bytes Zero Trust (`app/services/storage/`, `app/models/attachment.py`, `app/api/v1/endpoints/attachments.py`)**:
  - Puerto de almacenamiento desacoplado (`StorageService`) con implementación de sistema de archivos local (`LocalStorageService`) y sanitización de nombres de archivo vía UUIDv4.
  - Validación Zero Trust de tipos de archivo mediante inspección de Magic Bytes binarios reales (`security.py`) impidiendo suplantaciones de extensión (permitidos: JPEG, PNG, WebP, PDF con límite de 10 MB).
  - Modelo relacional `TaskAttachment`, migración `a9b1c2d3e4f5_add_taskattachment_model.py` y endpoints `/api/v1/tasks/{task_id}/attachments` con control de acceso IDOR estricto.
- **[ATT-020] Dropzone, Cámara Móvil y Compresión Client-side (`TaskAttachmentsSection.tsx`, `attachmentUtils.ts`)**:
  - Zona de arrastre dropzone intuitiva, disparador directo de captura con cámara en dispositivos móviles y pipeline en navegador para redimensionar y comprimir imágenes a formato WebP antes de la transmisión.
- **[ATT-021] Lightbox Retro Pixel-Art (`AttachmentLightboxModal.tsx`)**:
  - Modal para visualización a pantalla completa de imágenes adjuntas con controles retro de navegación, zoom y descarga segura.
- **[GDPR-010 / GDPR-020] Exportación GDPR en Streaming y Plantilla de Nevera A4 (`app/api/v1/endpoints/rooms.py`, `FridgeTemplateModal.tsx`)**:
  - Endpoint `GET /api/v1/rooms/{room_id}/export` generando archivos JSON y CSV en streaming con cabeceras `Content-Disposition`, dando cumplimiento a las normativas de portabilidad de datos GDPR.
  - Modal y hoja de estilos CSS optimizada para impresión en formato A4 (`@media print`), transformando la lista de tareas en un cuadrante físico retro listo para colocar en la nevera del hogar.
- **[PERF-010] Code-splitting en Vite (`prioritask-frontend/vite.config.ts`)**:
  - Reestructuración de la división de paquetes de Vite configurando `manualChunks` dinámicos, reduciendo drásticamente el peso del chunk JavaScript inicial a **183 kB**.
- **[E2E-020] Suite E2E Ampliada (`prioritask-frontend/e2e/tasks.spec.ts`)**:
  - Cobertura de tests Playwright para subida de adjuntos, filtrado por calendario, interacción con checklist y exportación de datos.

### 🟢 Quality Gate Consolidado de Release v1.2.0
- **Backend Test Suite**: **241 pruebas automatizadas** en verde (100% pass rate) en suites unitarias y de integración.
- **Cobertura de Código**: **69.54%** (superando holgadamente el umbral obligatorio de CI `fail_under = 65%`).
- **Análisis Estático Backend**: **0 errores y 0 advertencias** con Ruff en `app/` y `tests/`.
- **Análisis Estático Frontend**: **0 errores y 0 advertencias** con ESLint y TypeScript.
- **Frontend Bundle**: Compilación limpia en producción con Vite (chunk principal 183 kB).
- **Auditoría de Seguridad y Zero Trust**: **APROBADA** (verificación estricta contra IDOR, rate limiting hexagonal, validación binaria de magic bytes, protección CWE-942 en CORS y segregación multi-tenancy).

---

## 🚀 Versión 1.0.0-rc1 (Hardening, CI/CD y Preparación para Producción — Sprint 5) — [2026-09-28]


### 🔄 CI/CD & Automatización de Calidad (DevOps & CI/CD)
- **[BE-OPS-001] Pipeline Dual en GitHub Actions (`.github/workflows/ci.yml`)**:
  - Implementación de pipeline automatizado con jobs independientes y paralelos:
    - **Backend Quality Gate**: Checkout, configuración de Python 3.12, instalación de dependencias, linting estricto con Ruff (`ruff check app/`), y ejecución de suite de pruebas con `pytest` y validación de cobertura (`--cov=app --cov-fail-under=65`).
    - **Frontend Quality Gate**: Checkout, configuración de Node.js 20 con caché de npm, instalación limpia (`npm ci`), análisis de linter (`npm run lint`) y compilación de producción con Vite (`npm run build`).

### 🛡️ Hardening, Seguridad y Resiliencia (Security & Rate Limiting)
- **[BE-SEC-030] Rate Limiter en Memoria por Ventana Deslizante (`app/core/rate_limit.py`)**:
  - Implementación de `InMemoryRateLimiter` thread-safe con almacenamiento en deque de marcas temporales y limpieza automática de ventanas expiradas.
  - Dependencia inyectable `rate_limit(max_requests, window_seconds)` con identificación por IP cliente (respetando cabeceras `X-Forwarded-For`).
  - Protección activa en endpoints críticos contra fuerza bruta y sobrecarga: `/api/v1/auth/login` (5 req/min), `/api/v1/auth/register` (3 req/min) y endpoints de inferencia IA `/api/v1/tasks/ai/*` (10 req/min).
  - Respuestas estandarizadas `429 Too Many Requests` con cabecera `Retry-After` determinando el tiempo restante de bloqueo.

### 📜 Auditoría y Trazabilidad de Tareas (Audit & Task History)
- **[BE-AUD-001] Extensión de Auditoría en Ciclo de Vida de Tareas (`app/models/enums.py`, `app/api/v1/endpoints/tasks.py`, `app/services/recurrence.py`)**:
  - Nuevas acciones en `TaskAction`: `CREATED` y `RECURRENCE_ADVANCED`.
  - Registro inmediato en `TaskHistory` al crear cualquier tarea (`POST /tasks/`), documentando el estado inicial, prioridad, fecha límite y autor del evento.
  - Registro de auditoría `RECURRENCE_ADVANCED` en `advance_recurring_task` ante la compleción de tareas recurrentes, detallando la fecha límite recalculada y el reinicio de estado.

### 📖 Documentación OpenAPI & Swagger UI Interactivo (API Documentation)
- **[BE-DOC-001] Enriquecimiento de OpenAPI y Soporte Bearer JWT (`app/main.py`)**:
  - Configuración explícita de `openapi_tags` con descripciones semánticas para agrupar módulos (`Authentication`, `Tasks`, `Task AI Assistant`, `Rooms & Colaboración`, `Tags`, `Task Assignment`).
  - Configuración del esquema de seguridad `HTTPBearer` en OpenAPI schema, habilitando el botón interactivo **Authorize** en `/docs` para probar endpoints protegidos directamente con tokens JWT Bearer.

### 🟢 Quality Gate & Verificación de Entrega
- **[BE-QA-005] Suite Integral de Pruebas y Cobertura Global**:
  - 172 pruebas automatizadas en verde (100% pass rate) en suites unitarias y de integración.
  - Cobertura global de código: **70%** (superando el umbral mínimo obligatorio de `fail_under = 65%`).
  - Linter Ruff: **0 errores y 0 advertencias** en `app/` y `tests/`.
  - Build de Vite frontend exitoso en 3.07s y ESLint 100% limpio.
  - Auditoría de seguridad, trazabilidad y hardening: **APROBADA**.

---

## 🚀 Versión 0.6.0-alpha (Sincronización e Integración Frontend — Sprint 4) — [2026-09-28]

### 🖥️ Sincronización de Contratos y Tipos Frontend (Frontend Contracts & Types)
- **[FE-SYNC-001] Alineación de Tipos TypeScript (`src/types/index.ts`)**:
  - Sincronización estricta de interfaces TypeScript con los esquemas Pydantic/SQLModel del backend:
    - `RoomMember`: modelo de convivencia con `user_id`, `room_id`, `role` (`ADMIN` | `MEMBER`), `joined_at` y `email`.
    - `Room`: extensión con `members: RoomMember[]`, `current_user_role` y metadatos de convivencia.
    - `Task.is_recurring`: flag booleano para identificar y gestionar tareas recurrentes.
    - `AIHealthStatus`: interfaz de telemetría y diagnóstico del motor de IA (`status`, `circuit_breaker`, `model`, `details`).

### 🎨 Componentes Visuales y Experiencia de Usuario (UI & Components)
- **[FE-UI-010] Gestión Interactiva de Convivientes (`src/components/RoomMembersModal.tsx`)**:
  - Modal interactivo con estética visual retro/pixel-art para administración de miembros del hogar.
  - Controles de gobernanza y RBAC: invitación de nuevos miembros con rol (`ADMIN` / `MEMBER`), revocación de acceso y prevención de desgobierno (restricción que impide remover al último administrador o auto-eliminación descontrolada).
- **[FE-UI-011] Selector de Hogares y Contexto Compartido (`src/pages/Dashboard.tsx`)**:
  - Selector enriquecido de hogares con soporte para habitaciones compartidas y badges de rol activo (`ADMIN` / `MEMBER`).
- **[FE-UI-012] Soporte Integral de Tareas Recurrentes (`src/components/RecurringBadge.tsx`, `TaskCard.tsx`, `TaskForm.tsx`)**:
  - Componente `RecurringBadge` con icono e indicación visual de recurrencia en `TaskCard`.
  - Toggle de recurrencia (`is_recurring`) en formulario de creación y edición (`TaskForm`).
- **[FE-UI-013] Monitor de Salud del Motor de IA en Tiempo Real (`src/components/AIHealthBadge.tsx`)**:
  - Badge de monitoreo en vivo consumiendo `GET /api/v1/tasks/ai/health`.
  - Indicadores visuales de estado del circuito (`CLOSED` / verde, `OPEN` / rojo, `HALF_OPEN` / amarillo) y latencia/disponibilidad de Ollama.

### 🟢 Quality Gate & Verificación de Entrega
- **[FE-QA-001] Build y Linter Frontend**:
  - Compilación de producción con Vite (`npm run build`) 100% limpia sin errores ni advertencias de tipos.
  - ESLint ejecutado con 0 errores y 0 warnings.
- **[BE-QA-004] Quality Gate Backend Consolidado**:
  - 164 pruebas automatizadas en verde (100% pass rate).
  - Cobertura global de código: **70%** (superando el umbral `fail_under = 65%`).
  - Linter Ruff: **0 errores y 0 advertencias** en `app/` y `tests/`.
  - Auditoría de seguridad y políticas CORS (CWE-942): **APROBADA**.

---

## 🚀 Versión 0.5.0-alpha (IA Resiliente y Contextual — Sprint 3) — [2026-09-28]

### 🤖 Resiliencia de Inferencia IA y Telemetría (AI & Resilience)
- **[BE-AI-010] Patrón Circuit Breaker para Cliente Ollama (`app/services/AI/circuit_breaker.py`)**:
  - Implementación del `CircuitBreaker` con corte inmediato en modo degradado (< 5ms) ante fallos acumulativos en el servicio Ollama.
  - Protección de concurrencia y prevención de sobrecarga ante indisponibilidad o latencia excesiva del motor de IA local.
- **[BE-AI-011] Telemetría y Endpoint de Salud de IA (`app/api/v1/endpoints/tasks_ai.py`)**:
  - Endpoint `GET /api/v1/tasks/ai/health` protegido mediante JWT (`Depends(get_current_user)`).
  - Telemetría en tiempo real: estado del circuito (`CLOSED`, `OPEN`, `HALF_OPEN`), recuento de fallos/éxitos y diagnóstico del motor Ollama.
- **[BE-AI-012] Caché Semántica en Memoria con TTL (`app/services/AI/cache.py`)**:
  - Implementación de `AICache` thread-safe con TTL configurable (5 minutos por defecto) y límite acotado de memoria (`maxsize=1000`).
  - Reducción drástica del cómputo redundante en sugerencias y clasificaciones idénticas con política de desalojo controlada.

### ⚙️ Servicios y Lógica de Negocio (Business Logic & Services)
- **[BE-SRV-030] Motor de Priorización Contextual Multivariable (`app/services/AI/priority_classifier.py`)**:
  - Función de priorización contextual `evaluar_prioridad_contextual` integrando señales deterministas del sistema: fechas límite (`due_date`), recurrencia (`is_recurring`), colaboradores/asignaciones y ponderación de pesos (`peso`).
  - Fusión de inferencia semántica con heurísticas de negocio, generando explicaciones detalladas y trazables en el atributo `motivo`.
  - Mecanismos de degradación elegante y fallback determinista garantizados si el circuito está abierto o el modelo local no responde.

### 🟢 Quality Gate & Suites de Pruebas
- **[BE-TEST-030] Suite Integral de Pruebas y Cobertura**:
  - 164 pruebas automatizadas ejecutadas y pasando exitosamente (100% pass rate).
  - Cobertura global de código: **70%** (superando el umbral mínimo obligatorio de `fail_under = 65%`).
  - Linter Ruff: **0 errores y 0 advertencias** en `app/` y `tests/`.
  - Auditoría de seguridad y resiliencia: **APROBADA**.

---

## 🚀 Versión 0.4.0-alpha (Motor de Rutinas y Membresía de Hogares — Sprint 2) — [2026-09-28]

### 🔴 Control de Acceso, Endpoints y Seguridad (Security & Endpoints)
- **[BE-API-020] Endpoints de Gestión de Miembros (`/rooms/{room_id}/members`)**:
  - `GET /rooms/{room_id}/members`: Listado de convivientes del hogar con protección IDOR (acceso restringido a propietarios y convivientes activos).
  - `POST /rooms/{room_id}/members`: Incorporación de convivientes con asignación de rol (`ADMIN` / `MEMBER`), restringida estrictamente a propietarios y administradores del hogar mediante RBAC.
  - `DELETE /rooms/{room_id}/members/{user_id}`: Revocación y salida de miembros con validación RBAC y salvaguarda contra auto-eliminación o remoción indebida del propietario.
- **[BE-API-021] Refactorización de Visibilidad de Hogares (`GET /rooms`)**:
  - `GET /rooms` refactorizado para devolver tanto hogares en propiedad como hogares donde el usuario es miembro activo con esquema `RoomReadWithMembers`.
  - Visibilidad enriquecida con lista completa de compañeros de convivencia (`members`) y el rol contextual del usuario autenticado (`current_user_role`).

### 🟡 Base de Datos y Modelo de Datos (Database & Models)
- **[BE-DB-020] Modelo `RecurrenceRule` (`app/models/recurrence_rule.py`)**:
  - Creado el modelo `RecurrenceRule(SQLModel, table=True)` con `__tablename__ = "recurrencerule"`.
  - Soporte de configuración de frecuencias (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), intervalos de repetición, días de la semana y fecha de término (`end_date`).
  - Integración relacional directa con el modelo `Task` (`task_id`).

### ⚙️ Servicios y Lógica de Negocio (Business Logic & Services)
- **[BE-SRV-020] Servicio de Cálculo y Avance de Tareas Recurrentes (`app/services/recurrence.py`)**:
  - Motor de cálculo temporal determinista (`calculate_next_occurrence`) respetando `datetime` UTC y granularidades diarias, semanales y mensuales.
  - Avance automático de tareas recurrentes (`advance_recurring_task`): ante completitud (`DONE`), preserva el historial de ejecución, resetea el estado a `PENDING` y calcula la siguiente fecha límite (`due_date`).

### 🔵 Migraciones Alembic
- **[BE-MIG-003] Migración `3f641387ca16_add_recurrence_rule_model.py`**:
  - Generación de tabla `recurrencerule` con índices, restricciones de integridad y foreign keys.
  - Diseñada y ejecutada sin operaciones destructivas (`0 DROPs`) y totalmente compatible con batch operations en SQLite.

### 🟢 Quality Gate & Suites de Pruebas
- **[BE-TEST-020] Suite Integral de Pruebas y Cobertura**:
  - 144 tests ejecutados y pasando exitosamente (100% pass rate).
  - Cobertura global de código: **65%** (alcanzando el umbral de `fail_under = 65` en `pyproject.toml`).
  - Linter Ruff: **0 errores y 0 advertencias** en `app/` y `tests/`.
  - Auditoría de seguridad: **APROBADA** con verificación exhaustiva contra vectores IDOR y fallas de escalada de privilegios RBAC.

---

## 🚀 Versión 0.3.0-alpha (Sistema Colaborativo de Hogares — Core DB Sprint) — [2026-09-26]

### 🟡 Base de Datos y Modelo de Datos (Database & Models)
- **[BE-DB-010] Modelo `RoomMember` — Tabla Intermedia Many-to-Many (`app/models/room_member.py`)**:
  - Creado el modelo `RoomMember(SQLModel, table=True)` con `__tablename__ = "roommember"`.
  - Clave primaria compuesta `(user_id, room_id)` con claves foráneas a `usuario.id` y `room.id`.
  - Campo `joined_at: datetime` con `default_factory=lambda: datetime.now(UTC)` timezone-aware.
  - Campo `role: RoomMemberRole` con valor por defecto `MEMBER`, previniendo escalada de privilegios implícita.
  - Relaciones bidireccionales protegidas con `TYPE_CHECKING`: `user -> Usuario.rooms_member` y `room -> Room.members`.
- **[BE-DB-011] Enum `RoomMemberRole` (`app/models/enums.py`)**:
  - Añadido `class RoomMemberRole(str, Enum)` con miembros `ADMIN` y `MEMBER`.
  - Coexiste con el `UserRole` global del sistema (sin colisión).
- **[BE-DB-012] Campo `is_recurring` en modelo `Task` (`app/models/task.py`)**:
  - Añadido `is_recurring: bool = Field(default=False)` para preparar el modelo de cara al motor de IA.
  - Refactorizados todos los imports directos en runtime hacia el bloque `if TYPE_CHECKING:`, eliminando riesgos de importación circular.
  - Añadida relación `room: Optional["Room"] = Relationship(back_populates="tasks")`.
- **[BE-DB-013] Relaciones Bidireccionales en `Usuario` y `Room` (`app/models/user.py`, `app/models/room.py`)**:
  - `Usuario`: añadida relación `rooms_member: list["RoomMember"]` con `back_populates="user"`.
  - `Room`: añadidas relaciones `tasks: list["Task"]` y `members: list["RoomMember"]` con `back_populates` correspondientes.
  - Inicialización completa de mappers SQLAlchemy validada sin ciclos.

### 🔵 Migraciones Alembic
- **[BE-MIG-001] Migración `75cee56d2723_add_roommember_and_task_models.py`**:
  - Genera la tabla `roommember` con todos sus campos, índices y claves foráneas.
  - Añade columna `is_recurring BOOLEAN NOT NULL DEFAULT 0` a la tabla `task` usando `op.batch_alter_table` para compatibilidad SQLite, sin afectar los 625 registros preexistentes.
  - Auditado: **0 sentencias `DROP TABLE` accidentales**. Todas las tablas existentes preservadas.
  - `downgrade()` simétrico y reversible implementado.
- **[BE-MIG-002] Blindaje de `env.py` de Alembic (`app/db/migrations/env.py`)**:
  - Añadidos imports de `Tag`, `TaskTag`, `TaskHistory` y `RoomMember` para evitar drops accidentales en futuros autogenerates.

### 🟢 Tests de Persistencia
- **[BE-TEST-010] Tests Asíncronos de Persistencia (`tests/unit/test_room_member_persistence.py`)**:
  - `test_room_member_multiple_membership`: Crea un Room, añade dos usuarios vía `RoomMember` con roles distintos, y verifica bidireccionalidad de la relación.
  - `test_task_room_link_assignment_and_done_status`: Crea una Task vinculada a un Room, asigna al usuario, cambia estado a `DONE` y verifica vía `room.tasks`.
  - Cobertura total de la suite: **67%** (129 tests pasando, umbral 65% superado).

### 🔒 Seguridad y Calidad
- **[BE-SEC-010] Backup de Base de Datos Previa a Migración**: Generado `prioritask.db.bak` (copia de los 625 registros previos).
- **Ruff Linter**: 0 errores en `app/` y `tests/`.
- **QA-Sentinel**: Dictamen **APROBADO** — 129/129 tests pasando, cobertura 67%, 0 vulnerabilidades detectadas.

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
