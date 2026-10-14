import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import GlobalQuickAddModal from "../GlobalQuickAddModal";
import api from "../../../api";
import { RoomContext, type RoomContextType } from "../../../context/RoomContext";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";
import * as offlineQueue from "../../../services/offlineQueue";
import type { Room, Task } from "../../../types/task";

const mockRooms: Room[] = [
  {
    id: "room-cocina",
    nombre: "Cocina Principal",
    members: [
      {
        user_id: "user-maria",
        room_id: "room-cocina",
        role: "MEMBER",
        joined_at: "2025-01-01T00:00:00Z",
        user_nombre: "María José",
        user_email: "maria@hogar.es",
      },
    ],
  },
  {
    id: "room-salon",
    nombre: "Salón",
    members: [],
  },
];

const defaultRoomContext: RoomContextType = {
  roomId: "room-cocina",
  setRoomId: vi.fn(),
  rooms: mockRooms,
  activeRoom: mockRooms[0],
  selectRoom: vi.fn(),
  refreshRooms: vi.fn().mockResolvedValue(undefined),
  loadingRooms: false,
};

const CreateTaskLocationSpy: React.FC = () => {
  const location = useLocation();
  const state = location.state as {
    prefill?: {
      titulo?: string;
      descripcion?: string;
      categoria?: string;
      peso?: number;
    };
  } | null;
  return (
    <div data-testid="create-task-route-spy">
      <span data-testid="prefill-title">{state?.prefill?.titulo || ""}</span>
      <span data-testid="prefill-desc">
        {state?.prefill?.descripcion || ""}
      </span>
      <span data-testid="prefill-peso">{state?.prefill?.peso ?? ""}</span>
    </div>
  );
};

const renderGlobalQuickAdd = (
  props: Partial<React.ComponentProps<typeof GlobalQuickAddModal>> = {},
  initialRoute = "/rooms/room-cocina/tasks",
  roomCtx: Partial<RoomContextType> = {}
) => {
  const onClose = props.onClose ?? vi.fn();
  const onTaskCreated = props.onTaskCreated ?? vi.fn();

  const utils = render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <RoomContext.Provider value={{ ...defaultRoomContext, ...roomCtx }}>
        <ToastProvider>
          <TaskUpdateProvider>
            <GlobalQuickAddModal
              isOpen={true}
              onClose={onClose}
              onTaskCreated={onTaskCreated}
              {...props}
            />
            <Routes>
              <Route
                path="/rooms/:roomId/tasks"
                element={<div data-testid="room-view">Vista Sala</div>}
              />
              <Route path="/tasks/create" element={<CreateTaskLocationSpy />} />
            </Routes>
          </TaskUpdateProvider>
        </ToastProvider>
      </RoomContext.Provider>
    </MemoryRouter>
  );

  return { ...utils, onClose, onTaskCreated };
};

describe("GlobalQuickAddModal Component (Todoist Desktop quick_add)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "get").mockResolvedValue({
      data: [
        { id: "tag-hogar", nombre: "hogar" },
        { id: "tag-ferreteria", nombre: "ferreteria" },
      ],
    });
  });

  it("renderiza con atributos ARIA accesibles (role='dialog', aria-modal='true'), deduce la sala de la ruta y detecta tokens NLP en vivo", async () => {
    renderGlobalQuickAdd();
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // Pre-selecciona room-cocina por estar en /rooms/room-cocina/tasks
    const roomSelect = screen.getByTestId(
      "global-quick-add-room-select"
    ) as HTMLSelectElement;
    expect(roomSelect.value).toBe("room-cocina");

    // Escribir entrada rica con NLP
    const titleInput = screen.getByTestId("global-quick-add-title-input");
    fireEvent.change(titleInput, {
      target: {
        value:
          "Comprar bombillas LED mañana !alta #compras ~salon @hogar +maria",
      },
    });

    const tokensBar = screen.getByTestId("global-quick-add-nlp-tokens");
    expect(tokensBar).toBeInTheDocument();
    expect(screen.getByTestId("global-nlp-token-date")).toBeInTheDocument();
    expect(screen.getByTestId("global-nlp-token-priority")).toHaveTextContent(
      /P2 · Alta/i
    );
    expect(screen.getByTestId("global-nlp-token-category")).toHaveTextContent(
      /#Compra/i
    );
    expect(screen.getByTestId("global-nlp-token-room")).toHaveTextContent(
      /~Salón/i
    );
    expect(screen.getByTestId("global-nlp-token-tag")).toHaveTextContent(
      /@hogar/i
    );
    expect(screen.getByTestId("global-nlp-token-assignee")).toHaveTextContent(
      /\+María José/i
    );

    // El selector de habitación cambió dinámicamente a room-salon por ~salon
    expect(roomSelect.value).toBe("room-salon");
  });

  it("permite descartar chips detectados con el botón × y respeta overrides manuales sobre el texto NLP (RN-02 / CA-05)", async () => {
    renderGlobalQuickAdd();
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    const titleInput = screen.getByTestId("global-quick-add-title-input");
    fireEvent.change(titleInput, {
      target: { value: "Limpiar cristales mañana !baja" },
    });

    expect(
      screen.getByTestId("global-quick-add-priority-trigger")
    ).toHaveTextContent(/P5 · Baja/i);

    // Override manual: cambiar prioridad a P1 Urgente desde el selector
    fireEvent.click(screen.getByTestId("global-quick-add-priority-trigger"));
    fireEvent.click(screen.getByRole("menuitem", { name: /P1.*Urgente/i }));
    expect(
      screen.getByTestId("global-quick-add-priority-trigger")
    ).toHaveTextContent(/P1 · Urgente/i);

    // Aunque el usuario siga escribiendo en el input, el override manual P1 se mantiene (RN-02)
    fireEvent.change(titleInput, {
      target: { value: "Limpiar cristales del balcón mañana !baja" },
    });
    expect(
      screen.getByTestId("global-quick-add-priority-trigger")
    ).toHaveTextContent(/P1 · Urgente/i);

    // Descartar chip de fecha con el botón ×
    fireEvent.click(screen.getByTestId("dismiss-nlp-token-date"));
    expect(
      screen.queryByTestId("global-nlp-token-date")
    ).not.toBeInTheDocument();
  });

  it("envía la tarea con Enter o clic en 'Añadir tarea' (quickAddAddTask) y cierra el modal", async () => {
    const createdTask: Task = {
      id: "task-101",
      titulo: "Revisar filtro caldera",
      categoria: "MANTENIMIENTO",
      peso: 5,
      estado: "TODO",
      room_id: "room-cocina",
    };

    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: createdTask });

    const { onClose, onTaskCreated } = renderGlobalQuickAdd();

    fireEvent.change(screen.getByTestId("global-quick-add-title-input"), {
      target: { value: "Revisar filtro caldera #mantenimiento p1 +maria" },
    });
    fireEvent.change(screen.getByTestId("global-quick-add-desc-input"), {
      target: { value: "Verificar presión en barómetro" },
    });

    fireEvent.click(screen.getByTestId("global-quick-add-submit-btn"));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Revisar filtro caldera",
          descripcion: "Verificar presión en barómetro",
          categoria: "MANTENIMIENTO",
          peso: 5,
          room_id: "room-cocina",
        })
      );
    });

    expect(onTaskCreated).toHaveBeenCalledWith(createdTask);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ejecuta captura en ráfaga con Ctrl+Enter o 'Crear y seguir' (resetQuickAdd): crea la tarea, limpia los campos y mantiene abierto el modal (CA-04)", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: {
        id: "task-burst-1",
        titulo: "Comprar leche",
        categoria: "COMPRA",
        peso: 2,
        estado: "TODO",
      },
    });

    const { onClose } = renderGlobalQuickAdd();

    const titleInput = screen.getByTestId(
      "global-quick-add-title-input"
    ) as HTMLInputElement;
    const descInput = screen.getByTestId(
      "global-quick-add-desc-input"
    ) as HTMLTextAreaElement;

    fireEvent.change(titleInput, {
      target: { value: "Comprar leche #compras" },
    });
    fireEvent.change(descInput, {
      target: { value: "Semidesnatada" },
    });

    // Pulsar Ctrl+Enter para envío en ráfaga
    fireEvent.keyDown(titleInput, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Comprar leche",
          descripcion: "Semidesnatada",
          categoria: "COMPRA",
        })
      );
    });

    // El modal NO se cierra y los inputs quedan limpios listos para la siguiente tarea
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(titleInput.value).toBe("");
      expect(descInput.value).toBe("");
    });
  });

  it("escala al formulario completo ('Formulario completo' / sendOpenPageFromQuickAdd) transfiriendo el estado prefill completo a /tasks/create (CA-06)", async () => {
    const { onClose } = renderGlobalQuickAdd();
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("global-quick-add-title-input"), {
      target: { value: "Organizar despensa p1 @hogar +maria ~salon" },
    });
    fireEvent.change(screen.getByTestId("global-quick-add-desc-input"), {
      target: { value: "Clasificar conservas por caducidad" },
    });

    fireEvent.click(screen.getByTestId("global-quick-add-full-form-btn"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("create-task-route-spy")).toBeInTheDocument();
    expect(screen.getByTestId("prefill-title")).toHaveTextContent(
      "Organizar despensa"
    );
    expect(screen.getByTestId("prefill-desc")).toHaveTextContent(
      "Clasificar conservas por caducidad"
    );
    expect(screen.getByTestId("prefill-peso")).toHaveTextContent("5");
  });

  it("auto-crea etiquetas nuevas (@tag) que no existen en GET /tags mediante POST /tags y envía su nuevo ID en tag_ids dentro de POST /tasks (RN-04)", async () => {
    const postSpy = vi.spyOn(api, "post").mockImplementation((url: string) => {
      if (url === "/tags") {
        return Promise.resolve({
          data: { id: "tag-nueva-123", nombre: "bricolaje" },
        });
      }
      if (url === "/tasks") {
        return Promise.resolve({
          data: {
            id: "task-with-new-tag",
            titulo: "Colgar estantería",
            categoria: "MANTENIMIENTO",
            peso: 2,
            estado: "TODO",
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const { onClose } = renderGlobalQuickAdd();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/tags", expect.anything()));

    fireEvent.change(screen.getByTestId("global-quick-add-title-input"), {
      target: {
        value: "Colgar estantería #mantenimiento @hogar @bricolaje",
      },
    });

    fireEvent.click(screen.getByTestId("global-quick-add-submit-btn"));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith("/tags", { nombre: "bricolaje" });
      expect(postSpy).toHaveBeenCalledWith(
        "/tasks",
        expect.objectContaining({
          titulo: "Colgar estantería",
          categoria: "MANTENIMIENTO",
          tag_ids: ["tag-hogar", "tag-nueva-123"],
        })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("encola la tarea en offlineQueue cuando falla la red sin respuesta HTTP y no bloquea al usuario (EC-02 / CA-07)", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new Error("Network Error"));
    const enqueueSpy = vi
      .spyOn(offlineQueue, "enqueueMutation")
      .mockResolvedValueOnce({
        id: "mut-offline-1",
        url: "/tasks",
        method: "POST",
        timestamp: Date.now(),
      });

    const { onClose } = renderGlobalQuickAdd();

    fireEvent.change(screen.getByTestId("global-quick-add-title-input"), {
      target: { value: "Tarea creada en avión p2" },
    });

    fireEvent.click(screen.getByTestId("global-quick-add-submit-btn"));

    await waitFor(() => {
      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/tasks",
          method: "POST",
          data: expect.objectContaining({
            titulo: "Tarea creada en avión",
            peso: 4,
          }),
        })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("responde a los atajos internos Alt+P (alternar menú de prioridad) y Alt+D (activar selector de fecha rápida)", async () => {
    renderGlobalQuickAdd();
    const titleInput = screen.getByTestId("global-quick-add-title-input");

    // Menú de prioridad inicialmente cerrado
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Pulsar Alt+P abre el menú de prioridad
    fireEvent.keyDown(titleInput, { key: "p", altKey: true });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Urgente")).toBeInTheDocument();

    // Pulsar Alt+P de nuevo cierra el menú
    fireEvent.keyDown(titleInput, { key: "p", altKey: true });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Pulsar Alt+D sin fecha previa asigna Hoy
    const todayStr = new Date().toISOString().split("T")[0];
    const dateInput = screen.getByTestId("global-quick-add-date-input") as HTMLInputElement;
    expect(dateInput.value).toBe("");

    fireEvent.keyDown(titleInput, { key: "d", altKey: true });
    expect(dateInput.value).toBe(todayStr);
  });

  it("muestra las indicaciones visuales con <kbd> accesibles en los botones de acción del pie", () => {
    renderGlobalQuickAdd();

    const cancelBtn = screen.getByTestId("global-quick-add-cancel-btn");
    const burstBtn = screen.getByTestId("global-quick-add-burst-btn");
    const submitBtn = screen.getByTestId("global-quick-add-submit-btn");

    expect(cancelBtn.querySelector(".todoist-kbd-hint")).toHaveTextContent("Esc");
    expect(burstBtn.querySelector(".todoist-kbd-hint")).toHaveTextContent("Ctrl+↵");
    expect(submitBtn.querySelector(".todoist-kbd-hint")).toHaveTextContent("↵");
  });

  it("persiste la sala seleccionada en sessionStorage y la recupera al abrir en vistas sin contexto", () => {
    sessionStorage.clear();
    const { unmount } = renderGlobalQuickAdd({}, "/dashboard", { roomId: null, activeRoom: null });

    const roomSelect = screen.getByTestId("global-quick-add-room-select") as HTMLSelectElement;
    expect(roomSelect.value).toBe("");

    // Cambiar a room-salon
    fireEvent.change(roomSelect, { target: { value: "room-salon" } });
    expect(sessionStorage.getItem("prioritask_last_quick_add_room_id")).toBe("room-salon");

    unmount();

    // Volver a abrir el modal en una vista neutral: debe hidratar room-salon desde sessionStorage
    renderGlobalQuickAdd({}, "/dashboard", { roomId: null, activeRoom: null });
    const rehydratedSelect = screen.getByTestId("global-quick-add-room-select") as HTMLSelectElement;
    expect(rehydratedSelect.value).toBe("room-salon");
  });
});

