import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import type { Task, TaskStatus } from "../../types/task";
import { useTaskUpdate } from "../../context/TaskUpdateContext";
import { useToast } from "../../context/ToastContext";
import {
  parseRecurrenceExpression,
  previewUpcomingOccurrences,
  toISODateString,
  type RecurrenceMode,
  type RecurrenceRuleConfig,
} from "../../utils/recurrenceEngine";
import TaskChecklist from "./TaskChecklist";
import TaskCommentsSection from "./TaskCommentsSection";
import TaskAttachmentsSection from "./TaskAttachmentsSection";
import {
  KUDOS_OPTIONS,
  getTaskKudos,
  toggleTaskKudo,
  type KudosEmoji,
} from "../../utils/kudosStore";
import { isHighPriority } from "../../utils/priorityScale";
import {
  LuX,
  LuCheck,
  LuCircleCheck,
  LuCalendar,
  LuFlag,
  LuRepeat,
  LuMaximize2,
  LuTrash2,
  LuSave,
  LuLoaderCircle,
  LuLayers,
  LuAward,
} from "react-icons/lu";
import "./tasks.css";

export interface TaskPeekDrawerProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: Task) => void;
  onComplete?: (taskId: string) => void | Promise<void>;
  onDelete?: (task: Task) => void;
  onAdvance?: (taskId: string) => void | Promise<void>;
  onKudosReaction?: (taskId: string, emoji: KudosEmoji, deltaPoints: number) => void;
}

const TODOIST_PRIORITIES = [
  { peso: 5, code: "P1", label: "Urgente", color: "#dc2626" },
  { peso: 4, code: "P2", label: "Alta", color: "#ea580c" },
  { peso: 3, code: "P3", label: "Media", color: "#d97706" },
  { peso: 2, code: "P4", label: "Media-Baja", color: "#2563eb" },
  { peso: 1, code: "P5", label: "Baja", color: "#64748b" },
];

const CATEGORIES = [
  { value: "LIMPIEZA", label: "Limpieza" },
  { value: "COMPRA", label: "Compra" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "OTRO", label: "Otro" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "Pendiente" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "DONE", label: "Completada" },
];

const RECURRENCE_CHIPS = [
  { label: "Cada día", expr: "cada día" },
  { label: "Cada semana", expr: "cada semana" },
  { label: "Cada! 7 días", expr: "cada! 7 días" },
  { label: "Cada mes", expr: "cada mes" },
];

export const TaskPeekDrawer: React.FC<TaskPeekDrawerProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated,
  onComplete,
  onDelete,
  onAdvance,
  onKudosReaction,
}) => {
  const { notifyUpdate } = useTaskUpdate();
  const { toast } = useToast();

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState<number>(2);
  const [estado, setEstado] = useState<TaskStatus>("TODO");
  const [dueDate, setDueDate] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<
    "DAILY" | "WEEKLY" | "MONTHLY"
  >("WEEKLY");
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1);
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>("FIXED");
  const [recurrenceDsl, setRecurrenceDsl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [attachmentsCount, setAttachmentsCount] = useState<number>(
    task?.attachments_count ?? 0
  );
  const [kudosState, setKudosState] = useState(() =>
    getTaskKudos(task?.id || "")
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  // Sincronizar estado local cuando cambia la tarea seleccionada
  useEffect(() => {
    if (!task) return;
    setTitulo(task.titulo || "");
    setDescripcion(task.descripcion || "");
    setCategoria(task.categoria || "LIMPIEZA");
    setPeso(task.peso ?? 2);
    setEstado(task.estado || "TODO");
    setDueDate(task.due_date ? String(task.due_date).slice(0, 10) : "");
    setIsRecurring(Boolean(task.is_recurring));
    setAttachmentsCount(task.attachments_count ?? 0);
    setKudosState(getTaskKudos(task.id));

    if (task.recurrence_rule) {
      setRecurrenceFrequency(task.recurrence_rule.frequency || "WEEKLY");
      setRecurrenceInterval(task.recurrence_rule.interval || 1);
      setRecurrenceMode(task.recurrence_rule.mode || "FIXED");
    } else {
      setRecurrenceFrequency("WEEKLY");
      setRecurrenceInterval(1);
      setRecurrenceMode("FIXED");
    }
    setRecurrenceDsl("");
  }, [task]);

  useEffect(() => {
    if (!isOpen || !task?.id) return;
    const handleSync = () => setKudosState(getTaskKudos(task.id));
    window.addEventListener("prioritask:kudos-updated", handleSync);
    return () => window.removeEventListener("prioritask:kudos-updated", handleSync);
  }, [isOpen, task?.id]);

  // Cerrar con tecla Escape
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

  const handleApplyDsl = (expr: string) => {
    setRecurrenceDsl(expr);
    const parsed = parseRecurrenceExpression(expr.trim());
    if (!parsed) return;
    setIsRecurring(true);
    setRecurrenceMode(parsed.mode);
    if (parsed.frequency === "DAILY" || parsed.frequency === "WORKDAYS") {
      setRecurrenceFrequency("DAILY");
      setRecurrenceInterval(parsed.interval);
    } else if (parsed.frequency === "WEEKLY") {
      setRecurrenceFrequency("WEEKLY");
      setRecurrenceInterval(parsed.interval);
    } else if (parsed.frequency === "MONTHLY") {
      setRecurrenceFrequency("MONTHLY");
      setRecurrenceInterval(parsed.interval);
    } else if (parsed.frequency === "YEARLY") {
      setRecurrenceFrequency("MONTHLY");
      setRecurrenceInterval(Math.min(365, parsed.interval * 12));
    }
  };

  const ruleConfig = useMemo<RecurrenceRuleConfig>(
    () => ({
      frequency: recurrenceFrequency,
      interval: Math.max(1, Math.min(365, recurrenceInterval || 1)),
      mode: recurrenceMode,
      resetSubtasks: true,
    }),
    [recurrenceFrequency, recurrenceInterval, recurrenceMode]
  );

  const upcomingOccurrences = useMemo(() => {
    if (!isRecurring) return [];
    const anchor = dueDate || todayStr;
    try {
      return previewUpcomingOccurrences(anchor, ruleConfig, 4).map((d) =>
        toISODateString(d)
      );
    } catch {
      return [];
    }
  }, [isRecurring, dueDate, todayStr, ruleConfig]);

  if (!isOpen || !task) {
    return null;
  }

  const isDone = estado === "DONE";
  // Bucket visual intencional: P1|P2 comparten el anillo de alta prioridad.
  const priorityRingClass =
    isHighPriority(peso)
      ? "priority-ring-p1"
      : peso === 3
        ? "priority-ring-p2"
        : peso === 2
          ? "priority-ring-p3"
          : "priority-ring-p4";

  const handleQuickDate = (daysOffset: number | null) => {
    if (daysOffset === null) {
      setDueDate("");
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    setDueDate(d.toISOString().slice(0, 10));
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitulo = titulo.trim();
    if (!cleanTitulo || isSaving) return;

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        titulo: cleanTitulo,
        descripcion: descripcion.trim() || undefined,
        categoria,
        peso,
        estado,
        due_date: dueDate || null,
        is_recurring: isRecurring,
      };

      if (isRecurring) {
        payload.recurrence_rule = {
          frequency: recurrenceFrequency,
          interval: Math.max(1, Math.min(365, recurrenceInterval || 1)),
          mode: recurrenceMode,
          reset_subtasks: true,
        };
      }

      const res = await api.put<Task>(`/tasks/${task.id}`, payload);
      const updatedTask: Task = {
        ...task,
        ...payload,
        ...(res.data || {}),
        titulo: cleanTitulo,
        descripcion: descripcion.trim() || undefined,
        categoria,
        peso,
        estado,
        due_date: dueDate || undefined,
        is_recurring: isRecurring,
      };

      onTaskUpdated?.(updatedTask);
      notifyUpdate();
      toast.success("Tarea actualizada desde el panel rápido");
    } catch {
      toast.error("No se pudieron guardar los cambios de la tarea.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="task-peek-drawer-backdrop"
      onClick={onClose}
      data-testid="task-peek-drawer-backdrop"
    >
      <aside
        className="task-peek-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de tarea: ${task.titulo}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="task-peek-drawer"
      >
        {/* Cabecera Superior Sticky */}
        <div className="task-peek-drawer-header">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className={`ui-task-checkbox ${priorityRingClass} ${
                isDone ? "checked" : ""
              }`}
              onClick={async () => {
                const nextStatus: TaskStatus = isDone ? "TODO" : "DONE";
                setEstado(nextStatus);
                if (onComplete) {
                  await onComplete(task.id);
                } else {
                  try {
                    await api.patch(`/tasks/${task.id}/status`, {
                      estado: nextStatus,
                    });
                    onTaskUpdated?.({ ...task, estado: nextStatus });
                    notifyUpdate();
                  } catch {
                    setEstado(task.estado);
                    toast.error("No se pudo actualizar el estado de la tarea.");
                  }
                }
              }}
              aria-label={
                isDone ? "Marcar como pendiente" : "Completar tarea"
              }
              data-testid="peek-drawer-complete-checkbox"
            >
              {isDone ? <LuCircleCheck size={16} /> : <LuCheck size={12} />}
            </button>
            <span className="badge rounded-pill bg-light text-dark border small">
              {categoria}
            </span>
          </div>

          <div className="d-flex align-items-center gap-1">
            <Link
              to={`/tasks/edit/${task.id}`}
              className="task-peek-icon-btn text-decoration-none"
              title="Abrir en página completa"
              data-testid="peek-drawer-full-link"
            >
              <LuMaximize2 size={15} />
              <span className="d-none d-sm-inline ms-1 small">Expandir</span>
            </Link>

            {onDelete && (
              <button
                type="button"
                className="task-peek-icon-btn danger"
                onClick={() => {
                  onClose();
                  onDelete(task);
                }}
                title="Eliminar tarea"
                aria-label="Eliminar tarea"
                data-testid="peek-drawer-delete-btn"
              >
                <LuTrash2 size={15} />
              </button>
            )}

            <button
              type="button"
              className="task-peek-icon-btn"
              onClick={onClose}
              title="Cerrar panel (Esc)"
              aria-label="Cerrar panel de detalle"
              data-testid="peek-drawer-close-btn"
            >
              <LuX size={18} />
            </button>
          </div>
        </div>

        {/* Contenido Desplazable */}
        <div className="task-peek-drawer-body">
          <form onSubmit={handleSaveChanges} className="mb-4">
            {/* Título y Descripción Inline */}
            <div className="mb-3">
              <input
                type="text"
                className="task-peek-title-input"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título de la tarea..."
                aria-label="Título de la tarea"
                data-testid="peek-drawer-title-input"
                required
              />
              <textarea
                className="task-peek-desc-input"
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Añadir descripción o notas clave..."
                aria-label="Descripción de la tarea"
                data-testid="peek-drawer-desc-input"
              />
            </div>

            {/* Propiedades Estilo Linear / Todoist */}
            <div className="task-peek-props-card">
              {/* Estado */}
              <div className="task-peek-prop-row">
                <span className="task-peek-prop-label">
                  <LuLayers size={13} />
                  <span>Estado</span>
                </span>
                <div className="d-flex gap-1 flex-wrap">
                  {STATUS_OPTIONS.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      className={`todoist-mini-chip ${
                        estado === st.value ? "active" : ""
                      }`}
                      onClick={() => setEstado(st.value)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prioridad P1..P5 */}
              <div className="task-peek-prop-row">
                <span className="task-peek-prop-label">
                  <LuFlag size={13} />
                  <span>Prioridad</span>
                </span>
                <div className="d-flex gap-1 flex-wrap">
                  {TODOIST_PRIORITIES.map((p) => (
                    <button
                      key={p.peso}
                      type="button"
                      className={`todoist-mini-chip ${
                        peso === p.peso ? "active" : ""
                      }`}
                      style={{
                        borderColor: peso === p.peso ? p.color : undefined,
                        color: peso === p.peso ? p.color : undefined,
                      }}
                      onClick={() => setPeso(p.peso)}
                      data-testid={`peek-priority-${p.code}`}
                    >
                      <LuFlag size={11} style={{ color: p.color }} className="me-1" />
                      {p.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría */}
              <div className="task-peek-prop-row">
                <span className="task-peek-prop-label">Categoría</span>
                <select
                  className="todoist-attr-select"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  aria-label="Categoría de la tarea"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha de vencimiento */}
              <div className="task-peek-prop-row">
                <span className="task-peek-prop-label">
                  <LuCalendar size={13} />
                  <span>Vencimiento</span>
                </span>
                <div className="d-flex align-items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    className="todoist-mini-chip"
                    onClick={() => handleQuickDate(0)}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    className="todoist-mini-chip"
                    onClick={() => handleQuickDate(1)}
                  >
                    Mañana
                  </button>
                  <input
                    type="date"
                    className="todoist-attr-select"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    aria-label="Fecha límite"
                  />
                  {dueDate && (
                    <button
                      type="button"
                      className="todoist-pill-clear-btn"
                      onClick={() => handleQuickDate(null)}
                      title="Quitar fecha"
                    >
                      <LuX size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Recurrencia y Vista Previa de 4 Ciclos */}
              <div className="task-peek-prop-row flex-column align-items-stretch">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="task-peek-prop-label">
                    <LuRepeat size={13} />
                    <span>Rutina Recurrente</span>
                  </span>
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="peek-recurring-switch"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                    />
                  </div>
                </div>

                <div className="d-flex gap-1 flex-wrap mb-2">
                  {RECURRENCE_CHIPS.map((chip) => (
                    <button
                      key={chip.expr}
                      type="button"
                      className={`todoist-mini-chip ${
                        recurrenceDsl === chip.expr ? "active" : ""
                      }`}
                      onClick={() => handleApplyDsl(chip.expr)}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {isRecurring && upcomingOccurrences.length > 0 && (
                  <div
                    className="task-peek-recurrence-preview"
                    data-testid="peek-drawer-recurrence-preview"
                  >
                    <span className="text-muted" style={{ fontSize: "11px" }}>
                      Próximos 4 ciclos ({recurrenceMode === "FLOATING" ? "Flotante !" : "Fijo"}):
                    </span>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {upcomingOccurrences.map((isoDate, i) => (
                        <span
                          key={isoDate}
                          className="badge rounded-pill bg-light text-dark border"
                          style={{ fontSize: "10.5px" }}
                        >
                          #{i + 1} · {isoDate}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Acciones de Guardado y Avance de Ciclo */}
            <div className="d-flex align-items-center justify-content-between gap-2 mt-3">
              {isRecurring && onAdvance && estado !== "DONE" ? (
                <button
                  type="button"
                  className="todoist-btn-cancel"
                  onClick={() => onAdvance(task.id)}
                >
                  🔄 Avanzar ciclo
                </button>
              ) : (
                <span />
              )}

              <button
                type="submit"
                className="todoist-btn-submit d-inline-flex align-items-center gap-1"
                disabled={!titulo.trim() || isSaving}
                data-testid="peek-drawer-save-btn"
              >
                {isSaving ? (
                  <LuLoaderCircle size={14} className="ui-btn-spinner" />
                ) : (
                  <LuSave size={14} />
                )}
                <span>{isSaving ? "Guardando..." : "Guardar cambios"}</span>
              </button>
            </div>
          </form>

          {/* Barra de Reconocimiento Rápido ("Kudos": 👏, 🔥, ❤️) en tareas completadas */}
          {isDone && (
            <div
              className="ui-task-kudos-bar mb-3"
              data-testid="peek-kudos-bar"
            >
              <span className="ui-task-kudos-label">
                <LuAward size={14} className="text-warning" />
                <span>Reconocer esfuerzo del hogar:</span>
              </span>
              <div className="ui-task-kudos-actions">
                {KUDOS_OPTIONS.map((opt) => {
                  const count = kudosState.counts[opt.emoji] || 0;
                  const isReacted = kudosState.myReactions.includes(opt.emoji);
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      className={`ui-task-kudos-btn ${isReacted ? "active" : ""}`}
                      onClick={() => {
                        const res = toggleTaskKudo(
                          task.id,
                          opt.emoji,
                          peso,
                          attachmentsCount > 0
                        );
                        setKudosState(res.state);
                        onKudosReaction?.(task.id, opt.emoji, res.deltaPoints);
                      }}
                      title={opt.label}
                      aria-label={`Dar Kudo ${opt.emoji} ${opt.label}`}
                      aria-pressed={isReacted}
                      data-testid={`peek-kudos-btn-${opt.code}`}
                    >
                      <span>{opt.emoji}</span>
                      {count > 0 && (
                        <span className="ui-task-kudos-count">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. Checklist Interactivo de Subtareas */}
          <div className="task-peek-section">
            <TaskChecklist
              taskId={task.id}
              initialSubtasks={task.subtasks}
              onSubtasksChange={(subtasks) =>
                onTaskUpdated?.({ ...task, subtasks })
              }
            />
          </div>

          {/* 2. Hilo de Actividad y Comentarios */}
          <div className="task-peek-section">
            <TaskCommentsSection taskId={task.id} />
          </div>

          {/* 3. Galería de Evidencias Fotográficas */}
          <div className="task-peek-section">
            <TaskAttachmentsSection
              taskId={task.id}
              onAttachmentsCountChange={(count) => {
                setAttachmentsCount(count);
                onTaskUpdated?.({ ...task, attachments_count: count });
              }}
            />
          </div>
        </div>
      </aside>
    </div>
  );
};

export default TaskPeekDrawer;
