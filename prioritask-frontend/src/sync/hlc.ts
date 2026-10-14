/**
 * Reloj Lógico Híbrido (HLC - Hybrid Logical Clock)
 *
 * Combina el tiempo físico (`Date.now()`) con un contador lógico monótono y un
 * identificador de nodo (`nodeId`) para garantizar ordenamiento causal estricto
 * y resolución determinista de conflictos por campo (CRDT LWW-Element-Set),
 * incluso ante deriva de reloj (clock skew) o ediciones en el mismo milisegundo.
 *
 * Formato canónico ordenable lexicográficamente:
 *   `${paddedEpochMs13}:${paddedCounterHex4}:${nodeId}`
 * Ejemplo:
 *   `1760000000123:0001:tab_a1b2c3`
 */

export type HLCString = string;

export interface ParsedHLC {
  physicalMs: number;
  counter: number;
  nodeId: string;
  raw: HLCString;
}

const MAX_COUNTER = 0xffff;
export const MAX_HLC_FUTURE_DRIFT_MS = 300_000;
export const HLC_REGEX = /^\d{13}:[0-9a-fA-F]{4}:[a-zA-Z0-9_-]{1,36}$/;

export function isValidHlc(hlc: unknown): hlc is HLCString {
  return typeof hlc === "string" && HLC_REGEX.test(hlc);
}

function generateDefaultNodeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `node_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `node_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Formatea los componentes de un HLC en su representación canónica ordenable.
 */
export function formatHlc(
  physicalMs: number,
  counter: number,
  nodeId: string
): HLCString {
  const safePhysical = Math.max(0, Math.floor(physicalMs));
  const safeCounter = Math.max(0, Math.min(MAX_COUNTER, Math.floor(counter)));
  const paddedMs = String(safePhysical).padStart(13, "0");
  const paddedCounter = safeCounter.toString(16).padStart(4, "0").toLowerCase();
  const safeNodeId = nodeId.trim() || "node_anon";
  return `${paddedMs}:${paddedCounter}:${safeNodeId}`;
}

/**
 * Parsea una cadena HLC canónica en sus componentes numéricos y de nodo.
 */
export function parseHlc(hlc: string): ParsedHLC {
  if (!hlc || typeof hlc !== "string") {
    return { physicalMs: 0, counter: 0, nodeId: "", raw: "" };
  }

  const firstColon = hlc.indexOf(":");
  const secondColon = firstColon === -1 ? -1 : hlc.indexOf(":", firstColon + 1);

  if (firstColon === -1 || secondColon === -1 || !isValidHlc(hlc)) {
    return {
      physicalMs: 0,
      counter: 0,
      nodeId: "",
      raw: hlc,
    };
  }

  const physicalStr = hlc.slice(0, firstColon);
  const counterStr = hlc.slice(firstColon + 1, secondColon);
  const nodeId = hlc.slice(secondColon + 1);

  const physicalMs = Number.parseInt(physicalStr, 10);
  const counter = Number.parseInt(counterStr, 16);

  return {
    physicalMs: Number.isFinite(physicalMs) ? physicalMs : 0,
    counter: Number.isFinite(counter) ? counter : 0,
    nodeId,
    raw: hlc,
  };
}

/**
 * Compara dos marcas HLC de forma determinista:
 * - Devuelve `< 0` si `a < b`
 * - Devuelve `> 0` si `a > b`
 * - Devuelve `0` si son idénticos
 */
export function compareHlc(a: string, b: string): number {
  if (a === b) return 0;
  const parsedA = parseHlc(a);
  const parsedB = parseHlc(b);

  if (parsedA.physicalMs !== parsedB.physicalMs) {
    return parsedA.physicalMs < parsedB.physicalMs ? -1 : 1;
  }
  if (parsedA.counter !== parsedB.counter) {
    return parsedA.counter < parsedB.counter ? -1 : 1;
  }
  if (parsedA.nodeId !== parsedB.nodeId) {
    return parsedA.nodeId < parsedB.nodeId ? -1 : 1;
  }
  return 0;
}

export class HybridLogicalClock {
  private lastPhysicalMs: number;
  private lastCounter: number;
  private readonly nodeId: string;

  constructor(nodeId?: string, initialPhysicalMs = 0, initialCounter = 0) {
    this.nodeId = nodeId ?? generateDefaultNodeId();
    this.lastPhysicalMs = Math.max(0, Math.floor(initialPhysicalMs));
    this.lastCounter = Math.max(0, Math.floor(initialCounter));
  }

  getNodeId(): string {
    return this.nodeId;
  }

  /**
   * Genera una nueva marca HLC estrictamente monótona para un evento local.
   * Si el reloj físico retrocede o permanece en el mismo milisegundo,
   * incrementa el contador lógico sin retroceder jamás el tiempo físico.
   */
  now(wallTimeMs: number = Date.now()): HLCString {
    const physicalNow = Math.floor(wallTimeMs);

    if (physicalNow > this.lastPhysicalMs) {
      this.lastPhysicalMs = physicalNow;
      this.lastCounter = 0;
    } else {
      this.lastCounter += 1;
      if (this.lastCounter > MAX_COUNTER) {
        this.lastPhysicalMs += 1;
        this.lastCounter = 0;
      }
    }

    return formatHlc(this.lastPhysicalMs, this.lastCounter, this.nodeId);
  }

  /**
   * Fusiona una marca HLC remota recibida con el estado local del reloj,
   * garantizando que el resultado sea estrictamente mayor que el último HLC
   * local y que el HLC remoto recibido.
   */
  receive(remoteHlc: string, wallTimeMs: number = Date.now()): HLCString {
    if (!isValidHlc(remoteHlc)) {
      throw new Error("Formato de HLC inválido");
    }

    const physicalNow = Math.floor(wallTimeMs);
    const remote = parseHlc(remoteHlc);

    const maxAllowedMs = physicalNow + MAX_HLC_FUTURE_DRIFT_MS;
    if (remote.physicalMs > maxAllowedMs) {
      throw new Error("El timestamp HLC excede la deriva futura máxima permitida");
    }

    if (
      physicalNow > this.lastPhysicalMs &&
      physicalNow > remote.physicalMs
    ) {
      this.lastPhysicalMs = physicalNow;
      this.lastCounter = 0;
    } else if (this.lastPhysicalMs === remote.physicalMs) {
      this.lastCounter = Math.max(this.lastCounter, remote.counter) + 1;
    } else if (this.lastPhysicalMs > remote.physicalMs) {
      this.lastCounter += 1;
    } else {
      this.lastPhysicalMs = remote.physicalMs;
      this.lastCounter = remote.counter + 1;
    }

    if (this.lastCounter > MAX_COUNTER) {
      this.lastPhysicalMs += 1;
      this.lastCounter = 0;
    }

    return formatHlc(this.lastPhysicalMs, this.lastCounter, this.nodeId);
  }

  static parse(hlc: string): ParsedHLC {
    return parseHlc(hlc);
  }

  static compare(a: string, b: string): number {
    return compareHlc(a, b);
  }
}
