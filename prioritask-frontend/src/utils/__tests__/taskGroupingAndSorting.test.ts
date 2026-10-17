import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Task } from "../../types/task";
import {
  isSafeSectionKey,
  getRoomSectionsState,
  createCustomSection,
  renameCustomSection,
  deleteCustomSection,
  assignTaskToCustomSection,
  getPersistedTaskOrder,
  savePersistedTaskOrder,
  getViewGroupingPreferences,
  saveViewGroupingPreferences,
  sortTasksCollection,
  groupAndSortTasks,
} from "../taskGroupingAndSorting";
import { useTasksState } from "../../hooks/useTasksState";

const baseNow = new Date("2026-10-12T10:00:00.000Z");

const sampleTasks: Task[] = [
  {
    id: "t-overdue",
    titulo: "Zeta - Limpiar horno vencido",
    estado: "TODO",
    completed: false,
    categoria: "LIMPIEZA",
    peso: 2,
    due_date: "2026-10-10",
    created_at: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "t-today",
    titulo: "Alfa - Comprar verdura hoy",
    estado: "IN_PROGRESS",
    completed: false,
    categoria: "COMPRA",
    peso: 4,
    due_date: "2026-10-12",
    created_at: "2026-10-12T09:00:00.000Z",
  },
  {
    id: "t-tomorrow",
    titulo: "Beta - Reparar grifo mañana",
    estado: "TODO",
    completed: false,
    categoria: "MANTENIMIENTO",
    peso: 3,
    due_date: "2026-10-13",
    created_at: "2026-10-11T12:00:00.000Z",
  },
  {
    id: "t-upcoming",
    titulo: "Gamma - Pagar seguro esta semana",
    estado: "TODO",
    completed: false,
    categoria: "OTRO",
    peso: 1,
    due_date: "2026-10-16",
    created_at: "2026-10-05T15:00:00.000Z",
  },
  {
    id: "t-nodate",
    titulo: "Delta - Ordenar trastero sin fecha",
    estado: "DONE",
    completed: true,
    categoria: "LIMPIEZA",
    peso: 4,
    due_date: undefined,
    created_at: "2026-10-08T10:00:00.000Z",
  },
];

describe("taskGroupingAndSorting — Motor de Agrupación, Ordenación y Secciones Personalizadas", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("protege contra Prototype Pollution mediante isSafeSectionKey", () => {
    expect(isSafeSectionKey("sec-cocina-1")).toBe(true);
    expect(isSafeSectionKey("room-123")).toBe(true);
    expect(isSafeSectionKey("")).toBe(false);
    expect(isSafeSectionKey("   ")).toBe(false);
    expect(isSafeSectionKey("__proto__")).toBe(false);
    expect(isSafeSectionKey("constructor")).toBe(false);
    expect(isSafeSectionKey("prototype")).toBe(false);
    expect(isSafeSectionKey("toString")).toBe(false);
    expect(isSafeSectionKey("valueOf")).toBe(false);
    expect(isSafeSectionKey(null)).toBe(false);
    expect(isSafeSectionKey(undefined)).toBe(false);
    expect(isSafeSectionKey("a".repeat(65))).toBe(false);
  });

  it("ordena correctamente por priority (P1->P4), due_date (sin fecha siempre al final EC-01), title (A->Z), created_at y manual", () => {
    // 1. Priority: mayor peso primero (P1=5 → P4), desempatando por due_date más próxima
    const byPriority = sortTasksCollection(sampleTasks, "priority", "asc");
    expect(byPriority.map((t) => t.id)).toEqual([
      "t-today", // peso 4 (P2), con fecha 2026-10-12
      "t-nodate", // peso 4 (P2), sin fecha
      "t-tomorrow", // peso 3 (P3)
      "t-overdue", // peso 2 (P4)
      "t-upcoming", // peso 1 (P4)
    ]);

    // 2. Due Date: cronológico ascendente y tareas sin fecha SIEMPRE al final (EC-01)
    const byDueAsc = sortTasksCollection(sampleTasks, "due_date", "asc");
    expect(byDueAsc.map((t) => t.id)).toEqual([
      "t-overdue",
      "t-today",
      "t-tomorrow",
      "t-upcoming",
      "t-nodate",
    ]);

    // Incluso en orden descendente de fecha, las tareas sin fecha quedan al final (EC-01)
    const byDueDesc = sortTasksCollection(sampleTasks, "due_date", "desc");
    expect(byDueDesc[byDueDesc.length - 1].id).toBe("t-nodate");
    expect(byDueDesc[0].id).toBe("t-upcoming");

    // 3. Title: Alfabético A -> Z
    const byTitle = sortTasksCollection(sampleTasks, "title", "asc");
    expect(byTitle.map((t) => t.id)).toEqual([
      "t-today", // Alfa
      "t-tomorrow", // Beta
      "t-nodate", // Delta
      "t-upcoming", // Gamma
      "t-overdue", // Zeta
    ]);

    // 4. Created At: Más recientes primero
    const byCreated = sortTasksCollection(sampleTasks, "created_at", "asc");
    expect(byCreated.map((t) => t.id)).toEqual([
      "t-today", // Oct 12
      "t-tomorrow", // Oct 11
      "t-nodate", // Oct 8
      "t-upcoming", // Oct 5
      "t-overdue", // Oct 1
    ]);

    // 5. Manual: respeta manualOrderIds y conserva elementos restantes al final
    const byManual = sortTasksCollection(sampleTasks, "manual", "asc", [
      "t-upcoming",
      "t-overdue",
    ]);
    expect(byManual.slice(0, 2).map((t) => t.id)).toEqual([
      "t-upcoming",
      "t-overdue",
    ]);
    expect(byManual).toHaveLength(sampleTasks.length);
  });

  it("agrupa correctamente por due_date (Vencidas, Hoy, Mañana, Próximos 7 días, Sin fecha), priority, category y status", () => {
    const dueGroups = groupAndSortTasks(sampleTasks, {
      groupBy: "due_date",
      sortBy: "priority",
      now: baseNow,
    });

    expect(dueGroups.map((g) => g.id)).toEqual([
      "due-overdue",
      "due-today",
      "due-tomorrow",
      "due-upcoming",
      "due-none",
    ]);
    expect(dueGroups.map((g) => g.label)).toEqual([
      "Vencidas",
      "Hoy",
      "Mañana",
      "Próximos 7 días",
      "Sin fecha",
    ]);
    expect(dueGroups[0].tasks[0].id).toBe("t-overdue");
    expect(dueGroups[4].tasks[0].id).toBe("t-nodate");

    // Priority groups (P1..P4)
    const priorityGroups = groupAndSortTasks(sampleTasks, {
      groupBy: "priority",
      sortBy: "due_date",
      now: baseNow,
    });
    expect(priorityGroups.map((g) => g.id)).toEqual([
      "priority-p1",
      "priority-p2",
      "priority-p3",
      "priority-p4",
    ]);
    // Peso 4 pertenece a P2 (Alta); P1 queda vacío porque no hay peso 5.
    expect(priorityGroups[0].tasks).toEqual([]);
    expect(priorityGroups[1].tasks.map((t) => t.id)).toEqual([
      "t-today",
      "t-nodate",
    ]);
    expect(priorityGroups[1].dropMutation?.patch).toEqual({ peso: 4 });

    // Category groups
    const categoryGroups = groupAndSortTasks(sampleTasks, {
      groupBy: "category",
      sortBy: "title",
    });
    expect(categoryGroups.map((g) => g.id)).toEqual([
      "cat-LIMPIEZA",
      "cat-COMPRA",
      "cat-MANTENIMIENTO",
      "cat-OTRO",
    ]);
    expect(categoryGroups[0].tasks).toHaveLength(2);

    // Status groups
    const statusGroups = groupAndSortTasks(sampleTasks, {
      groupBy: "status",
      sortBy: "priority",
    });
    expect(statusGroups.map((g) => g.id)).toEqual([
      "status-TODO",
      "status-IN_PROGRESS",
      "status-DONE",
    ]);
    expect(statusGroups[2].completedCount).toBe(1);
  });

  it("agrupa con la escala canónica: peso 5 → P1, peso 4 → P2, peso 3 → P3 y peso 1..2 → P4", () => {
    const scaleTasks: Task[] = [
      {
        id: "scale-p1",
        titulo: "Urgente",
        estado: "TODO",
        categoria: "OTRO",
        peso: 5,
      },
      {
        id: "scale-p2",
        titulo: "Alta",
        estado: "TODO",
        categoria: "OTRO",
        peso: 4,
      },
      {
        id: "scale-p3",
        titulo: "Media",
        estado: "TODO",
        categoria: "OTRO",
        peso: 3,
      },
      {
        id: "scale-p4a",
        titulo: "Baja 2",
        estado: "TODO",
        categoria: "OTRO",
        peso: 2,
      },
      {
        id: "scale-p4b",
        titulo: "Baja 1",
        estado: "TODO",
        categoria: "OTRO",
        peso: 1,
      },
    ];

    const groups = groupAndSortTasks(scaleTasks, {
      groupBy: "priority",
      sortBy: "manual",
    });

    expect(groups.map((g) => g.id)).toEqual([
      "priority-p1",
      "priority-p2",
      "priority-p3",
      "priority-p4",
    ]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["scale-p1"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["scale-p2"]);
    expect(groups[2].tasks.map((t) => t.id)).toEqual(["scale-p3"]);
    expect(groups[3].tasks.map((t) => t.id)).toEqual([
      "scale-p4a",
      "scale-p4b",
    ]);
    expect(groups[0].dropMutation?.patch).toEqual({ peso: 5 });
    expect(groups[1].dropMutation?.patch).toEqual({ peso: 4 });
    expect(groups[2].dropMutation?.patch).toEqual({ peso: 3 });
    expect(groups[3].dropMutation?.patch).toEqual({ peso: 1 });
  });

  it("gestiona secciones personalizadas por hogar y al eliminar una sección devuelve sus tareas a General sin borrarlas (RN-04 / EC-02)", () => {
    const roomId = "room-home-42";

    // 1. Crear dos secciones personalizadas
    const res1 = createCustomSection(roomId, "  Cocina  ");
    expect(res1.created?.name).toBe("Cocina");
    const secCocinaId = res1.created!.id;

    const res2 = createCustomSection(roomId, "Jardín y Terraza");
    const secJardinId = res2.created!.id;

    // Evita duplicados case-insensitive
    const resDup = createCustomSection(roomId, "cocina");
    expect(resDup.state.sections).toHaveLength(2);
    expect(resDup.created?.id).toBe(secCocinaId);

    // 2. Asignar tareas a secciones
    assignTaskToCustomSection(roomId, "t-today", secCocinaId);
    assignTaskToCustomSection(roomId, "t-overdue", secCocinaId);
    const stateAfterAssign = assignTaskToCustomSection(
      roomId,
      "t-tomorrow",
      secJardinId
    );

    const customGroups = groupAndSortTasks(sampleTasks, {
      groupBy: "custom_section",
      sortBy: "priority",
      customSectionsState: stateAfterAssign,
    });

    expect(customGroups.map((g) => g.id)).toEqual([
      "section-unsectioned",
      secCocinaId,
      secJardinId,
    ]);
    expect(customGroups[0].tasks.map((t) => t.id)).toEqual([
      "t-nodate",
      "t-upcoming",
    ]);
    expect(customGroups[1].tasks.map((t) => t.id)).toEqual([
      "t-today",
      "t-overdue",
    ]);
    expect(customGroups[2].tasks.map((t) => t.id)).toEqual(["t-tomorrow"]);

    // 3. Renombrar sección Cocina -> Cocina Principal
    const stateAfterRename = renameCustomSection(
      roomId,
      secCocinaId,
      "Cocina Principal"
    );
    expect(
      stateAfterRename.sections.find((s) => s.id === secCocinaId)?.name
    ).toBe("Cocina Principal");

    // 4. Eliminar sección Cocina Principal -> t-today y t-overdue vuelven a "General (Sin sección)" sin borrarse (RN-04 / EC-02)
    const stateAfterDelete = deleteCustomSection(roomId, secCocinaId);
    expect(stateAfterDelete.sections).toHaveLength(1);
    expect(stateAfterDelete.taskSectionMap["t-today"]).toBeUndefined();
    expect(stateAfterDelete.taskSectionMap["t-overdue"]).toBeUndefined();

    const groupsAfterDelete = groupAndSortTasks(sampleTasks, {
      groupBy: "custom_section",
      sortBy: "priority",
      customSectionsState: stateAfterDelete,
    });
    const totalTasksCount = groupsAfterDelete.reduce(
      (acc, g) => acc + g.tasks.length,
      0
    );
    expect(totalTasksCount).toBe(sampleTasks.length);
    expect(groupsAfterDelete[0].id).toBe("section-unsectioned");
    expect(groupsAfterDelete[0].tasks.map((t) => t.id)).toContain("t-today");
    expect(groupsAfterDelete[0].tasks.map((t) => t.id)).toContain("t-overdue");
  });

  it("soporta reordenación manual en useTasksState (reorderTasks, moveTaskOrderByKeyboard y undo) y persistencia local", () => {
    const { result } = renderHook(() =>
      useTasksState({ initialTasks: sampleTasks })
    );

    expect(result.current.ids).toEqual([
      "t-overdue",
      "t-today",
      "t-tomorrow",
      "t-upcoming",
      "t-nodate",
    ]);

    // Mover t-upcoming antes de t-today (Drag & Drop)
    let reorderRes!: ReturnType<typeof result.current.reorderTasks>;
    act(() => {
      reorderRes = result.current.reorderTasks(
        "t-upcoming",
        "t-today",
        "before",
        "room-1"
      );
    });

    expect(reorderRes.ok).toBe(true);
    expect(result.current.ids).toEqual([
      "t-overdue",
      "t-upcoming",
      "t-today",
      "t-tomorrow",
      "t-nodate",
    ]);
    expect(getPersistedTaskOrder("room-1")).toEqual(result.current.ids);

    // Deshacer restaura el orden previo
    act(() => {
      reorderRes.undo();
    });
    expect(result.current.ids).toEqual([
      "t-overdue",
      "t-today",
      "t-tomorrow",
      "t-upcoming",
      "t-nodate",
    ]);

    // Mover por teclado (Alt+ArrowDown sobre t-overdue)
    act(() => {
      result.current.moveTaskOrderByKeyboard(
        "t-overdue",
        "down",
        undefined,
        "room-1"
      );
    });
    expect(result.current.ids.slice(0, 2)).toEqual(["t-today", "t-overdue"]);

    // Persistencia de preferencias de vista
    savePersistedTaskOrder("room-1", result.current.ids);
    saveViewGroupingPreferences("room-1", {
      groupBy: "priority",
      sortBy: "due_date",
      collapsedGroupIds: ["priority-p4"],
    });
    const prefs = getViewGroupingPreferences("room-1");
    expect(prefs.groupBy).toBe("priority");
    expect(prefs.sortBy).toBe("due_date");
    expect(prefs.collapsedGroupIds).toEqual(["priority-p4"]);
    expect(getRoomSectionsState("room-1").sections).toEqual([]);
  });
});
