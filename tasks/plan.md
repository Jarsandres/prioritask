# Implementation Plan: Resolución en Cascada de `temp_id` y Comandos Hijos en `/sync/batch`

> **Deriva de:** `notes/02-temp-id-mapping-analysis.md` §4 (especificación del algoritmo)
> **Rama:** `analysis/temp-id-mapping-cascade` → crear rama de implementación `feature/sync-temp-id-cascade`
> **Estado:** PROPUESTO — requiere aprobación humana y paso por `qa-sentinel` antes de fusionar.
> **Alcance de este documento:** planificación (solo lectura). No se ha escrito código de producción.

## Overview

Se implementa un **Pase de Resolución de Referencias (PRR)** dirigido por un registro declarativo de campos referenciales, que reemplaza la resolución ad-hoc de un único escalar en `_resolve_task_uuid`. Con ello, (a) las referencias a `temp_id` se reescriben en cascada (incluidas FK anidadas), (b) los temporales irresolubles rinden un error semántico `INVALID_TEMP_ID` en lugar de un `ValueError` crudo de `UUID()`, y (c) se habilitan comandos hijos (`subtask_create`, `tag_create`, `tag_attach`) para cerrar la contradicción X1 (subtareas/etiquetas dependientes).

## Architecture Decisions

- **ADR-1: Registro declarativo sobre lógica por comando.** Un dict `_REFERENCE_FIELDS` mapea tipo de comando → claves referenciales, y `resolve_references` los reescribe recursivamente. Justificación: la resolución deja de ser especial-caso y escala a futuros comandos sin tocar la lógica de negocio.
- **ADR-2: Errores semánticos alineados a Todoist.** Nuevo `error_tag="INVALID_TEMP_ID"` (equivalente al `error_code:15` de Todoist) en lugar del `ValueError` de `UUID()`.
- **ADR-3: Atomicidad por SAVEPOINT (sin cambio de contrato).** Se conserva la transacción única del lote (`sync.py:608`) y el `begin_nested()` por creación (`sync.py:245`); el nuevo invariante es no propagar `IntegrityError` a hermanos.
- **ADR-4: Paridad de contrato Frontend/Backend.** Todo cambio en `SyncErrorTag`/`SyncCommandType` se replica en `prioritask-frontend/src/sync/offlineQueue.ts` en el mismo cambio (o en un slice dedicado) para evitar drift de tipos.

## Análisis de Impacto GitNexus (obligatorio antes de editar)

Ejecutado con el runner CLI (MCP `gitnexus` no registrado en este harness):

| Símbolo | Riesgo GitNexus | Evidencia / resolución |
|---|---|---|
| `sync_batch` (`app/api/v1/endpoints/sync.py:149`) | `UNKNOWN` (0 callers en grafo) | **UNKNOWN tratado como no resuelto**, confirmado por texto: es un route handler registrado por decorador y llamado directamente por `tests/unit/test_sync_endpoint_unit.py:14,493,653,731`. Riesgo práctico **MEDIO** (handler central, 8 tests de integración). |
| `_resolve_task_uuid` (`app/api/v1/endpoints/sync.py:133`) | `LOW` (1 caller) | 1 caller directo `sync_batch` (confianza 0.85); importado por `tests/unit/test_sync_endpoint_unit.py:13`. |

`detect_changes --scope all` y `--scope compare --base-ref main`: **No changes detected** (limpio; las notas `.md` no pertenecen al grafo).

## Task List

### Phase 0: Foundation (contrato y utilidades puras)
- [ ] Task 1: Registro `_REFERENCE_FIELDS` + helper puro `resolve_references`
- [ ] Task 2: Nuevo `error_tag="INVALID_TEMP_ID"` (backend + paridad frontend)
- [ ] Task 3: Detección determinista de colisión de `temp_id`

### Checkpoint: Foundation
- [ ] `python -m pytest tests/unit/test_sync_reference_resolution.py -q` en verde
- [ ] `npx vitest run` en `prioritask-frontend/` sin errores de tipo

### Phase 1: Cascada backend (nivel tarea)
- [ ] Task 4: Refactor de `_resolve_task_uuid` sobre el PRR + error semántico
- [ ] Task 5: Paridad de reconstrucción idempotente (`args.task_id`)

### Checkpoint: Cascada nivel tarea
- [ ] `python -m pytest tests/unit/test_sync_endpoint_unit.py tests/integration/test_sync_batch.py -q` en verde (sin regresión)

### Phase 2: Comandos hijos (cierra X1)
- [ ] Task 6: `subtask_create` con FK padre resuelta por PRR
- [ ] Task 7: `tag_create` + `tag_attach`
- [ ] Task 8: Soporte de comandos hijos en el motor offline frontend

### Checkpoint: Hijos
- [ ] Invariante I2 verificado (0 huérfanos `subtask`/`tasktag`)

### Phase 3: Endurecimiento y Quality Gate
- [ ] Task 9: Test de concurrencia WAL + invariantes I1/I4
- [ ] Task 10: Quality Gate `qa-sentinel` (cobertura ≥ 65 %, IDOR, `detect_changes`)

### Checkpoint: Complete
- [ ] Todos los criterios de aceptación cumplidos
- [ ] `VERDICT: APPROVED` emitido por `qa-sentinel`
- [ ] Listo para PR a `main`

---

## Detalle de Tareas

### Task 1: Registro `_REFERENCE_FIELDS` + helper puro `resolve_references`

**Description:** Introducir en `app/api/v1/endpoints/sync.py` (o `app/schemas/sync.py`) el registro declarativo y una función pura que reescriba recursivamente claves referenciales (escalares, dicts y listas anidadas) usando un `mapping`.

**Acceptance criteria:**
- [ ] `resolve_references(args, keys, mapping)` reescribe escalares y estructuras anidadas (`etiquetas: [{tag_id: temp}]`).
- [ ] Claves no referenciales y valores no-`temp` se conservan idénticos.
- [ ] No muta el input de forma observable fuera del retorno (función pura testeable).

**Verification:**
- [ ] Tests: `python -m pytest tests/unit/test_sync_reference_resolution.py -q`
- [ ] Build: import limpio (ruff/mypy del proyecto)

**Dependencies:** None
**Files likely touched:** `app/api/v1/endpoints/sync.py`, `tests/unit/test_sync_reference_resolution.py`
**Estimated scope:** Small (2 archivos)

---

### Task 2: Nuevo `error_tag="INVALID_TEMP_ID"` (backend + paridad frontend)

**Description:** Añadir `INVALID_TEMP_ID` a `SyncErrorTag` (`app/schemas/sync.py:34-39`) y a la unión `CommandSyncResult.error_tag` del cliente (`offlineQueue.ts:165`). Mapear el fallo de temporal irresoluble a este tag con `error_code=422`.

**Acceptance criteria:**
- [ ] Un dependiente que referencia un `temp_*` ausente devuelve `error_tag="INVALID_TEMP_ID"` (no `"badly formed hexadecimal UUID string"`).
- [ ] El tipo del frontend acepta el nuevo tag sin romper la compilación.

**Verification:**
- [ ] Tests: `python -m pytest tests/integration/test_sync_temp_id_cascade.py::test_forward_reference_returns_invalid_temp_id -q`
- [ ] Build: `npx vitest run` (typecheck) en `prioritask-frontend/`

**Dependencies:** None
**Files likely touched:** `app/schemas/sync.py`, `app/api/v1/endpoints/sync.py`, `prioritask-frontend/src/sync/offlineQueue.ts`
**Estimated scope:** Small (3 archivos)

---

### Task 3: Detección determinista de colisión de `temp_id`

**Description:** Pre-escanear el lote y rechazar con error determinista (`TEMP_ID_COLLISION`) cuando dos comandos declaran el mismo `temp_id`, sustituyendo el "último gana" silencioso del `dict`.

**Acceptance criteria:**
- [ ] Dos `task_create` con el mismo `temp_id` producen error explícito y **no** un mapeo sobrescrito.
- [ ] El mapeo devuelto nunca contiene una clave `temp_*`.

**Verification:**
- [ ] Tests: `python -m pytest tests/integration/test_sync_temp_id_cascade.py -k collision -q`

**Dependencies:** Task 1
**Files likely touched:** `app/api/v1/endpoints/sync.py`, `app/schemas/sync.py`, `tests/integration/test_sync_temp_id_cascade.py`
**Estimated scope:** Small (3 archivos)

---

### Task 4: Refactor de `_resolve_task_uuid` sobre el PRR + error semántico

**Description:** Reescribir `_resolve_task_uuid` para que use `_REFERENCE_FIELDS` + `resolve_references`, y lance un error estructurado (`INVALID_TEMP_ID`) en lugar de `UUID()` sobre un `temp_*`. Mantener compatibilidad con `args.id` / `args.task_id` / `cmd.temp_id`.

**Acceptance criteria:**
- [ ] Los 4 casos del test unitario actual (`test_sync_endpoint_unit.py::TestResolveTaskUuid`) siguen pasando.
- [ ] Un `temp_*` no mapeado produce `INVALID_TEMP_ID` (ver Task 2), no `ValueError` de UUID.

**Verification:**
- [ ] Tests: `python -m pytest tests/unit/test_sync_endpoint_unit.py -q`
- [ ] Regresión: `python -m pytest tests/integration/test_sync_batch.py -q`

**Dependencies:** Task 1, Task 2
**Files likely touched:** `app/api/v1/endpoints/sync.py`, `app/schemas/sync.py`, `tests/unit/test_sync_endpoint_unit.py`
**Estimated scope:** Small–Medium (3 archivos) · **Riesgo GitNexus: LOW**

---

### Task 5: Paridad de reconstrucción idempotente (`args.task_id`)

**Description:** Extender la rama de idempotencia (`sync.py:171-177`) para reconstruir el mapeo también desde `args.task_id`, eliminando la asimetría con `_resolve_task_uuid` (H4).

**Acceptance criteria:**
- [ ] Un replay con `args.task_id=<temp>` reconstruye el mapeo con el `task_id` definitivo.
- [ ] El reintento no duplica filas ni incrementa `version`.

**Verification:**
- [ ] Tests: `python -m pytest tests/integration/test_sync_temp_id_cascade.py -k idempotent -q`

**Dependencies:** Task 4
**Files likely touched:** `app/api/v1/endpoints/sync.py`, `tests/integration/test_sync_temp_id_cascade.py`
**Estimated scope:** XS–Small (2 archivos)

---

### Task 6: `subtask_create` con FK padre resuelta por PRR

**Description:** Añadir el tipo de comando `subtask_create` a `SyncCommandType`, con `args.task_id` (temp o real del padre) resuelto por el PRR y `args.titulo`, `args.orden`. Persistir `Subtask` con FK válida y registrar en `ProcessedSyncCommand`.

**Acceptance criteria:**
- [ ] Creación de subtarea offline contra un padre `temp_id` en el mismo lote inserta `subtask.task_id = <UUID real>`.
- [ ] Cero filas huérfanas en `subtask` (invariante I2).
- [ ] Acceso restringido por `_get_task_with_access` (anti-IDOR) al padre.

**Verification:**
- [ ] Tests: `python -m pytest tests/integration/test_sync_temp_id_cascade.py -k subtask -q`
- [ ] Manual: consulta `PRAGMA foreign_key_check;` sin resultados

**Dependencies:** Task 4
**Files likely touched:** `app/schemas/sync.py`, `app/api/v1/endpoints/sync.py`, `app/models/subtask.py`, `tests/integration/test_sync_temp_id_cascade.py`
**Estimated scope:** Medium (4 archivos)

---

### Task 7: `tag_create` + `tag_attach`

**Description:** Añadir `tag_create` (etiqueta nueva offline, con `temp_id` propio) y `tag_attach` (`args.task_id` + `args.tag_id`, ambos resolubles por el PRR) usando la PK compuesta de `TaskTag`.

**Acceptance criteria:**
- [ ] `tag_attach` sobre un padre temporal crea la fila `tasktag` con FK reales.
- [ ] Cero filas huérfanas en `tasktag`.
- [ ] Idempotencia: reenvío no duplica `(task_id, tag_id)`.

**Verification:**
- [ ] Tests: `python -m pytest tests/integration/test_sync_temp_id_cascade.py -k tag -q`

**Dependencies:** Task 6
**Files likely touched:** `app/schemas/sync.py`, `app/api/v1/endpoints/sync.py`, `app/models/tag.py`, `app/models/task_tag.py`, `tests/integration/test_sync_temp_id_cascade.py`
**Estimated scope:** Medium (4–5 archivos)

---

### Task 8: Soporte de comandos hijos en el motor offline frontend

**Description:** Extender `SyncCommandType`/`SyncCommandArgsMap` y `applyMutationToMemory` en `offlineQueue.ts` para `subtask_create`/`tag_attach`, y garantizar que `INVALID_TEMP_ID` **mantenga** el comando en la cola (reenviar el `task_create` padre) en lugar de rollback definitivo.

**Acceptance criteria:**
- [ ] Encadenar `task_create(temp) → subtask_create(task_id=temp)` y `flushQueue()` mapea y confirma ambos.
- [ ] `INVALID_TEMP_ID` no descarta la mutación hija.

**Verification:**
- [ ] Tests: `npx vitest run src/sync/__tests__/offlineQueue.test.ts`
- [ ] Build: `npm run build` en `prioritask-frontend/`

**Dependencies:** Task 6, Task 7
**Files likely touched:** `prioritask-frontend/src/sync/offlineQueue.ts`, `prioritask-frontend/src/sync/__tests__/offlineQueue.test.ts`
**Estimated scope:** Medium (2–3 archivos)

---

### Task 9: Test de concurrencia WAL + invariantes I1/I4

**Description:** Añadir el test de lotes concurrentes (`asyncio.gather`) con `temp_id` distintos y el test de "mapeo nunca devuelve `temp_*`", bajo SQLite WAL real.

**Acceptance criteria:**
- [ ] Sin `database is locked` dentro de `busy_timeout=5000`.
- [ ] Sin crosstalk de `temp_id` entre lotes concurrentes.

**Verification:**
- [ ] Tests: `python -m pytest tests/integration/test_sync_temp_id_concurrency.py -q`

**Dependencies:** Task 4
**Files likely touched:** `tests/integration/test_sync_temp_id_concurrency.py`
**Estimated scope:** Small (1 archivo)

---

### Task 10: Quality Gate `qa-sentinel`

**Description:** Ejecutar la puerta de calidad innegociable del proyecto.

**Acceptance criteria:**
- [ ] Cobertura del módulo `sync.py` ≥ 65 % (o umbral vigente en `CONSTRAINTS.md`).
- [ ] Auditoría anti-IDOR de los nuevos comandos.
- [ ] `node .gitnexus/run.cjs detect_changes --scope all --repo .` sin regresiones (`partial`/`truncated` = no limpio).
- [ ] `VERDICT: APPROVED` explícito.

**Verification:**
- [ ] `python -m pytest --cov=app/api/v1/endpoints/sync -q`
- [ ] `node .gitnexus/run.cjs detect-changes --scope compare --base-ref main --repo .`

**Dependencies:** Task 1–9
**Estimated scope:** Small (verificación)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `sync_batch` es handler central; refactor rompe 8 tests de integración | High | Ejecutar la suite de regresión tras Task 4 antes de continuar; mantener firma pública |
| `UNKNOWN` de `sync_batch` ocultaba callers | Medium | Ya confirmado por búsqueda de texto; cobertura de tests explícita |
| Añadir comandos cambia el contrato público del endpoint | Medium | ADR-4: paridad frontend en el mismo slice; versionar `SyncErrorTag` |
| Reescritura anidada muta payloads compartidos | Medium | `resolve_references` pura; tests de no-mutación |
| Concurrencia WAL con `busy_timeout` insuficiente | Medium | Task 9 mide; ajustar PRAGMA si falla |
| Escribir subtareas/etiquetas sin `_get_task_with_access` → IDOR | High | Task 6/7 exigen control de acceso al padre antes de insertar hijos |

## Open Questions

- H5 (`notes/open-questions.md`): ¿se aprueba añadir comandos hijos al protocolo de sync o la creación offline de subtareas/etiquetas queda fuera de alcance?
- ¿Existe `CONSTRAINTS.md` con el umbral de cobertura vigente? Si no, confirmar 65 %.

## Parallelization Opportunities

- **Paralelizable:** Task 1 y Task 2 (utilidad pura vs. tag de error) tras acordar el registro.
- **Secuencial:** Task 4 (depende de 1+2) → Task 5 → Task 6 → Task 7 → Task 8.
- **Coordinación:** Task 8 requiere el contrato congelado de Task 6/7 (definir tipos primero).
