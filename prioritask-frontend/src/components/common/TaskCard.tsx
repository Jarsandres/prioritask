import type { Task } from "../../types/task";
import { PriorityBadge, StatusBadge, RecurringBadge, getCategoryIcon } from "./Badges";

export interface TaskCardProps {
  task: Task;
  onComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  isCompleting?: boolean;
  isDeleting?: boolean;
  className?: string;
}

export const TaskCard = ({
  task,
  onComplete,
  onEdit,
  onDelete,
  isCompleting = false,
  isDeleting = false,
  className = "",
}: TaskCardProps) => {
  const isDone = task.estado === "DONE";

  return (
    <div
      className={`retro-window retro-task-card ${isDone ? "task-done" : ""} ${className}`.trim()}
    >
      {/* Header de ventana retro con categoría y controles decorativos */}
      <div className="retro-window-header">
        <div className="d-flex align-items-center gap-2 text-truncate pe-2">
          <span role="img" aria-label={task.categoria}>
            {getCategoryIcon(task.categoria)}
          </span>
          <span className="text-uppercase fw-bold small text-truncate">
            {task.categoria || "OTRO"}
          </span>
        </div>
        <div className="retro-window-controls flex-shrink-0" aria-hidden="true">
          <span className="retro-window-btn">─</span>
          <span className="retro-window-btn">□</span>
          <span className="retro-window-btn">✕</span>
        </div>
      </div>

      <div className="retro-window-body">
        {/* Badges de prioridad y estado */}
        <div className="d-flex flex-wrap gap-2 mb-2 align-items-center">
          <PriorityBadge peso={task.peso} />
          <StatusBadge status={task.estado} />
          {task.is_recurring && <RecurringBadge />}
        </div>

        {/* Título de tarea */}
        <h5 className="retro-task-title fw-bold mb-2 text-break">
          {task.titulo}
        </h5>

        {/* Descripción si existe */}
        {task.descripcion && (
          <p
            className="text-muted small mb-2 text-break"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {task.descripcion}
          </p>
        )}

        {/* Fecha de vencimiento si existe */}
        {task.due_date && (
          <div className="small text-muted mb-2 d-flex align-items-center gap-1">
            <span>📅</span>
            <span>Vence: {task.due_date}</span>
          </div>
        )}

        {/* Tags con estilo retro hashtag */}
        {task.tags && task.tags.length > 0 && (
          <div className="retro-tags-container mb-3">
            {task.tags.map((tag) => (
              <span key={tag.id} className="retro-tag">
                #{tag.nombre}
              </span>
            ))}
          </div>
        )}

        {/* Zona Táctil del Pulgar (Thumb Zone) */}
        <div className="retro-task-actions">
          {!isDone && onComplete && (
            <button
              type="button"
              className="btn-retro btn-retro-success w-100 mb-2 py-2 d-flex align-items-center justify-content-center gap-2"
              style={{ minHeight: "44px" }}
              onClick={() => onComplete(task.id)}
              disabled={isCompleting || isDeleting}
              aria-label={`Completar tarea ${task.titulo}`}
            >
              <span>{isCompleting ? "⏳" : "✅"}</span>
              <span>
                {isCompleting ? "Completando..." : "Completar Tarea"}
              </span>
            </button>
          )}

          {(onEdit || onDelete) && (
            <div className="d-flex gap-2">
              {onEdit && (
                <button
                  type="button"
                  className="btn-retro btn-retro-outline flex-fill py-2 d-flex align-items-center justify-content-center gap-1"
                  style={{ minHeight: "40px" }}
                  onClick={() => onEdit(task)}
                  disabled={isDeleting || isCompleting}
                >
                  <span>✏️</span>
                  <span>Editar</span>
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="btn-retro btn-retro-danger flex-fill py-2 d-flex align-items-center justify-content-center gap-1"
                  style={{ minHeight: "40px" }}
                  onClick={() => onDelete(task)}
                  disabled={isDeleting || isCompleting}
                >
                  <span>🗑️</span>
                  <span>{isDeleting ? "Eliminando..." : "Eliminar"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
