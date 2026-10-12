import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
  type DragEvent,
} from "react";
import type { Task } from "../../types/task";
import {
  pesoToPriorityLevel,
  priorityLevelToPeso,
  PRIORITY_LEVEL_METADATA,
  type PriorityLevelMetadata,
  type FocusNavigationDirection,
  type TaskMutationKind,
  type TaskPriorityLevel,
} from "../../hooks/useTasksState";
import {
  getMemberInitials,
  type QuickAssignee,
} from "../../utils/kudosStore";
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
  LuUserPlus,
  LuFlag,
  LuRotateCw,
} from "react-icons/lu";
import "./tasks.css";

export type { PriorityLevelMetadata };

export interface TaskItemProps {
  task: Task;
  /** Rol ARIA del contenedor ("listitem" para listas ul/ol o "row" para tablas/grids virtualizados) */
  role?: "listitem" | "row";
  /** Estado de foco del patrón roving tabindex */
  isFocused?: boolean;
  /** Si se activa rovingTabIndex, solo el ítem enfocado tiene tabIndex=0 y el resto -1 */
  rovingTabIndex?: boolean;
  /** Estado de selección múltiple */
  isSelected?: boolean;
  /** Tipo de mutación optimista en curso */
  pendingState?: TaskMutationKind | null;
  /** Flags explícitos compatibles con TaskListView */
  isCompleting?: boolean;
  isDeleting?: boolean;
  /** Miembros asignados para renderizado de chips rápidos */
  assignedMembers?: QuickAssignee[];
  activeAssigneeForClick?: QuickAssignee | null;
  /** Callbacks de interacción y mutación optimista */
  onToggleComplete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onAdvance?: (taskId: string) => void | Promise<void>;
  onPriorityChange?: (
    taskId: string,
    nextPeso: number,
    nextLevel: TaskPriorityLevel
  ) => void | Promise<void>;
  onFocusTask?: (taskId: string) => void;
  onNavigateFocus?: (direction: FocusNavigationDirection, currentTaskId: string) => void;
  onToggleSelect?: (taskId: string) => void;
  onAssignMember?: (taskId: string, member: QuickAssignee) => void | Promise<void>;
  className?: string;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.matches(
    'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="slider"]'
  );
}

const TaskItemComponent = ({
  task,
  role = "listitem",
  isFocused = false,
  rovingTabIndex = false,
  isSelected = false,
  pendingState = null,
  isCompleting = false,
  isDeleting = false,
  assignedMembers = [],
  activeAssigneeForClick = null,
  onToggleComplete,
  onEdit,
  onDelete,
  onAdvance,
  onPriorityChange,
  onFocusTask,
  onNavigateFocus,
  onToggleSelect,
  onAssignMember,
  className = "",
}: TaskItemProps) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const wasFocusedRef = useRef(isFocused);

  const isDone = task.estado === "DONE" || Boolean(task.completed);
  const effectiveCompleting = isCompleting || pendingState === "completing";
  const effectiveDeleting = isDeleting || pendingState === "deleting";
  const effectiveUpdating = pendingState === "updating";
  const isBusy = effectiveCompleting || effectiveDeleting || effectiveUpdating;

  const priorityLevel = pesoToPriorityLevel(task.peso);
  const priorityMeta = PRIORITY_LEVEL_METADATA[priorityLevel];

  const [isMemberDragOver, setIsMemberDragOver] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);

  // Sincronización de foco DOM para roving tabindex solo cuando `isFocused` transiciona de false -> true
  // y el usuario no está escribiendo en un input externo (evita robo de foco en montajes o filtros).
  useEffect(() => {
    const transitionedToFocused = !wasFocusedRef.current && isFocused;
    wasFocusedRef.current = isFocused;
    if (!transitionedToFocused || !rovingTabIndex) return;
    const node = rowRef.current;
    if (!node) return;
    if (isEditableElement(document.activeElement)) return;
    if (document.activeElement !== node && !node.contains(document.activeElement)) {
      node.focus({ preventScroll: true });
      if (typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }, [isFocused, rovingTabIndex]);

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

  const subtasksTotal = task.subtasks_count ?? task.subtasks?.length ?? 0;
  const subtasksCompleted =
    task.subtasks_completed_count ??
    task.subtasks?.filter((s) => s.completada).length ??
    0;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;

    const innerTarget =
      typeof e.nativeEvent.composedPath === "function"
        ? e.nativeEvent.composedPath()[0] ?? e.target
        : e.target;

    if (isEditableElement(innerTarget)) return;

    // Ignorar combinaciones con Ctrl / Cmd / Alt para no colisionar con atajos del navegador o Command Palette
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 1. Navegación espacial / Roving TabIndex (ArrowDown, ArrowUp, Home, End)
    if (onNavigateFocus) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigateFocus("next", task.id);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigateFocus("prev", task.id);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        onNavigateFocus("first", task.id);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        onNavigateFocus("last", task.id);
        return;
      }
    }

    // Si el foco está dentro de un <button> hijo y el usuario pulsa Enter o Space,
    // dejamos que el botón nativo gestione su propio clic sin duplicar la invocación.
    const isChildButton =
      innerTarget instanceof HTMLElement &&
      innerTarget !== rowRef.current &&
      innerTarget.tagName === "BUTTON";

    // 2. Selección múltiple (Shift+Space o tecla 's') — evaluado antes de Space simple
    if (
      (e.key === "s" || e.key === "S" || (e.key === " " && e.shiftKey)) &&
      !isChildButton
    ) {
      if (onToggleSelect) {
        e.preventDefault();
        onToggleSelect(task.id);
      }
      return;
    }

    // 3. Completar / Desmarcar (Space sin Shift o tecla 'x')
    if (
      ((e.key === " " && !e.shiftKey) || e.key === "x" || e.key === "X") &&
      !isChildButton
    ) {
      if (onToggleComplete && !isBusy) {
        e.preventDefault();
        onToggleComplete(task.id);
      }
      return;
    }

    // 4. Editar / Abrir detalle (Enter o tecla 'e')
    if ((e.key === "Enter" || e.key === "e" || e.key === "E") && !isChildButton) {
      if (onEdit && !effectiveDeleting) {
        e.preventDefault();
        onEdit(task);
      }
      return;
    }

    // 5. Eliminar tarea (Delete o Backspace)
    if (e.key === "Delete" || e.key === "Backspace") {
      if (onDelete && !isBusy) {
        e.preventDefault();
        onDelete(task);
      }
      return;
    }

    // 6. Atajos directos de Prioridad estilo Todoist ('1' -> P1, '2' -> P2, '3' -> P3, '4' -> P4)
    if (
      (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") &&
      onPriorityChange &&
      !isBusy
    ) {
      e.preventDefault();
      const targetLevel = `p${e.key}` as TaskPriorityLevel;
      const nextPeso = priorityLevelToPeso(targetLevel);
      if (nextPeso !== task.peso) {
        onPriorityChange(task.id, nextPeso, targetLevel);
      }
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchCurrentX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (touchStartX === null) return;
    setTouchCurrentX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX !== null && touchCurrentX !== null) {
      const deltaX = touchCurrentX - touchStartX;
      if (deltaX > 75 && onToggleComplete && !isBusy) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(30);
        }
        onToggleComplete(task.id);
      } else if (deltaX < -75 && onDelete && !isBusy) {
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

  const handleMemberDragOver = (e: DragEvent) => {
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

  const handleMemberDrop = (e: DragEvent) => {
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

  const computedTabIndex = rovingTabIndex ? (isFocused ? 0 : -1) : 0;

  return (
    <div
      ref={rowRef}
      role={role}
      tabIndex={computedTabIndex}
      aria-selected={role === "row" ? isSelected : undefined}
      aria-busy={isBusy || undefined}
      aria-label={`${task.titulo} — ${priorityMeta.label}${
        isDone ? " (Completada)" : ""
      }`}
      data-testid={`task-item-${task.id}`}
      data-task-id={task.id}
      data-priority={priorityMeta.level}
      className={`task-list-row ${isDone ? "task-done" : ""} ${
        isFocused ? "task-row-focused" : ""
      } ${isSelected ? "task-row-selected" : ""} ${
        isMemberDragOver ? "is-member-drop-target" : ""
      } ${className}`.trim()}
      onFocus={() => onFocusTask?.(task.id)}
      onKeyDown={handleKeyDown}
      onDragOver={handleMemberDragOver}
      onDragLeave={handleMemberDragLeave}
      onDrop={handleMemberDrop}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform:
          isSwiping && Math.abs(clampedOffset) > 10
            ? `translateX(${clampedOffset}px)`
            : undefined,
        transition: isSwiping ? "none" : "transform 0.2s ease, background-color 0.12s ease",
        backgroundColor:
          clampedOffset > 40
            ? "rgba(16, 185, 129, 0.08)"
            : clampedOffset < -40
            ? "rgba(239, 68, 68, 0.08)"
            : undefined,
      }}
    >
      {/* 1. Checkbox circular con anillo de prioridad Todoist P1..P4 */}
      <div className="d-flex align-items-center">
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-busy={effectiveCompleting || undefined}
          className={`ui-task-checkbox ${priorityMeta.ringClass} ${
            isDone ? "checked" : ""
          }`.trim()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete?.(task.id);
          }}
          disabled={effectiveCompleting || effectiveDeleting}
          aria-label={
            isDone
              ? `Desmarcar ${task.titulo}`
              : `Completar ${task.titulo} (${priorityMeta.shortLabel})`
          }
          title={
            isDone
              ? "Completada (Espacio / X para reabrir)"
              : `Marcar completada (${priorityMeta.shortLabel} · Atajo: Espacio o X)`
          }
          data-testid={`task-item-checkbox-${task.id}`}
        >
          {effectiveCompleting ? (
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

      {/* 2. Celda principal: Título, subtareas, recurrencia, asignados y descripción */}
      <div
        className="task-list-title-cell"
        onClick={() => onEdit?.(task)}
        style={{ cursor: onEdit ? "pointer" : undefined }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="task-list-item-title">{task.titulo}</span>

          {/* Chip compacto P1-P4 accesible (icono + código de prioridad) */}
          <span
            className="badge rounded-pill bg-body-tertiary text-body-secondary border d-inline-flex align-items-center gap-1 px-2 py-0 small"
            style={{ fontSize: "10px", fontWeight: 700 }}
            title={`${priorityMeta.label} — Pulsa ${priorityMeta.shortcutKey} con la tarea enfocada`}
            data-testid={`task-item-p-chip-${task.id}`}
          >
            <LuFlag size={10} aria-hidden="true" />
            <span>{priorityMeta.shortLabel}</span>
          </span>

          {task.is_recurring && <RecurringBadge />}

          {subtasksTotal > 0 && (
            <span
              className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-1 px-2 py-0 small"
              style={{ fontSize: "11px", fontWeight: 600 }}
              title={`Subtareas: ${subtasksCompleted}/${subtasksTotal}`}
              aria-label={`Subtareas completadas: ${subtasksCompleted} de ${subtasksTotal}`}
            >
              <LuListChecks size={12} aria-hidden="true" />
              <span>
                {subtasksCompleted}/{subtasksTotal}
              </span>
            </span>
          )}

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
            >
              <span className="ui-task-assignee-initials">
                {getMemberInitials(member.label)}
              </span>
              <span className="ui-task-assignee-name">{member.label}</span>
            </button>
          ))}

          {activeAssigneeForClick && onAssignMember && (
            <button
              type="button"
              className="ui-task-quick-assign-btn"
              onClick={(e) => {
                e.stopPropagation();
                onAssignMember(task.id, activeAssigneeForClick);
              }}
              data-testid={`list-quick-assign-btn-${task.id}`}
            >
              <LuUserPlus size={11} aria-hidden="true" />
              <span>
                {assignedMembers.some(
                  (m) => m.userId === activeAssigneeForClick.userId
                )
                  ? `Quitar ${activeAssigneeForClick.label}`
                  : `Asignar a ${activeAssigneeForClick.label}`}
              </span>
            </button>
          )}

          {isBusy && (
            <span
              role="status"
              aria-live="polite"
              className="text-muted small d-inline-flex align-items-center gap-1"
              style={{ fontSize: "11px" }}
              data-testid={`task-item-optimistic-status-${task.id}`}
            >
              <LuLoaderCircle size={11} className="ui-btn-spinner" aria-hidden="true" />
              <span>Sincronizando…</span>
            </span>
          )}
        </div>

        {task.descripcion && (
          <span className="task-list-item-desc">{task.descripcion}</span>
        )}
      </div>

      {/* 3. Categoría */}
      <div className="task-list-category-cell">
        <span className="badge rounded-pill bg-light text-dark border d-inline-flex align-items-center gap-1 px-2 py-1 small">
          <CategoryIcon category={task.categoria} size={13} />
          <span style={{ fontSize: "11px", fontWeight: 600 }}>
            {task.categoria || "OTRO"}
          </span>
        </span>
      </div>

      {/* 4. Badge semántico de Prioridad */}
      <div
        className="task-list-priority-cell"
        data-testid={`task-item-priority-badge-${task.id}`}
      >
        <PriorityBadge peso={task.peso} />
      </div>

      {/* 5. Fecha de vencimiento */}
      <div className="task-list-due-cell">
        {task.due_date ? (
          <span
            className={`ui-task-due-date ${dueStatusClass} d-inline-flex align-items-center gap-1 small`.trim()}
          >
            <LuCalendar size={13} aria-hidden="true" />
            <span>{task.due_date}</span>
          </span>
        ) : (
          <span className="text-muted small">—</span>
        )}
      </div>

      {/* 6. Acciones rápidas */}
      <div className="task-list-actions">
        <StatusBadge status={task.estado} />
        {task.is_recurring && onAdvance && !isDone && (
          <button
            type="button"
            className="task-list-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(task.id);
            }}
            aria-label={`Avanzar rutina ${task.titulo}`}
            title="Avanzar rutina al siguiente ciclo"
            disabled={isBusy}
            data-testid={`task-item-advance-btn-${task.id}`}
          >
            <LuRotateCw size={15} aria-hidden="true" />
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            className="task-list-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task);
            }}
            aria-label={`Editar tarea ${task.titulo}`}
            title="Editar tarea"
            disabled={effectiveDeleting || effectiveCompleting}
            data-testid={`task-item-edit-btn-${task.id}`}
          >
            <LuPencil size={15} aria-hidden="true" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="task-list-action-btn danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task);
            }}
            aria-label={`Eliminar tarea ${task.titulo}`}
            title="Eliminar tarea"
            disabled={effectiveDeleting || effectiveCompleting}
            data-testid={`task-item-delete-btn-${task.id}`}
          >
            <LuTrash2 size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

function areTaskItemPropsEqual(prev: TaskItemProps, next: TaskItemProps): boolean {
  const a = prev.task;
  const b = next.task;
  if (
    a.id !== b.id ||
    a.titulo !== b.titulo ||
    a.descripcion !== b.descripcion ||
    a.estado !== b.estado ||
    a.completed !== b.completed ||
    a.categoria !== b.categoria ||
    a.peso !== b.peso ||
    a.due_date !== b.due_date ||
    a.is_recurring !== b.is_recurring ||
    a.subtasks_count !== b.subtasks_count ||
    a.subtasks_completed_count !== b.subtasks_completed_count ||
    a.comments_count !== b.comments_count ||
    a.attachments_count !== b.attachments_count ||
    a.version !== b.version ||
    a.subtasks !== b.subtasks ||
    a.tags !== b.tags ||
    a.recurrence_rule !== b.recurrence_rule
  ) {
    return false;
  }

  return (
    prev.role === next.role &&
    prev.isFocused === next.isFocused &&
    prev.rovingTabIndex === next.rovingTabIndex &&
    prev.isSelected === next.isSelected &&
    prev.pendingState === next.pendingState &&
    prev.isCompleting === next.isCompleting &&
    prev.isDeleting === next.isDeleting &&
    prev.activeAssigneeForClick === next.activeAssigneeForClick &&
    prev.assignedMembers === next.assignedMembers &&
    prev.className === next.className &&
    prev.onToggleComplete === next.onToggleComplete &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onAdvance === next.onAdvance &&
    prev.onPriorityChange === next.onPriorityChange &&
    prev.onFocusTask === next.onFocusTask &&
    prev.onNavigateFocus === next.onNavigateFocus &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onAssignMember === next.onAssignMember
  );
}

export const TaskItem = memo(TaskItemComponent, areTaskItemPropsEqual);
TaskItem.displayName = "TaskItem";

export default TaskItem;
