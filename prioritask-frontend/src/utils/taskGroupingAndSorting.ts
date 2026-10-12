import type { Task, TaskStatus } from "../types/task";
import type { QuickAssignee } from "./kudosStore";

export type TaskGroupByMode =
  | "none"
  | "custom_section"
  | "due_date"
  | "priority"
  | "category"
  | "status"
  | "assignee";

export type TaskSortByMode =
  | "manual"
  | "priority"
  | "due_date"
  | "title"
  | "created_at";

export type SortDirection = "asc" | "desc";

export interface CustomTaskSection {
  id: string;
  name: string;
  order: number;
}

export interface RoomSectionsState {
  sections: CustomTaskSection[];
  taskSectionMap: Record<string, string>; // taskId -> sectionId
}

export interface ViewGroupingPreferences {
  groupBy: TaskGroupByMode;
  sortBy: TaskSortByMode;
  sortDirection: SortDirection;
  collapsedGroupIds: string[];
}

export interface TaskGroupSection {
  id: string;
  label: string;
  badgeColorClass?: string;
  tasks: Task[];
  completedCount: number;
  isCustomSection?: boolean;
  customSectionId?: string;
  dropMutation?: {
    patch?: Partial<Task>;
    customSectionId?: string | null;
    assignee?: QuickAssignee | null;
    descriptionLabel: string;
  };
}

export interface GroupAndSortOptions {
  groupBy: TaskGroupByMode;
  sortBy: TaskSortByMode;
  sortDirection?: SortDirection;
  manualOrderIds?: string[];
  customSectionsState?: RoomSectionsState;
  assigneesMap?: Record<string, QuickAssignee[]>;
  now?: Date;
}

const SECTIONS_STORAGE_PREFIX = "prioritask_room_sections_v1_";
const MANUAL_ORDER_STORAGE_PREFIX = "prioritask_task_order_v1_";
const VIEW_PREFS_STORAGE_PREFIX = "prioritask_view_grouping_prefs_v1_";

const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
]);

const VALID_GROUP_BY_MODES = new Set<TaskGroupByMode>([
  "none",
  "custom_section",
  "due_date",
  "priority",
  "category",
  "status",
  "assignee",
]);

const VALID_SORT_BY_MODES = new Set<TaskSortByMode>([
  "manual",
  "priority",
  "due_date",
  "title",
  "created_at",
]);

/**
 * Valida que una clave de sección o identificador sea segura frente a Prototype Pollution.
 */
export function isSafeSectionKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 64) return false;
  if (FORBIDDEN_KEYS.has(trimmed) || FORBIDDEN_KEYS.has(key)) return false;
  return true;
}

function resolveScopeKey(roomId?: string | null): string {
  if (roomId && isSafeSectionKey(roomId)) {
    return roomId.trim();
  }
  return "global";
}

function formatLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function countCompletedTasks(tasks: Task[]): number {
  let count = 0;
  for (const t of tasks) {
    if (t.estado === "DONE" || Boolean(t.completed)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Obtiene el estado de secciones personalizadas para un hogar (o vista global).
 */
export function getRoomSectionsState(roomId?: string | null): RoomSectionsState {
  const scope = resolveScopeKey(roomId);
  const emptyState: RoomSectionsState = {
    sections: [],
    taskSectionMap: {},
  };
  try {
    const raw = localStorage.getItem(`${SECTIONS_STORAGE_PREFIX}${scope}`);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<RoomSectionsState> | null;
    if (!parsed || typeof parsed !== "object") return emptyState;

    const validSections: CustomTaskSection[] = [];
    const seenIds = new Set<string>();
    if (Array.isArray(parsed.sections)) {
      for (const sec of parsed.sections) {
        if (
          sec &&
          typeof sec === "object" &&
          isSafeSectionKey(sec.id) &&
          typeof sec.name === "string" &&
          sec.name.trim().length > 0 &&
          !seenIds.has(sec.id)
        ) {
          seenIds.add(sec.id);
          validSections.push({
            id: sec.id,
            name: sec.name.trim().slice(0, 60),
            order: typeof sec.order === "number" && Number.isFinite(sec.order)
              ? sec.order
              : validSections.length,
          });
        }
      }
    }
    validSections.sort((a, b) => a.order - b.order);

    const safeMap: Record<string, string> = {};
    if (parsed.taskSectionMap && typeof parsed.taskSectionMap === "object") {
      for (const [taskId, sectionId] of Object.entries(parsed.taskSectionMap)) {
        if (
          isSafeSectionKey(taskId) &&
          isSafeSectionKey(sectionId) &&
          seenIds.has(sectionId)
        ) {
          safeMap[taskId] = sectionId;
        }
      }
    }

    return {
      sections: validSections.map((s, idx) => ({ ...s, order: idx })),
      taskSectionMap: safeMap,
    };
  } catch {
    return emptyState;
  }
}

/**
 * Persiste el estado de secciones personalizadas para un hogar (o vista global).
 */
export function saveRoomSectionsState(
  roomId: string | null | undefined,
  state: RoomSectionsState
): void {
  const scope = resolveScopeKey(roomId);
  try {
    localStorage.setItem(`${SECTIONS_STORAGE_PREFIX}${scope}`, JSON.stringify(state));
  } catch {
    // Ignorar errores de cuota de almacenamiento
  }
}

/**
 * Crea una nueva sección personalizada en el hogar evitando duplicados case-insensitive.
 */
export function createCustomSection(
  roomId: string | null | undefined,
  rawName: string
): { state: RoomSectionsState; created: CustomTaskSection | null } {
  const current = getRoomSectionsState(roomId);
  if (typeof rawName !== "string") {
    return { state: current, created: null };
  }
  const cleanName = rawName.trim().slice(0, 60);
  if (!cleanName || FORBIDDEN_KEYS.has(cleanName)) {
    return { state: current, created: null };
  }

  const existing = current.sections.find(
    (s) => s.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (existing) {
    return { state: current, created: existing };
  }

  const newSection: CustomTaskSection = {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    order: current.sections.length,
  };

  const nextState: RoomSectionsState = {
    sections: [...current.sections, newSection],
    taskSectionMap: { ...current.taskSectionMap },
  };
  saveRoomSectionsState(roomId, nextState);
  return { state: nextState, created: newSection };
}

/**
 * Renombra una sección personalizada existente.
 */
export function renameCustomSection(
  roomId: string | null | undefined,
  sectionId: string,
  newName: string
): RoomSectionsState {
  const current = getRoomSectionsState(roomId);
  if (!isSafeSectionKey(sectionId) || typeof newName !== "string") {
    return current;
  }
  const cleanName = newName.trim().slice(0, 60);
  if (!cleanName || FORBIDDEN_KEYS.has(cleanName)) {
    return current;
  }

  const duplicate = current.sections.some(
    (s) => s.id !== sectionId && s.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    return current;
  }

  const nextSections = current.sections.map((s) =>
    s.id === sectionId ? { ...s, name: cleanName } : s
  );
  const nextState: RoomSectionsState = {
    sections: nextSections,
    taskSectionMap: { ...current.taskSectionMap },
  };
  saveRoomSectionsState(roomId, nextState);
  return nextState;
}

/**
 * Elimina una sección personalizada y desasigna las tareas asociadas devolviéndolas a "Sin sección"
 * sin eliminar ninguna tarea (`RN-04` / `EC-02`).
 */
export function deleteCustomSection(
  roomId: string | null | undefined,
  sectionId: string
): RoomSectionsState {
  const current = getRoomSectionsState(roomId);
  if (!isSafeSectionKey(sectionId)) {
    return current;
  }

  const nextSections = current.sections
    .filter((s) => s.id !== sectionId)
    .map((s, idx) => ({ ...s, order: idx }));

  const nextMap: Record<string, string> = {};
  for (const [taskId, assignedSectionId] of Object.entries(current.taskSectionMap)) {
    if (isSafeSectionKey(taskId) && assignedSectionId !== sectionId) {
      nextMap[taskId] = assignedSectionId;
    }
  }

  const nextState: RoomSectionsState = {
    sections: nextSections,
    taskSectionMap: nextMap,
  };
  saveRoomSectionsState(roomId, nextState);
  return nextState;
}

/**
 * Asigna o desasigna una tarea a una sección personalizada del hogar.
 */
export function assignTaskToCustomSection(
  roomId: string | null | undefined,
  taskId: string,
  sectionId: string | null
): RoomSectionsState {
  const current = getRoomSectionsState(roomId);
  if (!isSafeSectionKey(taskId)) {
    return current;
  }

  const nextMap = { ...current.taskSectionMap };
  if (
    sectionId === null ||
    sectionId === "" ||
    sectionId === "unsectioned" ||
    sectionId === "section-unsectioned" ||
    !isSafeSectionKey(sectionId)
  ) {
    delete nextMap[taskId];
  } else if (current.sections.some((s) => s.id === sectionId)) {
    nextMap[taskId] = sectionId;
  }

  const nextState: RoomSectionsState = {
    sections: current.sections,
    taskSectionMap: nextMap,
  };
  saveRoomSectionsState(roomId, nextState);
  return nextState;
}

/**
 * Lee el orden manual de IDs de tareas persistido por hogar.
 */
export function getPersistedTaskOrder(roomId?: string | null): string[] {
  const scope = resolveScopeKey(roomId);
  try {
    const raw = localStorage.getItem(`${MANUAL_ORDER_STORAGE_PREFIX}${scope}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of parsed) {
      if (isSafeSectionKey(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Guarda el orden manual de IDs de tareas por hogar.
 */
export function savePersistedTaskOrder(
  roomId: string | null | undefined,
  orderedIds: string[]
): void {
  const scope = resolveScopeKey(roomId);
  try {
    const clean = orderedIds.filter((id) => isSafeSectionKey(id));
    localStorage.setItem(`${MANUAL_ORDER_STORAGE_PREFIX}${scope}`, JSON.stringify(clean));
  } catch {
    // Ignorar errores de cuota
  }
}

/**
 * Obtiene las preferencias de agrupación y ordenación persistidas para un hogar o vista.
 */
export function getViewGroupingPreferences(
  roomId?: string | null
): ViewGroupingPreferences {
  const scope = resolveScopeKey(roomId);
  const defaults: ViewGroupingPreferences = {
    groupBy: "none",
    sortBy: "manual",
    sortDirection: "asc",
    collapsedGroupIds: [],
  };
  try {
    const raw = localStorage.getItem(`${VIEW_PREFS_STORAGE_PREFIX}${scope}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ViewGroupingPreferences> | null;
    if (!parsed || typeof parsed !== "object") return defaults;

    const groupBy =
      parsed.groupBy && VALID_GROUP_BY_MODES.has(parsed.groupBy)
        ? parsed.groupBy
        : "none";
    const sortBy =
      parsed.sortBy && VALID_SORT_BY_MODES.has(parsed.sortBy)
        ? parsed.sortBy
        : "manual";
    const sortDirection: SortDirection =
      parsed.sortDirection === "desc" ? "desc" : "asc";
    const collapsedGroupIds = Array.isArray(parsed.collapsedGroupIds)
      ? parsed.collapsedGroupIds.filter((id): id is string => isSafeSectionKey(id))
      : [];

    return {
      groupBy,
      sortBy,
      sortDirection,
      collapsedGroupIds,
    };
  } catch {
    return defaults;
  }
}

/**
 * Guarda las preferencias de agrupación y ordenación para un hogar o vista.
 */
export function saveViewGroupingPreferences(
  roomId: string | null | undefined,
  prefs: Partial<ViewGroupingPreferences>
): ViewGroupingPreferences {
  const scope = resolveScopeKey(roomId);
  const current = getViewGroupingPreferences(roomId);
  const next: ViewGroupingPreferences = {
    groupBy:
      prefs.groupBy && VALID_GROUP_BY_MODES.has(prefs.groupBy)
        ? prefs.groupBy
        : current.groupBy,
    sortBy:
      prefs.sortBy && VALID_SORT_BY_MODES.has(prefs.sortBy)
        ? prefs.sortBy
        : current.sortBy,
    sortDirection:
      prefs.sortDirection === "desc" || prefs.sortDirection === "asc"
        ? prefs.sortDirection
        : current.sortDirection,
    collapsedGroupIds: Array.isArray(prefs.collapsedGroupIds)
      ? prefs.collapsedGroupIds.filter((id) => isSafeSectionKey(id))
      : current.collapsedGroupIds,
  };
  try {
    localStorage.setItem(`${VIEW_PREFS_STORAGE_PREFIX}${scope}`, JSON.stringify(next));
  } catch {
    // Ignorar errores de cuota
  }
  return next;
}

/**
 * Ordena una colección de tareas de forma determinista sin mutar el array original.
 * - `manual`: respeta `manualOrderIds` (si se provee) o el orden de entrada.
 * - `priority`: mayor peso (`P1=4` -> `P4=1`) primero cuando `sortDirection === "asc"`.
 * - `due_date`: tareas con `due_date` ordenadas cronológicamente; tareas sin fecha (`null`/`undefined`)
 *   quedan SIEMPRE al final (`EC-01`).
 * - `title`: orden alfabético local (`es`).
 * - `created_at`: más recientes primero por defecto (`asc`), o más antiguas si `desc`.
 */
export function sortTasksCollection(
  tasks: Task[],
  sortBy: TaskSortByMode,
  sortDirection: SortDirection = "asc",
  manualOrderIds?: string[]
): Task[] {
  if (tasks.length <= 1) return [...tasks];

  if (sortBy === "manual") {
    if (!manualOrderIds || manualOrderIds.length === 0) {
      return sortDirection === "desc" ? [...tasks].reverse() : [...tasks];
    }
    const orderIndex = new Map<string, number>();
    manualOrderIds.forEach((id, idx) => {
      if (!orderIndex.has(id)) {
        orderIndex.set(id, idx);
      }
    });
    const fallbackIndex = new Map<string, number>();
    tasks.forEach((t, idx) => {
      fallbackIndex.set(t.id, idx);
    });

    const copy = [...tasks];
    copy.sort((a, b) => {
      const idxA = orderIndex.get(a.id);
      const idxB = orderIndex.get(b.id);
      if (idxA !== undefined && idxB !== undefined) {
        return sortDirection === "desc" ? idxB - idxA : idxA - idxB;
      }
      if (idxA !== undefined) return -1;
      if (idxB !== undefined) return 1;
      return (fallbackIndex.get(a.id) ?? 0) - (fallbackIndex.get(b.id) ?? 0);
    });
    return copy;
  }

  const dirFactor = sortDirection === "desc" ? -1 : 1;
  const copy = [...tasks];

  copy.sort((a, b) => {
    if (sortBy === "priority") {
      const weightDiff = (b.peso - a.peso) * dirFactor;
      if (weightDiff !== 0) return weightDiff;
      const dueA = a.due_date ? String(a.due_date).slice(0, 10) : "";
      const dueB = b.due_date ? String(b.due_date).slice(0, 10) : "";
      if (dueA && dueB && dueA !== dueB) {
        return dueA < dueB ? -1 : 1;
      }
      if (dueA && !dueB) return -1;
      if (!dueA && dueB) return 1;
      return a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" });
    }

    if (sortBy === "due_date") {
      const hasDueA = Boolean(a.due_date && String(a.due_date).trim().length > 0);
      const hasDueB = Boolean(b.due_date && String(b.due_date).trim().length > 0);

      // EC-01: Tareas sin fecha siempre quedan al final
      if (hasDueA && !hasDueB) return -1;
      if (!hasDueA && hasDueB) return 1;
      if (hasDueA && hasDueB) {
        const strA = String(a.due_date).slice(0, 10);
        const strB = String(b.due_date).slice(0, 10);
        if (strA !== strB) {
          return (strA < strB ? -1 : 1) * dirFactor;
        }
      }
      if (b.peso !== a.peso) {
        return b.peso - a.peso;
      }
      return a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" });
    }

    if (sortBy === "title") {
      const cmp = a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" });
      if (cmp !== 0) return cmp * dirFactor;
      return b.peso - a.peso;
    }

    if (sortBy === "created_at") {
      const timeA = a.created_at ? Date.parse(a.created_at) : 0;
      const timeB = b.created_at ? Date.parse(b.created_at) : 0;
      const safeA = Number.isFinite(timeA) ? timeA : 0;
      const safeB = Number.isFinite(timeB) ? timeB : 0;
      if (safeB !== safeA) {
        return (safeB - safeA) * dirFactor;
      }
      return a.id.localeCompare(b.id);
    }

    return 0;
  });

  return copy;
}

/**
 * Agrupa y ordena una lista de tareas según el criterio `groupBy` y `sortBy`.
 */
export function groupAndSortTasks(
  tasks: Task[],
  options: GroupAndSortOptions
): TaskGroupSection[] {
  const {
    groupBy,
    sortBy,
    sortDirection = "asc",
    manualOrderIds,
    customSectionsState,
    assigneesMap,
    now = new Date(),
  } = options;

  const sortBucket = (bucket: Task[]) =>
    sortTasksCollection(bucket, sortBy, sortDirection, manualOrderIds);

  if (groupBy === "none") {
    const sorted = sortBucket(tasks);
    return [
      {
        id: "all",
        label: "Todas las tareas",
        tasks: sorted,
        completedCount: countCompletedTasks(sorted),
      },
    ];
  }

  if (groupBy === "priority") {
    const p1: Task[] = [];
    const p2: Task[] = [];
    const p3: Task[] = [];
    const p4: Task[] = [];

    for (const t of tasks) {
      if (t.peso >= 4) p1.push(t);
      else if (t.peso === 3) p2.push(t);
      else if (t.peso === 2) p3.push(t);
      else p4.push(t);
    }

    const rawSections: Array<{
      id: string;
      label: string;
      badgeColorClass: string;
      bucket: Task[];
      peso: number;
      descriptionLabel: string;
    }> = [
      {
        id: "priority-p1",
        label: "P1 — Urgente",
        badgeColorClass: "priority-ring-p1",
        bucket: p1,
        peso: 4,
        descriptionLabel: "Prioridad P1 (Urgente)",
      },
      {
        id: "priority-p2",
        label: "P2 — Alta",
        badgeColorClass: "priority-ring-p2",
        bucket: p2,
        peso: 3,
        descriptionLabel: "Prioridad P2 (Alta)",
      },
      {
        id: "priority-p3",
        label: "P3 — Media",
        badgeColorClass: "priority-ring-p3",
        bucket: p3,
        peso: 2,
        descriptionLabel: "Prioridad P3 (Media)",
      },
      {
        id: "priority-p4",
        label: "P4 — Baja",
        badgeColorClass: "priority-ring-p4",
        bucket: p4,
        peso: 1,
        descriptionLabel: "Prioridad P4 (Baja)",
      },
    ];

    return rawSections.map((sec) => {
      const sorted = sortBucket(sec.bucket);
      return {
        id: sec.id,
        label: sec.label,
        badgeColorClass: sec.badgeColorClass,
        tasks: sorted,
        completedCount: countCompletedTasks(sorted),
        dropMutation: {
          patch: { peso: sec.peso },
          descriptionLabel: sec.descriptionLabel,
        },
      };
    });
  }

  if (groupBy === "due_date") {
    const todayIso = formatLocalYmd(now);
    const tomorrowDate = new Date(now.getTime());
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = formatLocalYmd(tomorrowDate);

    const nextWeekDate = new Date(now.getTime());
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekIso = formatLocalYmd(nextWeekDate);

    const overdue: Task[] = [];
    const today: Task[] = [];
    const tomorrow: Task[] = [];
    const upcoming: Task[] = [];
    const later: Task[] = [];
    const noDate: Task[] = [];

    for (const t of tasks) {
      const dueStr = t.due_date ? String(t.due_date).slice(0, 10) : "";
      const isDone = t.estado === "DONE" || Boolean(t.completed);
      if (!dueStr) {
        noDate.push(t);
      } else if (dueStr < todayIso && !isDone) {
        overdue.push(t);
      } else if (dueStr === todayIso) {
        today.push(t);
      } else if (dueStr === tomorrowIso) {
        tomorrow.push(t);
      } else if (dueStr > tomorrowIso && dueStr <= nextWeekIso) {
        upcoming.push(t);
      } else {
        later.push(t);
      }
    }

    const definitions: Array<{
      id: string;
      label: string;
      bucket: Task[];
      duePatch: string | undefined;
      descriptionLabel: string;
    }> = [
      {
        id: "due-overdue",
        label: "Vencidas",
        bucket: overdue,
        duePatch: todayIso,
        descriptionLabel: "Hoy",
      },
      {
        id: "due-today",
        label: "Hoy",
        bucket: today,
        duePatch: todayIso,
        descriptionLabel: "Hoy",
      },
      {
        id: "due-tomorrow",
        label: "Mañana",
        bucket: tomorrow,
        duePatch: tomorrowIso,
        descriptionLabel: "Mañana",
      },
      {
        id: "due-upcoming",
        label: "Próximos 7 días",
        bucket: upcoming,
        duePatch: nextWeekIso,
        descriptionLabel: "Próximos 7 días",
      },
      {
        id: "due-later",
        label: "Más adelante",
        bucket: later,
        duePatch: nextWeekIso,
        descriptionLabel: "Próximos 7 días",
      },
      {
        id: "due-none",
        label: "Sin fecha",
        bucket: noDate,
        duePatch: undefined,
        descriptionLabel: "Sin fecha",
      },
    ];

    return definitions
      .filter((def) => def.bucket.length > 0)
      .map((def) => {
        const sorted = sortBucket(def.bucket);
        return {
          id: def.id,
          label: def.label,
          tasks: sorted,
          completedCount: countCompletedTasks(sorted),
          dropMutation: {
            patch: { due_date: def.duePatch },
            descriptionLabel: def.descriptionLabel,
          },
        };
      });
  }

  if (groupBy === "category") {
    const categories: Array<{ key: string; label: string }> = [
      { key: "LIMPIEZA", label: "Limpieza" },
      { key: "COMPRA", label: "Compra" },
      { key: "MANTENIMIENTO", label: "Mantenimiento" },
      { key: "OTRO", label: "Otro" },
    ];
    const buckets: Record<string, Task[]> = {
      LIMPIEZA: [],
      COMPRA: [],
      MANTENIMIENTO: [],
      OTRO: [],
    };

    for (const t of tasks) {
      const cat = (t.categoria || "OTRO").toUpperCase();
      if (Object.prototype.hasOwnProperty.call(buckets, cat)) {
        buckets[cat].push(t);
      } else {
        buckets.OTRO.push(t);
      }
    }

    return categories.map(({ key, label }) => {
      const sorted = sortBucket(buckets[key]);
      return {
        id: `cat-${key}`,
        label,
        tasks: sorted,
        completedCount: countCompletedTasks(sorted),
        dropMutation: {
          patch: { categoria: key },
          descriptionLabel: `Categoría ${label}`,
        },
      };
    });
  }

  if (groupBy === "status") {
    const statuses: Array<{
      key: TaskStatus;
      label: string;
      completed: boolean;
    }> = [
      { key: "TODO", label: "Por hacer", completed: false },
      { key: "IN_PROGRESS", label: "En progreso", completed: false },
      { key: "DONE", label: "Completadas", completed: true },
    ];
    const buckets: Record<TaskStatus, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    };

    for (const t of tasks) {
      if (t.estado === "DONE" || Boolean(t.completed)) {
        buckets.DONE.push(t);
      } else if (t.estado === "IN_PROGRESS") {
        buckets.IN_PROGRESS.push(t);
      } else {
        buckets.TODO.push(t);
      }
    }

    return statuses.map(({ key, label, completed }) => {
      const sorted = sortBucket(buckets[key]);
      return {
        id: `status-${key}`,
        label,
        tasks: sorted,
        completedCount: countCompletedTasks(sorted),
        dropMutation: {
          patch: { estado: key, completed },
          descriptionLabel: label,
        },
      };
    });
  }

  if (groupBy === "assignee") {
    const byUser = new Map<
      string,
      { assignee: QuickAssignee; bucket: Task[] }
    >();
    const unassigned: Task[] = [];

    for (const t of tasks) {
      const firstAssignee = assigneesMap?.[t.id]?.[0];
      if (firstAssignee && isSafeSectionKey(firstAssignee.userId)) {
        const existing = byUser.get(firstAssignee.userId);
        if (existing) {
          existing.bucket.push(t);
        } else {
          byUser.set(firstAssignee.userId, {
            assignee: firstAssignee,
            bucket: [t],
          });
        }
      } else {
        unassigned.push(t);
      }
    }

    const result: TaskGroupSection[] = [];
    for (const [userId, { assignee, bucket }] of byUser.entries()) {
      const sorted = sortBucket(bucket);
      result.push({
        id: `assignee-${userId}`,
        label: assignee.label,
        tasks: sorted,
        completedCount: countCompletedTasks(sorted),
        dropMutation: {
          assignee,
          descriptionLabel: `Asignada a ${assignee.label}`,
        },
      });
    }

    const sortedUnassigned = sortBucket(unassigned);
    result.push({
      id: "assignee-unassigned",
      label: "Sin asignar",
      tasks: sortedUnassigned,
      completedCount: countCompletedTasks(sortedUnassigned),
      dropMutation: {
        assignee: null,
        descriptionLabel: "Sin asignar",
      },
    });

    return result;
  }

  if (groupBy === "custom_section") {
    const sections = customSectionsState?.sections ?? [];
    const taskSectionMap = customSectionsState?.taskSectionMap ?? {};

    const validSectionIds = new Set(sections.map((s) => s.id));
    const unsectionedBucket: Task[] = [];
    const sectionBuckets = new Map<string, Task[]>();

    for (const sec of sections) {
      sectionBuckets.set(sec.id, []);
    }

    for (const t of tasks) {
      const secId =
        isSafeSectionKey(t.id) &&
        Object.prototype.hasOwnProperty.call(taskSectionMap, t.id)
          ? taskSectionMap[t.id]
          : undefined;
      if (secId && validSectionIds.has(secId)) {
        sectionBuckets.get(secId)?.push(t);
      } else {
        unsectionedBucket.push(t);
      }
    }

    const sortedUnsectioned = sortBucket(unsectionedBucket);
    const result: TaskGroupSection[] = [
      {
        id: "section-unsectioned",
        label: "General (Sin sección)",
        tasks: sortedUnsectioned,
        completedCount: countCompletedTasks(sortedUnsectioned),
        isCustomSection: false,
        dropMutation: {
          customSectionId: null,
          descriptionLabel: "General (Sin sección)",
        },
      },
    ];

    const orderedSections = [...sections].sort((a, b) => a.order - b.order);
    for (const sec of orderedSections) {
      const bucket = sectionBuckets.get(sec.id) ?? [];
      const sorted = sortBucket(bucket);
      result.push({
        id: sec.id,
        label: sec.name,
        tasks: sorted,
        completedCount: countCompletedTasks(sorted),
        isCustomSection: true,
        customSectionId: sec.id,
        dropMutation: {
          customSectionId: sec.id,
          descriptionLabel: `Sección "${sec.name}"`,
        },
      });
    }

    return result;
  }

  return [];
}
