/**
 * Escala canónica de prioridad de Prioritask (única fuente de verdad).
 *
 * Contrato dominio → UI:
 * - peso 5              → P1 (Urgente)
 * - peso 4              → P2 (Alta)
 * - peso 3              → P3 (Media)
 * - peso 1, 2 o undefined → P4 (Baja)
 *
 * `peso >= 4` NO significa "P1": significa "alta prioridad" (P1 o P2).
 * Usa siempre `isHighPriority` para expresar esa intención y evita comparar
 * umbrales inline en componentes y stores.
 */

export type PriorityCode = "p1" | "p2" | "p3" | "p4";

export type PriorityShortLabel = "P1" | "P2" | "P3" | "P4";
export type PriorityName = "Urgente" | "Alta" | "Media" | "Baja";

export interface PriorityScaleEntry {
  code: PriorityCode;
  /** Peso mínimo que pertenece a este nivel. */
  minWeight: number;
  /** Peso máximo que pertenece a este nivel. */
  maxWeight: number;
  /** Peso que se aplica al seleccionar este nivel explícitamente. */
  weight: number;
  shortLabel: PriorityShortLabel;
  name: PriorityName;
  colorClass: string;
  ringClass: string;
  shortcutKey: "1" | "2" | "3" | "4";
}

export const PRIORITY_SCALE: readonly PriorityScaleEntry[] = [
  {
    code: "p1",
    minWeight: 5,
    maxWeight: 5,
    weight: 5,
    shortLabel: "P1",
    name: "Urgente",
    colorClass: "command-palette-priority-p1",
    ringClass: "priority-ring-p1",
    shortcutKey: "1",
  },
  {
    code: "p2",
    minWeight: 4,
    maxWeight: 4,
    weight: 4,
    shortLabel: "P2",
    name: "Alta",
    colorClass: "command-palette-priority-p2",
    ringClass: "priority-ring-p2",
    shortcutKey: "2",
  },
  {
    code: "p3",
    minWeight: 3,
    maxWeight: 3,
    weight: 3,
    shortLabel: "P3",
    name: "Media",
    colorClass: "command-palette-priority-p3",
    ringClass: "priority-ring-p3",
    shortcutKey: "3",
  },
  {
    code: "p4",
    minWeight: 1,
    maxWeight: 2,
    // Al elegir P4 se mantiene el peso mínimo histórico (1); el rango 1..2
    // sigue representando el mismo nivel semántico.
    weight: 1,
    shortLabel: "P4",
    name: "Baja",
    colorClass: "command-palette-priority-p4",
    ringClass: "priority-ring-p4",
    shortcutKey: "4",
  },
];

const PRIORITY_BY_CODE: Record<PriorityCode, PriorityScaleEntry> = {
  p1: PRIORITY_SCALE[0],
  p2: PRIORITY_SCALE[1],
  p3: PRIORITY_SCALE[2],
  p4: PRIORITY_SCALE[3],
};

const LOWEST_PRIORITY = PRIORITY_BY_CODE.p4;

export function isPriorityCode(value: string): value is PriorityCode {
  return value === "p1" || value === "p2" || value === "p3" || value === "p4";
}

export function priorityEntryForCode(code: PriorityCode): PriorityScaleEntry {
  return PRIORITY_BY_CODE[code];
}

/**
 * Resuelve el nivel canónico para un peso de dominio. Cualquier peso ausente,
 * no finito o inferior a 3 cae en P4 (Baja).
 */
export function priorityEntryForWeight(peso?: number): PriorityScaleEntry {
  if (typeof peso !== "number" || !Number.isFinite(peso)) {
    return LOWEST_PRIORITY;
  }
  if (peso >= 5) return PRIORITY_BY_CODE.p1;
  if (peso >= 4) return PRIORITY_BY_CODE.p2;
  if (peso >= 3) return PRIORITY_BY_CODE.p3;
  return LOWEST_PRIORITY;
}

/**
 * Bucket explícito de alta prioridad: P1 (peso 5) o P2 (peso 4).
 * No es una etiqueta P1 ni debe usarse para agrupar/etiquetar el nivel.
 */
export function isHighPriority(peso?: number): boolean {
  return typeof peso === "number" && Number.isFinite(peso) && peso >= 4;
}

export function pesoToPriorityLevel(peso?: number): PriorityCode {
  return priorityEntryForWeight(peso).code;
}

/**
 * Peso que se aplica al seleccionar un nivel explícitamente (atajos, bulk,
 * drag & drop). Para P4 se conserva el peso mínimo histórico (1).
 */
export function priorityCodeToWeight(code: PriorityCode): number {
  return priorityEntryForCode(code).weight;
}

/**
 * Convierte el peso numérico de una tarea al badge visual de prioridad (P1..P4).
 */
export function weightToPriorityBadge(peso?: number): {
  code: PriorityCode;
  label: PriorityShortLabel;
  colorClass: string;
} {
  const entry = priorityEntryForWeight(peso);
  return {
    code: entry.code,
    label: entry.shortLabel,
    colorClass: entry.colorClass,
  };
}

export function priorityFilterLabel(entry: PriorityScaleEntry): string {
  return `${entry.shortLabel} (${entry.name})`;
}

export function priorityTaskLabel(entry: PriorityScaleEntry): string {
  return `Prioridad ${entry.code.slice(1)} (${entry.name})`;
}

export function priorityBadgeLabel(entry: PriorityScaleEntry): string {
  return `Prioridad ${entry.name}`;
}

export function prioritySectionLabel(entry: PriorityScaleEntry): string {
  return `${entry.shortLabel} — ${entry.name}`;
}

export function prioritySectionDescription(entry: PriorityScaleEntry): string {
  return `Prioridad ${entry.shortLabel} (${entry.name})`;
}
