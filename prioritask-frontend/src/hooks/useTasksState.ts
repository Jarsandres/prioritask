import { useReducer, useCallback, useMemo, useRef } from "react";
import api from "../api";
import type { Task, TaskStatus, Subtask } from "../types/task";

export type TaskPriorityLevel = "p1" | "p2" | "p3" | "p4";
export type TaskMutationKind = "completing" | "updating" | "deleting";
export type FocusNavigationDirection = "next" | "prev" | "first" | "last";
export type TaskOverlayType = "peek" | "delete-confirm" | "quick-add" | "context-menu" | null;

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
 * Convierte el peso numérico de Prioritask (1-4+) al nivel de prioridad Todoist (p1-p4).
 * En Todoist (verificado con REA en `webpack/electron/electron.js` `function ai(e)`):
 * - peso >= 4 -> "p1" (Prioridad 1 / Urgente)
 * - peso === 3 -> "p2" (Prioridad 2 / Alta)
 * - peso === 2 -> "p3" (Prioridad 3 / Media)
 * - peso <= 1 -> "p4" (Prioridad 4 / Baja - Default)
 */
export function pesoToPriorityLevel(peso: number): TaskPriorityLevel {
  if (peso >= 4) return "p1";
  if (peso === 3) return "p2";
  if (peso === 2) return "p3";
  return "p4";
}

export interface PriorityLevelMetadata {
  level: TaskPriorityLevel;
  peso: number;
  shortLabel: "P1" | "P2" | "P3" | "P4";
  label: string;
  ringClass: string;
  shortcutKey: "1" | "2" | "3" | "4";
}

export const PRIORITY_LEVEL_METADATA: Record<TaskPriorityLevel, PriorityLevelMetadata> = {
  p1: {
    level: "p1",
    peso: 4,
    shortLabel: "P1",
    label: "Prioridad 1 (Urgente)",
    ringClass: "priority-ring-p1",
    shortcutKey: "1",
  },
  p2: {
    level: "p2",
    peso: 3,
    shortLabel: "P2",
    label: "Prioridad 2 (Alta)",
    ringClass: "priority-ring-p2",
    shortcutKey: "2",
  },
  p3: {
    level: "p3",
    peso: 2,
    shortLabel: "P3",
    label: "Prioridad 3 (Media)",
    ringClass: "priority-ring-p3",
    shortcutKey: "3",
  },
  p4: {
    level: "p4",
    peso: 1,
    shortLabel: "P4",
    label: "Prioridad 4 (Baja)",
    ringClass: "priority-ring-p4",
    shortcutKey: "4",
  },
};

/**
 * Convierte un nivel de prioridad Todoist ("p1"-"p4") al peso de dominio de Prioritask (4-1).
 */
export function priorityLevelToPeso(level: TaskPriorityLevel): number {
  switch (level) {
    case "p1":
      return 4;
    case "p2":
      return 3;
    case "p3":
      return 2;
    case "p4":
    default:
      return 1;
  }
}

type TasksAction =
  | { type: "SET_TASKS"; payload: Task[] }
  | { type: "UPSERT_TASK"; payload: { task: Task; position?: "prepend" | "append" } }
  | { type: "PATCH_TASK"; payload: { taskId: string; patch: Partial<Task> } }
  | { type: "REMOVE_TASK"; payload: { taskId: string } }
  | { type: "RESTORE_TASK"; payload: { task: Task; index: number } }
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
  | { type: "CLEAR_SELECTION" }
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

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR_SELECTION" });
  }, []);

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
   * Cambia la prioridad usando el esquema Todoist ("p1".."p4") o peso directo (1..4) de forma optimista.
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
      const clampedPeso = Math.max(1, Math.min(4, Math.round(rawPeso)));

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
    reconcileLiveEvent,

    // Mutaciones optimistas con rollback automático
    toggleCompleteOptimistic,
    updateTaskOptimistic,
    setPriorityOptimistic,
    deleteTaskOptimistic,

    // Acciones de UI y foco por teclado (roving tabindex)
    setFocusedTaskId,
    moveFocus,
    toggleSelectTask,
    clearSelection,
    openOverlay,
    closeOverlay,
    clearError,
  };
}

export default useTasksState;
