import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../../../context/ThemeContext";
import TaskListView from "../TaskListView";
import FilterBar from "../FilterBar";
import {
  groupAndSortTasks,
  createCustomSection,
  assignTaskToCustomSection,
  deleteCustomSection,
} from "../../../utils/taskGroupingAndSorting";
import type { Task } from "../../../types/task";

const sampleTasks: Task[] = [
  {
    id: "task-1",
    titulo: "Limpiar encimera",
    estado: "TODO",
    completed: false,
    categoria: "LIMPIEZA",
    peso: 4,
    due_date: "2026-10-12",
  },
  {
    id: "task-2",
    titulo: "Comprar detergente",
    estado: "TODO",
    completed: false,
    categoria: "COMPRA",
    peso: 2,
    due_date: "2026-10-13",
  },
  {
    id: "task-3",
    titulo: "Revisar bombillas",
    estado: "DONE",
    completed: true,
    categoria: "MANTENIMIENTO",
    peso: 1,
    due_date: "2026-10-15",
  },
];

describe("TaskListView & FilterBar — Agrupación Dinámica, Secciones Colapsables, Drag & Drop y Teclado", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renderiza cabeceras de sección colapsables, muestra contadores y alterna aria-expanded al hacer clic", () => {
    const groups = groupAndSortTasks(sampleTasks, {
      groupBy: "priority",
      sortBy: "manual",
    });

    render(
      <ThemeProvider>
        <TaskListView tasks={sampleTasks} groups={groups} />
      </ThemeProvider>
    );

    const p1Header = screen.getByTestId("task-group-header-priority-p1");
    expect(p1Header).toBeInTheDocument();
    expect(screen.getByTestId("task-group-count-priority-p1")).toHaveTextContent("1");

    const p1Toggle = screen.getByTestId("task-group-toggle-priority-p1");
    expect(p1Toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("task-item-task-1")).toBeInTheDocument();

    // Colapsar sección P1 -> oculta sus tareas y cambia aria-expanded a false
    fireEvent.click(p1Toggle);
    expect(p1Toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("task-item-task-1")).not.toBeInTheDocument();

    // Expandir sección P1 de nuevo -> vuelve a mostrar la tarea
    fireEvent.click(p1Toggle);
    expect(p1Toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("task-item-task-1")).toBeInTheDocument();
  });

  it("invoca onDropTaskInGroup con el dropMutation correspondiente al arrastrar y soltar una tarea sobre otra sección", () => {
    const onDropTaskInGroup = vi.fn();
    const groups = groupAndSortTasks(sampleTasks, {
      groupBy: "priority",
      sortBy: "manual",
    });

    render(
      <ThemeProvider>
        <TaskListView
          tasks={sampleTasks}
          groups={groups}
          onDropTaskInGroup={onDropTaskInGroup}
        />
      </ThemeProvider>
    );

    const task2Row = screen.getByTestId("task-item-task-2");
    const p1Section = screen.getByTestId("task-group-section-priority-p1");

    const dataTransfer = {
      data: {} as Record<string, string>,
      types: ["application/x-prioritask-task-id"],
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type] || "";
      },
      effectAllowed: "move",
      dropEffect: "move",
    };

    fireEvent.dragStart(task2Row, { dataTransfer });
    fireEvent.dragOver(p1Section, { dataTransfer });
    fireEvent.drop(p1Section, { dataTransfer });

    expect(onDropTaskInGroup).toHaveBeenCalledTimes(1);
    expect(onDropTaskInGroup).toHaveBeenCalledWith(
      "task-2",
      expect.objectContaining({
        id: "priority-p1",
        dropMutation: expect.objectContaining({
          patch: { peso: 4 },
        }),
      })
    );
  });

  it("ejecuta onMoveTaskOrder al pulsar Alt+ArrowDown y Alt+ArrowUp sobre una fila enfocada (RN-03)", () => {
    const onMoveTaskOrder = vi.fn();

    render(
      <ThemeProvider>
        <TaskListView
          tasks={sampleTasks}
          onMoveTaskOrder={onMoveTaskOrder}
        />
      </ThemeProvider>
    );

    const row1 = screen.getByTestId("task-item-task-1");
    fireEvent.keyDown(row1, { key: "ArrowDown", altKey: true });
    expect(onMoveTaskOrder).toHaveBeenCalledWith("task-1", "down");

    const row2 = screen.getByTestId("task-item-task-2");
    fireEvent.keyDown(row2, { key: "ArrowUp", altKey: true });
    expect(onMoveTaskOrder).toHaveBeenCalledWith("task-2", "up");
  });

  it("permite crear secciones personalizadas desde FilterBar y renombrarlas/eliminarlas desde TaskListView", () => {
    const onGroupByChange = vi.fn();
    const onSortByChange = vi.fn();
    const onAddCustomSection = vi.fn();

    render(
      <FilterBar
        busqueda=""
        onBusquedaChange={vi.fn()}
        estado=""
        onEstadoChange={vi.fn()}
        categoria=""
        onCategoriaChange={vi.fn()}
        fechaLimite=""
        onFechaLimiteChange={vi.fn()}
        groupBy="custom_section"
        onGroupByChange={onGroupByChange}
        sortBy="manual"
        onSortByChange={onSortByChange}
        onAddCustomSection={onAddCustomSection}
        onClearFilters={vi.fn()}
        totalTasks={sampleTasks}
      />
    );

    // Crear nueva sección desde el input inline de FilterBar
    const input = screen.getByTestId("add-custom-section-input");
    const addBtn = screen.getByTestId("add-custom-section-btn");
    fireEvent.change(input, { target: { value: "Terraza" } });
    fireEvent.click(addBtn);

    expect(onAddCustomSection).toHaveBeenCalledWith("Terraza");

    // Probar renderizado y acciones de sección personalizada en TaskListView
    const { created } = createCustomSection("room-test", "Terraza");
    const secId = created!.id;
    const stateWithTask = assignTaskToCustomSection("room-test", "task-1", secId);

    const customGroups = groupAndSortTasks(sampleTasks, {
      groupBy: "custom_section",
      sortBy: "manual",
      customSectionsState: stateWithTask,
    });

    const onRenameCustomSection = vi.fn();
    const onDeleteCustomSection = vi.fn((id: string) => {
      deleteCustomSection("room-test", id);
    });

    render(
      <ThemeProvider>
        <TaskListView
          tasks={sampleTasks}
          groups={customGroups}
          onRenameCustomSection={onRenameCustomSection}
          onDeleteCustomSection={onDeleteCustomSection}
        />
      </ThemeProvider>
    );

    // Renombrar sección inline
    const renameBtn = screen.getByTestId(`rename-section-${secId}`);
    fireEvent.click(renameBtn);
    const renameInput = screen.getByTestId(`rename-section-input-${secId}`);
    fireEvent.change(renameInput, { target: { value: "Terraza Exterior" } });
    fireEvent.click(screen.getByTestId(`rename-section-save-${secId}`));
    expect(onRenameCustomSection).toHaveBeenCalledWith(secId, "Terraza Exterior");

    // Eliminar sección personalizada
    const deleteBtn = screen.getByTestId(`delete-section-${secId}`);
    fireEvent.click(deleteBtn);
    expect(onDeleteCustomSection).toHaveBeenCalledWith(secId);
  });
});
