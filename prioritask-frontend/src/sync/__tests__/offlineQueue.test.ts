import { describe, it, expect } from "vitest";
import {
  OfflineSyncEngine,
  IndexedDBQueueStorageAdapter,
  createSimulatedSyncTransport,
} from "../offlineQueue";
import type { Task } from "../../types/task";

describe("OfflineSyncEngine (Todoist-inspired Optimistic UI & Offline Queue)", () => {
  it("applies optimistic mutations immediately, persists commands, and maps temp_id to real_id across queued commands on flush", async () => {
    const storage = new IndexedDBQueueStorageAdapter();
    await storage.clear();

    const { transport, serverStore } = createSimulatedSyncTransport([]);
    const engine = new OfflineSyncEngine({
      storage,
      transport,
      conflictStrategy: "field-merge",
    });

    await engine.initialize([]);

    // 1. Crear tarea offline con temp_id y luego completarla offline usando ese temp_id
    const { command: createCmd, optimisticTask } = await engine.dispatchMutation(
      "task_create",
      {
        titulo: "Limpiar cocina",
        descripcion: "Fregar platos y encimera",
        categoria: "Limpieza",
        peso: 3,
      },
      { timestamp: 1000 }
    );

    expect(optimisticTask).not.toBeNull();
    const tempId = createCmd.temp_id!;
    expect(tempId).toMatch(/^temp_/);
    expect(engine.getTaskById(tempId)?.estado).toBe("TODO");

    await engine.dispatchMutation(
      "task_complete",
      { id: tempId },
      { timestamp: 1050 }
    );

    expect(engine.getTaskById(tempId)?.estado).toBe("DONE");
    expect(engine.getQueueState().pendingCommands).toHaveLength(2);

    // 2. Reprocesar por lotes (flushQueue) al recuperar conexión
    const flushResult = await engine.flushQueue();

    expect(flushResult.syncedCommandUuids).toHaveLength(2);
    expect(flushResult.remainingPendingCount).toBe(0);

    const realId = flushResult.tempIdMappingsApplied[tempId];
    expect(realId).toBeDefined();
    expect(realId).toMatch(/^srv_task_/);

    // El motor traduce automáticamente consultas por temp_id o real_id
    expect(engine.getTaskById(tempId)?.id).toBe(realId);
    expect(engine.getTaskById(realId)?.estado).toBe("DONE");
    expect(serverStore.get(realId)?.estado).toBe("DONE");
    expect(engine.getQueueState().syncToken).not.toBe("*");
  });

  it("simulates conflict resolution (field-merge) and rolls back optimistic state on permanent server error", async () => {
    const storage = new IndexedDBQueueStorageAdapter();
    await storage.clear();

    const baseTask: Task = {
      id: "task_100",
      titulo: "Comprar leche",
      descripcion: "Entera 2L",
      categoria: "Compras",
      peso: 2,
      estado: "TODO",
      created_at: "2026-01-01T10:00:00.000Z",
      updated_at: "2026-01-01T10:00:00.000Z",
    };

    const { transport, injectConcurrentServerEdit } = createSimulatedSyncTransport([
      baseTask,
    ]);

    const engine = new OfflineSyncEngine({
      storage,
      transport,
      conflictStrategy: "field-merge",
    });

    await engine.initialize([baseTask]);

    // Otro dispositivo modifica el título en el servidor con un timestamp posterior (T = 5000ms)
    injectConcurrentServerEdit({
      ...baseTask,
      titulo: "Comprar leche sin lactosa (editado remotamente)",
      updated_at: new Date(5000).toISOString(),
    });

    // El cliente modifica el peso offline en T = 2000ms (anterior al cambio del servidor)
    await engine.dispatchMutation(
      "task_update",
      {
        id: "task_100",
        peso: 5,
        expected_updated_at: baseTask.updated_at,
      },
      { timestamp: 2000 }
    );

    expect(engine.getTaskById("task_100")?.peso).toBe(5);

    const conflictFlush = await engine.flushQueue();
    expect(conflictFlush.conflictsResolved).toHaveLength(1);
    expect(conflictFlush.conflictsResolved[0].strategy).toBe("field-merge");
    expect(conflictFlush.conflictsResolved[0].winner).toBe("merged");

    // Field-merge conserva el título remoto y el peso modificado localmente
    const mergedTask = engine.getTaskById("task_100")!;
    expect(mergedTask.titulo).toBe("Comprar leche sin lactosa (editado remotamente)");
    expect(mergedTask.peso).toBe(5);

    // Simular un fallo permanente: intentar actualizar una tarea borrada en el servidor
    const { transport: failingTransport } = createSimulatedSyncTransport([]);
    engine.setTransport(failingTransport);

    await engine.dispatchMutation(
      "task_complete",
      { id: "task_100" },
      { timestamp: 6000 }
    );
    expect(engine.getTaskById("task_100")?.estado).toBe("DONE");

    const rollbackFlush = await engine.flushQueue();
    expect(rollbackFlush.failedCommandUuids).toHaveLength(1);
    // El estado local hace rollback automático a "TODO" gracias al OptimisticSnapshot
    expect(engine.getTaskById("task_100")?.estado).toBe("TODO");
  });
});
