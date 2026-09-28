import { useState } from "react";
import type { Task, TaskStatus } from "../../types/task";
import TaskCard from "../common/TaskCard";
import "./tasks.css";

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
          <div
            key={column.status}
            className={`kanban-column ${isOver ? "is-drag-over" : ""}`}
            onDragOver={(e) => handleDragOver(e, column.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.status)}
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
            <div className="kanban-column-content">
              {columnTasks.length === 0 ? (
                <div className="kanban-empty-drop">
                  Arrastra tareas aquí o usa las acciones rápidas
                </div>
              ) : (
                columnTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`kanban-card-wrapper ${
                      draggedTaskId === task.id ? "is-dragging" : ""
                    }`}
                  >
                    <TaskCard
                      task={task}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, task.id)}
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
                      {column.status === "TODO" && (
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

                      {column.status === "IN_PROGRESS" && (
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

                      {column.status === "DONE" && (
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
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TaskKanbanBoard;
