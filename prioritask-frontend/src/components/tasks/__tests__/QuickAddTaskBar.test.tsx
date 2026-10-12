import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import QuickAddTaskBar from "../QuickAddTaskBar";
import api from "../../../api";
import { RoomContext, type RoomContextType } from "../../../context/RoomContext";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";
import type { Task } from "../../../types/task";

const mockRoomCtx: RoomContextType = {
  roomId: "room-1",
  setRoomId: vi.fn(),
  rooms: [
    { id: "room-1", nombre: "Cocina", members: [] },
    { id: "room-2", nombre: "Terraza", members: [] },
  ],
  activeRoom: { id: "room-1", nombre: "Cocina", members: [] },
  selectRoom: vi.fn(),
  refreshRooms: vi.fn().mockResolvedValue(undefined),
  loadingRooms: false,
};

const renderQuickAdd = (
  props: Partial<React.ComponentProps<typeof QuickAddTaskBar>> = {}
) => {
  return render(
    <BrowserRouter>
      <RoomContext.Provider value={mockRoomCtx}>
        <ToastProvider>
          <TaskUpdateProvider>
            <QuickAddTaskBar
              roomId="room-1"
              onTaskCreated={vi.fn()}
              {...props}
            />
          </TaskUpdateProvider>
        </ToastProvider>
      </RoomContext.Provider>
    </BrowserRouter>
  );
};

describe("QuickAddTaskBar Component (Todoist Inline Composer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "get").mockResolvedValue({
      data: [{ id: "tag-hogar", nombre: "hogar" }],
    });
  });

  it("muestra inicialmente el botón compacto '+ Añadir tarea...' y se expande al hacer clic", async () => {
    renderQuickAdd();

    const trigger = screen.getByTestId("quick-add-task-trigger");
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText("Añadir tarea...")).toBeInTheDocument();

    fireEvent.click(trigger);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.getByTestId("quick-add-task-composer")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-title-input")).toBeInTheDocument();
  });

  it("permite seleccionar prioridad P1 (Urgente), aplicar recurrencia DSL ('cada! 7 días') y crear la tarea vía POST /tasks", async () => {
    const onTaskCreated = vi.fn();
    const createdTaskMock: Task = {
      id: "task-created-1",
      titulo: "Desinfectar encimera",
      descripcion: "Con lejía diluida",
      categoria: "LIMPIEZA",
      peso: 5,
      estado: "TODO",
      room_id: "room-1",
      is_recurring: true,
    };

    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: createdTaskMock,
    });

    renderQuickAdd({ onTaskCreated });

    // Expandir compositor
    fireEvent.click(screen.getByTestId("quick-add-task-trigger"));
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    // Escribir título y descripción
    fireEvent.change(screen.getByTestId("quick-add-title-input"), {
      target: { value: "Desinfectar encimera" },
    });
    fireEvent.change(screen.getByTestId("quick-add-desc-input"), {
      target: { value: "Con lejía diluida" },
    });

    // Seleccionar Prioridad P1 (Urgente -> peso 5)
    fireEvent.click(screen.getByTestId("quick-add-priority-trigger"));
    fireEvent.click(screen.getByRole("menuitem", { name: /P1.*Urgente/i }));

    // Aplicar expresión DSL de recurrencia y confirmar con Enter sin enviar el formulario prematuramente
    fireEvent.click(screen.getByTestId("quick-add-recurrence-trigger"));
    const dslInput = screen.getByPlaceholderText(/Ej\. cada! 7 días/i);
    fireEvent.change(dslInput, { target: { value: "cada! 7 días" } });
    fireEvent.keyDown(dslInput, { key: "Enter" });
    expect(api.post).not.toHaveBeenCalled();

    // Enviar formulario
    fireEvent.click(screen.getByTestId("quick-add-submit-btn"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Desinfectar encimera",
          descripcion: "Con lejía diluida",
          peso: 5,
          room_id: "room-1",
          is_recurring: true,
        })
      );
    });

    expect(onTaskCreated).toHaveBeenCalledWith(createdTaskMock);
  });

  it("consulta sugerencia de prioridad con IA (POST /tasks/ai/suggest), asigna P1 (peso 5) cuando es Urgente y muestra el motivo", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        prioridad: "Urgente",
        motivo: "Fuga de agua requiere atención inmediata",
      },
    });

    renderQuickAdd();
    fireEvent.click(screen.getByTestId("quick-add-task-trigger"));
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("quick-add-title-input"), {
      target: { value: "Reparar tubería rota del fregadero" },
    });

    const aiBtn = screen.getByTestId("quick-add-ai-btn");
    fireEvent.click(aiBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/tasks/ai/suggest",
        expect.objectContaining({
          titulo: "Reparar tubería rota del fregadero",
        })
      );
    });

    expect(
      await screen.findByText(/Fuga de agua requiere atención inmediata/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-priority-trigger")).toHaveTextContent(
      /P1 · Urgente/i
    );
  });

  it("cierra primero el popover abierto al pulsar Escape y en el segundo Escape colapsa el compositor", async () => {
    renderQuickAdd();
    fireEvent.click(screen.getByTestId("quick-add-task-trigger"));
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    const composer = screen.getByTestId("quick-add-task-composer");
    fireEvent.click(screen.getByTestId("quick-add-priority-trigger"));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Primer Escape cierra solo el menú de prioridad, manteniendo abierto el compositor
    fireEvent.keyDown(composer, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-add-task-composer")).toBeInTheDocument();

    // Segundo Escape cierra el compositor
    fireEvent.keyDown(composer, { key: "Escape" });
    expect(screen.queryByTestId("quick-add-task-composer")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-add-task-trigger")).toBeInTheDocument();
  });

  it("detecta tokens en lenguaje natural en vivo (mañana, p1, #compras, cada! 7 días) y envía el título limpio", async () => {
    const onTaskCreated = vi.fn();
    vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        id: "task-nlp-1",
        titulo: "Comprar detergente",
        categoria: "COMPRA",
        peso: 5,
        estado: "TODO",
        room_id: "room-1",
        is_recurring: true,
      },
    });

    renderQuickAdd({ onTaskCreated });
    fireEvent.click(screen.getByTestId("quick-add-task-trigger"));
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("quick-add-title-input"), {
      target: { value: "Comprar detergente mañana p1 #compras cada! 7 días" },
    });

    // Verifica que aparece la cinta de tokens NLP detectados en vivo
    const tokenRibbon = screen.getByTestId("quick-add-nlp-tokens");
    expect(tokenRibbon).toBeInTheDocument();
    expect(tokenRibbon).toHaveTextContent(/P1 · Urgente/i);
    expect(tokenRibbon).toHaveTextContent(/#Compra/i);

    fireEvent.click(screen.getByTestId("quick-add-submit-btn"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Comprar detergente",
          categoria: "COMPRA",
          peso: 5,
          is_recurring: true,
        })
      );
    });
  });

  it("resuelve ~sala y @tags (auto-creando etiquetas nuevas con POST /tags) en el compositor inline", async () => {
    const postSpy = vi.spyOn(api, "post").mockImplementation((url: string) => {
      if (url === "/tags") {
        return Promise.resolve({
          data: { id: "tag-jardin", nombre: "jardin" },
        });
      }
      return Promise.resolve({
        data: {
          id: "task-inline-tags",
          titulo: "Regar plantas",
          categoria: "MANTENIMIENTO",
          peso: 2,
          estado: "TODO",
          room_id: "room-2",
        },
      });
    });

    renderQuickAdd();
    fireEvent.click(screen.getByTestId("quick-add-task-trigger"));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/tags", expect.anything()));

    fireEvent.change(screen.getByTestId("quick-add-title-input"), {
      target: { value: "Regar plantas ~terraza @hogar @jardin #mantenimiento" },
    });

    fireEvent.click(screen.getByTestId("quick-add-submit-btn"));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith("/tags", { nombre: "jardin" });
      expect(postSpy).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Regar plantas",
          room_id: "room-2",
          tag_ids: ["tag-hogar", "tag-jardin"],
        })
      );
    });
  });

  it("acepta sugerencia del popover contextual al pulsar Enter sin enviar el formulario y revierte atributos al borrar el token NLP", async () => {
    renderQuickAdd();
    fireEvent.click(screen.getByTestId("quick-add-task-trigger"));
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    const titleInput = screen.getByTestId("quick-add-title-input");

    // Escribir trigger '/hoy' y aceptar con Enter
    fireEvent.change(titleInput, {
      target: { value: "Sacar basura /hoy" },
    });
    expect(screen.getByTestId("quick-add-trigger-popover")).toBeInTheDocument();

    fireEvent.keyDown(titleInput, { key: "Enter" });
    // No debe haber enviado el formulario y debe haber reemplazado '/hoy' por 'hoy '
    expect(api.post).not.toHaveBeenCalled();
    expect(titleInput).toHaveValue("Sacar basura hoy ");

    // Añadir prioridad p1 por NLP y luego borrarla del texto -> debe revertir a P4 (peso 2)
    fireEvent.change(titleInput, {
      target: { value: "Sacar basura p1" },
    });
    expect(screen.getByTestId("quick-add-priority-trigger")).toHaveTextContent(
      /P1 · Urgente/i
    );

    fireEvent.change(titleInput, {
      target: { value: "Sacar basura" },
    });
    expect(screen.getByTestId("quick-add-priority-trigger")).toHaveTextContent(
      /P4/i
    );
  });
});

