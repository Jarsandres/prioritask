import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import OfflineBanner from "../OfflineBanner";
import * as offlineQueue from "../../../services/offlineQueue";
import api from "../../../api";
import { ToastProvider } from "../../../context/ToastContext";
import { TaskUpdateProvider } from "../../../context/TaskUpdateContext";
import * as useNetworkStatusModule from "../../../hooks/useNetworkStatus";

const renderBanner = () => {
  return render(
    <ToastProvider>
      <TaskUpdateProvider>
        <OfflineBanner />
      </TaskUpdateProvider>
    </ToastProvider>
  );
};

describe("OfflineBanner Component", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await offlineQueue.clearQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no se renderiza cuando el usuario está online y no hay mutaciones pendientes", async () => {
    vi.spyOn(useNetworkStatusModule, "default").mockReturnValue({
      isOnline: true,
      isOffline: false,
      wasOffline: false,
    });

    const { container } = renderBanner();
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("muestra el banner de advertencia cuando el usuario está en modo offline", async () => {
    vi.spyOn(useNetworkStatusModule, "default").mockReturnValue({
      isOnline: false,
      isOffline: true,
      wasOffline: false,
    });

    renderBanner();

    expect(
      await screen.findByText(/Estás navegando en modo sin conexión/i)
    ).toBeInTheDocument();
    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  it("muestra el número de acciones pendientes encoladas offline", async () => {
    vi.spyOn(useNetworkStatusModule, "default").mockReturnValue({
      isOnline: false,
      isOffline: true,
      wasOffline: false,
    });

    await offlineQueue.enqueueMutation({
      id: "mut_1",
      url: "/tasks/1/status",
      method: "PATCH",
      data: { estado: "DONE" },
    });
    await offlineQueue.enqueueMutation({
      id: "mut_2",
      url: "/tasks",
      method: "POST",
      data: { titulo: "Nueva Tarea" },
    });

    renderBanner();

    expect(
      await screen.findByText(/2 cambios guardados offline esperando conexión ⏳/i)
    ).toBeInTheDocument();
  });

  it("sincroniza automáticamente las mutaciones pendientes cuando se dispara el evento 'online'", async () => {
    vi.spyOn(useNetworkStatusModule, "default").mockReturnValue({
      isOnline: true,
      isOffline: false,
      wasOffline: true,
    });

    await offlineQueue.enqueueMutation({
      id: "sync_task_1",
      url: "/tasks/10/status",
      method: "PATCH",
      data: { estado: "DONE" },
    });

    const apiRequestSpy = vi.spyOn(api, "request").mockResolvedValueOnce({
      data: { id: "10", estado: "DONE" },
    });

    renderBanner();

    // Disparar evento de recuperación de red
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(apiRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/tasks/10/status",
          method: "PATCH",
          data: { estado: "DONE" },
        })
      );
    });

    await waitFor(async () => {
      const remaining = await offlineQueue.getPendingMutations();
      expect(remaining).toHaveLength(0);
    });
  });
});
