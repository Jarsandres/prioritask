import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CommandPaletteModal, { searchLRUCache, QueryLRUCache } from "../CommandPaletteModal";
import { cacheManager } from "../../../services/cacheManager";
import api from "../../../api";
import type { Task } from "../../../types/task";

const mockUseRoom = vi.fn();
vi.mock("../../../context/RoomContext", () => ({
  useRoom: () => mockUseRoom(),
}));

describe("CommandPaletteModal (Multi-Tier Instant Search & LRU Cache)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    searchLRUCache.clear();
    cacheManager.clearCache();
    mockUseRoom.mockReturnValue({
      rooms: [{ id: "room-1", nombre: "Piso Centro" }],
      activeRoom: { id: "room-1", nombre: "Piso Centro" },
      selectRoom: vi.fn(),
    });
  });

  describe("QueryLRUCache unit", () => {
    it("debe respetar la capacidad máxima expulsando la clave más antigua (LRU)", () => {
      const lru = new QueryLRUCache<string, string>(3);
      lru.set("a", "1");
      lru.set("b", "2");
      lru.set("c", "3");

      expect(lru.size()).toBe(3);
      expect(lru.get("a")).toBe("1"); // acceso a 'a', ahora 'b' es el más antiguo

      lru.set("d", "4"); // expulsa 'b'
      expect(lru.has("b")).toBe(false);
      expect(lru.get("a")).toBe("1");
      expect(lru.get("c")).toBe("3");
      expect(lru.get("d")).toBe("4");
    });
  });

  it("Capa 1: debe filtrar instantáneamente (0 ms) sobre tareas en memoria en cacheManager", async () => {
    const cachedTask: Task = {
      id: "task-mem-1",
      titulo: "Lavar platos de la cena",
      descripcion: "Usar lavavajillas",
      estado: "TODO",
      categoria: "LIMPIEZA",
      peso: 1,
      room_id: "room-1",
    };
    cacheManager.setRoomTasks("room-1", [cachedTask]);

    // Mock API search
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        total_matches: 0,
        results: [],
      },
    });

    render(
      <MemoryRouter>
        <CommandPaletteModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(
      "Buscar tareas, cambiar de hogar o ejecutar acción..."
    );

    fireEvent.change(input, { target: { value: "Lavar" } });

    // La tarea debe aparecer en el DOM síncronamente (Capa 1)
    expect(screen.getByText("Lavar platos de la cena")).toBeInTheDocument();
  });

  it("Capa 2: debe reutilizar resultados cacheados en LRU para evitar esperas repetidas", async () => {
    const lruTask: Task = {
      id: "task-lru-1",
      titulo: "Comprar bombilla LED",
      estado: "TODO",
      categoria: "HOGAR",
      peso: 1,
      room_id: "room-1",
    };

    searchLRUCache.set("bombilla", [
      {
        task: lruTask,
        relevance_score: 1.0,
        matched_fields: ["titulo"],
      },
    ]);

    render(
      <MemoryRouter>
        <CommandPaletteModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(
      "Buscar tareas, cambiar de hogar o ejecutar acción..."
    );

    fireEvent.change(input, { target: { value: "bombilla" } });

    expect(screen.getByText("Comprar bombilla LED")).toBeInTheDocument();
  });

  it("Capa 3: debe consultar el backend con debounce y fusionar resultados de forma deduplicada", async () => {
    const remoteTask: Task = {
      id: "task-remote-99",
      titulo: "Reparar caldera",
      descripcion: "Llamar al técnico de gas",
      estado: "TODO",
      categoria: "MANTENIMIENTO",
      peso: 3,
      room_id: "room-1",
    };

    const getSpy = vi.spyOn(api, "get").mockResolvedValue({
      data: {
        total_matches: 1,
        results: [
          {
            task: remoteTask,
            relevance_score: 0.95,
            matched_fields: ["titulo"],
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <CommandPaletteModal isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(
      "Buscar tareas, cambiar de hogar o ejecutar acción..."
    );

    fireEvent.change(input, { target: { value: "caldera" } });

    await waitFor(
      () => {
        expect(getSpy).toHaveBeenCalledWith("/tasks/search", expect.anything());
        expect(screen.getByText("Reparar caldera")).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    // Debe haberse guardado en Capa 2 (LRU)
    expect(searchLRUCache.has("caldera")).toBe(true);
  });
});
