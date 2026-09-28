import { useState, useRef, useEffect } from "react";
import type { Task } from "../../types/task";
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
} from "react-icons/lu";
import "../tasks/tasks.css";

export interface TaskCardProps {
  task: Task;
  onComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
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
  isCompleting = false,
  isDeleting = false,
  className = "",
  draggable = false,
  onDragStart,
}: TaskCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDone = task.estado === "DONE";

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
      draggable={draggable}
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
    </div>
  );
};

export default TaskCard;
