import React, { useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Task, TaskStatus } from "../../types/task";
import TaskCard from "../common/TaskCard";
import "./tasks.css";

export const VIRTUALIZATION_THRESHOLD = 40;

export interface TaskKanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  completingId?: string | null;
  deletingId?: string | null;
  className?: string;
}

interface KanbanColumnConfig {
  status: TaskStatus;
  title: string;
  dotClass: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  { status: "TODO", title: "Por Hacer", dotClass: "kanban-dot-todo" },
  { status: "IN_PROGRESS", title: "En Progreso", dotClass: "kanban-dot-in-progress" },
  { status: "DONE", title: "Completadas", dotClass: "kanban-dot-done" },
];

interface KanbanCardItemProps {
  task: Task;
  columnStatus: TaskStatus;
  draggedTaskId: string | null;
  completingId?: string | null;
  deletingId?: string | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

const KanbanCardItem = ({
  task,
  columnStatus,
  draggedTaskId,
  completingId,
  deletingId,
  onDragStart,
  onStatusChange,
  onEdit,
  onDelete,
}: KanbanCardItemProps) => {
  return (
    <div
      className={`kanban-card-wrapper ${
        draggedTaskId === task.id ? "is-dragging" : ""
      }`}
      data-testid={`kanban-card-${task.id}`}
    >
      <TaskCard
        task={task}
        draggable={true}
        onDragStart={(e) => onDragStart(e, task.id)}
        onComplete={() =>
          onStatusChange(
            task.id,
            task.estado === "DONE" ? "TODO" : "DONE"
          )
        }
        onEdit={onEdit}
        onDelete={onDelete}
        isCompleting={completingId === task.id}
        isDeleting={deletingId === task.id}
      />

      {/* Botones de acción rápida para pantallas táctiles y móviles */}
      <div className="kanban-quick-actions">
        {columnStatus === "TODO" && (
          <>
            <button
              type="button"
              className="kanban-move-btn"
              onClick={() => onStatusChange(task.id, "IN_PROGRESS")}
              title="Mover a En progreso"
            >
              ➔ En progreso
            </button>
            <button
              type="button"
              className="kanban-move-btn"
              onClick={() => onStatusChange(task.id, "DONE")}
              title="Marcar como completada"
            >
              ✓ Completar
            </button>
          </>
        )}

        {columnStatus === "IN_PROGRESS" && (
          <>
            <button
              type="button"
              className="kanban-move-btn"
              onClick={() => onStatusChange(task.id, "TODO")}
              title="Regresar a Por hacer"
            >
              ⬅ Por hacer
            </button>
            <button
              type="button"
              className="kanban-move-btn"
              onClick={() => onStatusChange(task.id, "DONE")}
              title="Marcar como completada"
            >
              ✓ Completar
            </button>
          </>
        )}

        {columnStatus === "DONE" && (
          <button
            type="button"
            className="kanban-move-btn"
            onClick={() => onStatusChange(task.id, "TODO")}
            title="Reabrir tarea"
          >
            ↺ Reabrir
          </button>
        )}
      </div>
    </div>
  );
};

interface KanbanColumnProps {
  column: KanbanColumnConfig;
  columnTasks: Task[];
  isOver: boolean;
  draggedTaskId: string | null;
  completingId?: string | null;
  deletingId?: string | null;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragOver: (e: React.DragEvent, columnStatus: TaskStatus) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetStatus: TaskStatus) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

const KanbanColumn = ({
  column,
  columnTasks,
  isOver,
  draggedTaskId,
  completingId,
  deletingId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onStatusChange,
  onEdit,
  onDelete,
}: KanbanColumnProps) => {
  const isVirtualized = columnTasks.length > VIRTUALIZATION_THRESHOLD;
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: isVirtualized ? columnTasks.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 160,
    overscan: 5,
  });

  return (
    <div
      className={`kanban-column ${isOver ? "is-drag-over" : ""}`}
      onDragOver={(e) => onDragOver(e, column.status)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column.status)}
      data-testid={`kanban-column-${column.status}`}
    >
      {/* Header de Columna */}
      <div className="kanban-column-header">
        <div className="kanban-column-title">
          <span className={`kanban-dot ${column.dotClass}`} />
          <span>{column.title}</span>
        </div>
        <span className="kanban-column-count">{columnTasks.length}</span>
      </div>

      {/* Contenido de Tarjetas en Columna */}
      {columnTasks.length === 0 ? (
        <div className="kanban-column-content">
          <div className="kanban-empty-drop">
            Arrastra tareas aquí o usa las acciones rápidas
          </div>
        </div>
      ) : isVirtualized ? (
        <div
          ref={parentRef}
          className="kanban-column-content kanban-column-virtualized"
          data-testid={`kanban-virtualized-${column.status}`}
          style={{
            overflowY: "auto",
            position: "relative",
          }}
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const task = columnTasks[virtualItem.index];
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
                    paddingBottom: "12px",
                  }}
                >
                  <KanbanCardItem
                    task={task}
                    columnStatus={column.status}
                    draggedTaskId={draggedTaskId}
                    completingId={completingId}
                    deletingId={deletingId}
                    onDragStart={onDragStart}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="kanban-column-content">
          {columnTasks.map((task) => (
            <KanbanCardItem
              key={task.id}
              task={task}
              columnStatus={column.status}
              draggedTaskId={draggedTaskId}
              completingId={completingId}
              deletingId={deletingId}
              onDragStart={onDragStart}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TaskKanbanBoard = ({
  tasks,
  onStatusChange,
  onEdit,
  onDelete,
  completingId,
  deletingId,
  className = "",
}: TaskKanbanBoardProps) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeDropColumn, setActiveDropColumn] = useState<TaskStatus | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, columnStatus: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (activeDropColumn !== columnStatus) {
      setActiveDropColumn(columnStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setActiveDropColumn(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.estado !== targetStatus) {
      await onStatusChange(taskId, targetStatus);
    }
  };

  return (
    <div className={`kanban-board ${className}`.trim()}>
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((t) => t.estado === column.status);
        const isOver = activeDropColumn === column.status;

        return (
          <KanbanColumn
            key={column.status}
            column={column}
            columnTasks={columnTasks}
            isOver={isOver}
            draggedTaskId={draggedTaskId}
            completingId={completingId}
            deletingId={deletingId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
};

export default TaskKanbanBoard;
