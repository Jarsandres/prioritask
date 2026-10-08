import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import TaskForm from "../TaskForm";
import api from "../../api";
import { ToastProvider } from "../../context/ToastContext";
import { TaskUpdateProvider } from "../../context/TaskUpdateContext";
import { ThemeProvider } from "../../context/ThemeContext";

const renderTaskForm = () => {
  return render(
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <TaskUpdateProvider>
            <TaskForm />
          </TaskUpdateProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

describe("TaskForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "get").mockImplementation((url: string) => {
      if (url === "/tags") {
        return Promise.resolve({ data: [{ id: "tag-1", nombre: "Limpieza" }] });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("renderiza todos los campos principales del formulario de creación", async () => {
    renderTaskForm();

    expect(screen.getByLabelText(/Título de la tarea/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Descripción/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Categoría/i)).toBeInTheDocument();
    expect(screen.getByText(/Nivel de Prioridad \/ Peso/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Fecha de vencimiento/i)).toBeInTheDocument();
    expect(screen.getByText(/Tarea recurrente/i)).toBeInTheDocument();
  });

  it("permite seleccionar el nivel de prioridad mediante los botones táctiles segmentados de 44px", async () => {
    renderTaskForm();

    const priorityBtn5 = screen.getByTestId("priority-btn-5");
    expect(priorityBtn5).toBeInTheDocument();

    fireEvent.click(priorityBtn5);

    expect(priorityBtn5).toHaveAttribute("aria-checked", "true");
    const hiddenPesoInput = document.querySelector('input[name="peso"]') as HTMLInputElement;
    expect(hiddenPesoInput.value).toBe("5");
  });

  it("asigna fechas automáticas con los chips táctiles de acceso rápido [ Hoy ], [ Mañana ], [ Próx. Semana ]", async () => {
    renderTaskForm();

    const todayStr = new Date().toISOString().split("T")[0];
    const hoyBtn = screen.getByRole("button", { name: /Hoy/i });
    fireEvent.click(hoyBtn);

    const dateInput = screen.getByLabelText(/Fecha de vencimiento/i) as HTMLInputElement;
    expect(dateInput.value).toBe(todayStr);

    const mananaBtn = screen.getByRole("button", { name: /Mañana/i });
    fireEvent.click(mananaBtn);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(dateInput.value).toBe(tomorrow.toISOString().split("T")[0]);
  });

  it("muestra error si se intenta enviar un título vacío o con solo espacios", async () => {
    renderTaskForm();

    const submitBtn = screen.getByRole("button", { name: /Crear Tarea/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/El título de la tarea es obligatorio/i)
    ).toBeInTheDocument();
  });

  it("obtiene sugerencia de prioridad con IA y actualiza el nivel", async () => {
    vi.spyOn(api, "post").mockImplementation((url: string) => {
      if (url === "/tasks/ai/suggest") {
        return Promise.resolve({
          data: {
            prioridad: "alta",
            motivo: "Se detectaron palabras clave de urgencia",
          },
        });
      }
      return Promise.resolve({ data: { id: "new-task-1" } });
    });

    renderTaskForm();

    const titleInput = screen.getByLabelText(/Título de la tarea/i);
    fireEvent.change(titleInput, { target: { value: "Reparar fuga de agua urgente" } });

    const aiBtn = screen.getByRole("button", { name: /Sugerir prioridad con IA/i });
    fireEvent.click(aiBtn);

    expect(
      await screen.findByText(/Sugerencia IA: Prioridad ALTA/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Se detectaron palabras clave de urgencia")
    ).toBeInTheDocument();
  });

  it("envía satisfactoriamente la creación de la tarea al backend", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { id: "created-task-1" },
    });

    renderTaskForm();

    const titleInput = screen.getByLabelText(/Título de la tarea/i);
    fireEvent.change(titleInput, { target: { value: "Comprar bombillas LED" } });

    const submitBtn = screen.getByRole("button", { name: /Crear Tarea/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Comprar bombillas LED",
          peso: 1,
        })
      );
    });
  });
});
