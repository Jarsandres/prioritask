import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TaskCard from "../TaskCard";
import type { Task } from "../../../types/task";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";

const mockTask: Task = {
  id: "task-1",
  titulo: "Limpiar y desinfectar el salón",
  descripcion: "Aspirar alfombra y fregar el suelo",
  categoria: "LIMPIEZA",
  peso: 4,
  estado: "TODO",
  due_date: "2026-10-15",
  is_recurring: true,
  tags: [{ id: "tag-1", nombre: "Urgente" }],
  subtasks_count: 3,
  subtasks_completed_count: 1,
  attachments_count: 2,
};

const renderTaskCard = (props: Partial<React.ComponentProps<typeof TaskCard>> = {}) => {
  return render(
    <ToastProvider>
      <TaskUpdateProvider>
        <TaskCard
          task={mockTask}
          onComplete={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onAdvance={vi.fn()}
          {...props}
        />
      </TaskUpdateProvider>
    </ToastProvider>
  );
};

describe("TaskCard Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza correctamente los detalles básicos, badges y contadores de la tarea", () => {
    renderTaskCard();

    expect(screen.getByText("Limpiar y desinfectar el salón")).toBeInTheDocument();
    expect(screen.getByText("Aspirar alfombra y fregar el suelo")).toBeInTheDocument();
    expect(screen.getByText("LIMPIEZA")).toBeInTheDocument();
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
    expect(screen.getByText("📎 2")).toBeInTheDocument();
    expect(screen.getByText("#Urgente")).toBeInTheDocument();
  });

  it("llama a onComplete al pulsar el checkbox interactivo", () => {
    const onComplete = vi.fn();
    renderTaskCard({ onComplete });

    const checkbox = screen.getByLabelText(/Completar tarea Limpiar y desinfectar el salón/i);
    fireEvent.click(checkbox);

    expect(onComplete).toHaveBeenCalledWith("task-1");
  });

  it("abre el menú contextual y ejecuta las acciones de editar y eliminar", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderTaskCard({ onEdit, onDelete });

    const menuTrigger = screen.getByLabelText("Acciones de la tarea");
    fireEvent.click(menuTrigger);

    const editBtn = screen.getByRole("menuitem", { name: /Editar/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(mockTask);

    // Re-abrir menú para eliminar
    fireEvent.click(menuTrigger);
    const deleteBtn = screen.getByRole("menuitem", { name: /Eliminar/i });
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith(mockTask);
  });

  it("permite avanzar la rutina en tareas recurrentes mediante onAdvance", async () => {
    const onAdvance = vi.fn().mockResolvedValue(undefined);
    renderTaskCard({ onAdvance });

    const advanceBtn = screen.getByRole("button", { name: /Avanzar/i });
    expect(advanceBtn).toBeInTheDocument();

    fireEvent.click(advanceBtn);
    expect(onAdvance).toHaveBeenCalledWith("task-1");
  });

  it("soporta gestos táctiles Swipe derecho para completar con vibración háptica", () => {
    const onComplete = vi.fn();
    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    });

    renderTaskCard({ onComplete });

    const card = screen.getByTestId("task-card-task-1");

    // Simular Swipe derecho (>75px)
    fireEvent.touchStart(card, { touches: [{ clientX: 50, clientY: 100 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 160, clientY: 100 }] });
    fireEvent.touchEnd(card);

    expect(vibrateSpy).toHaveBeenCalledWith(30);
    expect(onComplete).toHaveBeenCalledWith("task-1");
  });

  it("soporta gestos táctiles Swipe izquierdo para eliminar con vibración háptica", () => {
    const onDelete = vi.fn();
    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    });

    renderTaskCard({ onDelete });

    const card = screen.getByTestId("task-card-task-1");

    // Simular Swipe izquierdo (<-75px)
    fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(card, { touches: [{ clientX: 90, clientY: 100 }] });
    fireEvent.touchEnd(card);

    expect(vibrateSpy).toHaveBeenCalledWith(30);
    expect(onDelete).toHaveBeenCalledWith(mockTask);
  });

  it("aplica el anillo de prioridad estilo Todoist (priority-ring-p1..p4) y estado semántico de vencimiento", () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const urgentTodayTask: Task = {
      ...mockTask,
      id: "task-urgent",
      peso: 5,
      due_date: todayStr,
    };

    const { unmount } = renderTaskCard({ task: urgentTodayTask });

    const card = screen.getByTestId("task-card-task-urgent");
    expect(card).toHaveClass("priority-card-p1");

    const checkbox = screen.getByLabelText(/Completar tarea Limpiar y desinfectar el salón/i);
    expect(checkbox).toHaveClass("priority-ring-p1");

    const dueEl = screen.getByTitle(`Fecha de vencimiento: ${todayStr}`);
    expect(dueEl).toHaveClass("due-today");

    unmount();

    // Verificar prioridad media-baja (peso 2 -> priority-ring-p3) y fecha vencida (due-overdue)
    const overdueLowTask: Task = {
      ...mockTask,
      id: "task-overdue",
      peso: 2,
      due_date: "2020-01-01",
    };

    renderTaskCard({ task: overdueLowTask });
    expect(screen.getByTestId("task-card-task-overdue")).toHaveClass("priority-card-p3");
    expect(
      screen.getByLabelText(/Completar tarea Limpiar y desinfectar el salón/i)
    ).toHaveClass("priority-ring-p3");
    expect(screen.getByTitle("Fecha de vencimiento: 2020-01-01")).toHaveClass("due-overdue");
  });

  it("abre el panel rápido (onEdit) al hacer clic directamente sobre el título de la tarea", () => {
    const onEdit = vi.fn();
    renderTaskCard({ onEdit });

    fireEvent.click(screen.getByText("Limpiar y desinfectar el salón"));
    expect(onEdit).toHaveBeenCalledWith(mockTask);
  });
});

