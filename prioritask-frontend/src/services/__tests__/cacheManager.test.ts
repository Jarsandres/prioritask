import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheManager, CACHE_TTL_MS } from "../cacheManager";
import type { Task, Subtask } from "../../types/task";

describe("cacheManager (SWR L1 In-Memory Cache)", () => {
  beforeEach(() => {
    cacheManager.clearCache();
    vi.useRealTimers();
  });

  const mockTask1: Task = {
    id: "task-1",
    titulo: "Limpiar la cocina",
    estado: "TODO",
    categoria: "LIMPIEZA",
    peso: 2,
    room_id: "room-101",
  };

  const mockTask2: Task = {
    id: "task-2",
    titulo: "Comprar fruta",
    estado: "IN_PROGRESS",
    categoria: "COMPRAS",
    peso: 1,
    room_id: "room-101",
  };

  it("debe retornar null para una sala sin tareas cacheadas", () => {
    expect(cacheManager.getRoomTasks("non-existent-room")).toBeNull();
  });

  it("debe almacenar y recuperar tareas con estado isStale: false dentro del TTL", () => {
    cacheManager.setRoomTasks("room-101", [mockTask1, mockTask2]);

    const result = cacheManager.getRoomTasks("room-101");
    expect(result).not.toBeNull();
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0].titulo).toBe("Limpiar la cocina");
    expect(result?.isStale).toBe(false);
  });

  it("debe marcar isStale: true cuando expira el TTL de 60 segundos", () => {
    vi.useFakeTimers();
    cacheManager.setRoomTasks("room-101", [mockTask1]);

    // Avanzar 61 segundos (más allá del TTL de 60s)
    vi.advanceTimersByTime(CACHE_TTL_MS + 1000);

    const result = cacheManager.getRoomTasks("room-101");
    expect(result?.isStale).toBe(true);
    expect(result?.tasks).toHaveLength(1);
  });

  it("debe invalidar la sala inmediatamente con invalidateRoom()", () => {
    cacheManager.setRoomTasks("room-101", [mockTask1]);
    expect(cacheManager.getRoomTasks("room-101")?.isStale).toBe(false);

    cacheManager.invalidateRoom("room-101");
    expect(cacheManager.getRoomTasks("room-101")?.isStale).toBe(true);
  });

  it("debe añadir una nueva tarea a la sala en primera posición con addTaskToCache()", () => {
    cacheManager.setRoomTasks("room-101", [mockTask1]);
    cacheManager.addTaskToCache("room-101", mockTask2);

    const result = cacheManager.getRoomTasks("room-101");
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0].id).toBe("task-2");
    expect(result?.tasks[1].id).toBe("task-1");
  });

  it("debe actualizar una tarea existente si addTaskToCache() recibe una con ID repetido", () => {
    cacheManager.setRoomTasks("room-101", [mockTask1]);
    cacheManager.addTaskToCache("room-101", {
      ...mockTask1,
      titulo: "Limpiar la cocina a fondo",
      estado: "DONE",
    });

    const result = cacheManager.getRoomTasks("room-101");
    expect(result?.tasks).toHaveLength(1);
    expect(result?.tasks[0].titulo).toBe("Limpiar la cocina a fondo");
    expect(result?.tasks[0].estado).toBe("DONE");
  });

  it("debe actualizar parcialmente una tarea con updateTaskInCache()", () => {
    cacheManager.setRoomTasks("room-101", [mockTask1, mockTask2]);
    cacheManager.updateTaskInCache("room-101", {
      id: "task-1",
      estado: "DONE",
    });

    const result = cacheManager.getRoomTasks("room-101");
    const updated = result?.tasks.find((t) => t.id === "task-1");
    expect(updated?.estado).toBe("DONE");
    expect(updated?.titulo).toBe("Limpiar la cocina");
  });

  it("debe eliminar una tarea de la sala con removeTaskFromCache()", () => {
    cacheManager.setRoomTasks("room-101", [mockTask1, mockTask2]);
    cacheManager.removeTaskFromCache("room-101", "task-1");

    const result = cacheManager.getRoomTasks("room-101");
    expect(result?.tasks).toHaveLength(1);
    expect(result?.tasks[0].id).toBe("task-2");
  });

  it("debe actualizar subtareas y conteos con updateSubtaskInCache()", () => {
    const subtask: Subtask = {
      id: "sub-1",
      task_id: "task-1",
      titulo: "Barrer el suelo",
      completada: true,
      orden: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    cacheManager.setRoomTasks("room-101", [mockTask1]);
    cacheManager.updateSubtaskInCache("room-101", "task-1", {
      subtask,
      subtasks_count: 3,
      subtasks_completed_count: 1,
    });

    const result = cacheManager.getRoomTasks("room-101");
    const task = result?.tasks[0];
    expect(task?.subtasks_count).toBe(3);
    expect(task?.subtasks_completed_count).toBe(1);
  });

  it("debe incrementar y decrementar el contador de comentarios con updateCommentsCountInCache()", () => {
    cacheManager.setRoomTasks("room-101", [{ ...mockTask1, comments_count: 2 }]);

    cacheManager.updateCommentsCountInCache("room-101", "task-1", 1);
    expect(cacheManager.getRoomTasks("room-101")?.tasks[0].comments_count).toBe(3);

    cacheManager.updateCommentsCountInCache("room-101", "task-1", -1);
    expect(cacheManager.getRoomTasks("room-101")?.tasks[0].comments_count).toBe(2);
  });

  it("debe incrementar y decrementar el contador de adjuntos con updateAttachmentsCountInCache()", () => {
    cacheManager.setRoomTasks("room-101", [{ ...mockTask1, attachments_count: 1 }]);

    cacheManager.updateAttachmentsCountInCache("room-101", "task-1", 1);
    expect(cacheManager.getRoomTasks("room-101")?.tasks[0].attachments_count).toBe(2);

    cacheManager.updateAttachmentsCountInCache("room-101", "task-1", -1);
    expect(cacheManager.getRoomTasks("room-101")?.tasks[0].attachments_count).toBe(1);
  });

  it("debe gestionar datos de gamificación por sala con getRoomGamification / setRoomGamification", () => {
    const gamificationData = {
      room_id: "room-101",
      user_balance: 150,
      user_current_streak: 5,
      user_max_streak: 10,
      leaderboard: [],
      rewards: [],
      my_redemptions: [],
    };

    cacheManager.setRoomGamification("room-101", gamificationData);
    expect(cacheManager.getRoomGamification("room-101")).toEqual(gamificationData);
  });

  it("debe devolver todas las tareas cacheadas sin duplicados con getAllCachedTasks()", () => {
    const taskRoom2: Task = {
      id: "task-3",
      titulo: "Pintar habitación",
      estado: "TODO",
      categoria: "HOGAR",
      peso: 3,
      room_id: "room-202",
    };

    cacheManager.setRoomTasks("room-101", [mockTask1, mockTask2]);
    cacheManager.setRoomTasks("room-202", [taskRoom2]);

    const all = cacheManager.getAllCachedTasks();
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.id)).toContain("task-1");
    expect(all.map((t) => t.id)).toContain("task-2");
    expect(all.map((t) => t.id)).toContain("task-3");
  });

  it("debe notificar a los suscriptores cuando la caché sufre mutaciones", () => {
    const listener = vi.fn();
    const unsubscribe = cacheManager.subscribe(listener);

    cacheManager.setRoomTasks("room-101", [mockTask1]);
    expect(listener).toHaveBeenCalledTimes(1);

    cacheManager.updateTaskInCache("room-101", { id: "task-1", estado: "DONE" });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    cacheManager.removeTaskFromCache("room-101", "task-1");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
