import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskBulkActionsBar from "../TaskBulkActionsBar";

describe("TaskBulkActionsBar — Barra Flotante de Acciones en Lote y Pospuesto Rápido", () => {
  it("no renderiza nada cuando selectedCount === 0", () => {
    const { container } = render(
      <TaskBulkActionsBar
        selectedCount={0}
        totalVisibleCount={5}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onBulkComplete={vi.fn()}
        onBulkPriority={vi.fn()}
        onBulkSnooze={vi.fn()}
        onBulkCategory={vi.fn()}
        onBulkDelete={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renderiza role='toolbar' y ejecuta completar, prioridad (P1..P4), snooze, categoría, eliminar y limpiar", () => {
    const onSelectAll = vi.fn();
    const onClearSelection = vi.fn();
    const onBulkComplete = vi.fn();
    const onBulkPriority = vi.fn();
    const onBulkSnooze = vi.fn();
    const onBulkCategory = vi.fn();
    const onBulkDelete = vi.fn();

    render(
      <TaskBulkActionsBar
        selectedCount={3}
        totalVisibleCount={5}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
        onBulkComplete={onBulkComplete}
        onBulkPriority={onBulkPriority}
        onBulkSnooze={onBulkSnooze}
        onBulkCategory={onBulkCategory}
        onBulkDelete={onBulkDelete}
      />
    );

    const toolbar = screen.getByRole("toolbar", {
      name: /acciones en lote para tareas seleccionadas/i,
    });
    expect(toolbar).toBeInTheDocument();
    expect(screen.getByTestId("bulk-selected-count")).toHaveTextContent("3");

    // Seleccionar todas
    fireEvent.click(screen.getByTestId("bulk-select-all-btn"));
    expect(onSelectAll).toHaveBeenCalledTimes(1);

    // Completar en lote
    fireEvent.click(screen.getByTestId("bulk-complete-btn"));
    expect(onBulkComplete).toHaveBeenCalledTimes(1);

    // Cambiar prioridad en lote -> P1 (peso 5) y P2 (peso 4), sin colapsarlos
    fireEvent.click(screen.getByTestId("bulk-priority-trigger"));
    fireEvent.click(screen.getByTestId("bulk-priority-p1"));
    expect(onBulkPriority).toHaveBeenCalledWith(5, "p1");

    fireEvent.click(screen.getByTestId("bulk-priority-trigger"));
    fireEvent.click(screen.getByTestId("bulk-priority-p2"));
    expect(onBulkPriority).toHaveBeenCalledWith(4, "p2");

    // Posponer en lote -> +30 minutos y Mañana 09:00
    fireEvent.click(screen.getByTestId("bulk-snooze-trigger"));
    fireEvent.click(screen.getByTestId("bulk-snooze-30m"));
    expect(onBulkSnooze).toHaveBeenCalledWith("30m");

    fireEvent.click(screen.getByTestId("bulk-snooze-trigger"));
    fireEvent.click(screen.getByTestId("bulk-snooze-tomorrow_9am"));
    expect(onBulkSnooze).toHaveBeenCalledWith("tomorrow_9am");

    // Cambiar categoría en lote -> COMPRA
    fireEvent.click(screen.getByTestId("bulk-category-trigger"));
    fireEvent.click(screen.getByTestId("bulk-category-COMPRA"));
    expect(onBulkCategory).toHaveBeenCalledWith("COMPRA");

    // Eliminar en lote
    fireEvent.click(screen.getByTestId("bulk-delete-btn"));
    expect(onBulkDelete).toHaveBeenCalledTimes(1);

    // Limpiar selección
    fireEvent.click(screen.getByTestId("bulk-clear-selection-btn"));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });
});
