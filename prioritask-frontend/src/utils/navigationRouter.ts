import type { NavigateFunction } from "react-router-dom";
import {
  isPriorityCode,
  priorityEntryForCode,
  priorityFilterLabel,
  type PriorityCode,
} from "./priorityScale";

export type SmartViewType = "today" | "upcoming" | "inbox" | "completed";
export type PriorityFilterCode = PriorityCode;

// Re-export para conservar la API histórica de este módulo.
export { weightToPriorityBadge } from "./priorityScale";

export type NavigationTarget =
  | { view: { type: SmartViewType; roomId?: string | null } }
  | { view: { type: "room"; roomId: string } }
  | { view: { type: "tag"; tagName?: string } }
  | {
      view: {
        type: "priority";
        priority: PriorityFilterCode;
        roomId?: string | null;
      };
    }
  | { view: { type: "category"; categoria: string; roomId?: string | null } }
  | { view: { type: "search"; searchQuery: string; roomId?: string | null } }
  | {
      view: {
        type:
          | "dashboard"
          | "analytics"
          | "history"
          | "profile"
          | "grouped"
          | "assign";
      };
    }
  | { task: { id: string; roomId?: string | null } };

export interface ParsedNavigationQuery {
  view: SmartViewType | null;
  estado: string;
  categoria: string;
  fechaLimite: string;
  priority: PriorityFilterCode | "";
  pesoMin: number | null;
  pesoMax: number | null;
  q: string;
  taskId: string | null;
}

export type CommandPaletteMode =
  | "all"
  | "actions"
  | "rooms"
  | "tags"
  | "priority";

export interface ParsedCommandPaletteInput {
  mode: CommandPaletteMode;
  cleanQuery: string;
  priorityFilter: PriorityFilterCode | null;
}

const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const SAFE_ENTITY_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const VALID_ESTADOS = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const VALID_CATEGORIAS = new Set([
  "LIMPIEZA",
  "COMPRA",
  "MANTENIMIENTO",
  "OTRO",
]);

/**
 * Valida que un identificador de entidad (taskId o roomId) sea seguro frente a
 * Prototype Pollution, XSS o inyección de rutas.
 */
export function isSafeNavigationEntityId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return false;
  if (FORBIDDEN_PROTOTYPE_KEYS.has(trimmed.toLowerCase())) return false;
  return SAFE_ENTITY_ID_REGEX.test(trimmed);
}

/**
 * Convierte el código semántico de prioridad Todoist (p1..p4) al rango de peso de Prioritask (1..5).
 */
export function priorityCodeToWeightRange(priority: string): {
  priority: PriorityFilterCode | "";
  pesoMin: number | null;
  pesoMax: number | null;
  label: string;
} {
  const normalized = priority.trim().toLowerCase();
  if (!isPriorityCode(normalized)) {
    return {
      priority: "",
      pesoMin: null,
      pesoMax: null,
      label: "",
    };
  }

  const entry = priorityEntryForCode(normalized);
  return {
    priority: entry.code,
    pesoMin: entry.minWeight,
    pesoMax: entry.maxWeight,
    label: priorityFilterLabel(entry),
  };
}

/**
 * Construye una URL interna determinista a partir de un descriptor tipado NavigationTarget.
 * Inspirado en `navigateTo` (`v(e, t)`, `vt(e)`, `lt(e)`) de Todoist Desktop v9.31.0.
 */
export function buildNavigationUrl(target: NavigationTarget): string {
  if ("task" in target) {
    const { id, roomId } = target.task;
    const basePath = isSafeNavigationEntityId(roomId)
      ? `/rooms/${encodeURIComponent(roomId)}/tasks`
      : "/tasks";
    if (!isSafeNavigationEntityId(id)) {
      return basePath;
    }
    return `${basePath}?taskId=${encodeURIComponent(id)}`;
  }

  const v = target.view;
  switch (v.type) {
    case "today":
    case "upcoming":
    case "inbox":
    case "completed": {
      const basePath = isSafeNavigationEntityId(v.roomId)
        ? `/rooms/${encodeURIComponent(v.roomId)}/tasks`
        : "/tasks";
      if (v.type === "inbox") {
        return basePath;
      }
      return `${basePath}?view=${v.type}`;
    }
    case "room": {
      if (isSafeNavigationEntityId(v.roomId)) {
        return `/rooms/${encodeURIComponent(v.roomId)}/tasks`;
      }
      return "/tasks";
    }
    case "tag": {
      const tag = v.tagName?.trim();
      return tag ? `/tags?q=${encodeURIComponent(tag)}` : "/tags";
    }
    case "priority": {
      const basePath = isSafeNavigationEntityId(v.roomId)
        ? `/rooms/${encodeURIComponent(v.roomId)}/tasks`
        : "/tasks";
      return `${basePath}?priority=${encodeURIComponent(v.priority)}`;
    }
    case "category": {
      const basePath = isSafeNavigationEntityId(v.roomId)
        ? `/rooms/${encodeURIComponent(v.roomId)}/tasks`
        : "/tasks";
      return `${basePath}?categoria=${encodeURIComponent(v.categoria.trim().toUpperCase())}`;
    }
    case "search": {
      const basePath = isSafeNavigationEntityId(v.roomId)
        ? `/rooms/${encodeURIComponent(v.roomId)}/tasks`
        : "/tasks";
      const q = v.searchQuery.trim();
      return q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath;
    }
    case "dashboard":
      return "/dashboard";
    case "analytics":
      return "/analytics";
    case "history":
      return "/history";
    case "profile":
      return "/profile";
    case "grouped":
      return "/tasks/grouped";
    case "assign":
      return "/tasks/assign";
  }
}

/**
 * Parsea la cadena `location.search` y la traduce a filtros de estado para TaskList y RoomTasks.
 */
export function parseNavigationQuery(
  search: string,
  now: Date = new Date()
): ParsedNavigationQuery {
  const params = new URLSearchParams(search);
  const todayIso = now.toISOString().split("T")[0];
  const nextWeekDate = new Date(now.getTime());
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekIso = nextWeekDate.toISOString().split("T")[0];

  const rawView = (params.get("view") || "").trim().toLowerCase();
  const view: SmartViewType | null =
    rawView === "today" ||
    rawView === "upcoming" ||
    rawView === "inbox" ||
    rawView === "completed"
      ? rawView
      : null;

  const rawEstado = (params.get("estado") || "").trim().toUpperCase();
  let estado = VALID_ESTADOS.has(rawEstado) ? rawEstado : "";

  const rawFecha = (
    params.get("due_date_max") ||
    params.get("fechaLimite") ||
    ""
  ).trim();
  let fechaLimite = ISO_DATE_REGEX.test(rawFecha) ? rawFecha : "";

  if (view === "today") {
    fechaLimite = todayIso;
  } else if (view === "upcoming") {
    fechaLimite = nextWeekIso;
  } else if (view === "completed") {
    estado = "DONE";
  }

  const rawCategoria = (params.get("categoria") || "").trim().toUpperCase();
  const categoria = VALID_CATEGORIAS.has(rawCategoria) ? rawCategoria : "";

  const prioInfo = priorityCodeToWeightRange(params.get("priority") || "");
  const q = (params.get("q") || params.get("search") || "").trim();

  const rawTaskId = params.get("taskId");
  const taskId = isSafeNavigationEntityId(rawTaskId) ? rawTaskId.trim() : null;

  return {
    view,
    estado,
    categoria,
    fechaLimite,
    priority: prioInfo.priority,
    pesoMin: prioInfo.pesoMin,
    pesoMax: prioInfo.pesoMax,
    q,
    taskId,
  };
}

/**
 * Despachador centralizado `navigateTo`: resuelve el descriptor tipado y ejecuta `navigate`.
 */
export function navigateTo(
  navigate: NavigateFunction,
  target: NavigationTarget,
  options?: { replace?: boolean }
): string {
  const url = buildNavigationUrl(target);
  navigate(url, options);
  return url;
}

/**
 * Analiza la entrada del usuario en el Command Palette para detectar prefijos semánticos:
 * `>` (acciones), `#` (hogares), `@` (etiquetas), `!` o `p1..p4` (prioridad).
 */
export function parseCommandPaletteInput(
  rawQuery: string
): ParsedCommandPaletteInput {
  const trimmedStart = rawQuery.trimStart();

  if (trimmedStart.startsWith(">")) {
    return {
      mode: "actions",
      cleanQuery: trimmedStart.slice(1).trim(),
      priorityFilter: null,
    };
  }

  if (trimmedStart.startsWith("#")) {
    return {
      mode: "rooms",
      cleanQuery: trimmedStart.slice(1).trim(),
      priorityFilter: null,
    };
  }

  if (trimmedStart.startsWith("@")) {
    return {
      mode: "tags",
      cleanQuery: trimmedStart.slice(1).trim(),
      priorityFilter: null,
    };
  }

  if (trimmedStart.startsWith("!")) {
    const afterBang = trimmedStart.slice(1).trim();
    const prioMatch = afterBang.match(/^(?:p)?([1-4])(?:\s+(.*))?$/i);
    if (prioMatch) {
      return {
        mode: "priority",
        cleanQuery: (prioMatch[2] || "").trim(),
        priorityFilter: `p${prioMatch[1]}` as PriorityFilterCode,
      };
    }
    return {
      mode: "priority",
      cleanQuery: afterBang,
      priorityFilter: null,
    };
  }

  const standalonePrioMatch = trimmedStart.match(/^(p[1-4])(?:\s+(.*))?$/i);
  if (standalonePrioMatch) {
    return {
      mode: "priority",
      cleanQuery: (standalonePrioMatch[2] || "").trim(),
      priorityFilter: standalonePrioMatch[1].toLowerCase() as PriorityFilterCode,
    };
  }

  return {
    mode: "all",
    cleanQuery: rawQuery.trim(),
    priorityFilter: null,
  };
}
