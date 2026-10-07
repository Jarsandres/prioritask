import { useState, useRef, useEffect } from "react";
import type { Task, Subtask } from "../../types/task";
import TaskChecklist from "../tasks/TaskChecklist";
import TaskCommentsSection from "../tasks/TaskCommentsSection";
import TaskAttachmentsSection from "../tasks/TaskAttachmentsSection";
import {
  PriorityBadge,
  StatusBadge,
  RecurringBadge,
  CategoryIcon,
} from "./Badges";
import {
  LuCheck,
  LuCircleCheck,
  LuEllipsisVertical,
  LuPencil,
  LuTrash2,
  LuCalendar,
  LuLoaderCircle,
  LuListChecks,
  LuMessageSquare,
  LuPaperclip,
} from "react-icons/lu";
import "../tasks/tasks.css";

export interface TaskCardProps {
  task: Task;
  onComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onAdvance?: (taskId: string) => Promise<void>;
  isCompleting?: boolean;
  isDeleting?: boolean;
  className?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

export const TaskCard = ({
  task,
  onComplete,
  onEdit,
  onDelete,
  onAdvance,
  isCompleting = false,
  isDeleting = false,
  className = "",
  draggable = false,
  onDragStart,
}: TaskCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentsCount, setAttachmentsCount] = useState<number | undefined>(task.attachments_count);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? []);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDone = task.estado === "DONE";

  useEffect(() => {
    if (task.subtasks) {
      setSubtasks(task.subtasks);
    }
  }, [task.subtasks]);

  const totalSubtasks = subtasks.length > 0 ? subtasks.length : (task.subtasks_count ?? 0);
  const completedSubtasks =
    subtasks.length > 0
      ? subtasks.filter((s) => s.completada).length
      : (task.subtasks_completed_count ?? 0);

  // Manejar clic exterior para cerrar el menú de acciones
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onComplete && !isCompleting && !isDeleting) {
      onComplete(task.id);
    }
  };

  return (
    <div
      className={`ui-task-card ${isDone ? "task-done" : ""} ${className}`.trim()}
      draggable={draggable && !showChecklist}
      onDragStart={onDragStart}
    >
      {/* Cabecera superior: Badges + Menú contextual de 3 puntos */}
      <div className="ui-task-card-header">
        <div className="ui-task-card-badges">
          <span className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-1 px-2 py-1 small">
            <CategoryIcon category={task.categoria} size={13} />
            <span className="text-uppercase" style={{ fontSize: "11px", fontWeight: 600 }}>
              {task.categoria || "OTRO"}
            </span>
          </span>
          <PriorityBadge peso={task.peso} />
          <StatusBadge status={task.estado} />
          {task.is_recurring && <RecurringBadge />}
          {totalSubtasks > 0 && (
            <button
              type="button"
              className={`ui-task-subtasks-badge ${showChecklist ? "active" : ""} ${
                completedSubtasks === totalSubtasks && totalSubtasks > 0 ? "all-done" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setShowChecklist((prev) => !prev);
              }}
              title={showChecklist ? "Ocultar subtareas" : "Ver subtareas"}
              aria-label={`Subtareas: ${completedSubtasks} de ${totalSubtasks} completadas`}
              aria-expanded={showChecklist}
            >
              <LuListChecks size={13} aria-hidden="true" />
              <span>
                {completedSubtasks}/{totalSubtasks}
              </span>
            </button>
          )}

          {/* Badge de Notas y Comentarios */}
          <button
            type="button"
            className={`ui-task-comments-badge ${showComments ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowComments((prev) => !prev);
            }}
            title={showComments ? "Ocultar notas" : "Ver notas y comentarios"}
            aria-label="Notas y comentarios de la tarea"
            aria-expanded={showComments}
          >
            <LuMessageSquare size={13} aria-hidden="true" />
            <span>Notas</span>
          </button>

          {/* Badge compacto de Adjuntos y Evidencias */}
          <button
            type="button"
            className={`ui-task-attachments-badge ${showAttachments ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowAttachments((prev) => !prev);
            }}
            title={showAttachments ? "Ocultar adjuntos" : "Ver adjuntos y evidencias fotográficas"}
            aria-label="Adjuntos y evidencias de la tarea"
            aria-expanded={showAttachments}
          >
            <LuPaperclip size={13} aria-hidden="true" />
            <span>
              {attachmentsCount !== undefined && attachmentsCount > 0
                ? `📎 ${attachmentsCount}`
                : "Adjuntos"}
            </span>
          </button>
        </div>

        {(onEdit || onDelete) && (
          <div className="ui-task-actions-dropdown" ref={menuRef}>
            <button
              type="button"
              className="ui-task-menu-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              aria-label="Acciones de la tarea"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <LuEllipsisVertical size={16} aria-hidden="true" />
            </button>

            {menuOpen && (
              <div className="ui-task-menu-menu" role="menu">
                <button
                  type="button"
                  className="ui-task-menu-item"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setShowChecklist((prev) => !prev);
                  }}
                  disabled={isDeleting || isCompleting}
                >
                  <LuListChecks size={14} aria-hidden="true" />
                  <span>{showChecklist ? "Ocultar subtareas" : "Subtareas"}</span>
                </button>
                <button
                  type="button"
                  className="ui-task-menu-item"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setShowComments((prev) => !prev);
                  }}
                  disabled={isDeleting || isCompleting}
                >
                  <LuMessageSquare size={14} aria-hidden="true" />
                  <span>{showComments ? "Ocultar notas" : "Notas y Comentarios"}</span>
                </button>
                <button
                  type="button"
                  className="ui-task-menu-item"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setShowAttachments((prev) => !prev);
                  }}
                  disabled={isDeleting || isCompleting}
                >
                  <LuPaperclip size={14} aria-hidden="true" />
                  <span>{showAttachments ? "Ocultar adjuntos" : "Adjuntos y Evidencias"}</span>
                </button>
                {onEdit && (
                  <button
                    type="button"
                    className="ui-task-menu-item"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onEdit(task);
                    }}
                    disabled={isDeleting || isCompleting}
                  >
                    <LuPencil size={14} aria-hidden="true" />
                    <span>Editar</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="ui-task-menu-item danger"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(task);
                    }}
                    disabled={isDeleting || isCompleting}
                  >
                    <LuTrash2 size={14} aria-hidden="true" />
                    <span>{isDeleting ? "Eliminando..." : "Eliminar"}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fila principal: Checkbox circular interactivo + Título */}
      <div className="ui-task-main-row">
        <button
          type="button"
          className={`ui-task-checkbox ${isDone ? "checked" : ""}`}
          onClick={handleToggleComplete}
          disabled={isCompleting || isDeleting}
          aria-label={isDone ? `Desmarcar tarea ${task.titulo}` : `Completar tarea ${task.titulo}`}
          title={isDone ? "Tarea completada" : "Completar tarea"}
        >
          {isCompleting ? (
            <LuLoaderCircle size={14} className="ui-btn-spinner" aria-hidden="true" />
          ) : isDone ? (
            <LuCircleCheck size={18} aria-hidden="true" />
          ) : (
            <LuCheck size={12} aria-hidden="true" />
          )}
        </button>

        <h4 className="ui-task-title">{task.titulo}</h4>
      </div>

      {/* Descripción opcional */}
      {task.descripcion && (
        <p className="ui-task-desc" title={task.descripcion}>
          {task.descripcion}
        </p>
      )}

      {/* Checklist desplegable integrado */}
      {showChecklist && (
        <div
          className="ui-task-checklist-wrapper mb-2"
          onClick={(e) => e.stopPropagation()}
        >
          <TaskChecklist
            taskId={task.id}
            initialSubtasks={subtasks.length > 0 ? subtasks : undefined}
            onSubtasksChange={(updated) => setSubtasks(updated)}
          />
        </div>
      )}

      {/* Sección de notas y comentarios integrada */}
      {showComments && (
        <div
          className="ui-task-comments-wrapper mb-2 p-2 rounded border bg-surface shadow-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <TaskCommentsSection taskId={task.id} />
        </div>
      )}

      {/* Sección de adjuntos y evidencias integrada */}
      {showAttachments && (
        <div
          className="ui-task-attachments-wrapper mb-2 p-2 rounded border bg-surface shadow-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <TaskAttachmentsSection
            taskId={task.id}
            onAttachmentsCountChange={(count) => setAttachmentsCount(count)}
          />
        </div>
      )}

      {/* Footer meta: Fecha de vencimiento y Tags */}
      <div className="ui-task-meta-footer">
        {task.due_date ? (
          <div className="ui-task-due-date" title={`Fecha de vencimiento: ${task.due_date}`}>
            <LuCalendar size={13} aria-hidden="true" />
            <span>{task.due_date}</span>
          </div>
        ) : (
          <span />
        )}

        {task.tags && task.tags.length > 0 && (
          <div className="ui-task-tags">
            {task.tags.map((tag) => (
              <span key={tag.id} className="ui-task-tag">
                #{tag.nombre}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Botón Avanzar Rutina — solo visible en tareas recurrentes no completadas */}
      {task.is_recurring && onAdvance && task.estado !== "DONE" && (
        <div className="ui-task-advance-row">
          <button
            type="button"
            className="btn-retro btn-retro-outline btn-sm"
            onClick={async () => {
              setIsAdvancing(true);
              try {
                await onAdvance(task.id);
              } finally {
                setIsAdvancing(false);
              }
            }}
            disabled={isAdvancing || isCompleting || isDeleting}
            title="Completar esta ocurrencia y generar la siguiente"
          >
            <span>{isAdvancing ? "⏳" : "🔄"}</span>
            <span className="ms-1">
              {isAdvancing ? "Avanzando..." : "Avanzar"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskCard;
