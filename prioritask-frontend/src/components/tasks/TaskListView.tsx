import { useState, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Task } from "../../types/task";
import { useTheme } from "../../context/ThemeContext";
import type { QuickAssignee } from "../../utils/kudosStore";
import type {
  FocusNavigationDirection,
  TaskMutationKind,
  TaskPriorityLevel,
} from "../../hooks/useTasksState";
import TaskItem from "./TaskItem";
import "./tasks.css";

export const VIRTUALIZATION_THRESHOLD = 40;

export interface TaskListViewProps {
  tasks: Task[];
  onComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onAdvance?: (taskId: string) => void | Promise<void>;
  onPriorityChange?: (
    taskId: string,
    nextPeso: number,
    nextLevel: TaskPriorityLevel
  ) => void | Promise<void>;
  completingId?: string | null;
  deletingId?: string | null;
  pendingById?: Record<string, TaskMutationKind>;
  focusedTaskId?: string | null;
  selectedTaskIds?: string[];
  onFocusTask?: (taskId: string) => void;
  onNavigateFocus?: (
    direction: FocusNavigationDirection,
    currentTaskId: string
  ) => string | null | void;
  onToggleSelect?: (taskId: string) => void;
  className?: string;
  assigneesMap?: Record<string, QuickAssignee[]>;
  onAssignMember?: (taskId: string, member: QuickAssignee) => void | Promise<void>;
  activeAssigneeForClick?: QuickAssignee | null;
}

export const TaskListView = ({
  tasks,
  onComplete,
  onEdit,
  onDelete,
  onAdvance,
  onPriorityChange,
  completingId,
  deletingId,
  pendingById,
  focusedTaskId: controlledFocusedTaskId,
  selectedTaskIds = [],
  onFocusTask,
  onNavigateFocus,
  onToggleSelect,
  className = "",
  assigneesMap,
  onAssignMember,
  activeAssigneeForClick,
}: TaskListViewProps) => {
  const { density } = useTheme();
  const isVirtualized = tasks.length > VIRTUALIZATION_THRESHOLD;
  const parentRef = useRef<HTMLDivElement>(null);

  const [internalFocusedId, setInternalFocusedId] = useState<string | null>(
    () => tasks[0]?.id ?? null
  );

  const activeFocusedId =
    controlledFocusedTaskId !== undefined
      ? controlledFocusedTaskId
      : internalFocusedId && tasks.some((t) => t.id === internalFocusedId)
      ? internalFocusedId
      : (tasks[0]?.id ?? null);

  const estimatedRowHeight =
    density === "compact" ? 38 : density === "cozy" ? 72 : 58;

  const rowVirtualizer = useVirtualizer({
    count: isVirtualized ? tasks.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 5,
  });

  const handleFocusTask = useCallback(
    (taskId: string) => {
      if (controlledFocusedTaskId === undefined) {
        setInternalFocusedId(taskId);
      }
      onFocusTask?.(taskId);
    },
    [controlledFocusedTaskId, onFocusTask]
  );

  const handleNavigateFocus = useCallback(
    (direction: FocusNavigationDirection, currentTaskId: string) => {
      if (tasks.length === 0) return;

      const currentIndex = tasks.findIndex((t) => t.id === currentTaskId);
      let nextIndex = 0;

      if (direction === "first") {
        nextIndex = 0;
      } else if (direction === "last") {
        nextIndex = tasks.length - 1;
      } else if (currentIndex === -1) {
        nextIndex = direction === "next" ? 0 : tasks.length - 1;
      } else if (direction === "next") {
        nextIndex = Math.min(currentIndex + 1, tasks.length - 1);
      } else {
        nextIndex = Math.max(currentIndex - 1, 0);
      }

      const targetTask = tasks[nextIndex];
      if (!targetTask) return;

      // Si la lista está virtualizada, asegurar que la fila destino esté montada en el viewport
      if (isVirtualized) {
        rowVirtualizer.scrollToIndex(nextIndex, { align: "auto" });
      }

      if (onNavigateFocus) {
        onNavigateFocus(direction, currentTaskId);
      } else {
        setInternalFocusedId(targetTask.id);
      }
    },
    [isVirtualized, onNavigateFocus, rowVirtualizer, tasks]
  );

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
                  <TaskItem
                    task={task}
                    role="row"
                    rovingTabIndex={true}
                    isFocused={activeFocusedId === task.id}
                    isSelected={selectedTaskIds.includes(task.id)}
                    pendingState={pendingById?.[task.id] ?? null}
                    isCompleting={completingId === task.id}
                    isDeleting={deletingId === task.id}
                    assignedMembers={assigneesMap?.[task.id]}
                    activeAssigneeForClick={activeAssigneeForClick}
                    onToggleComplete={onComplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAdvance={onAdvance}
                    onPriorityChange={onPriorityChange}
                    onFocusTask={handleFocusTask}
                    onNavigateFocus={handleNavigateFocus}
                    onToggleSelect={onToggleSelect}
                    onAssignMember={onAssignMember}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="task-list-rows" role="rowgroup">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              role="row"
              rovingTabIndex={true}
              isFocused={activeFocusedId === task.id}
              isSelected={selectedTaskIds.includes(task.id)}
              pendingState={pendingById?.[task.id] ?? null}
              isCompleting={completingId === task.id}
              isDeleting={deletingId === task.id}
              assignedMembers={assigneesMap?.[task.id]}
              activeAssigneeForClick={activeAssigneeForClick}
              onToggleComplete={onComplete}
              onEdit={onEdit}
              onDelete={onDelete}
              onAdvance={onAdvance}
              onPriorityChange={onPriorityChange}
              onFocusTask={handleFocusTask}
              onNavigateFocus={handleNavigateFocus}
              onToggleSelect={onToggleSelect}
              onAssignMember={onAssignMember}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskListView;

