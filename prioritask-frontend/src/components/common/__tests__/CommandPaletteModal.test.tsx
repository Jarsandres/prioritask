import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import CommandPaletteModal from "../CommandPaletteModal";
import { ThemeProvider } from "../../../context/ThemeContext";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";
import { RoomContext, type RoomContextType } from "../../../context/RoomContext";
import { cacheManager, searchLRUCache } from "../../../services/cacheManager";
import api from "../../../api";
import type { Task } from "../../../types/task";

vi.mock("../../../api", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockRooms = [
  {
    id: "room-1",
    nombre: "Cocina Principal",
    count: 3,
    is_owner: true,
    my_role: "ADMIN" as const,
  },
  {
    id: "room-2",
    nombre: "Jardín Exterior",
    count: 1,
    is_owner: true,
    my_role: "ADMIN" as const,
  },
];

const mockSelectRoom = vi.fn();

const mockRoomContextValue: RoomContextType = {
  roomId: "room-1",
  setRoomId: vi.fn(),
  rooms: mockRooms,
  activeRoom: mockRooms[0],
  selectRoom: mockSelectRoom,
  refreshRooms: vi.fn().mockResolvedValue(undefined),
  loadingRooms: false,
};

const sampleTasks: Task[] = [
  {
    id: "task-101",
    titulo: "Limpiar cristales del salón",
    descripcion: "Usar limpiacristales y paño de microfibra",
    estado: "TODO",
    categoria: "LIMPIEZA",
    peso: 5,
    room_id: "room-1",
    due_date: "2026-10-12",
  },
  {
    id: "task-202",
    titulo: "Comprar café en grano",
    descripcion: "Tueste natural",
    estado: "TODO",
    categoria: "COMPRA",
    peso: 2,
    room_id: null,
  },
];

const LocationObserver = () => {
  const location = useLocation();
  return (
    <div data-testid="current-location">
      {location.pathname}
      {location.search}
    </div>
  );
};

const renderCommandPalette = (onClose = vi.fn()) => {
  return {
    onClose,
    ...render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <ThemeProvider>
          <ToastProvider>
            <RoomContext.Provider value={mockRoomContextValue}>
              <TaskUpdateProvider>
                <LocationObserver />
                <CommandPaletteModal isOpen={true} onClose={onClose} />
              </TaskUpdateProvider>
            </RoomContext.Provider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    ),
  };
};

describe("CommandPaletteModal — Navegación Estructurada, Prefijos Semánticos y Completitud Inline", () => {
  beforeEach(() => {
    localStorage.clear();
    cacheManager.clearCache();
    searchLRUCache.clear();
    vi.clearAllMocks();

    cacheManager.setRoomTasks("room-1", sampleTasks);

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/tags") {
        return { data: [{ id: "tag-1", nombre: "urgente" }] };
      }
      if (url === "/tasks/search") {
        return {
          data: {
            results: sampleTasks.map((t) => ({
              task: t,
              relevance_score: 1.0,
              matched_fields: ["titulo"],
            })),
          },
        };
      }
      return { data: [] };
    });
  });

  it("renderiza el diálogo accesible con acciones rápidas incluyendo Hoy, Próximo, Completadas y Alternar Tema", () => {
    renderCommandPalette();

    expect(
      screen.getByRole("dialog", { name: /Paleta de Comandos de Prioritask/i })
    ).toBeInTheDocument();

    expect(screen.getByText("Ir a Hoy")).toBeInTheDocument();
    expect(screen.getByText("Ir a Próximo (7 días)")).toBeInTheDocument();
    expect(screen.getByText("Ver Tareas Completadas")).toBeInTheDocument();
    expect(screen.getByText("Alternar Tema Claro / Oscuro")).toBeInTheDocument();

    // Ejecutar acción "Ir a Hoy" navega a /tasks?view=today
    fireEvent.click(screen.getByText("Ir a Hoy"));
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/tasks?view=today"
    );
  });

  it("filtra por prefijos semánticos (`>` muestra solo acciones, `#` muestra solo hogares)", () => {
    renderCommandPalette();

    const input = screen.getByPlaceholderText(/Buscar tareas/i);

    // Prefijo `>` -> solo acciones rápidas
    fireEvent.change(input, { target: { value: "> Próximo" } });
    expect(screen.getByTestId("command-palette-mode-pill")).toHaveTextContent(
      "> Comandos"
    );
    expect(screen.getByText("Ir a Próximo (7 días)")).toBeInTheDocument();
    expect(screen.queryByText("Cocina Principal")).not.toBeInTheDocument();

    // Prefijo `#` -> solo hogares
    fireEvent.change(input, { target: { value: "# Cocina" } });
    expect(screen.getByTestId("command-palette-mode-pill")).toHaveTextContent(
      "# Hogares"
    );
    expect(screen.getByText("Cocina Principal")).toBeInTheDocument();
    expect(screen.queryByText("Jardín Exterior")).not.toBeInTheDocument();
    expect(screen.queryByText("Ir a Hoy")).not.toBeInTheDocument();
  });

  it("al seleccionar una tarea encontrada navega al deep-link /rooms/:roomId/tasks?taskId=<id> (RN-01)", async () => {
    const onClose = vi.fn();
    renderCommandPalette(onClose);

    const input = screen.getByPlaceholderText(/Buscar tareas/i);
    fireEvent.change(input, { target: { value: "cristales" } });

    const taskRow = await screen.findByTestId("palette-task-item-task-101");
    expect(taskRow).toHaveTextContent("P1");
    expect(taskRow).toHaveTextContent("2026-10-12");

    fireEvent.click(taskRow);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSelectRoom).toHaveBeenCalledWith("room-1");
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/rooms/room-1/tasks?taskId=task-101"
    );
  });

  it("permite completar una tarea inline (clic en check o Ctrl+Enter) sin cerrar la paleta y con opción Deshacer (RN-02)", async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: { ...sampleTasks[0], estado: "DONE", completed: true },
    });

    const onClose = vi.fn();
    renderCommandPalette(onClose);

    const input = screen.getByPlaceholderText(/Buscar tareas/i);
    fireEvent.change(input, { target: { value: "cristales" } });

    const checkBtn = await screen.findByTestId("palette-complete-task-task-101");
    fireEvent.click(checkBtn);

    // No debe cerrar la paleta
    expect(onClose).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/tasks/task-101", {
        estado: "DONE",
        completed: true,
      });
    });

    // El estado visual en la paleta cambia a DONE y aparece el toast con "Deshacer"
    expect(screen.getByTestId("palette-task-item-task-101")).toHaveTextContent(
      "DONE"
    );
    expect(await screen.findByText("Tarea completada")).toBeInTheDocument();
    expect(screen.getByText("Deshacer")).toBeInTheDocument();

    // Pulsar Ctrl+Enter sobre la tarea seleccionada la reabre inline sin cerrar el modal
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/tasks/task-101", {
        estado: "TODO",
        completed: false,
      });
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
