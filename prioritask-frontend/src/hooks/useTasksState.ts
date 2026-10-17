import { useReducer, useCallback, useMemo, useRef } from "react";
import api from "../api";
import { enqueueMutation } from "../services/offlineQueue";
import { savePersistedTaskOrder } from "../utils/taskGroupingAndSorting";
import {
  priorityCodeToWeight,
  priorityEntryForCode,
  priorityEntryForWeight,
  priorityTaskLabel,
  type PriorityCode,
  type PriorityScaleEntry,
} from "../utils/priorityScale";
import type { Task, TaskStatus, Subtask } from "../types/task";

export type TaskPriorityLevel = PriorityCode;
export type TaskMutationKind = "completing" | "updating" | "deleting";
export type FocusNavigationDirection = "next" | "prev" | "first" | "last";
export type TaskOverlayType = "peek" | "delete-confirm" | "quick-add" | "context-menu" | null;

export type SnoozePresetKey =
  | "30m"
  | "3h"
  | "tomorrow_9am"
  | "today"
  | "tomorrow"
  | "next_week"
  | "clear"
  | "custom";

export interface TaskSnapshotEntry {
  task: Task;
  index: number;
}

export interface SyncCommandPayload {
  uuid: string;
  temp_id?: string | null;
  type:
    | "task_create"
    | "task_update"
    | "task_complete"
    | "task_uncomplete"
    | "task_schedule_reminder"
    | "task_delete";
  args: Record<string, unknown>;
  timestamp: number;
}

function formatLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calcula las fechas de vencimiento (`due_date`) y recordatorio (`reminder_at`) para los presets de pospuesto rápido (`Snooze`),
 * siguiendo las constantes de Todoist Desktop (`1,800,000` ms para +30m, `10,800,000` ms para +3h, 09:00 AM para mañana).
 */
export function computeSnoozePresetDate(
  preset: SnoozePresetKey,
  now: Date = new Date(),
  customDate?: string
): { due_date: string | null; reminder_at: string | null; label: string } {
  switch (preset) {
    case "30m": {
      const iso = new Date(now.getTime() + 1_800_000).toISOString();
      return { due_date: iso, reminder_at: iso, label: "+30 minutos" };
    }
    case "3h": {
      const iso = new Date(now.getTime() + 10_800_000).toISOString();
      return { due_date: iso, reminder_at: iso, label: "+3 horas" };
    }
    case "tomorrow_9am": {
      const tomorrow9 = new Date(now.getTime());
      tomorrow9.setDate(tomorrow9.getDate() + 1);
      tomorrow9.setHours(9, 0, 0, 0);
      const iso = tomorrow9.toISOString();
      return { due_date: iso, reminder_at: iso, label: "Mañana a las 09:00" };
    }
    case "today": {
      return { due_date: formatLocalYmd(now), reminder_at: null, label: "Hoy" };
    }
    case "tomorrow": {
      const tomorrow = new Date(now.getTime());
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { due_date: formatLocalYmd(tomorrow), reminder_at: null, label: "Mañana" };
    }
    case "next_week": {
      const nextWeek = new Date(now.getTime());
      nextWeek.setDate(nextWeek.getDate() + 7);
      return {
        due_date: formatLocalYmd(nextWeek),
        reminder_at: null,
        label: "Próxima semana (+7 días)",
      };
    }
    case "clear": {
      return { due_date: null, reminder_at: null, label: "Sin fecha" };
    }
    case "custom":
    default: {
      return {
        due_date: customDate || null,
        reminder_at: null,
        label: customDate || "Fecha personalizada",
      };
    }
  }
}

export interface TaskOverlayState {
  type: TaskOverlayType;
  taskId: string | null;
}

export interface TaskActionError {
  taskId?: string;
  message: string;
}

export interface NormalizedTasksState {
  /** Diccionario O(1) de entidades indexadas por ID */
  byId: Record<string, Task>;
  /** Lista ordenada de IDs para preservar secuencia de renderizado y virtualización */
  ids: string[];
  /** Estado efímero de mutaciones optimistas en vuelo por tarea */
  pendingById: Record<string, TaskMutationKind>;
  /** Estado de UI desacoplado de las entidades de datos */
  ui: {
    focusedTaskId: string | null;
    selectedTaskIds: string[];
    activeOverlay: TaskOverlayState;
    lastError: TaskActionError | null;
  };
}

/**
 * Convierte el peso numérico de Prioritask al nivel canónico (p1-p4).
 * La escala vive en `utils/priorityScale.ts`:
 * - peso 5 -> P1 (Urgente)
 * - peso 4 -> P2 (Alta)
 * - peso 3 -> P3 (Media)
 * - peso 1..2 / undefined -> P4 (Baja)
 */
export function pesoToPriorityLevel(peso?: number): TaskPriorityLevel {
  return priorityEntryForWeight(peso).code;
}

export interface PriorityLevelMetadata {
  level: TaskPriorityLevel;
  peso: number;
  shortLabel: "P1" | "P2" | "P3" | "P4";
  label: string;
  ringClass: string;
  shortcutKey: "1" | "2" | "3" | "4";
}

function toPriorityLevelMetadata(entry: PriorityScaleEntry): PriorityLevelMetadata {
  return {
    level: entry.code,
    peso: entry.weight,
    shortLabel: entry.shortLabel,
    label: priorityTaskLabel(entry),
    ringClass: entry.ringClass,
    shortcutKey: entry.shortcutKey,
  };
}

export const PRIORITY_LEVEL_METADATA: Record<TaskPriorityLevel, PriorityLevelMetadata> = {
  p1: toPriorityLevelMetadata(priorityEntryForCode("p1")),
  p2: toPriorityLevelMetadata(priorityEntryForCode("p2")),
  p3: toPriorityLevelMetadata(priorityEntryForCode("p3")),
  p4: toPriorityLevelMetadata(priorityEntryForCode("p4")),
};

/**
 * Convierte un nivel canónico ("p1"-"p4") al peso que se aplica al seleccionarlo.
 */
export function priorityLevelToPeso(level: TaskPriorityLevel): number {
  return priorityCodeToWeight(level);
}

type TasksAction =
  | { type: "SET_TASKS"; payload: Task[] }
  | { type: "UPSERT_TASK"; payload: { task: Task; position?: "prepend" | "append" } }
  | { type: "PATCH_TASK"; payload: { taskId: string; patch: Partial<Task> } }
  | {
      type: "BATCH_UPDATE_TASKS";
      payload: { updates: Array<{ taskId: string; patch: Partial<Task> }> };
    }
  | { type: "REMOVE_TASK"; payload: { taskId: string } }
  | { type: "BATCH_REMOVE_TASKS"; payload: { taskIds: string[] } }
  | { type: "RESTORE_TASK"; payload: { task: Task; index: number } }
  | { type: "RESTORE_TASKS"; payload: { entries: TaskSnapshotEntry[] } }
  | {
      type: "RECONCILE_SUBTASK_EVENT";
      payload: {
        taskId: string;
        subtask?: Subtask;
        subtasks_count?: number;
        subtasks_completed_count?: number;
      };
    }
  | {
      type: "RECONCILE_COUNTER_EVENT";
      payload: {
        taskId: string;
        field: "comments_count" | "attachments_count";
        explicitCount?: number;
        delta: number;
      };
    }
  | { type: "SET_PENDING"; payload: { taskId: string; kind: TaskMutationKind | null } }
  | { type: "SET_FOCUSED_TASK"; payload: { taskId: string | null } }
  | { type: "TOGGLE_SELECT_TASK"; payload: { taskId: string } }
  | { type: "SET_SELECTED_TASKS"; payload: { taskIds: string[] } }
  | { type: "CLEAR_SELECTION" }
  | { type: "REORDER_TASKS"; payload: { orderedIds: string[] } }
  | { type: "SET_OVERLAY"; payload: TaskOverlayState }
  | { type: "SET_ERROR"; payload: TaskActionError | null };

export function isSafeEntityId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.trim().length > 0 &&
    id !== "__proto__" &&
    id !== "constructor" &&
    id !== "prototype" &&
    id !== "toString" &&
    id !== "valueOf"
  );
}

function hasOwnKey(obj: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeTasksArray(tasks: Task[]): { byId: Record<string, Task>; ids: string[] } {
  const byId: Record<string, Task> = {};
  const ids: string[] = [];
  for (const task of tasks) {
    if (!task || !isSafeEntityId(task.id)) continue;
    if (!hasOwnKey(byId, task.id)) {
      ids.push(task.id);
    }
    byId[task.id] = task;
  }
  return { byId, ids };
}

function createInitialState(initialTasks: Task[] = []): NormalizedTasksState {
  const { byId, ids } = normalizeTasksArray(initialTasks);
  return {
    byId,
    ids,
    pendingById: {},
    ui: {
      focusedTaskId: ids[0] ?? null,
      selectedTaskIds: [],
      activeOverlay: { type: null, taskId: null },
      lastError: null,
    },
  };
}

function tasksReducer(state: NormalizedTasksState, action: TasksAction): NormalizedTasksState {
  switch (action.type) {
    case "SET_TASKS": {
      const { byId, ids } = normalizeTasksArray(action.payload);
      const currentFocused = state.ui.focusedTaskId;
      const nextFocused =
        currentFocused && hasOwnKey(byId, currentFocused)
          ? currentFocused
          : (ids[0] ?? null);
      const nextSelected = state.ui.selectedTaskIds.filter((id) =>
        hasOwnKey(byId, id)
      );
      return {
        ...state,
        byId,
        ids,
        ui: {
          ...state.ui,
          focusedTaskId: nextFocused,
          selectedTaskIds: nextSelected,
        },
      };
    }

    case "UPSERT_TASK": {
      const { task, position = "prepend" } = action.payload;
      if (!task || !isSafeEntityId(task.id)) return state;
      const exists = hasOwnKey(state.byId, task.id);
      const mergedTask = exists ? { ...state.byId[task.id], ...task } : task;
      const nextIds = exists
        ? state.ids
        : position === "append"
        ? [...state.ids, task.id]
        : [task.id, ...state.ids];

      return {
        ...state,
        byId: {
          ...state.byId,
          [task.id]: mergedTask,
        },
        ids: nextIds,
        ui: {
          ...state.ui,
          focusedTaskId: state.ui.focusedTaskId ?? task.id,
        },
      };
    }

    case "PATCH_TASK": {
      const { taskId, patch } = action.payload;
      if (!isSafeEntityId(taskId) || !hasOwnKey(state.byId, taskId)) return state;
      const existing = state.byId[taskId];
      return {
        ...state,
        byId: {
          ...state.byId,
          [taskId]: { ...existing, ...patch },
        },
      };
    }

    case "BATCH_UPDATE_TASKS": {
      const { updates } = action.payload;
      if (!updates || updates.length === 0) return state;
      const nextById = { ...state.byId };
      let mutated = false;
      for (const { taskId, patch } of updates) {
        if (!isSafeEntityId(taskId) || !hasOwnKey(nextById, taskId)) continue;
        nextById[taskId] = { ...nextById[taskId], ...patch };
        mutated = true;
      }
      if (!mutated) return state;
      return {
        ...state,
        byId: nextById,
      };
    }

    case "REMOVE_TASK": {
      const { taskId } = action.payload;
      if (!isSafeEntityId(taskId) || !hasOwnKey(state.byId, taskId)) return state;
      const removedIndex = state.ids.indexOf(taskId);
      const nextById = { ...state.byId };
      delete nextById[taskId];
      const nextPending = { ...state.pendingById };
      delete nextPending[taskId];
      const nextIds = state.ids.filter((id) => id !== taskId);

      let nextFocused = state.ui.focusedTaskId;
      if (state.ui.focusedTaskId === taskId) {
        if (nextIds.length === 0) {
          nextFocused = null;
        } else {
          const fallbackIdx = Math.min(Math.max(0, removedIndex), nextIds.length - 1);
          nextFocused = nextIds[fallbackIdx] ?? null;
        }
      }

      const nextOverlay =
        state.ui.activeOverlay.taskId === taskId
          ? { type: null, taskId: null }
          : state.ui.activeOverlay;

      return {
        ...state,
        byId: nextById,
        ids: nextIds,
        pendingById: nextPending,
        ui: {
          ...state.ui,
          focusedTaskId: nextFocused,
          selectedTaskIds: state.ui.selectedTaskIds.filter((id) => id !== taskId),
          activeOverlay: nextOverlay,
        },
      };
    }

    case "BATCH_REMOVE_TASKS": {
      const removeSet = new Set(
        action.payload.taskIds.filter((id) => isSafeEntityId(id) && hasOwnKey(state.byId, id))
      );
      if (removeSet.size === 0) return state;

      const nextById = { ...state.byId };
      const nextPending = { ...state.pendingById };
      for (const id of removeSet) {
        delete nextById[id];
        delete nextPending[id];
      }
      const nextIds = state.ids.filter((id) => !removeSet.has(id));
      const nextSelected = state.ui.selectedTaskIds.filter((id) => !removeSet.has(id));

      let nextFocused = state.ui.focusedTaskId;
      if (nextFocused && removeSet.has(nextFocused)) {
        nextFocused = nextIds[0] ?? null;
      }

      const nextOverlay =
        state.ui.activeOverlay.taskId && removeSet.has(state.ui.activeOverlay.taskId)
          ? { type: null, taskId: null }
          : state.ui.activeOverlay;

      return {
        ...state,
        byId: nextById,
        ids: nextIds,
        pendingById: nextPending,
        ui: {
          ...state.ui,
          focusedTaskId: nextFocused,
          selectedTaskIds: nextSelected,
          activeOverlay: nextOverlay,
        },
      };
    }

    case "RESTORE_TASK": {
      const { task, index } = action.payload;
      if (!task || !isSafeEntityId(task.id)) return state;
      const nextIds = state.ids.includes(task.id)
        ? state.ids
        : [
            ...state.ids.slice(0, Math.max(0, Math.min(index, state.ids.length))),
            task.id,
            ...state.ids.slice(Math.max(0, Math.min(index, state.ids.length))),
          ];
      return {
        ...state,
        byId: {
          ...state.byId,
          [task.id]: task,
        },
        ids: nextIds,
        ui: {
          ...state.ui,
          focusedTaskId: state.ui.focusedTaskId ?? task.id,
        },
      };
    }

    case "RESTORE_TASKS": {
      const { entries } = action.payload;
      if (!entries || entries.length === 0) return state;
      const sortedEntries = [...entries]
        .filter((e) => e && e.task && isSafeEntityId(e.task.id))
        .sort((a, b) => a.index - b.index);
      if (sortedEntries.length === 0) return state;

      const nextById = { ...state.byId };
      const nextIds = [...state.ids];

      for (const { task, index } of sortedEntries) {
        nextById[task.id] = { ...task };
        if (!nextIds.includes(task.id)) {
          const insertAt = Math.max(0, Math.min(index, nextIds.length));
          nextIds.splice(insertAt, 0, task.id);
        }
      }

      return {
        ...state,
        byId: nextById,
        ids: nextIds,
        ui: {
          ...state.ui,
          focusedTaskId: state.ui.focusedTaskId ?? nextIds[0] ?? null,
        },
      };
    }

    case "RECONCILE_SUBTASK_EVENT": {
      const { taskId, subtask, subtasks_count, subtasks_completed_count } = action.payload;
      if (!isSafeEntityId(taskId) || !hasOwnKey(state.byId, taskId)) return state;
      const existing = state.byId[taskId];

      let updatedSubtasks = existing.subtasks;
      if (subtask) {
        if (updatedSubtasks?.some((s) => s.id === subtask.id)) {
          updatedSubtasks = updatedSubtasks.map((s) =>
            s.id === subtask.id ? subtask : s
          );
        } else if (updatedSubtasks) {
          updatedSubtasks = [...updatedSubtasks, subtask];
        }
      }

      const total =
        subtasks_count ??
        (updatedSubtasks ? updatedSubtasks.length : existing.subtasks_count);
      const completed =
        subtasks_completed_count ??
        (updatedSubtasks
          ? updatedSubtasks.filter((s) => s.completada).length
          : existing.subtasks_completed_count);

      return {
        ...state,
        byId: {
          ...state.byId,
          [taskId]: {
            ...existing,
            subtasks: updatedSubtasks,
            subtasks_count: total,
            subtasks_completed_count: completed,
          },
        },
      };
    }

    case "RECONCILE_COUNTER_EVENT": {
      const { taskId, field, explicitCount, delta } = action.payload;
      if (!isSafeEntityId(taskId) || !hasOwnKey(state.byId, taskId)) return state;
      const existing = state.byId[taskId];

      const nextCount =
        explicitCount !== undefined
          ? explicitCount
          : Math.max(0, (existing[field] ?? 0) + delta);

      return {
        ...state,
        byId: {
          ...state.byId,
          [taskId]: {
            ...existing,
            [field]: nextCount,
          },
        },
      };
    }

    case "SET_PENDING": {
      const { taskId, kind } = action.payload;
      if (!isSafeEntityId(taskId)) return state;
      if (kind === null) {
        if (!hasOwnKey(state.pendingById, taskId)) return state;
        const nextPending = { ...state.pendingById };
        delete nextPending[taskId];
        return { ...state, pendingById: nextPending };
      }
      return {
        ...state,
        pendingById: {
          ...state.pendingById,
          [taskId]: kind,
        },
      };
    }

    case "SET_FOCUSED_TASK": {
      const { taskId } = action.payload;
      if (
        taskId !== null &&
        (!isSafeEntityId(taskId) || !hasOwnKey(state.byId, taskId))
      ) {
        return state;
      }
      if (state.ui.focusedTaskId === taskId) return state;
      return {
        ...state,
        ui: {
          ...state.ui,
          focusedTaskId: taskId,
        },
      };
    }

    case "TOGGLE_SELECT_TASK": {
      const { taskId } = action.payload;
      if (!isSafeEntityId(taskId) || !hasOwnKey(state.byId, taskId)) return state;
      const exists = state.ui.selectedTaskIds.includes(taskId);
      const nextSelected = exists
        ? state.ui.selectedTaskIds.filter((id) => id !== taskId)
        : [...state.ui.selectedTaskIds, taskId];
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedTaskIds: nextSelected,
        },
      };
    }

    case "SET_SELECTED_TASKS": {
      const seen = new Set<string>();
      const nextSelected: string[] = [];
      for (const rawId of action.payload.taskIds) {
        if (isSafeEntityId(rawId) && hasOwnKey(state.byId, rawId) && !seen.has(rawId)) {
          seen.add(rawId);
          nextSelected.push(rawId);
        }
      }
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedTaskIds: nextSelected,
        },
      };
    }

    case "CLEAR_SELECTION": {
      if (state.ui.selectedTaskIds.length === 0) return state;
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedTaskIds: [],
        },
      };
    }

    case "REORDER_TASKS": {
      const seen = new Set<string>();
      const nextIds: string[] = [];
      for (const id of action.payload.orderedIds) {
        if (isSafeEntityId(id) && hasOwnKey(state.byId, id) && !seen.has(id)) {
          seen.add(id);
          nextIds.push(id);
        }
      }
      for (const id of state.ids) {
        if (hasOwnKey(state.byId, id) && !seen.has(id)) {
          seen.add(id);
          nextIds.push(id);
        }
      }
      return {
        ...state,
        ids: nextIds,
      };
    }

    case "SET_OVERLAY": {
      return {
        ...state,
        ui: {
          ...state.ui,
          activeOverlay: action.payload,
        },
      };
    }

    case "SET_ERROR": {
      return {
        ...state,
        ui: {
          ...state.ui,
          lastError: action.payload,
        },
      };
    }

    default:
      return state;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeSyncUuid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseTasksStateOptions {
  initialTasks?: Task[];
  onOptimisticError?: (error: TaskActionError) => void;
}

export function useTasksState(options: UseTasksStateOptions = {}) {
  const { initialTasks = [], onOptimisticError } = options;
  const [state, dispatch] = useReducer(tasksReducer, initialTasks, createInitialState);

  // Ref sincronizada para lecturas instantáneas en callbacks asíncronos sin recrear handlers
  const stateRef = useRef(state);
  stateRef.current = state;

  const errorCallbackRef = useRef(onOptimisticError);
  errorCallbackRef.current = onOptimisticError;

  // Registro de mutaciones concurrentes en vuelo por tarea para evitar condiciones de carrera
  // en rollbacks solapados o limpiezas prematuras de `pendingById`.
  const inFlightRef = useRef<Record<string, { count: number; baseTask: Task }>>({});

  const beginMutation = useCallback(
    (taskId: string, kind: TaskMutationKind, currentTask: Task): Task => {
      const existing = hasOwnKey(inFlightRef.current, taskId)
        ? inFlightRef.current[taskId]
        : undefined;
      if (existing) {
        existing.count += 1;
      } else {
        inFlightRef.current[taskId] = { count: 1, baseTask: currentTask };
      }
      dispatch({ type: "SET_PENDING", payload: { taskId, kind } });
      return inFlightRef.current[taskId].baseTask;
    },
    []
  );

  const commitMutationSuccess = useCallback((taskId: string, confirmedPatch: Partial<Task>) => {
    if (!isSafeEntityId(taskId) || !hasOwnKey(inFlightRef.current, taskId)) return;
    const existing = inFlightRef.current[taskId];
    if (existing) {
      existing.baseTask = { ...existing.baseTask, ...confirmedPatch };
    }
  }, []);

  const endMutation = useCallback((taskId: string) => {
    if (!isSafeEntityId(taskId)) return;
    const existing = hasOwnKey(inFlightRef.current, taskId)
      ? inFlightRef.current[taskId]
      : undefined;
    if (!existing) {
      dispatch({ type: "SET_PENDING", payload: { taskId, kind: null } });
      return;
    }
    existing.count -= 1;
    if (existing.count <= 0) {
      delete inFlightRef.current[taskId];
      dispatch({ type: "SET_PENDING", payload: { taskId, kind: null } });
    }
  }, []);

  const setTasks = useCallback((tasks: Task[]) => {
    dispatch({ type: "SET_TASKS", payload: tasks });
  }, []);

  const upsertTask = useCallback((task: Task, position: "prepend" | "append" = "prepend") => {
    dispatch({ type: "UPSERT_TASK", payload: { task, position } });
  }, []);

  const removeTask = useCallback((taskId: string) => {
    if (!isSafeEntityId(taskId)) return;
    delete inFlightRef.current[taskId];
    dispatch({ type: "REMOVE_TASK", payload: { taskId } });
  }, []);

  const getTaskById = useCallback((taskId: string): Task | undefined => {
    if (!isSafeEntityId(taskId) || !hasOwnKey(stateRef.current.byId, taskId)) {
      return undefined;
    }
    return stateRef.current.byId[taskId];
  }, []);

  const isTaskPending = useCallback((taskId: string): boolean => {
    if (!isSafeEntityId(taskId) || !hasOwnKey(stateRef.current.pendingById, taskId)) {
      return false;
    }
    return Boolean(stateRef.current.pendingById[taskId]);
  }, []);

  const setFocusedTaskId = useCallback((taskId: string | null) => {
    dispatch({ type: "SET_FOCUSED_TASK", payload: { taskId } });
  }, []);

  const moveFocus = useCallback(
    (direction: FocusNavigationDirection, fromTaskId?: string | null): string | null => {
      const currentIds = stateRef.current.ids;
      if (currentIds.length === 0) {
        dispatch({ type: "SET_FOCUSED_TASK", payload: { taskId: null } });
        return null;
      }

      if (direction === "first") {
        const target = currentIds[0];
        dispatch({ type: "SET_FOCUSED_TASK", payload: { taskId: target } });
        return target;
      }

      if (direction === "last") {
        const target = currentIds[currentIds.length - 1];
        dispatch({ type: "SET_FOCUSED_TASK", payload: { taskId: target } });
        return target;
      }

      const originId = fromTaskId ?? stateRef.current.ui.focusedTaskId;
      const currentIndex = originId ? currentIds.indexOf(originId) : -1;

      let nextIndex: number;
      if (currentIndex === -1) {
        nextIndex = direction === "next" ? 0 : currentIds.length - 1;
      } else if (direction === "next") {
        nextIndex = Math.min(currentIndex + 1, currentIds.length - 1);
      } else {
        nextIndex = Math.max(currentIndex - 1, 0);
      }

      const nextId = currentIds[nextIndex] ?? null;
      dispatch({ type: "SET_FOCUSED_TASK", payload: { taskId: nextId } });
      return nextId;
    },
    []
  );

  const toggleSelectTask = useCallback((taskId: string) => {
    dispatch({ type: "TOGGLE_SELECT_TASK", payload: { taskId } });
  }, []);

  const setSelectedTaskIds = useCallback((taskIds: string[]) => {
    dispatch({ type: "SET_SELECTED_TASKS", payload: { taskIds } });
  }, []);

  const selectAllTasks = useCallback((visibleTaskIds?: string[]) => {
    const targetIds = (visibleTaskIds ?? stateRef.current.ids).filter(
      (id) => isSafeEntityId(id) && hasOwnKey(stateRef.current.byId, id)
    );
    if (targetIds.length === 0) {
      dispatch({ type: "CLEAR_SELECTION" });
      return;
    }
    const currentSelected = stateRef.current.ui.selectedTaskIds;
    const allAlreadySelected =
      targetIds.length > 0 && targetIds.every((id) => currentSelected.includes(id));
    if (allAlreadySelected) {
      dispatch({ type: "CLEAR_SELECTION" });
    } else {
      dispatch({ type: "SET_SELECTED_TASKS", payload: { taskIds: targetIds } });
    }
  }, []);

  const selectTaskRange = useCallback(
    (targetTaskId: string, anchorTaskId?: string | null, orderedVisibleIds?: string[]) => {
      if (!isSafeEntityId(targetTaskId) || !hasOwnKey(stateRef.current.byId, targetTaskId)) {
        return;
      }
      const list = orderedVisibleIds ?? stateRef.current.ids;
      const currentSelected = stateRef.current.ui.selectedTaskIds;
      const resolvedAnchor =
        anchorTaskId ??
        currentSelected[currentSelected.length - 1] ??
        stateRef.current.ui.focusedTaskId;

      const targetIdx = list.indexOf(targetTaskId);
      const anchorIdx = resolvedAnchor ? list.indexOf(resolvedAnchor) : -1;

      if (targetIdx === -1 || anchorIdx === -1) {
        const merged = currentSelected.includes(targetTaskId)
          ? currentSelected
          : [...currentSelected, targetTaskId];
        dispatch({ type: "SET_SELECTED_TASKS", payload: { taskIds: merged } });
        return;
      }

      const startIdx = Math.min(anchorIdx, targetIdx);
      const endIdx = Math.max(anchorIdx, targetIdx);
      const rangeIds = list.slice(startIdx, endIdx + 1);
      const merged = Array.from(new Set([...currentSelected, ...rangeIds]));
      dispatch({ type: "SET_SELECTED_TASKS", payload: { taskIds: merged } });
    },
    []
  );

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR_SELECTION" });
  }, []);

  const restoreTasksSnapshot = useCallback((entries: TaskSnapshotEntry[]) => {
    dispatch({ type: "RESTORE_TASKS", payload: { entries } });
  }, []);

  const setCustomTaskOrder = useCallback((orderedIds: string[]) => {
    dispatch({ type: "REORDER_TASKS", payload: { orderedIds } });
  }, []);

  const reorderTasks = useCallback(
    (
      sourceTaskId: string,
      targetTaskId: string,
      position: "before" | "after" = "before",
      roomId?: string | null
    ): {
      ok: boolean;
      previousIds: string[];
      nextIds: string[];
      undo: () => void;
    } => {
      const previousIds = [...stateRef.current.ids];
      if (
        !isSafeEntityId(sourceTaskId) ||
        !isSafeEntityId(targetTaskId) ||
        sourceTaskId === targetTaskId ||
        !hasOwnKey(stateRef.current.byId, sourceTaskId) ||
        !hasOwnKey(stateRef.current.byId, targetTaskId)
      ) {
        return {
          ok: false,
          previousIds,
          nextIds: previousIds,
          undo: () => {},
        };
      }

      const withoutSource = previousIds.filter((id) => id !== sourceTaskId);
      const targetIndex = withoutSource.indexOf(targetTaskId);
      if (targetIndex === -1) {
        return {
          ok: false,
          previousIds,
          nextIds: previousIds,
          undo: () => {},
        };
      }

      const insertAt = position === "after" ? targetIndex + 1 : targetIndex;
      const nextIds = [
        ...withoutSource.slice(0, insertAt),
        sourceTaskId,
        ...withoutSource.slice(insertAt),
      ];

      dispatch({ type: "REORDER_TASKS", payload: { orderedIds: nextIds } });
      savePersistedTaskOrder(roomId, nextIds);

      return {
        ok: true,
        previousIds,
        nextIds,
        undo: () => {
          dispatch({ type: "REORDER_TASKS", payload: { orderedIds: previousIds } });
          savePersistedTaskOrder(roomId, previousIds);
        },
      };
    },
    []
  );

  const moveTaskOrderByKeyboard = useCallback(
    (
      taskId: string,
      direction: "up" | "down",
      visibleTaskIds?: string[],
      roomId?: string | null
    ): {
      ok: boolean;
      previousIds: string[];
      nextIds: string[];
      undo: () => void;
    } => {
      const previousIds = [...stateRef.current.ids];
      const list =
        visibleTaskIds && visibleTaskIds.length > 0
          ? visibleTaskIds
          : stateRef.current.ids;
      const idx = list.indexOf(taskId);
      if (idx === -1) {
        return { ok: false, previousIds, nextIds: previousIds, undo: () => {} };
      }
      const neighborIndex = direction === "up" ? idx - 1 : idx + 1;
      if (neighborIndex < 0 || neighborIndex >= list.length) {
        return { ok: false, previousIds, nextIds: previousIds, undo: () => {} };
      }
      const neighborId = list[neighborIndex];
      return reorderTasks(
        taskId,
        neighborId,
        direction === "up" ? "before" : "after",
        roomId
      );
    },
    [reorderTasks]
  );

  const executeBatchSync = useCallback(
    async (
      commands: SyncCommandPayload[],
      roomId?: string | null,
      fallbackFn?: () => Promise<void>
    ): Promise<{ ok: boolean; offline: boolean }> => {
      if (commands.length === 0) {
        return { ok: true, offline: false };
      }
      const payload = {
        sync_token: "*",
        ...(roomId && UUID_REGEX.test(roomId) ? { room_id: roomId } : {}),
        commands,
      };
      try {
        const res = await api.post("/sync/batch", payload);
        const syncStatus = (res?.data as { sync_status?: Record<string, unknown> } | undefined)
          ?.sync_status;
        if (syncStatus && typeof syncStatus === "object") {
          const hasCommandError = Object.values(syncStatus).some((v) => v !== "ok");
          if (hasCommandError && fallbackFn) {
            await fallbackFn();
          }
        }
        return { ok: true, offline: false };
      } catch (err) {
        if (!(err as { response?: unknown })?.response) {
          await enqueueMutation({
            url: "/sync/batch",
            method: "POST",
            data: payload,
          });
          return { ok: true, offline: true };
        }
        if (fallbackFn) {
          try {
            await fallbackFn();
            return { ok: true, offline: false };
          } catch {
            return { ok: false, offline: false };
          }
        }
        return { ok: false, offline: false };
      }
    },
    []
  );

  const openOverlay = useCallback(
    (type: Exclude<TaskOverlayType, null>, taskId: string | null = null) => {
      dispatch({ type: "SET_OVERLAY", payload: { type, taskId } });
    },
    []
  );

  const closeOverlay = useCallback(() => {
    dispatch({ type: "SET_OVERLAY", payload: { type: null, taskId: null } });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, []);

  /**
   * Conciliación en vivo O(1) para eventos SSE / BroadcastChannel / IPC Bridge
   * (`TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `SUBTASK_TOGGLED`, `SUBTASK_CREATED`,
   * `COMMENT_ADDED`, `COMMENT_DELETED`, `ATTACHMENT_ADDED`, `ATTACHMENT_DELETED`,
   * `completeItem`, `uncompleteItem`).
   */
  const reconcileLiveEvent = useCallback((event: { type: string; data: unknown }) => {
    if (!event || !event.type) return;

    if (event.type === "TASK_CREATED" || event.type === "addTask") {
      const newTask = event.data as Task;
      if (newTask && isSafeEntityId(newTask.id)) {
        dispatch({ type: "UPSERT_TASK", payload: { task: newTask, position: "prepend" } });
      }
    } else if (event.type === "TASK_UPDATED") {
      const updated = event.data as Partial<Task> & { id?: string };
      if (updated && isSafeEntityId(updated.id)) {
        dispatch({ type: "PATCH_TASK", payload: { taskId: updated.id, patch: updated } });
      }
    } else if (event.type === "completeItem") {
      const taskId =
        typeof event.data === "string"
          ? event.data
          : (event.data as { id?: string })?.id;
      if (isSafeEntityId(taskId)) {
        dispatch({
          type: "PATCH_TASK",
          payload: { taskId, patch: { estado: "DONE", completed: true } },
        });
      }
    } else if (event.type === "uncompleteItem") {
      const taskId =
        typeof event.data === "string"
          ? event.data
          : (event.data as { id?: string })?.id;
      if (isSafeEntityId(taskId)) {
        dispatch({
          type: "PATCH_TASK",
          payload: { taskId, patch: { estado: "TODO", completed: false } },
        });
      }
    } else if (event.type === "TASK_DELETED") {
      const payload = event.data as { id?: string; task_id?: string } | string;
      const deletedId =
        typeof payload === "string" ? payload : payload?.id || payload?.task_id;
      if (isSafeEntityId(deletedId)) {
        delete inFlightRef.current[deletedId];
        dispatch({ type: "REMOVE_TASK", payload: { taskId: deletedId } });
      }
    } else if (event.type === "SUBTASK_TOGGLED" || event.type === "SUBTASK_CREATED") {
      const subtaskPayload = event.data as {
        task_id?: string;
        subtask?: Subtask;
        subtasks_count?: number;
        subtasks_completed_count?: number;
      };
      if (isSafeEntityId(subtaskPayload?.task_id)) {
        dispatch({
          type: "RECONCILE_SUBTASK_EVENT",
          payload: {
            taskId: subtaskPayload.task_id,
            subtask: subtaskPayload.subtask,
            subtasks_count: subtaskPayload.subtasks_count,
            subtasks_completed_count: subtaskPayload.subtasks_completed_count,
          },
        });
      }
    } else if (event.type === "COMMENT_ADDED" || event.type === "COMMENT_DELETED") {
      const commentPayload = event.data as {
        task_id?: string;
        comments_count?: number;
      };
      if (isSafeEntityId(commentPayload?.task_id)) {
        dispatch({
          type: "RECONCILE_COUNTER_EVENT",
          payload: {
            taskId: commentPayload.task_id,
            field: "comments_count",
            explicitCount: commentPayload.comments_count,
            delta: event.type === "COMMENT_ADDED" ? 1 : -1,
          },
        });
      }
    } else if (event.type === "ATTACHMENT_ADDED" || event.type === "ATTACHMENT_DELETED") {
      const attPayload = event.data as {
        task_id?: string;
        attachments_count?: number;
      };
      if (isSafeEntityId(attPayload?.task_id)) {
        dispatch({
          type: "RECONCILE_COUNTER_EVENT",
          payload: {
            taskId: attPayload.task_id,
            field: "attachments_count",
            explicitCount: attPayload.attachments_count,
            delta: event.type === "ATTACHMENT_ADDED" ? 1 : -1,
          },
        });
      }
    }
  }, []);

  /**
   * Alterna completado con actualización optimista instantánea y rollback automático en caso de fallo.
   */
  const toggleCompleteOptimistic = useCallback(
    async (
      taskId: string,
      mutationFn?: (
        taskId: string,
        nextStatus: TaskStatus,
        previousTask: Task
      ) => Promise<Partial<Task> | void>
    ): Promise<boolean> => {
      if (!isSafeEntityId(taskId) || !hasOwnKey(stateRef.current.byId, taskId)) return false;
      const prevTask = stateRef.current.byId[taskId];

      const baseTask = beginMutation(taskId, "completing", prevTask);
      const nextStatus: TaskStatus = prevTask.estado === "DONE" ? "TODO" : "DONE";
      const optimisticPatch: Partial<Task> = {
        estado: nextStatus,
        completed: nextStatus === "DONE",
      };

      dispatch({ type: "SET_ERROR", payload: null });
      dispatch({ type: "PATCH_TASK", payload: { taskId, patch: optimisticPatch } });

      try {
        const result = mutationFn
          ? await mutationFn(taskId, nextStatus, prevTask)
          : (await api.patch<Task>(`/tasks/${taskId}/status`, { estado: nextStatus })).data;

        const confirmedPatch =
          result && typeof result === "object"
            ? { ...optimisticPatch, ...result }
            : optimisticPatch;
        commitMutationSuccess(taskId, confirmedPatch);
        if (result && typeof result === "object") {
          dispatch({ type: "PATCH_TASK", payload: { taskId, patch: result } });
        }
        return true;
      } catch (err) {
        // Rollback atómico al snapshot base confirmado
        dispatch({
          type: "PATCH_TASK",
          payload: {
            taskId,
            patch: { estado: baseTask.estado, completed: baseTask.completed },
          },
        });
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo actualizar el estado de la tarea.";
        const errorPayload: TaskActionError = { taskId, message };
        dispatch({ type: "SET_ERROR", payload: errorPayload });
        errorCallbackRef.current?.(errorPayload);
        return false;
      } finally {
        endMutation(taskId);
      }
    },
    [beginMutation, commitMutationSuccess, endMutation]
  );

  /**
   * Actualiza cualquier campo de una tarea de manera optimista con rollback garantizado por campo.
   */
  const updateTaskOptimistic = useCallback(
    async (
      taskId: string,
      patch: Partial<Task>,
      mutationFn?: (
        taskId: string,
        patch: Partial<Task>,
        previousTask: Task
      ) => Promise<Partial<Task> | void>
    ): Promise<boolean> => {
      if (!isSafeEntityId(taskId) || !hasOwnKey(stateRef.current.byId, taskId)) return false;
      const prevTask = stateRef.current.byId[taskId];

      const baseTask = beginMutation(taskId, "updating", prevTask);
      dispatch({ type: "SET_ERROR", payload: null });
      dispatch({ type: "PATCH_TASK", payload: { taskId, patch } });

      try {
        const result = mutationFn
          ? await mutationFn(taskId, patch, prevTask)
          : (await api.patch<Task>(`/tasks/${taskId}`, patch)).data;

        const confirmedPatch =
          result && typeof result === "object" ? { ...patch, ...result } : patch;
        commitMutationSuccess(taskId, confirmedPatch);
        if (result && typeof result === "object") {
          dispatch({ type: "PATCH_TASK", payload: { taskId, patch: result } });
        }
        return true;
      } catch (err) {
        // Rollback exclusivo de las claves modificadas hacia el snapshot base confirmado
        const rollbackPatch: Partial<Task> = {};
        for (const key of Object.keys(patch) as Array<keyof Task>) {
          if (isSafeEntityId(key)) {
            (rollbackPatch as Record<keyof Task, unknown>)[key] = baseTask[key];
          }
        }
        dispatch({ type: "PATCH_TASK", payload: { taskId, patch: rollbackPatch } });
        const message =
          err instanceof Error ? err.message : "No se pudo actualizar la tarea.";
        const errorPayload: TaskActionError = { taskId, message };
        dispatch({ type: "SET_ERROR", payload: errorPayload });
        errorCallbackRef.current?.(errorPayload);
        return false;
      } finally {
        endMutation(taskId);
      }
    },
    [beginMutation, commitMutationSuccess, endMutation]
  );

  /**
   * Cambia la prioridad usando el nivel canónico ("p1".."p4") o peso directo (1..5) de forma optimista.
   */
  const setPriorityOptimistic = useCallback(
    async (
      taskId: string,
      priorityOrPeso: TaskPriorityLevel | number,
      mutationFn?: (
        taskId: string,
        nextPeso: number,
        previousTask: Task
      ) => Promise<Partial<Task> | void>
    ): Promise<boolean> => {
      const rawPeso =
        typeof priorityOrPeso === "number"
          ? priorityOrPeso
          : priorityLevelToPeso(priorityOrPeso);
      const clampedPeso = Math.max(1, Math.min(5, Math.round(rawPeso)));

      return updateTaskOptimistic(
        taskId,
        { peso: clampedPeso },
        mutationFn
          ? (id, _patch, prev) => mutationFn(id, clampedPeso, prev)
          : undefined
      );
    },
    [updateTaskOptimistic]
  );

  /**
   * Elimina una tarea de manera optimista conservando su índice original por si requiere rollback.
   */
  const deleteTaskOptimistic = useCallback(
    async (
      taskId: string,
      mutationFn?: (taskId: string, previousTask: Task) => Promise<void>
    ): Promise<boolean> => {
      if (!isSafeEntityId(taskId) || !hasOwnKey(stateRef.current.byId, taskId)) return false;
      const prevTask = stateRef.current.byId[taskId];
      const prevIndex = stateRef.current.ids.indexOf(taskId);

      delete inFlightRef.current[taskId];
      dispatch({ type: "SET_ERROR", payload: null });
      dispatch({ type: "REMOVE_TASK", payload: { taskId } });

      try {
        if (mutationFn) {
          await mutationFn(taskId, prevTask);
        } else {
          await api.delete(`/tasks/${taskId}`);
        }
        return true;
      } catch (err) {
        dispatch({
          type: "RESTORE_TASK",
          payload: { task: prevTask, index: Math.max(0, prevIndex) },
        });
        const message =
          err instanceof Error ? err.message : "No se pudo eliminar la tarea.";
        const errorPayload: TaskActionError = { taskId, message };
        dispatch({ type: "SET_ERROR", payload: errorPayload });
        errorCallbackRef.current?.(errorPayload);
        return false;
      }
    },
    []
  );

  /**
   * Alterna completado (`completeItem` / `uncompleteItem`) en lote de forma optimista y retorna acción de Deshacer (`undo`).
   */
  const batchToggleCompleteOptimistic = useCallback(
    async (
      taskIds: string[],
      forcedCompleted?: boolean,
      roomId?: string | null
    ): Promise<{
      ok: boolean;
      nextCompleted: boolean;
      snapshots: TaskSnapshotEntry[];
      undo: () => Promise<boolean>;
    }> => {
      const validIds = Array.from(
        new Set(
          taskIds.filter((id) => isSafeEntityId(id) && hasOwnKey(stateRef.current.byId, id))
        )
      );
      if (validIds.length === 0) {
        return {
          ok: false,
          nextCompleted: false,
          snapshots: [],
          undo: async () => false,
        };
      }

      const snapshots: TaskSnapshotEntry[] = validIds.map((id) => ({
        task: { ...stateRef.current.byId[id] },
        index: stateRef.current.ids.indexOf(id),
      }));

      const nextCompleted =
        forcedCompleted !== undefined
          ? forcedCompleted
          : snapshots.some((s) => s.task.estado !== "DONE" && !s.task.completed);
      const nextStatus: TaskStatus = nextCompleted ? "DONE" : "TODO";

      dispatch({
        type: "BATCH_UPDATE_TASKS",
        payload: {
          updates: validIds.map((taskId) => ({
            taskId,
            patch: { estado: nextStatus, completed: nextCompleted },
          })),
        },
      });
      dispatch({ type: "CLEAR_SELECTION" });

      const nowTs = Date.now();
      const commands: SyncCommandPayload[] = validIds.map((taskId) => ({
        uuid: makeSyncUuid(nextCompleted ? "cmd-complete" : "cmd-uncomplete"),
        type: nextCompleted ? "task_complete" : "task_uncomplete",
        args: { id: taskId },
        timestamp: nowTs,
      }));

      const syncRes = await executeBatchSync(commands, roomId, async () => {
        await Promise.all(
          validIds.map((id) => api.patch(`/tasks/${id}/status`, { estado: nextStatus }))
        );
      });

      if (!syncRes.ok) {
        dispatch({ type: "RESTORE_TASKS", payload: { entries: snapshots } });
      }

      const undo = async (): Promise<boolean> => {
        dispatch({ type: "RESTORE_TASKS", payload: { entries: snapshots } });
        const undoTs = Date.now();
        const undoCommands: SyncCommandPayload[] = snapshots.map(({ task }) => {
          const wasCompleted = task.estado === "DONE" || Boolean(task.completed);
          return {
            uuid: makeSyncUuid(wasCompleted ? "cmd-undo-complete" : "cmd-undo-uncomplete"),
            type: wasCompleted ? "task_complete" : "task_uncomplete",
            args: { id: task.id },
            timestamp: undoTs,
          };
        });
        const undoRes = await executeBatchSync(undoCommands, roomId, async () => {
          await Promise.all(
            snapshots.map(({ task }) =>
              api.patch(`/tasks/${task.id}/status`, { estado: task.estado })
            )
          );
        });
        return undoRes.ok;
      };

      return { ok: syncRes.ok, nextCompleted, snapshots, undo };
    },
    [executeBatchSync]
  );

  /**
   * Actualiza múltiples tareas en lote de forma optimista preservando snapshots heterogéneos (`RN-01`) para `undo()`.
   */
  const batchUpdateTasksOptimistic = useCallback(
    async (
      taskIds: string[],
      patch: Partial<Task>,
      roomId?: string | null
    ): Promise<{
      ok: boolean;
      snapshots: TaskSnapshotEntry[];
      undo: () => Promise<boolean>;
    }> => {
      const validIds = Array.from(
        new Set(
          taskIds.filter((id) => isSafeEntityId(id) && hasOwnKey(stateRef.current.byId, id))
        )
      );
      if (validIds.length === 0) {
        return {
          ok: false,
          snapshots: [],
          undo: async () => false,
        };
      }

      const snapshots: TaskSnapshotEntry[] = validIds.map((id) => ({
        task: { ...stateRef.current.byId[id] },
        index: stateRef.current.ids.indexOf(id),
      }));

      dispatch({
        type: "BATCH_UPDATE_TASKS",
        payload: {
          updates: validIds.map((taskId) => ({ taskId, patch })),
        },
      });
      dispatch({ type: "CLEAR_SELECTION" });

      const nowTs = Date.now();
      const commands: SyncCommandPayload[] = validIds.map((taskId) => ({
        uuid: makeSyncUuid("cmd-update"),
        type: "task_update",
        args: { id: taskId, ...patch },
        timestamp: nowTs,
      }));

      const syncRes = await executeBatchSync(commands, roomId, async () => {
        await Promise.all(validIds.map((id) => api.patch(`/tasks/${id}`, patch)));
      });

      if (!syncRes.ok) {
        dispatch({ type: "RESTORE_TASKS", payload: { entries: snapshots } });
      }

      const patchKeys = Object.keys(patch) as Array<keyof Task>;
      const undo = async (): Promise<boolean> => {
        dispatch({ type: "RESTORE_TASKS", payload: { entries: snapshots } });
        const undoTs = Date.now();
        const undoCommands: SyncCommandPayload[] = snapshots.map(({ task }) => {
          const revertPatch: Record<string, unknown> = { id: task.id };
          for (const key of patchKeys) {
            revertPatch[key] = task[key] ?? null;
          }
          return {
            uuid: makeSyncUuid("cmd-undo-update"),
            type: "task_update",
            args: revertPatch,
            timestamp: undoTs,
          };
        });
        const undoRes = await executeBatchSync(undoCommands, roomId, async () => {
          await Promise.all(
            snapshots.map(({ task }) => {
              const revertPatch: Record<string, unknown> = {};
              for (const key of patchKeys) {
                revertPatch[key] = task[key] ?? null;
              }
              return api.patch(`/tasks/${task.id}`, revertPatch);
            })
          );
        });
        return undoRes.ok;
      };

      return { ok: syncRes.ok, snapshots, undo };
    },
    [executeBatchSync]
  );

  /**
   * Elimina múltiples tareas en lote con ventana de gracia configurable (`graceMs = 5000` por defecto).
   * Si se invoca `undo()` antes de que expire la ventana de gracia, se cancela el temporizador y no se ejecuta borrado en el servidor (`EC-04`).
   */
  const batchDeleteTasksOptimistic = useCallback(
    async (
      taskIds: string[],
      options?: {
        graceMs?: number;
        roomId?: string | null;
        onCommitted?: (deletedIds: string[]) => void;
      }
    ): Promise<{
      ok: boolean;
      snapshots: TaskSnapshotEntry[];
      undo: () => Promise<boolean>;
    }> => {
      const validIds = Array.from(
        new Set(
          taskIds.filter((id) => isSafeEntityId(id) && hasOwnKey(stateRef.current.byId, id))
        )
      );
      if (validIds.length === 0) {
        return {
          ok: false,
          snapshots: [],
          undo: async () => false,
        };
      }

      const snapshots: TaskSnapshotEntry[] = validIds.map((id) => ({
        task: { ...stateRef.current.byId[id] },
        index: stateRef.current.ids.indexOf(id),
      }));

      for (const id of validIds) {
        delete inFlightRef.current[id];
      }

      dispatch({ type: "BATCH_REMOVE_TASKS", payload: { taskIds: validIds } });
      dispatch({ type: "CLEAR_SELECTION" });

      const graceMs = options?.graceMs ?? 5000;
      const roomId = options?.roomId;
      let committed = false;
      let undone = false;
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const commitDeletion = async (): Promise<boolean> => {
        if (undone || committed) return true;
        committed = true;
        const nowTs = Date.now();
        const commands: SyncCommandPayload[] = validIds.map((taskId) => ({
          uuid: makeSyncUuid("cmd-delete"),
          type: "task_delete",
          args: { id: taskId },
          timestamp: nowTs,
        }));
        const syncRes = await executeBatchSync(commands, roomId, async () => {
          await Promise.all(validIds.map((id) => api.delete(`/tasks/${id}`)));
        });
        if (syncRes.ok) {
          options?.onCommitted?.(validIds);
        } else {
          dispatch({ type: "RESTORE_TASKS", payload: { entries: snapshots } });
        }
        return syncRes.ok;
      };

      let initialOk = true;
      if (graceMs <= 0) {
        initialOk = await commitDeletion();
      } else {
        timerId = setTimeout(() => {
          void commitDeletion();
        }, graceMs);
      }

      const undo = async (): Promise<boolean> => {
        if (undone) return true;
        undone = true;
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        dispatch({ type: "RESTORE_TASKS", payload: { entries: snapshots } });
        if (!committed) {
          return true;
        }
        const undoTs = Date.now();
        const recreateCommands: SyncCommandPayload[] = snapshots.map(({ task }) => ({
          uuid: makeSyncUuid("cmd-undo-delete"),
          temp_id: task.id,
          type: "task_create",
          args: {
            titulo: task.titulo,
            descripcion: task.descripcion ?? null,
            categoria: task.categoria,
            estado: task.estado,
            peso: task.peso,
            due_date: task.due_date ?? null,
            reminder_at: task.reminder_at ?? null,
            completed: Boolean(task.completed || task.estado === "DONE"),
            is_recurring: Boolean(task.is_recurring),
            room_id: task.room_id ?? roomId ?? undefined,
          },
          timestamp: undoTs,
        }));
        const undoRes = await executeBatchSync(recreateCommands, roomId, async () => {
          await Promise.all(
            snapshots.map(({ task }) =>
              api.post("/tasks/", {
                titulo: task.titulo,
                descripcion: task.descripcion ?? null,
                categoria: task.categoria,
                estado: task.estado,
                peso: task.peso,
                due_date: task.due_date ?? null,
                reminder_at: task.reminder_at ?? null,
              })
            )
          );
        });
        return undoRes.ok;
      };

      return { ok: initialOk, snapshots, undo };
    },
    [executeBatchSync]
  );

  const tasks = useMemo(
    () => state.ids.map((id) => state.byId[id]).filter((t): t is Task => Boolean(t)),
    [state.ids, state.byId]
  );

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };
    for (const task of tasks) {
      const bucket = grouped[task.estado] ?? grouped.TODO;
      bucket.push(task);
    }
    return grouped;
  }, [tasks]);

  const counts = useMemo(
    () => ({
      total: tasks.length,
      todo: tasksByStatus.TODO.length,
      inProgress: tasksByStatus.IN_PROGRESS.length,
      done: tasksByStatus.DONE.length,
    }),
    [tasks.length, tasksByStatus]
  );

  return {
    // Estado normalizado y selectores
    byId: state.byId,
    ids: state.ids,
    tasks,
    tasksByStatus,
    counts,
    pendingById: state.pendingById,
    ui: state.ui,

    // Consultas O(1)
    getTaskById,
    isTaskPending,

    // Mutaciones síncronas y conciliación en vivo
    setTasks,
    upsertTask,
    removeTask,
    restoreTasksSnapshot,
    setCustomTaskOrder,
    reorderTasks,
    moveTaskOrderByKeyboard,
    reconcileLiveEvent,

    // Mutaciones optimistas con rollback automático (individuales y en lote)
    toggleCompleteOptimistic,
    updateTaskOptimistic,
    setPriorityOptimistic,
    deleteTaskOptimistic,
    executeBatchSync,
    batchToggleCompleteOptimistic,
    batchUpdateTasksOptimistic,
    batchDeleteTasksOptimistic,

    // Acciones de UI, selección múltiple y foco por teclado (roving tabindex)
    setFocusedTaskId,
    moveFocus,
    toggleSelectTask,
    setSelectedTaskIds,
    selectAllTasks,
    selectTaskRange,
    clearSelection,
    openOverlay,
    closeOverlay,
    clearError,
  };
}

export default useTasksState;
