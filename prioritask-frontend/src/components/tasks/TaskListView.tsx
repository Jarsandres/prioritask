import { useState, useRef, useCallback, useMemo, type DragEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  LuChevronDown,
  LuChevronRight,
  LuPencil,
  LuTrash2,
  LuCheck,
  LuX,
} from "react-icons/lu";
import type { Task } from "../../types/task";
import { useTheme } from "../../context/ThemeContext";
import type { QuickAssignee } from "../../utils/kudosStore";
import type {
  FocusNavigationDirection,
  TaskMutationKind,
  TaskPriorityLevel,
  SnoozePresetKey,
} from "../../hooks/useTasksState";
import type { TaskGroupSection } from "../../utils/taskGroupingAndSorting";
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
  onSelectRange?: (taskId: string) => void;
  onSnoozeTask?: (
    taskId: string,
    preset: SnoozePresetKey,
    customDate?: string
  ) => void | Promise<void>;
  className?: string;
  assigneesMap?: Record<string, QuickAssignee[]>;
  onAssignMember?: (taskId: string, member: QuickAssignee) => void | Promise<void>;
  activeAssigneeForClick?: QuickAssignee | null;
  /** Secciones dinámicas cuando Group By está activo (`groupBy !== "none"`) */
  groups?: TaskGroupSection[];
  collapsedGroupIds?: string[];
  onToggleCollapseGroup?: (groupId: string) => void;
  onDropTaskInGroup?: (taskId: string, group: TaskGroupSection) => void;
  onReorderTasks?: (
    sourceTaskId: string,
    targetTaskId: string,
    position?: "before" | "after"
  ) => void;
  onMoveTaskOrder?: (taskId: string, direction: "up" | "down") => void;
  onRenameCustomSection?: (sectionId: string, nextName: string) => void;
  onDeleteCustomSection?: (sectionId: string) => void;
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
  onSelectRange,
  onSnoozeTask,
  className = "",
  assigneesMap,
  onAssignMember,
  activeAssigneeForClick,
  groups,
  collapsedGroupIds: controlledCollapsedGroupIds,
  onToggleCollapseGroup,
  onDropTaskInGroup,
  onReorderTasks,
  onMoveTaskOrder,
  onRenameCustomSection,
  onDeleteCustomSection,
}: TaskListViewProps) => {
  const { density } = useTheme();
  const hasGroups = Boolean(groups && groups.length > 0);
  const isVirtualized = !hasGroups && tasks.length > VIRTUALIZATION_THRESHOLD;
  const parentRef = useRef<HTMLDivElement>(null);
  const draggedTaskIdRef = useRef<string | null>(null);

  const [internalFocusedId, setInternalFocusedId] = useState<string | null>(
    () => tasks[0]?.id ?? null
  );
  const [internalCollapsedIds, setInternalCollapsedIds] = useState<string[]>([]);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState<string>("");

  const effectiveCollapsedIds = useMemo(
    () =>
      controlledCollapsedGroupIds !== undefined
        ? controlledCollapsedGroupIds
        : internalCollapsedIds,
    [controlledCollapsedGroupIds, internalCollapsedIds]
  );

  // Lista plana de tareas actualmente visibles (excluyendo grupos colapsados) para navegación por teclado
  const navigableTasks = useMemo(() => {
    if (!hasGroups || !groups) return tasks;
    const list: Task[] = [];
    for (const grp of groups) {
      if (!effectiveCollapsedIds.includes(grp.id)) {
        list.push(...grp.tasks);
      }
    }
    return list;
  }, [hasGroups, groups, effectiveCollapsedIds, tasks]);

  const activeFocusedId =
    controlledFocusedTaskId !== undefined
      ? controlledFocusedTaskId
      : internalFocusedId && navigableTasks.some((t) => t.id === internalFocusedId)
      ? internalFocusedId
      : (navigableTasks[0]?.id ?? tasks[0]?.id ?? null);

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
      if (navigableTasks.length === 0) return;

      const currentIndex = navigableTasks.findIndex((t) => t.id === currentTaskId);
      let nextIndex = 0;

      if (direction === "first") {
        nextIndex = 0;
      } else if (direction === "last") {
        nextIndex = navigableTasks.length - 1;
      } else if (currentIndex === -1) {
        nextIndex = direction === "next" ? 0 : navigableTasks.length - 1;
      } else if (direction === "next") {
        nextIndex = Math.min(currentIndex + 1, navigableTasks.length - 1);
      } else {
        nextIndex = Math.max(currentIndex - 1, 0);
      }

      const targetTask = navigableTasks[nextIndex];
      if (!targetTask) return;

      if (isVirtualized) {
        rowVirtualizer.scrollToIndex(nextIndex, { align: "auto" });
      }

      if (onNavigateFocus) {
        onNavigateFocus(direction, currentTaskId);
      } else {
        setInternalFocusedId(targetTask.id);
      }
    },
    [isVirtualized, navigableTasks, onNavigateFocus, rowVirtualizer]
  );

  const handleToggleGroup = useCallback(
    (groupId: string) => {
      if (controlledCollapsedGroupIds === undefined) {
        setInternalCollapsedIds((prev) =>
          prev.includes(groupId)
            ? prev.filter((id) => id !== groupId)
            : [...prev, groupId]
        );
      }
      onToggleCollapseGroup?.(groupId);
    },
    [controlledCollapsedGroupIds, onToggleCollapseGroup]
  );

  const handleRowDragStart = useCallback(
    (taskId: string) => {
      draggedTaskIdRef.current = taskId;
    },
    []
  );

  const handleRowDragOver = useCallback(
    (_taskId: string, e: DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
    },
    []
  );

  const handleRowDrop = useCallback(
    (targetTaskId: string, e: DragEvent<HTMLDivElement>) => {
      const sourceTaskId =
        e.dataTransfer?.getData("application/x-prioritask-task-id") ||
        e.dataTransfer?.getData("text/plain") ||
        draggedTaskIdRef.current;
      draggedTaskIdRef.current = null;
      if (sourceTaskId && sourceTaskId !== targetTaskId && onReorderTasks) {
        onReorderTasks(sourceTaskId, targetTaskId, "before");
      }
    },
    [onReorderTasks]
  );

  const handleGroupDragOver = useCallback(
    (groupId: string, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "move";
      }
      setDragOverGroupId((prev) => (prev === groupId ? prev : groupId));
    },
    []
  );

  const handleGroupDrop = useCallback(
    (group: TaskGroupSection, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragOverGroupId(null);
      const draggedTaskId =
        e.dataTransfer?.getData("application/x-prioritask-task-id") ||
        e.dataTransfer?.getData("text/plain") ||
        draggedTaskIdRef.current;
      draggedTaskIdRef.current = null;
      if (!draggedTaskId) return;
      onDropTaskInGroup?.(draggedTaskId, group);
    },
    [onDropTaskInGroup]
  );

  const isRowDraggable = Boolean(onReorderTasks || onDropTaskInGroup);

  const renderTaskRow = (task: Task) => (
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
      onSelectRange={onSelectRange}
      onSnoozeTask={onSnoozeTask}
      onAssignMember={onAssignMember}
      draggableRow={isRowDraggable}
      onRowDragStart={handleRowDragStart}
      onRowDragOver={handleRowDragOver}
      onRowDrop={handleRowDrop}
      onMoveTaskOrder={onMoveTaskOrder}
    />
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

      {hasGroups && groups ? (
        <div className="task-list-grouped-container" data-testid="task-list-grouped-container">
          {groups.map((group) => {
            const isCollapsed = effectiveCollapsedIds.includes(group.id);
            const isDragOver = dragOverGroupId === group.id;
            const sectionTargetId = group.customSectionId ?? group.id;
            const isEditingThisSection = editingSectionId === group.id;

            return (
              <div
                key={group.id}
                className={`task-group-section ${
                  isDragOver ? "is-group-drag-over" : ""
                }`.trim()}
                data-testid={`task-group-section-${group.id}`}
                onDragOver={(e) => handleGroupDragOver(group.id, e)}
                onDragLeave={() =>
                  setDragOverGroupId((prev) => (prev === group.id ? null : prev))
                }
                onDrop={(e) => handleGroupDrop(group, e)}
              >
                <div
                  className="task-group-section-header"
                  data-testid={`task-group-header-${group.id}`}
                >
                  <button
                    type="button"
                    className="task-group-toggle-btn"
                    onClick={() => handleToggleGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    aria-label={`${
                      isCollapsed ? "Expandir" : "Colapsar"
                    } sección ${group.label}`}
                    data-testid={`task-group-toggle-${group.id}`}
                  >
                    {isCollapsed ? (
                      <LuChevronRight size={16} aria-hidden="true" />
                    ) : (
                      <LuChevronDown size={16} aria-hidden="true" />
                    )}
                    {!isEditingThisSection && (
                      <span className="task-group-title">{group.label}</span>
                    )}
                  </button>

                  {isEditingThisSection && (
                    <form
                      className="d-inline-flex align-items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = editingSectionName.trim();
                        if (trimmed && onRenameCustomSection) {
                          onRenameCustomSection(sectionTargetId, trimmed);
                        }
                        setEditingSectionId(null);
                      }}
                    >
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        style={{ height: "26px", fontSize: "12.5px", width: "170px" }}
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        aria-label={`Nuevo nombre para sección ${group.label}`}
                        data-testid={`rename-section-input-${group.id}`}
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="task-list-action-btn"
                        aria-label="Guardar nombre de sección"
                        data-testid={`rename-section-save-${group.id}`}
                      >
                        <LuCheck size={14} />
                      </button>
                      <button
                        type="button"
                        className="task-list-action-btn"
                        onClick={() => setEditingSectionId(null)}
                        aria-label="Cancelar edición de sección"
                      >
                        <LuX size={14} />
                      </button>
                    </form>
                  )}

                  <span
                    className="task-group-count-badge"
                    title={`${group.completedCount} de ${group.tasks.length} completadas`}
                    data-testid={`task-group-count-${group.id}`}
                  >
                    {group.tasks.length}
                  </span>

                  {group.isCustomSection && (
                    <div className="task-group-custom-actions ms-auto d-inline-flex align-items-center gap-1">
                      {onRenameCustomSection && !isEditingThisSection && (
                        <button
                          type="button"
                          className="task-list-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSectionId(group.id);
                            setEditingSectionName(group.label);
                          }}
                          aria-label={`Renombrar sección ${group.label}`}
                          title="Renombrar sección"
                          data-testid={`rename-section-${group.id}`}
                        >
                          <LuPencil size={13} aria-hidden="true" />
                        </button>
                      )}
                      {onDeleteCustomSection && (
                        <button
                          type="button"
                          className="task-list-action-btn danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustomSection(sectionTargetId);
                          }}
                          aria-label={`Eliminar sección ${group.label}`}
                          title="Eliminar sección (las tareas volverán a General)"
                          data-testid={`delete-section-${group.id}`}
                        >
                          <LuTrash2 size={13} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  <div
                    className="task-list-rows"
                    role="rowgroup"
                    aria-label={`Tareas de ${group.label}`}
                  >
                    {group.tasks.length === 0 ? (
                      <div
                        className="task-group-empty-dropzone"
                        data-testid={`task-group-empty-${group.id}`}
                      >
                        Arrastra tareas a esta sección
                      </div>
                    ) : (
                      group.tasks.map((task) => renderTaskRow(task))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : isVirtualized ? (
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
                  {renderTaskRow(task)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="task-list-rows" role="rowgroup">
          {tasks.map((task) => renderTaskRow(task))}
        </div>
      )}
    </div>
  );
};

export default TaskListView;
