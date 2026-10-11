import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import TaskPeekDrawer from "../TaskPeekDrawer";
import api from "../../../api";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";
import type { Task } from "../../../types/task";

const sampleTask: Task = {
  id: "task-peek-1",
  titulo: "Limpiar cristales del salón",
  descripcion: "Usar bayeta de microfibra",
  categoria: "LIMPIEZA",
  peso: 3,
  estado: "TODO",
  due_date: "2025-11-10",
  is_recurring: false,
  subtasks: [],
};

const renderDrawer = (
  props: Partial<React.ComponentProps<typeof TaskPeekDrawer>> = {}
) => {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <TaskUpdateProvider>
          <TaskPeekDrawer
            task={sampleTask}
            isOpen={true}
            onClose={vi.fn()}
            onTaskUpdated={vi.fn()}
            {...props}
          />
        </TaskUpdateProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

describe("TaskPeekDrawer Component (Slide-Over Inspector)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "get").mockResolvedValue({ data: [] });
  });

  it("no renderiza nada cuando isOpen es false o task es null", () => {
    const { container } = renderDrawer({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra los datos de la tarea, permite editar título/prioridad P1 y guarda cambios vía PUT /tasks/:id", async () => {
    const onTaskUpdated = vi.fn();
    vi.spyOn(api, "put").mockResolvedValueOnce({
      data: {
        ...sampleTask,
        titulo: "Limpiar cristales y espejos",
        peso: 5,
      },
    });

    renderDrawer({ onTaskUpdated });

    expect(screen.getByTestId("task-peek-drawer")).toBeInTheDocument();

    const titleInput = screen.getByTestId("peek-drawer-title-input");
    expect(titleInput).toHaveValue("Limpiar cristales del salón");

    fireEvent.change(titleInput, {
      target: { value: "Limpiar cristales y espejos" },
    });

    // Cambiar prioridad a P1 (peso 5)
    fireEvent.click(screen.getByTestId("peek-priority-P1"));

    // Guardar cambios
    fireEvent.click(screen.getByTestId("peek-drawer-save-btn"));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        "/tasks/task-peek-1",
        expect.objectContaining({
          titulo: "Limpiar cristales y espejos",
          peso: 5,
          categoria: "LIMPIEZA",
        })
      );
    });

    expect(onTaskUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-peek-1",
        titulo: "Limpiar cristales y espejos",
        peso: 5,
      })
    );
  });

  it("muestra la vista previa de 4 ciclos al activar un chip de rutina recurrente ('Cada! 7 días')", async () => {
    renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: /Cada! 7 días/i }));

    const previewBox = await screen.findByTestId("peek-drawer-recurrence-preview");
    expect(previewBox).toBeInTheDocument();
    expect(previewBox).toHaveTextContent(/Próximos 4 ciclos/i);
    expect(previewBox).toHaveTextContent(/Flotante !/i);
    expect(previewBox).toHaveTextContent(/#1 ·/i);
    expect(previewBox).toHaveTextContent(/#4 ·/i);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
  });

  it("cierra el drawer al pulsar la tecla Escape o hacer clic en el botón de cierre", async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("peek-drawer-close-btn"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("persiste el cambio de estado vía PATCH /tasks/:id/status al pulsar el checkbox de completado cuando no se pasa onComplete", async () => {
    const onTaskUpdated = vi.fn();
    vi.spyOn(api, "patch").mockResolvedValueOnce({ data: {} });

    renderDrawer({ onTaskUpdated });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("peek-drawer-complete-checkbox"));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/tasks/task-peek-1/status", {
        estado: "DONE",
      });
    });

    expect(onTaskUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-peek-1",
        estado: "DONE",
      })
    );
  });
});
