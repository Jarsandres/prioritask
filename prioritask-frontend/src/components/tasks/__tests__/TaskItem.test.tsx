import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskItem from "../TaskItem";
import type { Task } from "../../../types/task";

const baseTask: Task = {
  id: "task-101",
  titulo: "Organizar despensa",
  descripcion: "Revisar caducidades y clasificar legumbres",
  estado: "TODO",
  categoria: "LIMPIEZA",
  peso: 4,
  due_date: "2026-12-31",
  subtasks_count: 3,
  subtasks_completed_count: 1,
  is_recurring: true,
};

describe("TaskItem — Accesibilidad WAI-ARIA, Prioridades Todoist P1-P4 y Atajos de Teclado", () => {
  it("renderiza semántica accesible, badge de prioridad P2 para peso 4, anillo de prioridad y subtareas", () => {
    render(<TaskItem task={baseTask} role="listitem" />);

    const item = screen.getByTestId("task-item-task-101");
    expect(item).toHaveAttribute("role", "listitem");
    expect(item).toHaveAttribute("data-priority", "p2");

    const checkbox = screen.getByTestId("task-item-checkbox-task-101");
    expect(checkbox).toHaveAttribute("role", "checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    expect(checkbox.className).toContain("priority-ring-p2");

    expect(screen.getByTestId("task-item-p-chip-task-101")).toHaveTextContent("P2");
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("Prioridad Alta")).toBeInTheDocument();
  });

  it("etiqueta peso 5 como P1 (Urgente) y no lo colapsa con P2", () => {
    render(
      <TaskItem
        task={{ ...baseTask, id: "task-urgent", peso: 5 }}
        role="listitem"
      />
    );

    const item = screen.getByTestId("task-item-task-urgent");
    expect(item).toHaveAttribute("data-priority", "p1");
    expect(
      screen.getByTestId("task-item-checkbox-task-urgent").className
    ).toContain("priority-ring-p1");
    expect(
      screen.getByTestId("task-item-p-chip-task-urgent")
    ).toHaveTextContent("P1");
    expect(screen.getByText("Prioridad Urgente")).toBeInTheDocument();
  });

  it("aplica correctamente rovingTabIndex (0 cuando está enfocado, -1 cuando no)", () => {
    const { rerender } = render(
      <TaskItem task={baseTask} rovingTabIndex={true} isFocused={false} />
    );

    const item = screen.getByTestId("task-item-task-101");
    expect(item).toHaveAttribute("tabIndex", "-1");

    rerender(<TaskItem task={baseTask} rovingTabIndex={true} isFocused={true} />);
    expect(item).toHaveAttribute("tabIndex", "0");
  });

  it("ejecuta atajos de teclado estilo Todoist: Espacio/X (completar), Enter/E (editar), Supr (eliminar), 1-4 (prioridad)", () => {
    const onToggleComplete = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onPriorityChange = vi.fn();
    const onNavigateFocus = vi.fn();

    render(
      <TaskItem
        task={baseTask}
        onToggleComplete={onToggleComplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onPriorityChange={onPriorityChange}
        onNavigateFocus={onNavigateFocus}
      />
    );

    const item = screen.getByTestId("task-item-task-101");

    // Espacio o 'x' -> completar
    fireEvent.keyDown(item, { key: " " });
    expect(onToggleComplete).toHaveBeenCalledWith("task-101");

    fireEvent.keyDown(item, { key: "x" });
    expect(onToggleComplete).toHaveBeenCalledTimes(2);

    // Enter o 'e' -> editar
    fireEvent.keyDown(item, { key: "Enter" });
    expect(onEdit).toHaveBeenCalledWith(baseTask);

    fireEvent.keyDown(item, { key: "e" });
    expect(onEdit).toHaveBeenCalledTimes(2);

    // Delete -> eliminar
    fireEvent.keyDown(item, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith(baseTask);

    // '1' -> P1 (peso 5) desde P2 (peso 4)
    fireEvent.keyDown(item, { key: "1" });
    expect(onPriorityChange).toHaveBeenCalledWith("task-101", 5, "p1");

    // '2' cuando ya es P2 (peso 4) no dispara mutación redundante
    onPriorityChange.mockClear();
    fireEvent.keyDown(item, { key: "2" });
    expect(onPriorityChange).not.toHaveBeenCalled();

    // '4' -> P4 (peso 1)
    fireEvent.keyDown(item, { key: "4" });
    expect(onPriorityChange).toHaveBeenCalledWith("task-101", 1, "p4");

    // Flechas -> navegación espacial roving tabindex
    fireEvent.keyDown(item, { key: "ArrowDown" });
    expect(onNavigateFocus).toHaveBeenCalledWith("next", "task-101");

    fireEvent.keyDown(item, { key: "ArrowUp" });
    expect(onNavigateFocus).toHaveBeenCalledWith("prev", "task-101");

    fireEvent.keyDown(item, { key: "Home" });
    expect(onNavigateFocus).toHaveBeenCalledWith("first", "task-101");

    fireEvent.keyDown(item, { key: "End" });
    expect(onNavigateFocus).toHaveBeenCalledWith("last", "task-101");
  });

  it("ignora atajos cuando se usan teclas modificadoras (Ctrl/Meta/Alt) o cuando la tarea está sincronizando (pendingState)", () => {
    const onToggleComplete = vi.fn();
    const onPriorityChange = vi.fn();

    const { rerender } = render(
      <TaskItem
        task={baseTask}
        onToggleComplete={onToggleComplete}
        onPriorityChange={onPriorityChange}
      />
    );

    const item = screen.getByTestId("task-item-task-101");

    // Con Ctrl presionado no debe interceptar atajos de una tecla
    fireEvent.keyDown(item, { key: "x", ctrlKey: true });
    fireEvent.keyDown(item, { key: "2", metaKey: true });
    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(onPriorityChange).not.toHaveBeenCalled();

    // Cuando hay una mutación optimista en vuelo, muestra estado aria-live y bloquea acciones duplicadas
    rerender(
      <TaskItem
        task={baseTask}
        pendingState="completing"
        onToggleComplete={onToggleComplete}
        onPriorityChange={onPriorityChange}
      />
    );

    expect(screen.getByTestId("task-item-optimistic-status-task-101")).toHaveTextContent(
      "Sincronizando…"
    );
    fireEvent.keyDown(item, { key: " " });
    fireEvent.keyDown(item, { key: "3" });
    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(onPriorityChange).not.toHaveBeenCalled();
  });

  it("distingue Shift+Space (selección múltiple) de Space simple (completar) y no roba el foco de inputs externos", () => {
    const onToggleComplete = vi.fn();
    const onToggleSelect = vi.fn();

    const { rerender } = render(
      <div>
        <input data-testid="external-search-input" />
        <TaskItem
          task={baseTask}
          rovingTabIndex={true}
          isFocused={false}
          onToggleComplete={onToggleComplete}
          onToggleSelect={onToggleSelect}
        />
      </div>
    );

    const item = screen.getByTestId("task-item-task-101");

    // Shift+Space debe disparar onToggleSelect y NO onToggleComplete
    fireEvent.keyDown(item, { key: " ", shiftKey: true });
    expect(onToggleSelect).toHaveBeenCalledWith("task-101");
    expect(onToggleComplete).not.toHaveBeenCalled();

    // Si el usuario tiene enfocado un input externo y cambia isFocused a true, no debe robarle el foco
    const searchInput = screen.getByTestId("external-search-input");
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    rerender(
      <div>
        <input data-testid="external-search-input" />
        <TaskItem
          task={baseTask}
          rovingTabIndex={true}
          isFocused={true}
          onToggleComplete={onToggleComplete}
          onToggleSelect={onToggleSelect}
        />
      </div>
    );

    expect(document.activeElement).toBe(searchInput);
  });

  it("muestra y ejecuta el botón de avanzar ciclo (onAdvance) únicamente en tareas recurrentes", () => {
    const onAdvance = vi.fn();

    const { rerender } = render(
      <TaskItem task={baseTask} onAdvance={onAdvance} />
    );

    const advanceBtn = screen.getByTestId("task-item-advance-btn-task-101");
    expect(advanceBtn).toBeInTheDocument();
    fireEvent.click(advanceBtn);
    expect(onAdvance).toHaveBeenCalledWith("task-101");

    // En una tarea no recurrente, el botón no se renderiza
    rerender(
      <TaskItem
        task={{ ...baseTask, is_recurring: false }}
        onAdvance={onAdvance}
      />
    );
    expect(
      screen.queryByTestId("task-item-advance-btn-task-101")
    ).not.toBeInTheDocument();
  });
});

