import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import KitchenKioskModal from "../KitchenKioskModal";
import TaskCard from "../../common/TaskCard";
import { ThemeProvider } from "../../../context/ThemeContext";
import type { Task } from "../../../types/task";

const sampleTasks: Task[] = [
  {
    id: "kiosk-t1",
    titulo: "Limpiar horno a fondo",
    descripcion: "Usar desengrasante ecológico",
    estado: "TODO",
    categoria: "LIMPIEZA",
    peso: 5,
    due_date: "2026-10-12",
  },
  {
    id: "kiosk-t2",
    titulo: "Hacer compra semanal",
    estado: "DONE",
    categoria: "COMPRA",
    peso: 4,
    attachments_count: 1,
  },
];

describe("Fase 4 UI Roadmap: KitchenKioskModal, Kudos & Drag-and-Drop Assignees", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no renderiza nada cuando isOpen es false", () => {
    render(
      <KitchenKioskModal
        isOpen={false}
        onClose={vi.fn()}
        tasks={sampleTasks}
        onToggleComplete={vi.fn()}
      />
    );
    expect(screen.queryByTestId("kitchen-kiosk-overlay")).not.toBeInTheDocument();
  });

  it("renderiza el Modo Kiosco de Cocina con reloj digital, Pomodoro de 25m y filtra tareas pendientes/completadas", () => {
    const onToggleComplete = vi.fn();
    const onClose = vi.fn();

    render(
      <KitchenKioskModal
        isOpen={true}
        onClose={onClose}
        roomName="Cocina Principal"
        tasks={sampleTasks}
        onToggleComplete={onToggleComplete}
        isLiveConnected={true}
      />
    );

    expect(screen.getByTestId("kitchen-kiosk-overlay")).toBeInTheDocument();
    expect(screen.getByText("Cocina Principal")).toBeInTheDocument();
    expect(screen.getByTestId("kiosk-live-badge")).toBeInTheDocument();
    expect(screen.getByTestId("kiosk-timer-display")).toHaveTextContent("25:00");

    // Cambiar preset a Sprint Limpieza (15m) e iniciar cuenta atrás
    fireEvent.click(screen.getByTestId("kiosk-preset-sprint-15"));
    expect(screen.getByTestId("kiosk-timer-display")).toHaveTextContent("15:00");

    fireEvent.click(screen.getByTestId("kiosk-timer-toggle"));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId("kiosk-timer-display")).toHaveTextContent("14:57");

    // Reiniciar temporizador
    fireEvent.click(screen.getByTestId("kiosk-timer-reset"));
    expect(screen.getByTestId("kiosk-timer-display")).toHaveTextContent("15:00");

    // Completar tarea pendiente con botón táctil grande
    fireEvent.click(screen.getByTestId("kiosk-complete-btn-kiosk-t1"));
    expect(onToggleComplete).toHaveBeenCalledWith("kiosk-t1");

    // Cambiar a pestaña Completadas y enviar un Kudo 🔥
    fireEvent.click(screen.getByTestId("kiosk-tab-done"));
    const fireBtn = screen.getByTestId("kiosk-kudos-fire-kiosk-t2");
    fireEvent.click(fireBtn);
    expect(fireBtn).toHaveTextContent("1");

    // Cerrar con Escape
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("permite asignar convivientes por Drag & Drop y por clic accesible en TaskCard y reaccionar con Kudos en tareas completadas", () => {
    const onAssignMember = vi.fn();
    const onKudosReaction = vi.fn();

    const { rerender } = render(
      <ThemeProvider>
        <TaskCard
          task={sampleTasks[0]}
          onAssignMember={onAssignMember}
          activeAssigneeForClick={{ userId: "user-ana", label: "Ana" }}
          assignedMembers={[]}
        />
      </ThemeProvider>
    );

    // 1. Asignación accesible por clic
    const quickAssignBtn = screen.getByTestId("quick-assign-btn-kiosk-t1");
    expect(quickAssignBtn).toHaveTextContent("Asignar a Ana");
    fireEvent.click(quickAssignBtn);
    expect(onAssignMember).toHaveBeenCalledWith("kiosk-t1", {
      userId: "user-ana",
      label: "Ana",
    });

    // 2. Asignación por Drag & Drop sobre la tarjeta
    const card = screen.getByTestId("task-card-kiosk-t1");
    fireEvent.dragOver(card, {
      dataTransfer: {
        types: ["application/x-prioritask-member"],
        dropEffect: "none",
      },
    });
    expect(card.className).toContain("is-member-drop-target");

    fireEvent.drop(card, {
      dataTransfer: {
        getData: (type: string) =>
          type === "application/x-prioritask-member"
            ? JSON.stringify({ userId: "user-carlos", label: "Carlos" })
            : "",
      },
    });
    expect(onAssignMember).toHaveBeenCalledWith("kiosk-t1", {
      userId: "user-carlos",
      label: "Carlos",
    });

    // 3. Renderizar tarea completada y verificar barra de Kudos (👏, 🔥, ❤️)
    rerender(
      <ThemeProvider>
        <TaskCard
          task={sampleTasks[1]}
          assignedMembers={[{ userId: "user-carlos", label: "Carlos" }]}
          onKudosReaction={onKudosReaction}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId("task-assignees-kiosk-t2")).toHaveTextContent("CA");
    const kudosBar = screen.getByTestId("task-kudos-bar-kiosk-t2");
    expect(kudosBar).toBeInTheDocument();

    const clapBtn = screen.getByTestId("kudos-btn-clap-kiosk-t2");
    fireEvent.click(clapBtn);
    expect(clapBtn).toHaveTextContent("1");
    // Tarea pesada (peso 4 + evidencia) multiplica basePoints (2 * 2 = 4)
    expect(onKudosReaction).toHaveBeenCalledWith("kiosk-t2", "👏", 4);
  });

  it("libera inmediatamente el WakeLockSentinel si el modal se cierra antes de que resuelva navigator.wakeLock.request", async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined);
    let resolveWakeLock!: (sentinel: { release: () => Promise<void> }) => void;
    const wakeLockPromise = new Promise<{ release: () => Promise<void> }>((resolve) => {
      resolveWakeLock = resolve;
    });

    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: vi.fn().mockReturnValue(wakeLockPromise),
      },
    });

    const { rerender } = render(
      <KitchenKioskModal
        isOpen={true}
        onClose={vi.fn()}
        tasks={sampleTasks}
        onToggleComplete={vi.fn()}
      />
    );

    // Cerrar el modal antes de que la promesa de Wake Lock se resuelva
    rerender(
      <KitchenKioskModal
        isOpen={false}
        onClose={vi.fn()}
        tasks={sampleTasks}
        onToggleComplete={vi.fn()}
      />
    );

    await act(async () => {
      resolveWakeLock({ release: releaseMock });
      await wakeLockPromise;
    });

    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
