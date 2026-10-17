import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RoomTasks from "../RoomTasks";
import { ThemeProvider } from "../../context/ThemeContext";
import { SettingsProvider } from "../../context/SettingsContext";
import { ToastProvider } from "../../context/ToastContext";
import { RoomContext, type RoomContextType } from "../../context/RoomContext";
import { TaskUpdateProvider } from "../../context/TaskUpdateContext";
import { cacheManager } from "../../services/cacheManager";
import api from "../../api";
import type { RoomSyncEvent } from "../../hooks/useRoomEvents";

let capturedLiveEventHandler: ((ev: RoomSyncEvent) => void) | null = null;

vi.mock("../../api", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../hooks/useRoomEvents", () => ({
  useRoomEvents: (
    _roomId: string | undefined,
    onEvent: (ev: RoomSyncEvent) => void
  ) => {
    capturedLiveEventHandler = onEvent;
    return { isConnected: true };
  },
}));

vi.mock("../../hooks/usePixelConfetti", () => ({
  usePixelConfetti: () => ({
    triggerCelebration: vi.fn(),
  }),
}));

const mockRooms = [
  {
    id: "room-1",
    nombre: "Hogar Central",
    count: 2,
    is_owner: true,
    my_role: "ADMIN" as const,
    owner_id: "usr-1",
    owner: "ana@prioritask.dev",
  },
];

const mockRoomContextValue: RoomContextType = {
  roomId: "room-1",
  setRoomId: vi.fn(),
  rooms: mockRooms,
  activeRoom: mockRooms[0],
  selectRoom: vi.fn(),
  refreshRooms: vi.fn().mockResolvedValue(undefined),
  loadingRooms: false,
};

const sampleRoomTasks = [
  {
    id: "rt-1",
    titulo: "Barrer salón",
    descripcion: "Pasar aspiradora por la alfombra",
    estado: "TODO" as const,
    categoria: "LIMPIEZA",
    peso: 4,
    room_id: "room-1",
    subtasks_count: 1,
    subtasks_completed_count: 0,
    comments_count: 0,
  },
  {
    id: "rt-2",
    titulo: "Comprar detergente",
    descripcion: "Detergente hipoalergénico",
    estado: "IN_PROGRESS" as const,
    categoria: "COMPRA",
    peso: 2,
    room_id: "room-1",
    is_recurring: true,
  },
];

const renderRoomTasks = () => {
  return render(
    <MemoryRouter initialEntries={["/rooms/room-1/tasks"]}>
      <ThemeProvider>
        <SettingsProvider>
          <ToastProvider>
            <RoomContext.Provider value={mockRoomContextValue}>
              <TaskUpdateProvider>
                <Routes>
                  <Route path="/rooms/:roomId/tasks" element={<RoomTasks />} />
                </Routes>
              </TaskUpdateProvider>
            </RoomContext.Provider>
          </ToastProvider>
        </SettingsProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe("RoomTasks — Integración con useTasksState, Vista Lista Todoist y Eventos SSE", () => {
  beforeEach(() => {
    localStorage.clear();
    cacheManager.clearCache();
    localStorage.setItem("token", "mock-jwt-token");
    localStorage.setItem("tasks_view_mode", "list");
    capturedLiveEventHandler = null;
    vi.clearAllMocks();

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.includes("/rooms/room-1/tasks")) {
        return { data: sampleRoomTasks };
      }
      if (url === "/rooms") {
        return { data: mockRooms };
      }
      return { data: null };
    });
  });

  it("renderiza las tareas del hogar en TaskListView y soporta atajos de teclado de prioridad (1-4), completado optimista y avance de ciclo recurrente", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ok: true } });
    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: "rt-2-next",
        titulo: "Comprar detergente",
        estado: "TODO",
        categoria: "COMPRA",
        peso: 2,
        room_id: "room-1",
        is_recurring: true,
        due_date: "2026-10-19",
      },
    });

    renderRoomTasks();

    await waitFor(() => {
      expect(screen.getByTestId("task-item-rt-1")).toBeInTheDocument();
    });

    const item1 = screen.getByTestId("task-item-rt-1");
    // Peso 4 -> P2 (Alta), no P1: la escala canónica reserva P1 para peso 5.
    expect(item1).toHaveAttribute("data-priority", "p2");

    // Cambiar prioridad con atajo '1' -> P1 (peso 5)
    fireEvent.keyDown(item1, { key: "1" });

    await waitFor(() => {
      expect(screen.getByTestId("task-item-rt-1")).toHaveAttribute(
        "data-priority",
        "p1"
      );
      expect(api.patch).toHaveBeenCalledWith("/tasks/rt-1", { peso: 5 });
      expect(screen.getByTestId("task-item-rt-1")).not.toHaveAttribute(
        "aria-busy",
        "true"
      );
    });

    // Completar con barra espaciadora -> actualización optimista inmediata
    fireEvent.keyDown(screen.getByTestId("task-item-rt-1"), { key: " " });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/tasks/rt-1/status", {
        estado: "DONE",
      });
    });

    // Avanzar ciclo recurrente en rt-2 -> marca rt-2 completada e inserta rt-2-next en useTasksState y caché L1
    const advanceBtn = screen.getByTestId("task-item-advance-btn-rt-2");
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/tasks/rt-2/advance");
      expect(screen.getByTestId("task-item-rt-2-next")).toBeInTheDocument();
    });
    expect(
      cacheManager.getRoomTasks("room-1")?.tasks.some((t) => t.id === "rt-2-next")
    ).toBe(true);
  });

  it("concilia eventos SSE en tiempo real (TASK_CREATED, COMMENT_ADDED, TASK_DELETED) sobre el store normalizado", async () => {
    renderRoomTasks();

    await waitFor(() => {
      expect(screen.getByTestId("task-item-rt-1")).toBeInTheDocument();
    });

    expect(capturedLiveEventHandler).not.toBeNull();

    act(() => {
      capturedLiveEventHandler?.({
        type: "TASK_CREATED",
        data: {
          id: "rt-live",
          titulo: "Tarea recibida por SSE",
          estado: "TODO",
          categoria: "OTRO",
          peso: 3,
          room_id: "room-1",
        },
        roomId: "room-1",
        timestamp: Date.now(),
      });
      capturedLiveEventHandler?.({
        type: "COMMENT_ADDED",
        data: {
          task_id: "rt-1",
        },
        roomId: "room-1",
        timestamp: Date.now(),
      });
    });

    expect(screen.getByTestId("task-item-rt-live")).toBeInTheDocument();

    act(() => {
      capturedLiveEventHandler?.({
        type: "TASK_DELETED",
        data: {
          task_id: "rt-live",
        },
        roomId: "room-1",
        timestamp: Date.now(),
      });
    });

    expect(screen.queryByTestId("task-item-rt-live")).not.toBeInTheDocument();
  });
});
