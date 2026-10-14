import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
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
        return Promise.resolve({
          data: [
            { id: "tag-1", nombre: "Limpieza" },
            { id: "tag-2", nombre: "Ferretería" },
          ],
        });
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

  it("despliega el panel de recurrencia, parsea expresiones 'cada! 7 días' (FLOATING) y envía recurrence_rule al backend", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { id: "recurring-task-1" },
    });

    renderTaskForm();

    const titleInput = screen.getByLabelText(/Título de la tarea/i);
    fireEvent.change(titleInput, { target: { value: "Limpieza profunda de cocina" } });

    const recurringSwitch = screen.getByRole("switch");
    fireEvent.click(recurringSwitch);

    expect(screen.getByTestId("recurrence-config-panel")).toBeInTheDocument();

    const dslInput = screen.getByLabelText(/Expresión rápida/i);
    fireEvent.change(dslInput, { target: { value: "cada! 7 días" } });

    const floatingRadio = screen.getByTestId("recurrence-mode-FLOATING");
    expect(floatingRadio).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("recurrence-formatted-summary")).toHaveTextContent(
      /Cada! 7 días \(al completar\)/i
    );
    expect(screen.getAllByTestId("recurrence-preview-chip").length).toBe(4);

    const submitBtn = screen.getByRole("button", { name: /Crear Tarea/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Limpieza profunda de cocina",
          is_recurring: true,
          recurrence_rule: expect.objectContaining({
            frequency: "DAILY",
            interval: 7,
            mode: "FLOATING",
            reset_subtasks: true,
          }),
        })
      );
    });
  });

  it("hidrata título, descripción, prioridad, etiquetas (tagIds y tags por nombre) y room_id desde location.state.prefill al escalar desde Quick Add (CA-06)", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: { id: "prefilled-task-99" },
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/tasks/create",
            state: {
              prefill: {
                titulo: "Cambiar grifo de cocina",
                descripcion: "Comprar junta de teflón",
                categoria: "MANTENIMIENTO",
                peso: 4,
                roomId: "room-cocina-prefill",
                tagIds: ["tag-1"],
                tags: ["ferreteria"],
                assigneeId: "user-maria",
              },
            },
          },
        ]}
      >
        <ThemeProvider>
          <ToastProvider>
            <TaskUpdateProvider>
              <TaskForm />
            </TaskUpdateProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const titleInput = screen.getByLabelText(/Título de la tarea/i) as HTMLInputElement;
    const descInput = screen.getByLabelText(/Descripción/i) as HTMLTextAreaElement;
    expect(titleInput.value).toBe("Cambiar grifo de cocina");
    expect(descInput.value).toBe("Comprar junta de teflón");
    expect(screen.getByTestId("priority-btn-4")).toHaveAttribute("aria-checked", "true");

    // Esperar a que GET /tags hidrate selectedTags ("Limpieza" por tagId y "Ferretería" por nombre insensible a tildes)
    await waitFor(() => {
      expect(screen.getByText("Ferretería")).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole("button", { name: /Crear Tarea/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Cambiar grifo de cocina",
          descripcion: "Comprar junta de teflón",
          categoria: "MANTENIMIENTO",
          peso: 4,
          room_id: "room-cocina-prefill",
          tag_ids: ["tag-1", "tag-2"],
        })
      );
      expect(postSpy).toHaveBeenCalledWith("/tasks/assign", {
        task_id: "prefilled-task-99",
        user_id: "user-maria",
      });
    });
  });

  it("muestra la barra asistente de tokens NLP cuando se introducen tokens en el título y permite aplicarlos con el botón", async () => {
    renderTaskForm();

    const titleInput = screen.getByLabelText(/Título de la tarea/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Comprar leche en 3 días p1 #limpieza" } });

    const assistantBar = await screen.findByTestId("nlp-assistant-bar");
    expect(assistantBar).toBeInTheDocument();

    expect(screen.getByTestId("nlp-token-badge-date")).toHaveTextContent("Vence: En 3 días");
    expect(screen.getByTestId("nlp-token-badge-priority")).toHaveTextContent("Prioridad: Urgente");
    expect(screen.getByTestId("nlp-token-badge-category")).toHaveTextContent("Categoría: Limpieza");

    const applyBtn = screen.getByTestId("apply-nlp-tokens-btn");
    expect(applyBtn).toBeInTheDocument();
    fireEvent.click(applyBtn);

    expect(titleInput.value).toBe("Comprar leche");

    const hiddenPesoInput = document.querySelector('input[name="peso"]') as HTMLInputElement;
    expect(hiddenPesoInput.value).toBe("5");

    const catSelect = screen.getByLabelText(/Categoría/i) as HTMLSelectElement;
    expect(catSelect.value).toBe("LIMPIEZA");

    const dateInput = screen.getByLabelText(/Fecha de vencimiento/i) as HTMLInputElement;
    expect(dateInput.value).not.toBe("");
  });

  it("aplica los tokens del título al pulsar la tecla Tab en el campo de título", async () => {
    renderTaskForm();

    const titleInput = screen.getByLabelText(/Título de la tarea/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "Revisar caldera mañana p2" } });

    expect(screen.getByTestId("nlp-assistant-bar")).toBeInTheDocument();

    fireEvent.keyDown(titleInput, { key: "Tab" });

    expect(titleInput.value).toBe("Revisar caldera");

    const hiddenPesoInput = document.querySelector('input[name="peso"]') as HTMLInputElement;
    expect(hiddenPesoInput.value).toBe("4");

    const dateInput = screen.getByLabelText(/Fecha de vencimiento/i) as HTMLInputElement;
    expect(dateInput.value).not.toBe("");
  });
});

