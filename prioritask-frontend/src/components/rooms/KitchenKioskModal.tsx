import React, { useState, useEffect } from "react";
import type { Task } from "../../types/task";
import { PriorityBadge, CategoryIcon } from "../common/Badges";
import {
  KUDOS_OPTIONS,
  getTaskKudos,
  toggleTaskKudo,
  type KudosEmoji,
  type QuickAssignee,
  getMemberInitials,
} from "../../utils/kudosStore";
import {
  LuMonitor,
  LuX,
  LuPlay,
  LuPause,
  LuRotateCcw,
  LuCheck,
  LuCircleCheck,
  LuRadio,
  LuSun,
  LuTimer,
  LuCalendar,
  LuUsers,
} from "react-icons/lu";

export interface KitchenKioskModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName?: string;
  tasks: Task[];
  onToggleComplete: (taskId: string) => void | Promise<void>;
  isLiveConnected?: boolean;
  assigneesMap?: Record<string, QuickAssignee[]>;
  onKudosReaction?: (taskId: string, emoji: KudosEmoji, deltaPoints: number) => void;
}

interface PomodoroPreset {
  id: string;
  label: string;
  minutes: number;
  badge: string;
}

const POMODORO_PRESETS: PomodoroPreset[] = [
  { id: "sprint-15", label: "Sprint Limpieza", minutes: 15, badge: "⚡ 15m" },
  { id: "pomodoro-25", label: "Pomodoro Hogar", minutes: 25, badge: "🍅 25m" },
  { id: "deep-45", label: "Colada / Cocina", minutes: 45, badge: "🧺 45m" },
  { id: "break-5", label: "Descanso", minutes: 5, badge: "☕ 5m" },
];

export const KitchenKioskModal: React.FC<KitchenKioskModalProps> = ({
  isOpen,
  onClose,
  roomName = "Mi Hogar",
  tasks,
  onToggleComplete,
  isLiveConnected = false,
  assigneesMap = {},
  onKudosReaction,
}) => {
  const [activePreset, setActivePreset] = useState<PomodoroPreset>(POMODORO_PRESETS[1]);
  const [secondsLeft, setSecondsLeft] = useState<number>(POMODORO_PRESETS[1].minutes * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<"pending" | "done">("pending");
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [clockText, setClockText] = useState<string>(() =>
    new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  );
  const [, setKudosTick] = useState(0);

  // Reloj digital en tiempo real para pantalla de cocina / nevera
  useEffect(() => {
    if (!isOpen) return;
    const updateClock = () => {
      setClockText(
        new Date().toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 15000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  // Solicitar Screen Wake Lock API (Always-On Display) con degradación elegante
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    let sentinel: { release?: () => Promise<void> } | null = null;
    const navWithWakeLock = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };

    if (navWithWakeLock?.wakeLock?.request) {
      navWithWakeLock.wakeLock
        .request("screen")
        .then((lock) => {
          if (isCancelled) {
            if (lock && typeof lock.release === "function") {
              lock.release().catch(() => {});
            }
            return;
          }
          sentinel = lock;
          setWakeLockActive(true);
        })
        .catch(() => {
          if (!isCancelled) {
            setWakeLockActive(false);
          }
        });
    } else {
      // En navegadores sin API nativa mostramos modo Always-On simulado
      setWakeLockActive(true);
    }

    return () => {
      isCancelled = true;
      if (sentinel && typeof sentinel.release === "function") {
        sentinel.release().catch(() => {});
      }
    };
  }, [isOpen]);

  // Temporizador Pomodoro doméstico
  useEffect(() => {
    if (!isOpen || !isRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, isRunning]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Escuchar cambios de Kudos
  useEffect(() => {
    if (!isOpen) return;
    const refresh = () => setKudosTick((t) => t + 1);
    window.addEventListener("prioritask:kudos-updated", refresh);
    return () => window.removeEventListener("prioritask:kudos-updated", refresh);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTimer = (totalSecs: number): string => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleSelectPreset = (preset: PomodoroPreset) => {
    setActivePreset(preset);
    setIsRunning(false);
    setSecondsLeft(preset.minutes * 60);
  };

  const handleResetTimer = () => {
    setIsRunning(false);
    setSecondsLeft(activePreset.minutes * 60);
  };

  const pendingTasks = tasks
    .filter((t) => t.estado !== "DONE")
    .sort((a, b) => (b.peso ?? 2) - (a.peso ?? 2));
  const doneTasks = tasks.filter((t) => t.estado === "DONE");
  const visibleTasks = filterTab === "pending" ? pendingTasks : doneTasks;

  const totalSecsPreset = activePreset.minutes * 60;
  const progressPct =
    totalSecsPreset > 0
      ? Math.round(((totalSecsPreset - secondsLeft) / totalSecsPreset) * 100)
      : 0;

  return (
    <div
      className="kitchen-kiosk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Modo Kiosco de Cocina: ${roomName}`}
      data-testid="kitchen-kiosk-overlay"
    >
      {/* Cabecera Superior de Alto Contraste */}
      <header className="kitchen-kiosk-header">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div className="kitchen-kiosk-brand-badge">
            <LuMonitor size={24} />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <h2 className="kitchen-kiosk-title mb-0">{roomName}</h2>
              <span className="kitchen-kiosk-pill kitchen-kiosk-pill-amber">
                <LuSun size={14} />
                <span>
                  {wakeLockActive ? "Always-On Activo" : "Modo Tablet Cocina"}
                </span>
              </span>
              {isLiveConnected && (
                <span
                  className="kitchen-kiosk-pill kitchen-kiosk-pill-emerald"
                  data-testid="kiosk-live-badge"
                >
                  <LuRadio size={14} />
                  <span>SSE En Vivo</span>
                </span>
              )}
            </div>
            <p className="kitchen-kiosk-subtitle mb-0">
              Pantalla táctil de alto contraste para nevera digital o tablet compartida
            </p>
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          <div className="kitchen-kiosk-clock" data-testid="kiosk-digital-clock">
            {clockText}
          </div>
          <button
            type="button"
            className="kitchen-kiosk-touch-btn kitchen-kiosk-exit-btn"
            onClick={onClose}
            aria-label="Salir del Modo Kiosco"
            data-testid="kiosk-close-btn"
          >
            <LuX size={22} />
            <span>Salir Kiosco</span>
          </button>
        </div>
      </header>

      {/* Cuerpo Kiosco: Columna Izquierda (Pomodoro Doméstico) + Columna Derecha (Tareas Táctiles) */}
      <div className="kitchen-kiosk-body">
        {/* Panel Izquierdo: Temporizador Pomodoro Doméstico */}
        <section
          className="kitchen-kiosk-pomodoro-card"
          aria-label="Temporizador Pomodoro Doméstico"
          data-testid="kiosk-pomodoro-timer"
        >
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div className="d-flex align-items-center gap-2">
              <LuTimer size={22} className="text-warning" />
              <h3 className="h5 mb-0 fw-bold text-white">Pomodoro Doméstico</h3>
            </div>
            <span className="badge rounded-pill bg-warning text-dark fw-bold px-3 py-1">
              {activePreset.label}
            </span>
          </div>

          <div className="kitchen-kiosk-timer-display" data-testid="kiosk-timer-display">
            {formatTimer(secondsLeft)}
          </div>

          <div
            className="kitchen-kiosk-timer-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="kitchen-kiosk-timer-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Controles Táctiles Grandes (min-height: 52px) */}
          <div className="d-flex gap-2 my-3">
            <button
              type="button"
              className={`kitchen-kiosk-touch-btn flex-grow-1 ${
                isRunning ? "btn-kiosk-warning" : "btn-kiosk-primary"
              }`}
              onClick={() => setIsRunning((prev) => !prev)}
              data-testid="kiosk-timer-toggle"
            >
              {isRunning ? <LuPause size={20} /> : <LuPlay size={20} />}
              <span>{isRunning ? "Pausar" : "Iniciar Rutina"}</span>
            </button>
            <button
              type="button"
              className="kitchen-kiosk-touch-btn btn-kiosk-secondary"
              onClick={handleResetTimer}
              aria-label="Reiniciar temporizador"
              data-testid="kiosk-timer-reset"
            >
              <LuRotateCcw size={20} />
              <span>Reiniciar</span>
            </button>
          </div>

          {/* Presets Rápidos */}
          <div className="kitchen-kiosk-presets-grid">
            {POMODORO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`kitchen-kiosk-preset-btn ${
                  activePreset.id === preset.id ? "active" : ""
                }`}
                onClick={() => handleSelectPreset(preset)}
                data-testid={`kiosk-preset-${preset.id}`}
              >
                <span className="fw-bold">{preset.badge}</span>
                <span className="small opacity-75">{preset.label}</span>
              </button>
            ))}
          </div>

          {/* Resumen de Progreso del Hogar */}
          <div className="kitchen-kiosk-stats-box mt-auto pt-3">
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-white-50 small fw-semibold text-uppercase">
                Estado del Hogar Hoy
              </span>
              <span className="fw-bold text-emerald-400" style={{ color: "#34d399" }}>
                {doneTasks.length} / {tasks.length} completadas
              </span>
            </div>
          </div>
        </section>

        {/* Panel Derecho: Tablero Táctil de Tareas */}
        <section className="kitchen-kiosk-tasks-panel">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
            <div className="d-flex gap-2">
              <button
                type="button"
                className={`kitchen-kiosk-touch-btn ${
                  filterTab === "pending" ? "btn-kiosk-primary" : "btn-kiosk-secondary"
                }`}
                onClick={() => setFilterTab("pending")}
                data-testid="kiosk-tab-pending"
              >
                <span>Por Hacer ({pendingTasks.length})</span>
              </button>
              <button
                type="button"
                className={`kitchen-kiosk-touch-btn ${
                  filterTab === "done" ? "btn-kiosk-emerald" : "btn-kiosk-secondary"
                }`}
                onClick={() => setFilterTab("done")}
                data-testid="kiosk-tab-done"
              >
                <span>Completadas ({doneTasks.length})</span>
              </button>
            </div>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="kitchen-kiosk-empty" data-testid="kiosk-empty-state">
              <LuCircleCheck size={48} className="text-success mb-2" />
              <h4 className="fw-bold text-white mb-1">
                {filterTab === "pending"
                  ? "¡Todo al día en el hogar!"
                  : "Aún no hay tareas completadas"}
              </h4>
              <p className="text-white-50 mb-0">
                {filterTab === "pending"
                  ? "No quedan tareas pendientes por resolver en este momento."
                  : "Completa una tarea pulsando los botones táctiles para celebrar en equipo."}
              </p>
            </div>
          ) : (
            <div className="kitchen-kiosk-task-list" data-testid="kiosk-task-list">
              {visibleTasks.map((task) => {
                const isDone = task.estado === "DONE";
                const assignees = assigneesMap[task.id] || [];
                const kudos = getTaskKudos(task.id);

                return (
                  <div
                    key={task.id}
                    className={`kitchen-kiosk-task-row ${isDone ? "is-done" : ""}`}
                    data-testid={`kiosk-task-row-${task.id}`}
                  >
                    <button
                      type="button"
                      className={`kitchen-kiosk-complete-btn ${isDone ? "checked" : ""}`}
                      onClick={() => onToggleComplete(task.id)}
                      aria-label={
                        isDone
                          ? `Reabrir tarea ${task.titulo}`
                          : `Completar tarea ${task.titulo}`
                      }
                      data-testid={`kiosk-complete-btn-${task.id}`}
                    >
                      {isDone ? <LuCircleCheck size={28} /> : <LuCheck size={24} />}
                    </button>

                    <div className="kitchen-kiosk-task-content">
                      <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                        <span className="kitchen-kiosk-cat-badge">
                          <CategoryIcon category={task.categoria} size={14} />
                          <span>{task.categoria || "OTRO"}</span>
                        </span>
                        <PriorityBadge peso={task.peso} />
                        {task.due_date && (
                          <span className="kitchen-kiosk-date-badge">
                            <LuCalendar size={13} />
                            <span>{String(task.due_date).slice(0, 10)}</span>
                          </span>
                        )}
                        {assignees.length > 0 && (
                          <span className="kitchen-kiosk-assignees-pill">
                            <LuUsers size={13} />
                            <span>
                              {assignees.map((a) => getMemberInitials(a.label)).join(", ")}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="kitchen-kiosk-task-title">{task.titulo}</div>
                      {task.descripcion && (
                        <div className="kitchen-kiosk-task-desc">{task.descripcion}</div>
                      )}
                    </div>

                    {/* Botones de Kudos rápidos en tareas completadas */}
                    {isDone && (
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        {KUDOS_OPTIONS.map((opt) => {
                          const count = kudos.counts[opt.emoji] || 0;
                          const active = kudos.myReactions.includes(opt.emoji);
                          return (
                            <button
                              key={opt.code}
                              type="button"
                              className={`kitchen-kiosk-kudos-btn ${active ? "active" : ""}`}
                              onClick={() => {
                                const res = toggleTaskKudo(
                                  task.id,
                                  opt.emoji,
                                  task.peso,
                                  (task.attachments_count ?? 0) > 0
                                );
                                setKudosTick((t) => t + 1);
                                onKudosReaction?.(task.id, opt.emoji, res.deltaPoints);
                              }}
                              title={`${opt.label} (+pts de reconocimiento)`}
                              data-testid={`kiosk-kudos-${opt.code}-${task.id}`}
                            >
                              <span>{opt.emoji}</span>
                              {count > 0 && <span className="fw-bold">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default KitchenKioskModal;
