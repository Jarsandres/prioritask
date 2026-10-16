# TODO — Resolución en Cascada de `temp_id` y Comandos Hijos en `/sync/batch`

> Plan completo en `tasks/plan.md`. Orden de ejecución estricto (dependencias). Verificación por tarea.
> Referencia de diseño: `notes/02-temp-id-mapping-analysis.md` §4.

## Phase 0: Foundation
- [x] Task 1 — Registro `_REFERENCE_FIELDS` + helper puro `resolve_references` (S)
- [x] Task 2 — `error_tag="INVALID_TEMP_ID"` backend + paridad frontend (S)
- [x] Task 3 — Detección determinista de colisión de `temp_id` (S)

### Checkpoint: Foundation
- [x] `python -m pytest tests/unit/test_sync_reference_resolution.py -q` → 6 passed
- [x] `npx vitest run src/sync/__tests__/offlineQueue.test.ts` → 5 passed
- [x] Regresión completa: `python -m pytest -q` → 354 passed
- [x] `ruff check` → OK

## Phase 1: Cascada backend (nivel tarea)
- [x] Task 4 — Refactor de `_resolve_task_uuid` sobre el PRR + error semántico (S/M) · risk LOW
- [x] Task 5 — Paridad de reconstrucción idempotente (`args.task_id`) (XS)

### Checkpoint: Cascada nivel tarea
- [x] `python -m pytest tests/unit/test_sync_endpoint_unit.py tests/integration/test_sync_batch.py tests/unit/test_sync_reference_resolution.py tests/integration/test_sync_temp_id_cascade.py -q` → 37 passed
- [x] `ruff check` → OK
- [ ] Regresión completa `python -m pytest -q` (en ejecución)

## Phase 2: Comandos hijos (cierra X1)
- [x] Task 6 — `subtask_create` con FK padre resuelta por PRR (M)
- [x] Task 7 — `tag_create` + `tag_attach` (M)
- [x] Task 8 — Soporte de comandos hijos en motor offline frontend (M)

### Checkpoint: Hijos
- [x] Invariante I2: 0 huérfanos en `subtask`/`tasktag` (tests de integración)
- [x] `npx vitest run src/sync/__tests__/offlineQueue.test.ts` → 7 passed
- [x] `npx tsc -b` (typecheck frontend) → OK
- [x] Regresión completa backend `python -m pytest -q` → 362 passed

## Phase 3: Endurecimiento y Quality Gate
- [ ] Task 9 — Test de concurrencia WAL + invariantes I1/I4 (S)
- [ ] Task 10 — Quality Gate `qa-sentinel` (cobertura ≥ 65 %, IDOR, `detect_changes`)

### Checkpoint: Complete
- [ ] Criterios de aceptación cumplidos
- [ ] `VERDICT: APPROVED` de `qa-sentinel`
- [ ] PR a `main`

## Bloqueadores / Dudas
- [ ] H5 — ¿se aprueban los comandos hijos? (decisión Orchestrator)
- [ ] Confirmar umbral de cobertura (¿`CONSTRAINTS.md`?)
