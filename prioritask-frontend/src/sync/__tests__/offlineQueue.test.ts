import { describe, it, expect, vi } from "vitest";
import {
  OfflineSyncEngine,
  IndexedDBQueueStorageAdapter,
  createSimulatedSyncTransport,
  isTransientNetworkError,
  attachSystemWakeupMonitor,
} from "../offlineQueue";
import { formatHlc } from "../hlc";
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

  it("stamps field_hlc, resolves per-field HLC conflicts, and supports task_schedule_reminder via createReminder", async () => {
    const storage = new IndexedDBQueueStorageAdapter();
    await storage.clear();

    const baseTask: Task = {
      id: "task_hlc_1",
      titulo: "Revisar presupuesto",
      descripcion: "Q1",
      categoria: "Finanzas",
      peso: 2,
      estado: "TODO",
      version: 3,
      field_hlc: {
        titulo: formatHlc(1000, 0, "srv"),
        peso: formatHlc(1000, 0, "srv"),
      },
      updated_at: new Date(1000).toISOString(),
    };

    const { transport, injectConcurrentServerEdit } = createSimulatedSyncTransport([
      baseTask,
    ]);

    const engine = new OfflineSyncEngine({
      storage,
      transport,
      conflictStrategy: "field-merge",
      nodeId: "client_tab",
    });

    await engine.initialize([baseTask]);

    // El servidor tiene un título más reciente (T=8000) pero un peso más antiguo (T=1500)
    injectConcurrentServerEdit({
      ...baseTask,
      titulo: "Título ganador del servidor",
      peso: 1,
      version: 4,
      field_hlc: {
        titulo: formatHlc(8000, 0, "srv"),
        peso: formatHlc(1500, 0, "srv"),
      },
      updated_at: new Date(8000).toISOString(),
    });

    // El cliente edita ambos campos en T=4000 (gana en peso frente a 1500, pierde en título frente a 8000)
    const { command } = await engine.dispatchMutation(
      "task_update",
      {
        id: "task_hlc_1",
        titulo: "Título local antiguo",
        peso: 5,
      },
      { timestamp: 4000 }
    );

    expect(command.base_version).toBe(3);
    expect(command.hlc_timestamp).toContain(":client_tab");
    expect(command.field_hlc?.titulo).toBe(command.hlc_timestamp);
    expect(command.field_hlc?.peso).toBe(command.hlc_timestamp);

    await engine.flushQueue();
    const resolved = engine.getTaskById("task_hlc_1")!;
    expect(resolved.titulo).toBe("Título ganador del servidor");
    expect(resolved.peso).toBe(5);
    expect(resolved.version).toBe(4);

    // Programar recordatorio a través de handleBridgeEnvelope("createReminder")
    const reminderIso = "2026-10-15T09:00:00.000Z";
    await engine.handleBridgeEnvelope({
      type: "com.todoist.ipc.request",
      id: "env_rem_1",
      method: "createReminder",
      data: { id: "task_hlc_1", reminder_at: reminderIso },
    });

    expect(engine.getTaskById("task_hlc_1")?.reminder_at).toBe(reminderIso);
  });

  it("detects transient network errors and triggers sendRequestSync on system wakeup", async () => {
    expect(isTransientNetworkError({ code: "ERR_INTERNET_DISCONNECTED" })).toBe(true);
    expect(isTransientNetworkError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientNetworkError(new Error("Network Error"))).toBe(true);
    expect(isTransientNetworkError({ response: { status: 503 } })).toBe(true);
    expect(isTransientNetworkError({ response: { status: 404 } })).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);

    vi.useFakeTimers();
    try {
      const engine = new OfflineSyncEngine();
      const spyEnvelope = vi
        .spyOn(engine, "handleBridgeEnvelope")
        .mockResolvedValue();

      const detach = attachSystemWakeupMonitor(engine, {
        settleDelayMs: 500,
      });

      window.dispatchEvent(new Event("online"));
      expect(spyEnvelope).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(500);
      expect(spyEnvelope).toHaveBeenCalledTimes(1);
      expect(spyEnvelope.mock.calls[0][0].method).toBe("sendRequestSync");

      detach();
    } finally {
      vi.useRealTimers();
    }
  });

  it("debe escuchar onDesktopWakeup en attachSystemWakeupMonitor cuando está en entorno Desktop", async () => {
    vi.useFakeTimers();
    let wakeupCb: (() => void) | null = null;
    const mockUnsub = vi.fn();

    window.prioritaskDesktop = {
      isDesktop: true,
      platform: "win32",
      version: "1.0.0",
      safeStorage: {
        isAvailable: async () => true,
        encryptString: async (s: string) => s,
        decryptString: async (s: string) => s,
      },
      ipc: {
        sendRequestSync: () => {},
        onWakeup: (cb: () => void) => {
          wakeupCb = cb;
          return mockUnsub;
        },
        onAddTask: () => () => {},
        quickAddAddTask: () => {},
        setMainLogicWindow: () => {},
      },
    };

    try {
      const engine = new OfflineSyncEngine();
      const spyEnvelope = vi
        .spyOn(engine, "handleBridgeEnvelope")
        .mockResolvedValue();

      const detach = attachSystemWakeupMonitor(engine, {
        settleDelayMs: 500,
      });

      expect(wakeupCb).not.toBeNull();
      wakeupCb!();

      expect(spyEnvelope).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);

      expect(spyEnvelope).toHaveBeenCalledTimes(1);
      expect(spyEnvelope.mock.calls[0][0].method).toBe("sendRequestSync");

      detach();
      expect(mockUnsub).toHaveBeenCalled();
    } finally {
      delete window.prioritaskDesktop;
      vi.useRealTimers();
    }
  });
});


