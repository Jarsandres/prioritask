import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import api from "../../api";
import {
  useTasksState,
  computeSnoozePresetDate,
} from "../useTasksState";
import type { Task } from "../../types/task";

const sampleTasks: Task[] = [
  {
    id: "t-1",
    titulo: "Limpiar cocina",
    estado: "TODO",
    completed: false,
    categoria: "LIMPIEZA",
    peso: 4,
    due_date: "2026-10-12",
  },
  {
    id: "t-2",
    titulo: "Comprar leche",
    estado: "IN_PROGRESS",
    completed: false,
    categoria: "COMPRA",
    peso: 2,
    due_date: "2026-10-14",
  },
  {
    id: "t-3",
    titulo: "Revisar caldera",
    estado: "DONE",
    completed: true,
    categoria: "MANTENIMIENTO",
    peso: 1,
    due_date: "2026-10-20",
  },
  {
    id: "t-4",
    titulo: "Pagar recibo de luz",
    estado: "TODO",
    completed: false,
    categoria: "OTRO",
    peso: 3,
  },
];

describe("useTasksState — Multi-Selection, Bulk Optimistic Actions, Snooze & Atomic Undo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("soporta selectTaskRange (Shift+Click), selectAllTasks y clearSelection", () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    // 1. Seleccionar t-1 como ancla y luego rango hasta t-3 con Shift+Click
    act(() => {
      result.current.toggleSelectTask("t-1");
    });
    expect(result.current.ui.selectedTaskIds).toEqual(["t-1"]);

    act(() => {
      result.current.selectTaskRange("t-3");
    });
    expect(result.current.ui.selectedTaskIds).toEqual(["t-1", "t-2", "t-3"]);

    // 2. selectAllTasks selecciona todas las visibles si faltaba alguna
    act(() => {
      result.current.selectAllTasks();
    });
    expect(result.current.ui.selectedTaskIds).toEqual(["t-1", "t-2", "t-3", "t-4"]);

    // 3. Llamar a selectAllTasks de nuevo cuando todas están seleccionadas limpia la selección
    act(() => {
      result.current.selectAllTasks();
    });
    expect(result.current.ui.selectedTaskIds).toEqual([]);

    // 4. Seleccionar un par y limpiar con clearSelection
    act(() => {
      result.current.setSelectedTaskIds(["t-2", "t-4", "id-inexistente"]);
    });
    expect(result.current.ui.selectedTaskIds).toEqual(["t-2", "t-4"]);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.ui.selectedTaskIds).toEqual([]);
  });

  it("ejecuta batchToggleCompleteOptimistic y revierte atómicamente con undo() (completeItem <-> uncompleteItem)", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        sync_token: "tok-1",
        full_sync: false,
        sync_status: {},
        temp_id_mapping: {},
        items: [],
      },
    });

    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    act(() => {
      result.current.setSelectedTaskIds(["t-1", "t-2"]);
    });

    let batchRes!: Awaited<
      ReturnType<typeof result.current.batchToggleCompleteOptimistic>
    >;
    await act(async () => {
      batchRes = await result.current.batchToggleCompleteOptimistic(["t-1", "t-2"]);
    });

    expect(batchRes.ok).toBe(true);
    expect(batchRes.nextCompleted).toBe(true);
    expect(result.current.byId["t-1"].estado).toBe("DONE");
    expect(result.current.byId["t-1"].completed).toBe(true);
    expect(result.current.byId["t-2"].estado).toBe("DONE");
    expect(result.current.byId["t-2"].completed).toBe(true);
    expect(result.current.ui.selectedTaskIds).toEqual([]);
    expect(postSpy).toHaveBeenCalledWith(
      "/sync/batch",
      expect.objectContaining({
        commands: expect.arrayContaining([
          expect.objectContaining({ type: "task_complete", args: { id: "t-1" } }),
          expect.objectContaining({ type: "task_complete", args: { id: "t-2" } }),
        ]),
      })
    );

    // Invocar undo() restaura cada tarea a su estado previo (t-1 -> TODO, t-2 -> IN_PROGRESS)
    await act(async () => {
      const undone = await batchRes.undo();
      expect(undone).toBe(true);
    });

    expect(result.current.byId["t-1"].estado).toBe("TODO");
    expect(result.current.byId["t-1"].completed).toBe(false);
    expect(result.current.byId["t-2"].estado).toBe("IN_PROGRESS");
    expect(result.current.byId["t-2"].completed).toBe(false);
    expect(postSpy).toHaveBeenLastCalledWith(
      "/sync/batch",
      expect.objectContaining({
        commands: expect.arrayContaining([
          expect.objectContaining({ type: "task_uncomplete", args: { id: "t-1" } }),
          expect.objectContaining({ type: "task_uncomplete", args: { id: "t-2" } }),
        ]),
      })
    );
  });

  it("preserva valores heterogéneos previos en batchUpdateTasksOptimistic y los restaura individualmente con undo() (RN-01)", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        sync_token: "tok-2",
        full_sync: false,
        sync_status: {},
        temp_id_mapping: {},
        items: [],
      },
    });

    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    // t-1 tiene peso 4 y due_date "2026-10-12"
    // t-2 tiene peso 2 y due_date "2026-10-14"
    // t-3 tiene peso 1 y due_date "2026-10-20"
    let updateRes!: Awaited<
      ReturnType<typeof result.current.batchUpdateTasksOptimistic>
    >;
    await act(async () => {
      updateRes = await result.current.batchUpdateTasksOptimistic(
        ["t-1", "t-2", "t-3"],
        { peso: 4, due_date: "2026-11-01" }
      );
    });

    expect(updateRes.ok).toBe(true);
    expect(result.current.byId["t-1"].peso).toBe(4);
    expect(result.current.byId["t-2"].peso).toBe(4);
    expect(result.current.byId["t-3"].peso).toBe(4);
    expect(result.current.byId["t-2"].due_date).toBe("2026-11-01");

    // Deshacer debe restaurar el peso y due_date original de cada tarea por separado
    await act(async () => {
      await updateRes.undo();
    });

    expect(result.current.byId["t-1"].peso).toBe(4);
    expect(result.current.byId["t-1"].due_date).toBe("2026-10-12");
    expect(result.current.byId["t-2"].peso).toBe(2);
    expect(result.current.byId["t-2"].due_date).toBe("2026-10-14");
    expect(result.current.byId["t-3"].peso).toBe(1);
    expect(result.current.byId["t-3"].due_date).toBe("2026-10-20");

    expect(postSpy).toHaveBeenLastCalledWith(
      "/sync/batch",
      expect.objectContaining({
        commands: expect.arrayContaining([
          expect.objectContaining({
            type: "task_update",
            args: { id: "t-1", peso: 4, due_date: "2026-10-12" },
          }),
          expect.objectContaining({
            type: "task_update",
            args: { id: "t-2", peso: 2, due_date: "2026-10-14" },
          }),
          expect.objectContaining({
            type: "task_update",
            args: { id: "t-3", peso: 1, due_date: "2026-10-20" },
          }),
        ]),
      })
    );
  });

  it("cancela el borrado en servidor si se invoca undo() dentro de la ventana de gracia de 5s (EC-04) y ejecuta el borrado al expirar", async () => {
    vi.useFakeTimers();
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        sync_token: "tok-3",
        full_sync: false,
        sync_status: {},
        temp_id_mapping: {},
        items: [],
      },
    });

    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    // Caso A: Borrar t-2 y t-4 y pulsar Deshacer a los 2 segundos (antes de los 5s)
    let deleteRes!: Awaited<
      ReturnType<typeof result.current.batchDeleteTasksOptimistic>
    >;
    await act(async () => {
      deleteRes = await result.current.batchDeleteTasksOptimistic(["t-2", "t-4"], {
        graceMs: 5000,
      });
    });

    // Eliminadas inmediatamente de la vista
    expect(result.current.ids).toEqual(["t-1", "t-3"]);
    expect(postSpy).not.toHaveBeenCalled();

    // Avanzar 2 segundos y deshacer
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await deleteRes.undo();
    });

    // Restauradas en sus posiciones originales exactas ["t-1", "t-2", "t-3", "t-4"]
    expect(result.current.ids).toEqual(["t-1", "t-2", "t-3", "t-4"]);
    expect(result.current.byId["t-2"].titulo).toBe("Comprar leche");
    expect(result.current.byId["t-4"].titulo).toBe("Pagar recibo de luz");

    // Avanzar otros 5 segundos: el timer cancelado NO debe disparar ninguna petición al servidor
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(postSpy).not.toHaveBeenCalled();

    // Caso B: Borrar t-1 y dejar que expire la ventana de 5s
    await act(async () => {
      await result.current.batchDeleteTasksOptimistic(["t-1"], {
        graceMs: 5000,
      });
    });
    expect(result.current.ids).toEqual(["t-2", "t-3", "t-4"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      "/sync/batch",
      expect.objectContaining({
        commands: [
          expect.objectContaining({
            type: "task_delete",
            args: { id: "t-1" },
          }),
        ],
      })
    );
  });

  it("calcula con precisión matemática los presets de pospuesto rápido (Snooze) en computeSnoozePresetDate", () => {
    const baseNow = new Date("2026-10-12T14:00:00.000Z");

    // +30m -> +1,800,000 ms
    const s30m = computeSnoozePresetDate("30m", baseNow);
    expect(new Date(s30m.due_date!).getTime() - baseNow.getTime()).toBe(1_800_000);
    expect(s30m.reminder_at).toBe(s30m.due_date);

    // +3h -> +10,800,000 ms
    const s3h = computeSnoozePresetDate("3h", baseNow);
    expect(new Date(s3h.due_date!).getTime() - baseNow.getTime()).toBe(10_800_000);
    expect(s3h.reminder_at).toBe(s3h.due_date);

    // Mañana a las 09:00
    const sTom9 = computeSnoozePresetDate("tomorrow_9am", baseNow);
    const parsedTom9 = new Date(sTom9.due_date!);
    expect(parsedTom9.getHours()).toBe(9);
    expect(parsedTom9.getMinutes()).toBe(0);
    expect(sTom9.reminder_at).toBe(sTom9.due_date);

    // Hoy / Mañana / Próxima semana / Clear / Custom
    const sToday = computeSnoozePresetDate("today", baseNow);
    expect(sToday.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sToday.reminder_at).toBeNull();

    const sTomorrow = computeSnoozePresetDate("tomorrow", baseNow);
    expect(sTomorrow.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sTomorrow.reminder_at).toBeNull();

    const sNextWeek = computeSnoozePresetDate("next_week", baseNow);
    expect(sNextWeek.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sNextWeek.reminder_at).toBeNull();

    const sClear = computeSnoozePresetDate("clear", baseNow);
    expect(sClear.due_date).toBeNull();
    expect(sClear.reminder_at).toBeNull();

    const sCustom = computeSnoozePresetDate("custom", baseNow, "2026-12-31");
    expect(sCustom.due_date).toBe("2026-12-31");
  });
});
