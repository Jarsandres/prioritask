import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useTasksState,
  pesoToPriorityLevel,
  priorityLevelToPeso,
} from "../useTasksState";
import type { Task } from "../../types/task";

const sampleTasks: Task[] = [
  {
    id: "t-1",
    titulo: "Limpiar cocina",
    estado: "TODO",
    categoria: "LIMPIEZA",
    peso: 4,
  },
  {
    id: "t-2",
    titulo: "Comprar leche",
    estado: "IN_PROGRESS",
    categoria: "COMPRA",
    peso: 2,
  },
  {
    id: "t-3",
    titulo: "Revisar caldera",
    estado: "DONE",
    completed: true,
    categoria: "MANTENIMIENTO",
    peso: 1,
  },
];

describe("useTasksState — Normalized Store, Optimistic Mutations & UI Decoupling", () => {
  it("mapea correctamente entre prioridades estilo Todoist (p1..p4) y peso Prioritask (4..1)", () => {
    expect(pesoToPriorityLevel(4)).toBe("p1");
    expect(pesoToPriorityLevel(5)).toBe("p1");
    expect(pesoToPriorityLevel(3)).toBe("p2");
    expect(pesoToPriorityLevel(2)).toBe("p3");
    expect(pesoToPriorityLevel(1)).toBe("p4");
    expect(pesoToPriorityLevel(0)).toBe("p4");

    expect(priorityLevelToPeso("p1")).toBe(4);
    expect(priorityLevelToPeso("p2")).toBe(3);
    expect(priorityLevelToPeso("p3")).toBe(2);
    expect(priorityLevelToPeso("p4")).toBe(1);
  });

  it("normaliza las tareas iniciales en diccionario O(1) byId, lista ordenada ids y contadores", () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    expect(result.current.ids).toEqual(["t-1", "t-2", "t-3"]);
    expect(result.current.getTaskById("t-2")?.titulo).toBe("Comprar leche");
    expect(result.current.counts).toEqual({
      total: 3,
      todo: 1,
      inProgress: 1,
      done: 1,
    });
    expect(result.current.ui.focusedTaskId).toBe("t-1");
  });

  it("deduplica IDs repetidos en setTasks conservando el orden de aparición", () => {
    const { result } = renderHook(() => useTasksState());

    act(() => {
      result.current.setTasks([
        sampleTasks[0],
        sampleTasks[1],
        { ...sampleTasks[0], titulo: "Limpiar cocina actualizado" },
      ]);
    });

    expect(result.current.ids).toEqual(["t-1", "t-2"]);
    expect(result.current.byId["t-1"].titulo).toBe("Limpiar cocina actualizado");
  });

  it("ejecuta toggleCompleteOptimistic de forma instantánea y hace rollback si la API falla", async () => {
    const onOptimisticError = vi.fn();
    const { result } = renderHook(() =>
      useTasksState({
        initialTasks: sampleTasks,
        onOptimisticError,
      })
    );

    let resolveApi!: () => void;
    const slowSuccessMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveApi = resolve;
        })
    );

    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.toggleCompleteOptimistic("t-1", slowSuccessMutation);
    });

    // Estado optimista aplicado antes de que resuelva la red
    expect(result.current.byId["t-1"].estado).toBe("DONE");
    expect(result.current.byId["t-1"].completed).toBe(true);
    expect(result.current.isTaskPending("t-1")).toBe(true);

    await act(async () => {
      resolveApi();
      await promise;
    });

    expect(result.current.isTaskPending("t-1")).toBe(false);
    expect(result.current.byId["t-1"].estado).toBe("DONE");

    // Ahora probamos un fallo de red y verificamos el rollback automático
    const failingMutation = vi.fn().mockRejectedValue(new Error("Fallo de red 503"));

    let ok = true;
    await act(async () => {
      ok = await result.current.toggleCompleteOptimistic("t-1", failingMutation);
    });

    expect(ok).toBe(false);
    expect(result.current.byId["t-1"].estado).toBe("DONE"); // revertido de TODO a DONE
    expect(result.current.isTaskPending("t-1")).toBe(false);
    expect(result.current.ui.lastError).toEqual({
      taskId: "t-1",
      message: "Fallo de red 503",
    });
    expect(onOptimisticError).toHaveBeenCalledWith({
      taskId: "t-1",
      message: "Fallo de red 503",
    });
  });

  it("actualiza prioridad con setPriorityOptimistic (clamping 1..4) y restaura en caso de error", async () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    await act(async () => {
      await result.current.setPriorityOptimistic("t-3", "p1", async () => {});
    });
    expect(result.current.byId["t-3"].peso).toBe(4);

    // Clamping de valores fuera de rango
    await act(async () => {
      await result.current.setPriorityOptimistic("t-3", 99, async () => {});
    });
    expect(result.current.byId["t-3"].peso).toBe(4);

    // Rollback en caso de error
    await act(async () => {
      await result.current.setPriorityOptimistic("t-3", "p4", async () => {
        throw new Error("Sin conexión");
      });
    });
    expect(result.current.byId["t-3"].peso).toBe(4);
  });

  it("elimina con deleteTaskOptimistic y restaura en su índice exacto si la mutación falla", async () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    await act(async () => {
      const ok = await result.current.deleteTaskOptimistic("t-2", async () => {
        throw new Error("No autorizado");
      });
      expect(ok).toBe(false);
    });

    // Debe restaurarse exactamente en la posición 1 (entre t-1 y t-3)
    expect(result.current.ids).toEqual(["t-1", "t-2", "t-3"]);
    expect(result.current.byId["t-2"].titulo).toBe("Comprar leche");
  });

  it("gestiona la navegación espacial de foco (moveFocus) y el desacoplamiento de overlays/UI", () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    expect(result.current.ui.focusedTaskId).toBe("t-1");

    act(() => {
      result.current.moveFocus("next");
    });
    expect(result.current.ui.focusedTaskId).toBe("t-2");

    act(() => {
      result.current.moveFocus("last");
    });
    expect(result.current.ui.focusedTaskId).toBe("t-3");

    // Límite inferior no desborda
    act(() => {
      result.current.moveFocus("next");
    });
    expect(result.current.ui.focusedTaskId).toBe("t-3");

    act(() => {
      result.current.moveFocus("first");
    });
    expect(result.current.ui.focusedTaskId).toBe("t-1");

    // Abrir un overlay de UI no muta las referencias de las tareas
    const prevTaskRef = result.current.byId["t-2"];
    act(() => {
      result.current.openOverlay("peek", "t-2");
    });
    expect(result.current.ui.activeOverlay).toEqual({
      type: "peek",
      taskId: "t-2",
    });
    expect(result.current.byId["t-2"]).toBe(prevTaskRef);

    // Si se elimina la tarea cuyo overlay está abierto, el overlay se cierra automáticamente
    act(() => {
      result.current.removeTask("t-2");
    });
    expect(result.current.ui.activeOverlay).toEqual({
      type: null,
      taskId: null,
    });
  });

  it("concilia eventos en vivo SSE e IPC (TASK_CREATED, TASK_UPDATED, completeItem, TASK_DELETED)", () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    act(() => {
      result.current.reconcileLiveEvent({
        type: "TASK_CREATED",
        data: {
          id: "t-0",
          titulo: "Nueva desde SSE",
          estado: "TODO",
          categoria: "OTRO",
          peso: 3,
        },
      });
    });
    expect(result.current.ids[0]).toBe("t-0");

    act(() => {
      result.current.reconcileLiveEvent({
        type: "completeItem",
        data: { id: "t-0" },
      });
    });
    expect(result.current.byId["t-0"].estado).toBe("DONE");

    act(() => {
      result.current.reconcileLiveEvent({
        type: "TASK_DELETED",
        data: { task_id: "t-0" },
      });
    });
    expect(result.current.getTaskById("t-0")).toBeUndefined();
  });

  it("concilia eventos SSE de subtareas, comentarios y adjuntos sin pisar contadores en ráfagas", () => {
    const initialSubtask = {
      id: "sub-1",
      task_id: "t-1",
      titulo: "Fregar platos",
      completada: false,
      orden: 0,
      created_at: "2026-10-12T10:00:00Z",
      updated_at: "2026-10-12T10:00:00Z",
    };

    const { result } = renderHook(() =>
      useTasksState({
        initialTasks: [
          {
            ...sampleTasks[0],
            subtasks_count: 1,
            subtasks_completed_count: 0,
            subtasks: [initialSubtask],
            comments_count: 0,
            attachments_count: 0,
          },
        ],
      })
    );

    act(() => {
      result.current.reconcileLiveEvent({
        type: "SUBTASK_CREATED",
        data: {
          task_id: "t-1",
          subtask: {
            id: "sub-2",
            task_id: "t-1",
            titulo: "Secar encimera",
            completada: false,
            orden: 1,
            created_at: "2026-10-12T10:01:00Z",
            updated_at: "2026-10-12T10:01:00Z",
          },
          subtasks_count: 2,
          subtasks_completed_count: 0,
        },
      });
      result.current.reconcileLiveEvent({
        type: "SUBTASK_TOGGLED",
        data: {
          task_id: "t-1",
          subtask: {
            ...initialSubtask,
            completada: true,
          },
        },
      });
      result.current.reconcileLiveEvent({
        type: "COMMENT_ADDED",
        data: { task_id: "t-1" },
      });
      result.current.reconcileLiveEvent({
        type: "COMMENT_ADDED",
        data: { task_id: "t-1" },
      });
      result.current.reconcileLiveEvent({
        type: "COMMENT_DELETED",
        data: { task_id: "t-1" },
      });
      result.current.reconcileLiveEvent({
        type: "ATTACHMENT_ADDED",
        data: { task_id: "t-1" },
      });
    });

    const updated = result.current.byId["t-1"];
    expect(updated.subtasks_count).toBe(2);
    expect(updated.subtasks_completed_count).toBe(1);
    expect(updated.subtasks?.find((s) => s.id === "sub-1")?.completada).toBe(true);
    expect(updated.subtasks?.find((s) => s.id === "sub-2")?.titulo).toBe("Secar encimera");
    expect(updated.comments_count).toBe(1);
    expect(updated.attachments_count).toBe(1);

    // El contador nunca debe bajar de 0 ante eventos duplicados de borrado
    act(() => {
      result.current.reconcileLiveEvent({
        type: "ATTACHMENT_DELETED",
        data: { task_id: "t-1" },
      });
      result.current.reconcileLiveEvent({
        type: "ATTACHMENT_DELETED",
        data: { task_id: "t-1" },
      });
    });
    expect(result.current.byId["t-1"].attachments_count).toBe(0);
  });

  it("mantiene pendingById en mutaciones concurrentes solapadas y hace rollback por campo sin pisar otros cambios", async () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    let rejectPriority!: (err: Error) => void;
    let resolveTitle!: () => void;

    const slowFailingPriority = vi.fn(
      () =>
        new Promise<void>((_res, rej) => {
          rejectPriority = rej;
        })
    );
    const slowSuccessTitle = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveTitle = res;
        })
    );

    let p1!: Promise<boolean>;
    let p2!: Promise<boolean>;

    act(() => {
      p1 = result.current.setPriorityOptimistic("t-1", "p4", slowFailingPriority);
      p2 = result.current.updateTaskOptimistic(
        "t-1",
        { titulo: "Cocina impecable" },
        slowSuccessTitle
      );
    });

    expect(result.current.byId["t-1"].peso).toBe(1);
    expect(result.current.byId["t-1"].titulo).toBe("Cocina impecable");
    expect(result.current.isTaskPending("t-1")).toBe(true);

    // Resuelve primero el cambio de título; la mutación de prioridad sigue en vuelo
    await act(async () => {
      resolveTitle();
      await p2;
    });

    // Debe seguir pendiente porque p1 aún no ha terminado
    expect(result.current.isTaskPending("t-1")).toBe(true);
    expect(result.current.byId["t-1"].titulo).toBe("Cocina impecable");

    // Falla la mutación de prioridad: solo `peso` debe revertir a 4, conservando `titulo: "Cocina impecable"`
    await act(async () => {
      rejectPriority(new Error("Conflicto de prioridad"));
      await p1;
    });

    expect(result.current.isTaskPending("t-1")).toBe(false);
    expect(result.current.byId["t-1"].peso).toBe(4);
    expect(result.current.byId["t-1"].titulo).toBe("Cocina impecable");
  });

  it("ignora IDs reservados (__proto__, constructor, prototype) en reconcileLiveEvent y acciones del reducer", () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    const reservedIds = ["__proto__", "constructor", "prototype", "toString", "valueOf", "   "];

    act(() => {
      for (const badId of reservedIds) {
        result.current.reconcileLiveEvent({
          type: "TASK_CREATED",
          data: {
            id: badId,
            titulo: "Intento de polución",
            estado: "TODO",
            categoria: "OTRO",
            peso: 1,
          },
        });
        result.current.reconcileLiveEvent({
          type: "TASK_UPDATED",
          data: { id: badId, titulo: "Mutación prohibida" },
        });
        result.current.reconcileLiveEvent({
          type: "completeItem",
          data: badId,
        });
        result.current.reconcileLiveEvent({
          type: "TASK_DELETED",
          data: { id: badId },
        });
        result.current.reconcileLiveEvent({
          type: "COMMENT_ADDED",
          data: { task_id: badId },
        });
      }
    });

    expect(result.current.ids).toEqual(["t-1", "t-2", "t-3"]);
    expect(Object.prototype.hasOwnProperty.call(result.current.byId, "__proto__")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.current.byId, "constructor")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.current.byId, "prototype")).toBe(false);
    expect(result.current.getTaskById("__proto__")).toBeUndefined();
    expect(result.current.getTaskById("constructor")).toBeUndefined();
    expect(result.current.getTaskById("prototype")).toBeUndefined();
  });
});


