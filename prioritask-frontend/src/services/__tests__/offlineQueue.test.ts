import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueMutation,
  getPendingMutations,
  removeMutation,
  clearQueue,
} from "../offlineQueue";

describe("offlineQueue service", () => {
  beforeEach(async () => {
    await clearQueue();
  });

  it("encola mutaciones offline y asigna id y timestamp si no están presentes", async () => {
    const mutation = await enqueueMutation({
      url: "/tasks/123/status",
      method: "PATCH",
      data: { estado: "DONE" },
    });

    expect(mutation.id).toBeDefined();
    expect(mutation.id).toMatch(/^mutation_/);
    expect(mutation.timestamp).toBeGreaterThan(0);
    expect(mutation.method).toBe("PATCH");
    expect(mutation.data).toEqual({ estado: "DONE" });
  });

  it("recupera mutaciones pendientes en orden cronológico estricto FIFO", async () => {
    await enqueueMutation({
      id: "mut_1",
      url: "/tasks",
      method: "POST",
      data: { titulo: "Tarea 1" },
      timestamp: 1000,
    });

    await enqueueMutation({
      id: "mut_3",
      url: "/tasks/3",
      method: "DELETE",
      timestamp: 3000,
    });

    await enqueueMutation({
      id: "mut_2",
      url: "/tasks/2",
      method: "PUT",
      data: { titulo: "Tarea 2 editada" },
      timestamp: 2000,
    });

    const pending = await getPendingMutations();
    expect(pending).toHaveLength(3);
    expect(pending[0].id).toBe("mut_1");
    expect(pending[1].id).toBe("mut_2");
    expect(pending[2].id).toBe("mut_3");
  });

  it("elimina una mutación específica por su ID tras sincronizarse", async () => {
    await enqueueMutation({
      id: "mut_del_1",
      url: "/tasks/del/1",
      method: "DELETE",
    });

    await enqueueMutation({
      id: "mut_del_2",
      url: "/tasks/del/2",
      method: "DELETE",
    });

    let pending = await getPendingMutations();
    expect(pending).toHaveLength(2);

    await removeMutation("mut_del_1");

    pending = await getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("mut_del_2");
  });

  it("limpia completamente la cola con clearQueue", async () => {
    await enqueueMutation({
      url: "/tasks/1",
      method: "POST",
    });
    await enqueueMutation({
      url: "/tasks/2",
      method: "POST",
    });

    let pending = await getPendingMutations();
    expect(pending).toHaveLength(2);

    await clearQueue();

    pending = await getPendingMutations();
    expect(pending).toHaveLength(0);
  });
});
