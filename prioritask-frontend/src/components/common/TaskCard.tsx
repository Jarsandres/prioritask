import React, { useState, useRef, useEffect, memo } from "react";
import type { Task, Subtask } from "../../types/task";
import { useTheme } from "../../context/ThemeContext";
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
  KUDOS_OPTIONS,
  getTaskKudos,
  toggleTaskKudo,
  getMemberInitials,
  type KudosEmoji,
  type QuickAssignee,
} from "../../utils/kudosStore";
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
  LuUserPlus,
  LuAward,
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
  assignedMembers?: QuickAssignee[];
  onAssignMember?: (taskId: string, member: QuickAssignee) => void | Promise<void>;
  activeAssigneeForClick?: QuickAssignee | null;
  onKudosReaction?: (taskId: string, emoji: KudosEmoji, deltaPoints: number) => void;
}

const TaskCardComponent = ({
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
  assignedMembers = [],
  onAssignMember,
  activeAssigneeForClick = null,
  onKudosReaction,
}: TaskCardProps) => {
  const { density } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentsCount, setAttachmentsCount] = useState<number | undefined>(task.attachments_count);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? []);
  const [isMemberDragOver, setIsMemberDragOver] = useState(false);
  const [kudosState, setKudosState] = useState(() => getTaskKudos(task.id));
  const menuRef = useRef<HTMLDivElement>(null);
  const isDone = task.estado === "DONE";

  // Control táctil para gestos Swipe en dispositivos móviles
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    setKudosState(getTaskKudos(task.id));
    const handleSync = () => setKudosState(getTaskKudos(task.id));
    window.addEventListener("prioritask:kudos-updated", handleSync);
    return () => window.removeEventListener("prioritask:kudos-updated", handleSync);
  }, [task.id]);

  useEffect(() => {
    if (task.subtasks) {
      setSubtasks(task.subtasks);
    }
  }, [task.subtasks]);

  useEffect(() => {
    setAttachmentsCount(task.attachments_count);
  }, [task.attachments_count]);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    // Solo activar swipe si no estamos interactuando con controles expandidos
    if (showChecklist || showComments || showAttachments || menuOpen) return;
    setTouchStartX(e.touches[0].clientX);
    setTouchCurrentX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    setTouchCurrentX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX !== null && touchCurrentX !== null) {
      const deltaX = touchCurrentX - touchStartX;

      // Swipe hacia la derecha -> Completar/Alternar
      if (deltaX > 75 && onComplete && !isCompleting && !isDeleting) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
        onComplete(task.id);
      }
      // Swipe hacia la izquierda -> Eliminar
      else if (deltaX < -75 && onDelete && !isDeleting && !isCompleting) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
        onDelete(task);
      }
    }

    setTouchStartX(null);
    setTouchCurrentX(null);
    setIsSwiping(false);
  };

  const swipeOffset = touchStartX !== null && touchCurrentX !== null ? touchCurrentX - touchStartX : 0;
  const clampedOffset = Math.max(-100, Math.min(100, swipeOffset));

  const priorityRingClass =
    task.peso >= 4
      ? "priority-ring-p1"
      : task.peso === 3
      ? "priority-ring-p2"
      : task.peso === 2
      ? "priority-ring-p3"
      : "priority-ring-p4";

  const priorityCardClass =
    task.peso >= 4
      ? "priority-card-p1"
      : task.peso === 3
      ? "priority-card-p2"
      : task.peso === 2
      ? "priority-card-p3"
      : "priority-card-p4";

  const todayIso = new Date().toISOString().slice(0, 10);
  const dueDateNormalized = task.due_date ? String(task.due_date).slice(0, 10) : "";
  const dueStatusClass =
    !dueDateNormalized || isDone
      ? ""
      : dueDateNormalized < todayIso
      ? "due-overdue"
      : dueDateNormalized === todayIso
      ? "due-today"
      : "due-upcoming";

  const handleMemberDragOver = (e: React.DragEvent) => {
    if (!onAssignMember) return;
    if (e.dataTransfer.types.includes("application/x-prioritask-member")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setIsMemberDragOver(true);
    }
  };

  const handleMemberDragLeave = () => {
    if (isMemberDragOver) {
      setIsMemberDragOver(false);
    }
  };

  const handleMemberDrop = (e: React.DragEvent) => {
    if (!onAssignMember) return;
    const rawMember = e.dataTransfer.getData("application/x-prioritask-member");
    if (!rawMember) return;
    e.preventDefault();
    e.stopPropagation();
    setIsMemberDragOver(false);
    try {
      const parsed = JSON.parse(rawMember) as QuickAssignee;
      if (parsed && parsed.userId) {
        onAssignMember(task.id, parsed);
      }
    } catch {
      // Ignorar payload inválido
    }
  };

  return (
    <div
      className={`ui-task-card ${priorityCardClass} ${isDone ? "task-done" : ""} ${
        isMemberDragOver ? "is-member-drop-target" : ""
      } ${className}`.trim()}
      draggable={draggable && !showChecklist}
      onDragStart={onDragStart}
      onDragOver={handleMemberDragOver}
      onDragLeave={handleMemberDragLeave}
      onDrop={handleMemberDrop}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: isSwiping && Math.abs(clampedOffset) > 10 ? `translateX(${clampedOffset}px)` : undefined,
        transition: isSwiping ? "none" : "transform 0.2s ease, box-shadow 0.15s ease",
        borderColor:
          clampedOffset > 40
            ? "var(--success-500)"
            : clampedOffset < -40
            ? "var(--danger-500)"
            : undefined,
      }}
      data-testid={`task-card-${task.id}`}
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
          className={`ui-task-checkbox ${priorityRingClass} ${isDone ? "checked" : ""}`.trim()}
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

        <h4
          className="ui-task-title"
          onClick={() => onEdit?.(task)}
          onKeyDown={(e) => {
            if (onEdit && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onEdit(task);
            }
          }}
          role={onEdit ? "button" : undefined}
          tabIndex={onEdit ? 0 : undefined}
          style={{ cursor: onEdit ? "pointer" : undefined }}
        >
          {task.titulo}
        </h4>
      </div>

      {/* Descripción opcional */}
      {task.descripcion && (
        <p className="ui-task-desc" title={task.descripcion}>
          {task.descripcion}
        </p>
      )}

      {/* Previsualización Bento de Subtareas en Densidad Cómoda ("cozy") */}
      {density === "cozy" && subtasks.length > 0 && !showChecklist && (
        <div
          className="bento-cozy-subtasks-preview mb-2"
          data-testid="bento-cozy-subtasks-preview"
        >
          {subtasks.slice(0, 3).map((st) => (
            <div
              key={st.id}
              className="d-flex align-items-center gap-2 small text-muted py-0.5"
            >
              <span
                style={{
                  color: st.completada
                    ? "var(--success-500)"
                    : "var(--text-subtle)",
                  fontSize: "11px",
                }}
              >
                {st.completada ? "✓" : "○"}
              </span>
              <span
                className={st.completada ? "text-decoration-line-through" : ""}
                style={{ fontSize: "12px" }}
              >
                {st.titulo}
              </span>
            </div>
          ))}
          {subtasks.length > 3 && (
            <span className="text-muted" style={{ fontSize: "11px" }}>
              +{subtasks.length - 3} subtarea(s) más...
            </span>
          )}
        </div>
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

      {/* Footer meta: Fecha de vencimiento, Avatares de Convivientes y Tags */}
      <div className="ui-task-meta-footer">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {task.due_date ? (
            <div
              className={`ui-task-due-date ${dueStatusClass}`.trim()}
              title={`Fecha de vencimiento: ${task.due_date}`}
            >
              <LuCalendar size={13} aria-hidden="true" />
              <span>{task.due_date}</span>
            </div>
          ) : null}

          {assignedMembers.length > 0 && (
            <div
              className="ui-task-assignees-group"
              data-testid={`task-assignees-${task.id}`}
            >
              {assignedMembers.map((member) => (
                <button
                  key={member.userId}
                  type="button"
                  className="ui-task-assignee-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignMember?.(task.id, member);
                  }}
                  title={`Asignada a ${member.label} (clic para quitar)`}
                  aria-label={`Quitar asignación de ${member.label}`}
                >
                  <span className="ui-task-assignee-initials">
                    {getMemberInitials(member.label)}
                  </span>
                  <span className="ui-task-assignee-name">{member.label}</span>
                </button>
              ))}
            </div>
          )}

          {activeAssigneeForClick && onAssignMember && (
            <button
              type="button"
              className="ui-task-quick-assign-btn"
              onClick={(e) => {
                e.stopPropagation();
                onAssignMember(task.id, activeAssigneeForClick);
              }}
              data-testid={`quick-assign-btn-${task.id}`}
              title={`Vincular o desvincular a ${activeAssigneeForClick.label}`}
            >
              <LuUserPlus size={12} />
              <span>
                {assignedMembers.some((m) => m.userId === activeAssigneeForClick.userId)
                  ? `Quitar ${activeAssigneeForClick.label}`
                  : `Asignar a ${activeAssigneeForClick.label}`}
              </span>
            </button>
          )}
        </div>

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

      {/* Barra de Reconocimiento Rápido ("Kudos": 👏, 🔥, ❤️) en tareas completadas */}
      {isDone && (
        <div
          className="ui-task-kudos-bar"
          onClick={(e) => e.stopPropagation()}
          data-testid={`task-kudos-bar-${task.id}`}
        >
          <span className="ui-task-kudos-label">
            <LuAward size={13} className="text-warning" />
            <span>
              {task.peso >= 4 || (attachmentsCount ?? 0) > 0
                ? "¡Gran esfuerzo! Reconocer:"
                : "Kudos:"}
            </span>
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
                      task.peso,
                      (attachmentsCount ?? 0) > 0
                    );
                    setKudosState(res.state);
                    onKudosReaction?.(task.id, opt.emoji, res.deltaPoints);
                  }}
                  title={`${opt.label} (${
                    task.peso >= 4 || (attachmentsCount ?? 0) > 0
                      ? `+${opt.basePoints * 2} pts`
                      : `+${opt.basePoints} pts`
                  })`}
                  aria-label={`Reaccionar con ${opt.emoji} ${opt.label}`}
                  aria-pressed={isReacted}
                  data-testid={`kudos-btn-${opt.code}-${task.id}`}
                >
                  <span>{opt.emoji}</span>
                  {count > 0 && <span className="ui-task-kudos-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

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

// Memoización atómica para evitar re-renderizados innecesarios de tarjetas en listas grandes
export const TaskCard = memo(TaskCardComponent);
export default TaskCard;
