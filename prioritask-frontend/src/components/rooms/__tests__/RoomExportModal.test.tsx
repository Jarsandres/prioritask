import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RoomExportModal from "../RoomExportModal";
import api from "../../../api";
import { ToastProvider } from "../../../context/ToastContext";
import type { Task } from "../../../types/task";

const mockTasks: Task[] = [
  {
    id: "task-1",
    titulo: "Comprar pan y leche",
    categoria: "COMPRA",
    peso: 2,
    estado: "TODO",
  },
  {
    id: "task-2",
    titulo: "Reparar la persiana",
    categoria: "MANTENIMIENTO",
    peso: 4,
    estado: "IN_PROGRESS",
  },
];

const renderExportModal = (props: Partial<React.ComponentProps<typeof RoomExportModal>> = {}) => {
  return render(
    <ToastProvider>
      <RoomExportModal
        roomId="room-100"
        roomName="Hogar Dulce Hogar"
        tasks={mockTasks}
        isOpen={true}
        onClose={vi.fn()}
        {...props}
      />
    </ToastProvider>
  );
};

describe("RoomExportModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL y revokeObjectURL para descargas
    Object.defineProperty(window.URL, "createObjectURL", {
      value: vi.fn(() => "blob:http://localhost/mock-blob-url"),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  it("renderiza las opciones de exportación JSON, CSV e impresión", () => {
    renderExportModal();

    expect(screen.getByText("Exportar Datos y Lista de Tareas")).toBeInTheDocument();
    expect(screen.getByText(/Hogar: Hogar Dulce Hogar/i)).toBeInTheDocument();
    expect(screen.getByText(/Exportar como JSON/i)).toBeInTheDocument();
    expect(screen.getByText(/Exportar como CSV/i)).toBeInTheDocument();
    expect(screen.getByText(/Imprimir Lista para la Nevera/i)).toBeInTheDocument();
  });

  it("solicita y descarga el archivo JSON al hacer clic en Exportar JSON", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: JSON.stringify(mockTasks),
    });

    renderExportModal();

    const jsonBtn = screen.getByRole("button", { name: /Exportar como JSON/i });
    fireEvent.click(jsonBtn);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith(
        "/rooms/room-100/export",
        expect.objectContaining({
          params: { format: "json" },
          responseType: "blob",
        })
      );
    });
  });

  it("activa la impresión nativa con window.print al pulsar Imprimir", () => {
    const printSpy = vi.fn();
    Object.defineProperty(window, "print", {
      value: printSpy,
      writable: true,
      configurable: true,
    });

    renderExportModal();

    const printBtn = screen.getByRole("button", { name: /Imprimir Lista para la Nevera/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalled();
  });

  it("cierra el modal con la tecla Escape gracias a useA11yModal", () => {
    const onClose = vi.fn();
    renderExportModal({ onClose });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });
});
