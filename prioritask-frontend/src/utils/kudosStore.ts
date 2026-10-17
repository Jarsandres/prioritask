// ─────────────────────────────────────────────────────────────────────────────
// Kudos & Reconocimiento Doméstico ("👏", "🔥", "❤️") + Asignación Rápida L1
// Fase 4 UI Roadmap: Colaboración Doméstica Interactiva
// ─────────────────────────────────────────────────────────────────────────────

import { isHighPriority } from "./priorityScale";

export type KudosEmoji = "👏" | "🔥" | "❤️";

export interface KudosOption {
  emoji: KudosEmoji;
  code: "clap" | "fire" | "heart";
  label: string;
  basePoints: number;
}

export const KUDOS_OPTIONS: KudosOption[] = [
  { emoji: "👏", code: "clap", label: "¡Buen trabajo!", basePoints: 2 },
  { emoji: "🔥", code: "fire", label: "¡Imparable!", basePoints: 3 },
  { emoji: "❤️", code: "heart", label: "¡Gracias!", basePoints: 2 },
];

export interface TaskKudosState {
  counts: Record<KudosEmoji, number>;
  myReactions: KudosEmoji[];
}

export interface QuickAssignee {
  userId: string;
  label: string;
  role?: string;
  isOwner?: boolean;
}

const KUDOS_STORAGE_KEY = "prioritask_task_kudos_v1";
const KUDOS_POINTS_KEY = "prioritask_kudos_bonus_points_v1";
const ROOM_ASSIGNEES_PREFIX = "prioritask_room_assignees_";

interface StoredTaskKudosState extends TaskKudosState {
  reactionPoints?: Partial<Record<KudosEmoji, number>>;
}

const DEFAULT_KUDOS_STATE: TaskKudosState = {
  counts: { "👏": 0, "🔥": 0, "❤️": 0 },
  myReactions: [],
};

let storageListenerAttached = false;

function ensureCrossTabStorageListener(): void {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === KUDOS_STORAGE_KEY ||
      event.key === KUDOS_POINTS_KEY
    ) {
      window.dispatchEvent(new CustomEvent("prioritask:kudos-updated"));
    }
  });
}

ensureCrossTabStorageListener();

function readAllKudos(): Record<string, StoredTaskKudosState> {
  try {
    const raw = localStorage.getItem(KUDOS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllKudos(data: Record<string, StoredTaskKudosState>): void {
  try {
    localStorage.setItem(KUDOS_STORAGE_KEY, JSON.stringify(data));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("prioritask:kudos-updated"));
    }
  } catch {
    // Ignorar errores de cuota de almacenamiento
  }
}

function computePointsFromStoredKudos(
  all: Record<string, StoredTaskKudosState>
): number {
  let sum = 0;
  for (const entry of Object.values(all)) {
    if (!entry || typeof entry !== "object") continue;
    for (const opt of KUDOS_OPTIONS) {
      const count = entry.counts?.[opt.emoji] ?? 0;
      if (count <= 0) continue;
      const recorded = entry.reactionPoints?.[opt.emoji];
      if (typeof recorded === "number" && recorded > 0) {
        sum += recorded + Math.max(0, count - 1) * opt.basePoints;
      } else {
        sum += count * opt.basePoints;
      }
    }
  }
  return sum;
}

export function getTaskKudos(taskId: string): TaskKudosState {
  if (!taskId || !taskId.trim()) {
    return {
      ...DEFAULT_KUDOS_STATE,
      counts: { ...DEFAULT_KUDOS_STATE.counts },
      myReactions: [],
    };
  }
  const all = readAllKudos();
  const entry = all[taskId];
  if (!entry) {
    return {
      counts: { "👏": 0, "🔥": 0, "❤️": 0 },
      myReactions: [],
    };
  }
  return {
    counts: {
      "👏": entry.counts?.["👏"] ?? 0,
      "🔥": entry.counts?.["🔥"] ?? 0,
      "❤️": entry.counts?.["❤️"] ?? 0,
    },
    myReactions: Array.isArray(entry.myReactions) ? [...entry.myReactions] : [],
  };
}

export function getTotalKudosBonusPoints(): number {
  try {
    const rawStr = localStorage.getItem(KUDOS_POINTS_KEY);
    if (rawStr !== null) {
      const raw = Number(rawStr);
      if (Number.isFinite(raw) && raw >= 0) {
        return raw;
      }
    }
    return computePointsFromStoredKudos(readAllKudos());
  } catch {
    return 0;
  }
}

export function toggleTaskKudo(
  taskId: string,
  emoji: KudosEmoji,
  taskPeso = 2,
  hasEvidence = false
): { state: TaskKudosState; deltaPoints: number; added: boolean } {
  if (!taskId || !taskId.trim()) {
    return {
      state: getTaskKudos(""),
      deltaPoints: 0,
      added: false,
    };
  }

  const all = readAllKudos();
  const storedEntry = all[taskId];
  const current = getTaskKudos(taskId);
  const reactionPoints: Partial<Record<KudosEmoji, number>> = {
    ...(storedEntry?.reactionPoints || {}),
  };
  const option = KUDOS_OPTIONS.find((o) => o.emoji === emoji) || KUDOS_OPTIONS[0];

  // Bucket de alta prioridad (P1|P2) o evidencia fotográfica: micro-bono extra.
  const multiplier = isHighPriority(taskPeso) || hasEvidence ? 2 : 1;
  const pointValue = option.basePoints * multiplier;

  const alreadyReacted = current.myReactions.includes(emoji);
  let deltaPoints = 0;

  if (alreadyReacted) {
    const refunded =
      typeof reactionPoints[emoji] === "number" && reactionPoints[emoji]! > 0
        ? reactionPoints[emoji]!
        : pointValue;
    current.myReactions = current.myReactions.filter((r) => r !== emoji);
    current.counts[emoji] = Math.max(0, (current.counts[emoji] ?? 1) - 1);
    delete reactionPoints[emoji];
    deltaPoints = -refunded;
  } else {
    current.myReactions = [...current.myReactions, emoji];
    current.counts[emoji] = (current.counts[emoji] ?? 0) + 1;
    reactionPoints[emoji] = pointValue;
    deltaPoints = pointValue;
  }

  all[taskId] = {
    ...current,
    reactionPoints,
  };

  try {
    const hasAnyReactions = Object.values(all).some(
      (entry) =>
        (entry?.counts?.["👏"] ?? 0) +
          (entry?.counts?.["🔥"] ?? 0) +
          (entry?.counts?.["❤️"] ?? 0) >
        0
    );
    const nextTotal = hasAnyReactions
      ? Math.max(0, getTotalKudosBonusPoints() + deltaPoints)
      : 0;
    localStorage.setItem(KUDOS_POINTS_KEY, String(nextTotal));
  } catch {
    // Ignore storage errors
  }

  writeAllKudos(all);

  return {
    state: current,
    deltaPoints,
    added: !alreadyReacted,
  };
}

export function addTaskKudo(
  taskId: string,
  emoji: KudosEmoji,
  options?: { isHeavyOrVerified?: boolean; taskPeso?: number }
): { state: TaskKudosState; deltaPoints: number; added: boolean } {
  if (!taskId || !taskId.trim()) {
    return {
      state: getTaskKudos(""),
      deltaPoints: 0,
      added: false,
    };
  }
  const current = getTaskKudos(taskId);
  if (current.myReactions.includes(emoji)) {
    return {
      state: current,
      deltaPoints: 0,
      added: false,
    };
  }
  const peso = options?.taskPeso ?? (options?.isHeavyOrVerified ? 5 : 2);
  const hasEvidence = Boolean(options?.isHeavyOrVerified);
  return toggleTaskKudo(taskId, emoji, peso, hasEvidence);
}

export function getRoomTaskAssignees(roomId: string): Record<string, QuickAssignee[]> {
  if (!roomId) return {};
  try {
    const raw = localStorage.getItem(`${ROOM_ASSIGNEES_PREFIX}${roomId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function setRoomTaskAssignees(
  roomId: string,
  map: Record<string, QuickAssignee[]>
): void {
  if (!roomId) return;
  try {
    localStorage.setItem(`${ROOM_ASSIGNEES_PREFIX}${roomId}`, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function toggleMemberTaskAssignmentLocal(
  roomId: string,
  taskId: string,
  member: QuickAssignee
): { assignees: QuickAssignee[]; added: boolean; allMap: Record<string, QuickAssignee[]> } {
  const allMap = getRoomTaskAssignees(roomId);
  const currentList = Array.isArray(allMap[taskId]) ? [...allMap[taskId]] : [];
  const exists = currentList.some((m) => m.userId === member.userId);

  const nextList = exists
    ? currentList.filter((m) => m.userId !== member.userId)
    : [...currentList, member];

  allMap[taskId] = nextList;
  setRoomTaskAssignees(roomId, allMap);

  return {
    assignees: nextList,
    added: !exists,
    allMap,
  };
}

export function getMemberInitials(label?: string): string {
  if (!label) return "U";
  const clean = label.split("@")[0].trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "U";
}
