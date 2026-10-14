import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppContent } from "../../../App";
import { ThemeProvider } from "../../../context/ThemeContext";
import { SettingsProvider } from "../../../context/SettingsContext";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";
import { RoomProvider } from "../../../context/RoomContext";
import api from "../../../api";

vi.mock("../../../api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock child pages to isolate shortcut evaluation
vi.mock("../../../pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard Mock</div>,
}));

vi.mock("../../../components/tasks/GlobalQuickAddModal", () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="global-quick-add-modal">
        <span>Mock Global Quick Add Modal</span>
        <button type="button" onClick={onClose} data-testid="mock-close-btn">
          Cerrar
        </button>
      </div>
    );
  },
}));

const renderAppWithShortcuts = (initialRoute = "/dashboard") => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <ThemeProvider>
        <SettingsProvider>
          <ToastProvider>
            <TaskUpdateProvider>
              <RoomProvider>
                <AppContent />
              </RoomProvider>
            </TaskUpdateProvider>
          </ToastProvider>
        </SettingsProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
};

describe("App Global Hotkeys & Quick Add Triggers (Sprint 3)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("token", "mock-valid-token");
    vi.clearAllMocks();

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/rooms" || url.includes("/rooms")) {
        return Promise.resolve({
          data: [{ id: "room-1", nombre: "Cocina Principal", members: [] }],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it("abre Captura Rápida al presionar el atajo canónico 'q' o 'Q' fuera de inputs", async () => {
    renderAppWithShortcuts();

    expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();

    // Pulsar tecla 'q'
    fireEvent.keyDown(window, { key: "q" });

    await waitFor(() => {
      expect(screen.getByTestId("global-quick-add-modal")).toBeInTheDocument();
    });

    // Cerrar el modal
    fireEvent.click(screen.getByTestId("mock-close-btn"));
    await waitFor(() => {
      expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();
    });

    // Pulsar tecla 'Q' mayúscula
    fireEvent.keyDown(window, { key: "Q" });

    await waitFor(() => {
      expect(screen.getByTestId("global-quick-add-modal")).toBeInTheDocument();
    });
  });

  it("abre Captura Rápida al presionar el atajo 'c' o 'C'", async () => {
    renderAppWithShortcuts();

    expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "c" });

    await waitFor(() => {
      expect(screen.getByTestId("global-quick-add-modal")).toBeInTheDocument();
    });
  });

  it("abre o alterna Captura Rápida con Alt+Space", async () => {
    renderAppWithShortcuts();

    expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();

    // Primera pulsación: abre
    fireEvent.keyDown(window, { key: " ", code: "Space", altKey: true });

    await waitFor(() => {
      expect(screen.getByTestId("global-quick-add-modal")).toBeInTheDocument();
    });

    // Segunda pulsación: alterna (cierra)
    fireEvent.keyDown(window, { key: " ", code: "Space", altKey: true });

    await waitFor(() => {
      expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();
    });
  });

  it("abre o alterna Captura Rápida con Ctrl+Shift+A / Cmd+Shift+A (Todoist desktop fallback)", async () => {
    renderAppWithShortcuts();

    expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();

    // Ctrl+Shift+A
    fireEvent.keyDown(window, { key: "a", ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.getByTestId("global-quick-add-modal")).toBeInTheDocument();
    });

    // Cmd+Shift+A (metaKey) alterna y cierra
    fireEvent.keyDown(window, { key: "A", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();
    });
  });

  it("NO abre Captura Rápida al teclear 'q' o 'c' si el foco está dentro de un elemento INPUT o TEXTAREA", async () => {
    renderAppWithShortcuts();

    const dummyInput = document.createElement("input");
    document.body.appendChild(dummyInput);
    dummyInput.focus();

    fireEvent.keyDown(dummyInput, { key: "q" });
    fireEvent.keyDown(dummyInput, { key: "c" });

    expect(screen.queryByTestId("global-quick-add-modal")).not.toBeInTheDocument();

    document.body.removeChild(dummyInput);
  });
});
