import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskListView, { VIRTUALIZATION_THRESHOLD } from "../TaskListView";
import type { Task } from "../../../types/task";

describe("TaskListView (Intelligent DOM Virtualization)", () => {
  const generateMockTasks = (count: number): Task[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `task-${i + 1}`,
      titulo: `Tarea Virtualizada #${i + 1}`,
      estado: i % 2 === 0 ? "TODO" : "DONE",
      categoria: "LIMPIEZA",
      peso: 1,
      room_id: "room-1",
    }));
  };

  it("debe renderizar de forma estándar sin virtualización cuando tasks.length <= 40", () => {
    const tasks = generateMockTasks(25);
    expect(tasks.length).toBeLessThanOrEqual(VIRTUALIZATION_THRESHOLD);

    const { container } = render(
      <TaskListView
        tasks={tasks}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // No debe contener el contenedor virtualizado
    expect(screen.queryByTestId("task-list-virtualized-container")).toBeNull();

    // Todas las filas se renderizan en el DOM directamente
    const rows = container.querySelectorAll(".task-list-row");
    expect(rows.length).toBe(25);
  });

  it("debe activar el contenedor virtualizado cuando tasks.length > 40", () => {
    const tasks = generateMockTasks(100);
    expect(tasks.length).toBeGreaterThan(VIRTUALIZATION_THRESHOLD);

    render(
      <TaskListView
        tasks={tasks}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const virtualContainer = screen.getByTestId("task-list-virtualized-container");
    expect(virtualContainer).toBeInTheDocument();
  });

  it("debe conservar los eventos de clic, completar y editar en filas", () => {
    const onComplete = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const tasks = generateMockTasks(10);

    render(
      <TaskListView
        tasks={tasks}
        onComplete={onComplete}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    // Click checkbox
    const completeButtons = screen.getAllByTitle(/Marcar completada|Completada/);
    fireEvent.click(completeButtons[0]);
    expect(onComplete).toHaveBeenCalledWith("task-1");

    // Click edit
    const editButtons = screen.getAllByTitle("Editar tarea");
    fireEvent.click(editButtons[0]);
    expect(onEdit).toHaveBeenCalledWith(tasks[0]);
  });
});
