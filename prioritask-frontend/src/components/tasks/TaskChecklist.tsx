import { useState, useEffect, useRef } from "react";
import api from "../../api";
import type { Subtask } from "../../types/task";
import { useToast } from "../../context/ToastContext";
import { useTaskUpdate } from "../../context/TaskUpdateContext";
import { Skeleton } from "../ui/Skeleton";
import {
  LuCheck,
  LuPlus,
  LuTrash2,
  LuLoaderCircle,
  LuListChecks,
} from "react-icons/lu";
import "./tasks.css";

export interface TaskChecklistProps {
  taskId: string;
  initialSubtasks?: Subtask[];
  onSubtasksChange?: (subtasks: Subtask[]) => void;
  className?: string;
  readOnly?: boolean;
}

export const TaskChecklist = ({
  taskId,
  initialSubtasks,
  onSubtasksChange,
  className = "",
  readOnly = false,
}: TaskChecklistProps) => {
  const [subtasks, setSubtasks] = useState<Subtask[]>(initialSubtasks ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(initialSubtasks === undefined);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { toast } = useToast();
  const { notifyUpdate } = useTaskUpdate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar subtareas si no fueron provistas inicialmente
  useEffect(() => {
    if (initialSubtasks !== undefined) {
      setSubtasks(initialSubtasks);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;
    setIsLoading(true);

    api
      .get<Subtask[]>(`/tasks/${taskId}/subtasks`, { signal: controller.signal })
      .then((res) => {
        if (isMounted) {
          setSubtasks(res.data);
          onSubtasksChange?.(res.data);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error("Error al cargar subtareas:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [taskId, initialSubtasks, onSubtasksChange]);

  const total = subtasks.length;
  const completed = subtasks.filter((s) => s.completada).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Alternar completitud con actualización optimista
  const handleToggle = async (subtask: Subtask) => {
    if (readOnly) return;
    const prevSubtasks = [...subtasks];
    const nextCompleted = !subtask.completada;

    const updated = subtasks.map((s) =>
      s.id === subtask.id ? { ...s, completada: nextCompleted } : s
    );
    setSubtasks(updated);
    onSubtasksChange?.(updated);

    try {
      const res = await api.patch<Subtask>(`/tasks/${taskId}/subtasks/${subtask.id}`, {
        completada: nextCompleted,
      });

      const reconciled = subtasks.map((s) => (s.id === subtask.id ? res.data : s));
      setSubtasks(reconciled);
      onSubtasksChange?.(reconciled);
      notifyUpdate();

      if (nextCompleted && updated.every((s) => s.completada)) {
        toast.success("¡Todas las subtareas completadas! 🎯");
      }
    } catch (err: unknown) {
      console.error("Error al actualizar subtarea:", err);
      setSubtasks(prevSubtasks);
      onSubtasksChange?.(prevSubtasks);
      toast.error("No se pudo actualizar la subtarea.");
    }
  };

  // Añadir nueva subtarea
  const handleAddSubtask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (readOnly) return;

    const trimmed = newTitle.trim();
    if (!trimmed) return;

    setIsAdding(true);
    try {
      const res = await api.post<Subtask>(`/tasks/${taskId}/subtasks`, {
        titulo: trimmed,
        orden: subtasks.length,
      });

      const updated = [...subtasks, res.data];
      setSubtasks(updated);
      setNewTitle("");
      onSubtasksChange?.(updated);
      notifyUpdate();
      toast.success("Subtarea añadida");
    } catch (err: unknown) {
      console.error("Error al crear subtarea:", err);
      toast.error("Error al añadir la subtarea.");
    } finally {
      setIsAdding(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Eliminar subtarea
  const handleDeleteSubtask = async (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;

    const prevSubtasks = [...subtasks];
    const updated = subtasks.filter((s) => s.id !== subtaskId);
    setSubtasks(updated);
    onSubtasksChange?.(updated);
    setDeletingId(subtaskId);

    try {
      await api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`);
      notifyUpdate();
      toast.info("Subtarea eliminada");
    } catch (err: unknown) {
      console.error("Error al eliminar subtarea:", err);
      setSubtasks(prevSubtasks);
      onSubtasksChange?.(prevSubtasks);
      toast.error("No se pudo eliminar la subtarea.");
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={`task-checklist-container ${className}`.trim()}>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <Skeleton width="100px" height="14px" />
          <Skeleton width="50px" height="14px" />
        </div>
        <Skeleton width="100%" height="6px" className="mb-3 rounded-pill" />
        <Skeleton width="85%" height="22px" className="mb-2" />
        <Skeleton width="70%" height="22px" />
      </div>
    );
  }

  return (
    <div className={`task-checklist-container ${className}`.trim()}>
      {/* Cabecera y Barra de Progreso */}
      <div className="task-checklist-header">
        <div className="task-checklist-header-title">
          <LuListChecks size={15} className="text-primary" aria-hidden="true" />
          <span>Subtareas</span>
        </div>
        <span className="task-checklist-header-meta">
          {total === 0 ? "0 subtareas" : `${completed}/${total} (${percentage}%)`}
        </span>
      </div>

      {total > 0 && (
        <div
          className="task-checklist-progress-track"
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de subtareas"
        >
          <div
            className={`task-checklist-progress-fill ${
              percentage === 100 ? "completed" : ""
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {/* Lista de subtareas */}
      <div className="task-checklist-items" role="list">
        {subtasks.map((subtask) => {
          const isDone = subtask.completada;
          const isDeleting = deletingId === subtask.id;

          return (
            <div
              key={subtask.id}
              className={`task-checklist-item ${isDone ? "is-done" : ""}`}
              role="listitem"
            >
              <button
                type="button"
                className={`task-checklist-checkbox ${isDone ? "checked" : ""}`}
                onClick={() => handleToggle(subtask)}
                disabled={readOnly || isDeleting}
                aria-label={
                  isDone
                    ? `Marcar como pendiente: ${subtask.titulo}`
                    : `Marcar como completada: ${subtask.titulo}`
                }
              >
                {isDone && <LuCheck size={11} aria-hidden="true" />}
              </button>

              <span
                className="task-checklist-title"
                onClick={() => !readOnly && handleToggle(subtask)}
                title={subtask.titulo}
              >
                {subtask.titulo}
              </span>

              {!readOnly && (
                <button
                  type="button"
                  className="task-checklist-delete-btn"
                  onClick={(e) => handleDeleteSubtask(subtask.id, e)}
                  disabled={isDeleting}
                  aria-label={`Eliminar subtarea: ${subtask.titulo}`}
                  title="Eliminar subtarea"
                >
                  {isDeleting ? (
                    <LuLoaderCircle size={12} className="ui-btn-spinner" />
                  ) : (
                    <LuTrash2 size={12} aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Input de Adición Rápida con tecla Enter */}
      {!readOnly && (
        <form onSubmit={handleAddSubtask} className="task-checklist-add-form">
          <div className="task-checklist-input-group">
            <input
              ref={inputRef}
              type="text"
              className="task-checklist-input"
              placeholder="Añadir subtarea... (Enter)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddSubtask();
                }
              }}
              disabled={isAdding}
              maxLength={100}
            />
            <button
              type="submit"
              className="task-checklist-add-btn"
              disabled={!newTitle.trim() || isAdding}
              aria-label="Guardar subtarea"
              title="Añadir subtarea"
            >
              {isAdding ? (
                <LuLoaderCircle size={13} className="ui-btn-spinner" />
              ) : (
                <LuPlus size={14} />
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TaskChecklist;
