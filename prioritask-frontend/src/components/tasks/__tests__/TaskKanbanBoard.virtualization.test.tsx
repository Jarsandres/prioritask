import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TaskKanbanBoard, { VIRTUALIZATION_THRESHOLD } from "../TaskKanbanBoard";
import type { Task } from "../../../types/task";

describe("TaskKanbanBoard (Intelligent DOM Virtualization)", () => {
  const generateMockTasks = (count: number, status: "TODO" | "IN_PROGRESS" | "DONE" = "TODO"): Task[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `k-task-${i + 1}`,
      titulo: `Kanban Tarea #${i + 1}`,
      estado: status,
      categoria: "LIMPIEZA",
      peso: 1,
      room_id: "room-1",
    }));
  };

  it("debe renderizar columnas estándar sin virtualización cuando tareas por columna <= 40", () => {
    const tasks = [
      ...generateMockTasks(15, "TODO"),
      ...generateMockTasks(10, "IN_PROGRESS"),
      ...generateMockTasks(5, "DONE"),
    ];

    render(
      <TaskKanbanBoard
        tasks={tasks}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.queryByTestId("kanban-virtualized-TODO")).toBeNull();
    expect(screen.queryByTestId("kanban-virtualized-IN_PROGRESS")).toBeNull();
    expect(screen.queryByTestId("kanban-virtualized-DONE")).toBeNull();
  });

  it("debe activar virtualización en la columna que supere 40 tareas", () => {
    const tasks = [
      ...generateMockTasks(50, "TODO"), // > 40 -> virtualizado
      ...generateMockTasks(10, "IN_PROGRESS"), // <= 40 -> estándar
    ];

    expect(tasks.filter((t) => t.estado === "TODO").length).toBeGreaterThan(VIRTUALIZATION_THRESHOLD);

    render(
      <TaskKanbanBoard
        tasks={tasks}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByTestId("kanban-virtualized-TODO")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-virtualized-IN_PROGRESS")).toBeNull();
  });
});
