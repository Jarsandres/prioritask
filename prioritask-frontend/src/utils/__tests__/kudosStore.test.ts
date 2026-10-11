import { describe, it, expect, beforeEach } from "vitest";
import {
  getTaskKudos,
  toggleTaskKudo,
  addTaskKudo,
  getTotalKudosBonusPoints,
  toggleMemberTaskAssignmentLocal,
  getRoomTaskAssignees,
  getMemberInitials,
} from "../kudosStore";

describe("kudosStore Utility (Fase 4 Colaboración Doméstica)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("devuelve estado inicial vacío cuando la tarea no tiene Kudos o el ID es vacío y no contamina localStorage al alternar con ID vacío", () => {
    expect(getTaskKudos("")).toEqual({
      counts: { "👏": 0, "🔥": 0, "❤️": 0 },
      myReactions: [],
    });
    expect(getTaskKudos("task-unknown")).toEqual({
      counts: { "👏": 0, "🔥": 0, "❤️": 0 },
      myReactions: [],
    });

    const emptyRes = toggleTaskKudo("   ", "🔥", 5, true);
    expect(emptyRes.added).toBe(false);
    expect(emptyRes.deltaPoints).toBe(0);
    expect(getTotalKudosBonusPoints()).toBe(0);
  });

  it("incrementa y revierte contadores y puntos de Kudos al alternar una reacción sin deriva cuando cambia el peso de la tarea", () => {
    const addedRes = toggleTaskKudo("task-1", "🔥", 5, true);
    expect(addedRes.added).toBe(true);
    expect(addedRes.deltaPoints).toBe(6); // basePoints 3 * 2 (heavy/evidence)
    expect(addedRes.state.counts["🔥"]).toBe(1);
    expect(getTotalKudosBonusPoints()).toBe(6);

    // Aunque la tarea se edite después a peso 2 sin evidencia, al retirar el Kudo revierte exactamente los 6 puntos otorgados
    const removedRes = toggleTaskKudo("task-1", "🔥", 2, false);
    expect(removedRes.added).toBe(false);
    expect(removedRes.deltaPoints).toBe(-6);
    expect(removedRes.state.counts["🔥"]).toBe(0);
    expect(getTotalKudosBonusPoints()).toBe(0);
  });

  it("addTaskKudo añade la reacción de forma idempotente sin retirarla en llamadas repetidas y calcula puntos de estado pre-poblado", () => {
    const first = addTaskKudo("task-2", "❤️", { isHeavyOrVerified: true });
    expect(first.added).toBe(true);
    expect(first.deltaPoints).toBe(4); // basePoints 2 * 2
    expect(getTotalKudosBonusPoints()).toBe(4);

    // Segunda llamada a addTaskKudo con el mismo emoji es idempotente (no resta puntos ni desmarca)
    const duplicate = addTaskKudo("task-2", "❤️", { isHeavyOrVerified: true });
    expect(duplicate.added).toBe(false);
    expect(duplicate.deltaPoints).toBe(0);
    expect(getTotalKudosBonusPoints()).toBe(4);

    // Si solo existe el mapa de reacciones en localStorage sin la clave de puntos acumulados, lo reconstruye
    localStorage.removeItem("prioritask_kudos_bonus_points_v1");
    expect(getTotalKudosBonusPoints()).toBe(4);
  });

  it("asigna y desasigna convivientes localmente por sala y extrae iniciales de forma segura", () => {
    const member = { userId: "u-1", label: "Lucía Gómez" };
    const first = toggleMemberTaskAssignmentLocal("room-a", "t-1", member);
    expect(first.added).toBe(true);
    expect(first.assignees).toHaveLength(1);
    expect(getRoomTaskAssignees("room-a")["t-1"]).toEqual([member]);

    const second = toggleMemberTaskAssignmentLocal("room-a", "t-1", member);
    expect(second.added).toBe(false);
    expect(second.assignees).toHaveLength(0);

    expect(getMemberInitials("Lucía Gómez")).toBe("LG");
    expect(getMemberInitials("carlos.perez@example.com")).toBe("CP");
    expect(getMemberInitials("")).toBe("U");
  });
});
