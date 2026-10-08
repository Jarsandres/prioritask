import React, { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Task } from "../../types/task";
import {
  PriorityBadge,
  StatusBadge,
  RecurringBadge,
  CategoryIcon,
} from "../common/Badges";
import {
  LuCheck,
  LuCircleCheck,
  LuCalendar,
  LuPencil,
  LuTrash2,
  LuLoaderCircle,
  LuListChecks,
} from "react-icons/lu";
import "./tasks.css";

export const VIRTUALIZATION_THRESHOLD = 40;

export interface TaskListViewProps {
  tasks: Task[];
  onComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  completingId?: string | null;
  deletingId?: string | null;
  className?: string;
}

interface TaskListRowProps {
  task: Task;
  onComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  isCompleting: boolean;
  isDeleting: boolean;
}

const TaskListRow = ({
  task,
  onComplete,
  onEdit,
  onDelete,
  isCompleting,
  isDeleting,
}: TaskListRowProps) => {
  const isDone = task.estado === "DONE";

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
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
      if (deltaX > 75 && onComplete && !isCompleting && !isDeleting) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
        onComplete(task.id);
      } else if (deltaX < -75 && onDelete && !isDeleting && !isCompleting) {
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

  const swipeOffset =
    touchStartX !== null && touchCurrentX !== null
      ? touchCurrentX - touchStartX
      : 0;
  const clampedOffset = Math.max(-90, Math.min(90, swipeOffset));

  return (
    <div
      className={`task-list-row ${isDone ? "task-done" : ""}`}
      role="row"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform:
          isSwiping && Math.abs(clampedOffset) > 10
            ? `translateX(${clampedOffset}px)`
            : undefined,
        transition: isSwiping ? "none" : "transform 0.2s ease",
        backgroundColor:
          clampedOffset > 40
            ? "rgba(16, 185, 129, 0.08)"
            : clampedOffset < -40
            ? "rgba(239, 68, 68, 0.08)"
            : undefined,
      }}
      data-testid={`task-list-row-${task.id}`}
    >
      {/* Checkbox circular */}
      <div className="d-flex align-items-center">
        <button
          type="button"
          className={`ui-task-checkbox ${isDone ? "checked" : ""}`}
          onClick={() => onComplete && onComplete(task.id)}
          disabled={isCompleting || isDeleting}
          aria-label={
            isDone ? `Desmarcar ${task.titulo}` : `Completar ${task.titulo}`
          }
          title={isDone ? "Completada" : "Marcar completada"}
        >
          {isCompleting ? (
            <LuLoaderCircle
              size={12}
              className="ui-btn-spinner"
              aria-hidden="true"
            />
          ) : isDone ? (
            <LuCircleCheck size={16} aria-hidden="true" />
          ) : (
            <LuCheck size={11} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Título y descripción */}
      <div className="task-list-title-cell">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="task-list-item-title">{task.titulo}</span>
          {task.is_recurring && <RecurringBadge />}
          {(task.subtasks_count ?? task.subtasks?.length ?? 0) > 0 && (
            <span
              className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-1 px-2 py-0 small"
              style={{ fontSize: "11px", fontWeight: 600 }}
              title={`Subtareas: ${
                task.subtasks_completed_count ??
                task.subtasks?.filter((s) => s.completada).length ??
                0
              }/${task.subtasks_count ?? task.subtasks?.length ?? 0}`}
            >
              <LuListChecks size={12} aria-hidden="true" />
              <span>
                {task.subtasks_completed_count ??
                  task.subtasks?.filter((s) => s.completada).length ??
                  0}
                /{task.subtasks_count ?? task.subtasks?.length ?? 0}
              </span>
            </span>
          )}
        </div>
        {task.descripcion && (
          <span className="task-list-item-desc">{task.descripcion}</span>
        )}
      </div>

      {/* Categoría */}
      <div className="task-list-category-cell">
        <span className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-1 px-2 py-1 small">
          <CategoryIcon category={task.categoria} size={13} />
          <span style={{ fontSize: "11px", fontWeight: 600 }}>
            {task.categoria || "OTRO"}
          </span>
        </span>
      </div>

      {/* Prioridad */}
      <div className="task-list-priority-cell">
        <PriorityBadge peso={task.peso} />
      </div>

      {/* Fecha de vencimiento */}
      <div className="task-list-due-cell">
        {task.due_date ? (
          <span className="text-muted d-flex align-items-center gap-1 small">
            <LuCalendar size={13} aria-hidden="true" />
            <span>{task.due_date}</span>
          </span>
        ) : (
          <span className="text-muted small">—</span>
        )}
      </div>

      {/* Acciones */}
      <div className="task-list-actions">
        <StatusBadge status={task.estado} />
        {onEdit && (
          <button
            type="button"
            className="task-list-action-btn"
            onClick={() => onEdit(task)}
            title="Editar tarea"
            disabled={isDeleting || isCompleting}
          >
            <LuPencil size={15} aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="task-list-action-btn danger"
            onClick={() => onDelete(task)}
            title="Eliminar tarea"
            disabled={isDeleting || isCompleting}
          >
            <LuTrash2 size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export const TaskListView = ({
  tasks,
  onComplete,
  onEdit,
  onDelete,
  completingId,
  deletingId,
  className = "",
}: TaskListViewProps) => {
  const isVirtualized = tasks.length > VIRTUALIZATION_THRESHOLD;
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: isVirtualized ? tasks.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 5,
  });

  return (
    <div className={`task-list-view ${className}`.trim()}>
      <div className="task-list-table-header" role="row">
        <span></span>
        <span>Tarea</span>
        <span className="task-list-category-cell">Categoría</span>
        <span className="task-list-priority-cell">Prioridad</span>
        <span className="task-list-due-cell">Vencimiento</span>
        <span className="text-end">Acciones</span>
      </div>

      {isVirtualized ? (
        <div
          ref={parentRef}
          className="task-list-rows task-list-rows-virtualized"
          role="rowgroup"
          style={{
            maxHeight: "calc(100vh - 280px)",
            overflowY: "auto",
            position: "relative",
          }}
          data-testid="task-list-virtualized-container"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const task = tasks[virtualItem.index];
              if (!task) return null;
              return (
                <div
                  key={task.id}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TaskListRow
                    task={task}
                    onComplete={onComplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isCompleting={completingId === task.id}
                    isDeleting={deletingId === task.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="task-list-rows" role="rowgroup">
          {tasks.map((task) => (
            <TaskListRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onEdit={onEdit}
              onDelete={onDelete}
              isCompleting={completingId === task.id}
              isDeleting={deletingId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskListView;
