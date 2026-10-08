import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TaskChecklist from "../TaskChecklist";
import type { Subtask } from "../../../types/task";
import api from "../../../api";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";

const mockSubtasks: Subtask[] = [
  {
    id: "sub-1",
    tarea_id: "task-100",
    titulo: "Comprar ingredientes",
    completada: true,
    orden: 0,
    created_at: "2026-10-01T10:00:00Z",
  },
  {
    id: "sub-2",
    tarea_id: "task-100",
    titulo: "Precalentar el horno",
    completada: true,
    orden: 1,
    created_at: "2026-10-01T10:05:00Z",
  },
  {
    id: "sub-3",
    tarea_id: "task-100",
    titulo: "Mezclar ingredientes",
    completada: false,
    orden: 2,
    created_at: "2026-10-01T10:10:00Z",
  },
  {
    id: "sub-4",
    tarea_id: "task-100",
    titulo: "Hornear por 45 minutos",
    completada: false,
    orden: 3,
    created_at: "2026-10-01T10:15:00Z",
  },
  {
    id: "sub-5",
    tarea_id: "task-100",
    titulo: "Dejar enfriar y servir",
    completada: false,
    orden: 4,
    created_at: "2026-10-01T10:20:00Z",
  },
];

const renderComponent = (props: React.ComponentProps<typeof TaskChecklist>) => {
  return render(
    <ToastProvider>
      <TaskUpdateProvider>
        <TaskChecklist {...props} />
      </TaskUpdateProvider>
    </ToastProvider>
  );
};

describe("TaskChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calcula y muestra correctamente el porcentaje de progreso (2/5 -> 40%)", () => {
    renderComponent({
      taskId: "task-100",
      initialSubtasks: mockSubtasks,
    });

    // Validar visualización numérica y textual del porcentaje
    expect(screen.getByText("2/5 (40%)")).toBeInTheDocument();

    // Validar atributos de accesibilidad de la barra de progreso
    const progressBar = screen.getByRole("progressbar", {
      name: /Progreso de subtareas/i,
    });
    expect(progressBar).toHaveAttribute("aria-valuenow", "40");
    expect(progressBar).toHaveAttribute("aria-valuemin", "0");
    expect(progressBar).toHaveAttribute("aria-valuemax", "100");
  });

  it("muestra '0 subtareas' cuando la lista inicial está vacía", () => {
    renderComponent({
      taskId: "task-100",
      initialSubtasks: [],
    });

    expect(screen.getByText("0 subtareas")).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: /Progreso de subtareas/i })
    ).not.toBeInTheDocument();
  });

  it("renderiza la lista de subtareas con estado completada y pendiente", () => {
    renderComponent({
      taskId: "task-100",
      initialSubtasks: mockSubtasks,
    });

    // Subtareas visibles en pantalla
    expect(screen.getByText("Comprar ingredientes")).toBeInTheDocument();
    expect(screen.getByText("Precalentar el horno")).toBeInTheDocument();
    expect(screen.getByText("Mezclar ingredientes")).toBeInTheDocument();
    expect(screen.getByText("Hornear por 45 minutos")).toBeInTheDocument();
    expect(screen.getByText("Dejar enfriar y servir")).toBeInTheDocument();

    // Verificar accesibilidad y botones de estado
    const btnCompletada = screen.getByRole("button", {
      name: "Marcar como pendiente: Comprar ingredientes",
    });
    expect(btnCompletada).toBeInTheDocument();
    expect(btnCompletada).toHaveClass("checked");

    const btnPendiente = screen.getByRole("button", {
      name: "Marcar como completada: Mezclar ingredientes",
    });
    expect(btnPendiente).toBeInTheDocument();
    expect(btnPendiente).not.toHaveClass("checked");
  });

  it("permite añadir una nueva subtarea pulsando Enter", async () => {
    const onSubtasksChange = vi.fn();
    const nuevaSubtarea: Subtask = {
      id: "sub-nueva",
      tarea_id: "task-100",
      titulo: "Limpiar la cocina",
      completada: false,
      orden: 5,
      created_at: "2026-10-01T10:30:00Z",
    };

    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: nuevaSubtarea,
    });

    renderComponent({
      taskId: "task-100",
      initialSubtasks: mockSubtasks,
      onSubtasksChange,
    });

    const input = screen.getByPlaceholderText("Añadir subtarea... (Enter)");
    fireEvent.change(input, { target: { value: "Limpiar la cocina" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/tasks/task-100/subtasks", {
        titulo: "Limpiar la cocina",
        orden: 5,
      });
    });

    expect(await screen.findByText("Limpiar la cocina")).toBeInTheDocument();
    expect(onSubtasksChange).toHaveBeenCalled();
  });

  it("ejecuta toggle optimista de checkbox y revierte si la llamada al backend falla", async () => {
    const onSubtasksChange = vi.fn();
    const subtaskAActualizar = mockSubtasks[2]; // 'Mezclar ingredientes', completada: false

    // Simular fallo en API
    vi.spyOn(api, "patch").mockRejectedValueOnce(new Error("Network Error"));

    renderComponent({
      taskId: "task-100",
      initialSubtasks: mockSubtasks,
      onSubtasksChange,
    });

    const botonToggle = screen.getByRole("button", {
      name: `Marcar como completada: ${subtaskAActualizar.titulo}`,
    });

    // Clic para alternar estado
    fireEvent.click(botonToggle);

    // Estado optimista inmediato: progreso sube de 40% a 60% (3 de 5)
    expect(screen.getByText("3/5 (60%)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Marcar como pendiente: ${subtaskAActualizar.titulo}`,
      })
    ).toBeInTheDocument();

    // Tras el fallo en backend, debe revertirse al estado previo
    await waitFor(() => {
      expect(screen.getByText("2/5 (40%)")).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: `Marcar como completada: ${subtaskAActualizar.titulo}`,
        })
      ).toBeInTheDocument();
    });
  });

  it("actualiza y concilia exitosamente el checkbox cuando el backend responde satisfactoriamente", async () => {
    const onSubtasksChange = vi.fn();
    const subtaskAActualizar = mockSubtasks[2];

    const subtaskResuelta: Subtask = {
      ...subtaskAActualizar,
      completada: true,
    };

    vi.spyOn(api, "patch").mockResolvedValueOnce({
      data: subtaskResuelta,
    });

    renderComponent({
      taskId: "task-100",
      initialSubtasks: mockSubtasks,
      onSubtasksChange,
    });

    const botonToggle = screen.getByRole("button", {
      name: `Marcar como completada: ${subtaskAActualizar.titulo}`,
    });

    fireEvent.click(botonToggle);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        `/tasks/task-100/subtasks/${subtaskAActualizar.id}`,
        { completada: true }
      );
    });

    expect(screen.getByText("3/5 (60%)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Marcar como pendiente: ${subtaskAActualizar.titulo}`,
      })
    ).toBeInTheDocument();
  });
});
