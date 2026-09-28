import { LuLayoutGrid, LuList, LuKanban } from "react-icons/lu";

export type TaskViewMode = "grid" | "list" | "kanban";

export interface TaskViewSwitcherProps {
  currentMode: TaskViewMode;
  onChangeMode: (mode: TaskViewMode) => void;
  className?: string;
}

export const TaskViewSwitcher = ({
  currentMode,
  onChangeMode,
  className = "",
}: TaskViewSwitcherProps) => {
  return (
    <div
      className={`task-view-switcher ${className}`.trim()}
      role="group"
      aria-label="Selector de vista de tareas"
    >
      <button
        type="button"
        className={`view-switcher-btn ${currentMode === "grid" ? "active" : ""}`}
        onClick={() => onChangeMode("grid")}
        title="Vista en cuadrícula"
        aria-pressed={currentMode === "grid"}
      >
        <LuLayoutGrid size={16} aria-hidden="true" />
        <span className="view-switcher-label">Cuadrícula</span>
      </button>

      <button
        type="button"
        className={`view-switcher-btn ${currentMode === "list" ? "active" : ""}`}
        onClick={() => onChangeMode("list")}
        title="Vista en lista compacta"
        aria-pressed={currentMode === "list"}
      >
        <LuList size={16} aria-hidden="true" />
        <span className="view-switcher-label">Lista</span>
      </button>

      <button
        type="button"
        className={`view-switcher-btn ${currentMode === "kanban" ? "active" : ""}`}
        onClick={() => onChangeMode("kanban")}
        title="Vista en tablero Kanban"
        aria-pressed={currentMode === "kanban"}
      >
        <LuKanban size={16} aria-hidden="true" />
        <span className="view-switcher-label">Kanban</span>
      </button>
    </div>
  );
};

export default TaskViewSwitcher;
