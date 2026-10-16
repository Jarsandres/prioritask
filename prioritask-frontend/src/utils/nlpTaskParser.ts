import {
  parseRecurrenceExpression,
  formatRecurrenceRule,
  toISODateString,
  type RecurrenceRuleConfig,
} from "./recurrenceEngine";
import {
  irToRecurrenceRuleConfig,
  scanRecurrenceClause,
} from "./recurrenceLexer";

export type NlpTokenType =
  | "date"
  | "time"
  | "priority"
  | "category"
  | "recurrence"
  | "tag"
  | "room"
  | "assignee";

export interface NlpDetectedToken {
  type: NlpTokenType;
  raw: string;
  label: string;
  value: string | number;
}

export interface NlpParseContext {
  rooms?: Array<{ id: string; nombre: string }>;
  tags?: Array<{ id: string; nombre: string }>;
  members?: Array<{
    user_id: string;
    user_nombre?: string | null;
    user_email?: string | null;
  }>;
}

export interface NlpParsedTaskResult {
  cleanTitle: string;
  tokens: NlpDetectedToken[];
  dueDate?: string;
  dueTime?: string;
  peso?: number;
  categoria?: string;
  recurrenceExpr?: string;
  recurrenceRule?: RecurrenceRuleConfig;
  tags?: string[];
  tagIds?: string[];
  roomId?: string;
  roomName?: string;
  assigneeId?: string;
  assigneeName?: string;
}

export interface NlpSuggestionItem {
  id: string;
  type: NlpTokenType;
  token: string;
  label: string;
  description: string;
}

const CATEGORY_MAP: Record<string, { value: string; label: string }> = {
  "#limpieza": { value: "LIMPIEZA", label: "Limpieza" },
  "#limpiar": { value: "LIMPIEZA", label: "Limpieza" },
  "#hogar": { value: "LIMPIEZA", label: "Limpieza" },
  "#compra": { value: "COMPRA", label: "Compra" },
  "#compras": { value: "COMPRA", label: "Compra" },
  "#super": { value: "COMPRA", label: "Compra" },
  "#supermercado": { value: "COMPRA", label: "Compra" },
  "#mantenimiento": { value: "MANTENIMIENTO", label: "Mantenimiento" },
  "#reparar": { value: "MANTENIMIENTO", label: "Mantenimiento" },
  "#arreglo": { value: "MANTENIMIENTO", label: "Mantenimiento" },
  "#otro": { value: "OTRO", label: "Otro" },
  "#otros": { value: "OTRO", label: "Otro" },
  "#general": { value: "OTRO", label: "Otro" },
};

const PRIORITY_MAP: Record<string, { peso: number; code: string; label: string }> = {
  p1: { peso: 5, code: "P1", label: "Urgente" },
  "!1": { peso: 5, code: "P1", label: "Urgente" },
  "!!!": { peso: 5, code: "P1", label: "Urgente" },
  "#urgente": { peso: 5, code: "P1", label: "Urgente" },
  "!urgente": { peso: 5, code: "P1", label: "Urgente" },
  p2: { peso: 4, code: "P2", label: "Alta" },
  "!2": { peso: 4, code: "P2", label: "Alta" },
  "!!": { peso: 4, code: "P2", label: "Alta" },
  "!alta": { peso: 4, code: "P2", label: "Alta" },
  p3: { peso: 3, code: "P3", label: "Media" },
  "!3": { peso: 3, code: "P3", label: "Media" },
  "!media": { peso: 3, code: "P3", label: "Media" },
  p4: { peso: 2, code: "P4", label: "Media-Baja" },
  "!4": { peso: 2, code: "P4", label: "Media-Baja" },
  p5: { peso: 1, code: "P5", label: "Baja" },
  "!5": { peso: 1, code: "P5", label: "Baja" },
  "!baja": { peso: 1, code: "P5", label: "Baja" },
};

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const MONTH_MAP: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeMatchKey(value: string): string {
  return normalizeText(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function findMatchingRoom(
  rawQuery: string,
  rooms?: Array<{ id: string; nombre: string }>,
  allowPartial = true
): { id: string; nombre: string } | undefined {
  if (!rooms || rooms.length === 0) return undefined;
  const qKey = normalizeMatchKey(rawQuery);
  if (!qKey) return undefined;

  const exact = rooms.find((r) => normalizeMatchKey(r.nombre) === qKey);
  if (exact) return exact;

  if (!allowPartial) return undefined;

  const prefixOrFirstWord = rooms.find((r) => {
    const rKey = normalizeMatchKey(r.nombre);
    const firstWord = rKey.split(" ")[0];
    return rKey.startsWith(`${qKey} `) || firstWord === qKey;
  });
  if (prefixOrFirstWord) return prefixOrFirstWord;

  return rooms.find((r) => normalizeMatchKey(r.nombre).includes(qKey));
}

function findMatchingMember(
  rawQuery: string,
  members?: Array<{
    user_id: string;
    user_nombre?: string | null;
    user_email?: string | null;
  }>
):
  | {
      user_id: string;
      user_nombre?: string | null;
      user_email?: string | null;
    }
  | undefined {
  if (!members || members.length === 0) return undefined;
  const qKey = normalizeMatchKey(rawQuery);
  if (!qKey) return undefined;

  return members.find((m) => {
    if (m.user_nombre) {
      const nameKey = normalizeMatchKey(m.user_nombre);
      const firstWord = nameKey.split(" ")[0];
      if (
        nameKey === qKey ||
        firstWord === qKey ||
        nameKey.startsWith(`${qKey} `)
      ) {
        return true;
      }
    }
    if (m.user_email) {
      const emailPrefix = m.user_email.split("@")[0] || "";
      const emailKey = normalizeMatchKey(emailPrefix.replace(/\./g, " "));
      const rawEmailNorm = normalizeText(emailPrefix);
      if (emailKey === qKey || rawEmailNorm === qKey) {
        return true;
      }
    }
    return false;
  });
}

function addDaysToBase(baseDate: Date, days: number): string {
  const d = new Date(
    Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + days)
  );
  return toISODateString(d);
}

function getNextWeekdayIso(baseDate: Date, targetDow: number): string {
  const currentDow = baseDate.getDay();
  let diff = targetDow - currentDow;
  if (diff <= 0) {
    diff += 7;
  }
  return addDaysToBase(baseDate, diff);
}

function getNextWeekendSaturdayIso(baseDate: Date): string {
  const currentDow = baseDate.getDay();
  if (currentDow === 6) {
    return baseDate.getHours() >= 18
      ? addDaysToBase(baseDate, 7)
      : addDaysToBase(baseDate, 0);
  }
  let diff = 6 - currentDow;
  if (diff < 0) {
    diff += 7;
  }
  return addDaysToBase(baseDate, diff);
}

function stripTrailingPunctuation(str: string): string {
  return str.replace(/[,.;:]+$/, "");
}

/**
 * Parsea un título de tarea en lenguaje natural al estilo Todoist,
 * extrayendo tokens de fecha, prioridad (P1..P5, !!, !alta), categoría (#limpieza, #compras...),
 * etiquetas (@tag), hogar/habitación (~cocina o #cocina), asignado (+miembro)
 * y expresiones de recurrencia DSL (cada! 7 días, cada semana, etc.).
 */
export function parseNaturalTaskInput(
  rawInput: string,
  baseDateOrContext: Date | NlpParseContext = new Date(),
  maybeContext?: NlpParseContext
): NlpParsedTaskResult {
  const baseDate =
    baseDateOrContext instanceof Date ? baseDateOrContext : new Date();
  const context: NlpParseContext | undefined =
    baseDateOrContext instanceof Date ? maybeContext : baseDateOrContext;

  if (!rawInput || !rawInput.trim()) {
    return { cleanTitle: "", tokens: [], tags: [], tagIds: [] };
  }

  let working = rawInput;
  const tokens: NlpDetectedToken[] = [];
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let peso: number | undefined;
  let categoria: string | undefined;
  let recurrenceExpr: string | undefined;
  let recurrenceRule: RecurrenceRuleConfig | undefined;
  const tags: string[] = [];
  const tagIds: string[] = [];
  let roomId: string | undefined;
  let roomName: string | undefined;
  let assigneeId: string | undefined;
  let assigneeName: string | undefined;

  // 1. Detectar expresiones de recurrencia con el escáner single-pass (FSM).
  //    Captura la cláusula completa, incluidas listas multi-día ("cada lunes y jueves"),
  //    corrigiendo la limitación previa del regex de match único.
  const recScan = scanRecurrenceClause(working);
  if (recScan.matched && recScan.ir) {
    const candidateExpr = recScan.text;
    const parsed =
      parseRecurrenceExpression(candidateExpr) ??
      irToRecurrenceRuleConfig(recScan.ir);
    recurrenceExpr = candidateExpr;
    recurrenceRule = parsed;
    tokens.push({
      type: "recurrence",
      raw: candidateExpr,
      label: formatRecurrenceRule(parsed),
      value: candidateExpr,
    });
    working =
      working.slice(0, recScan.start) + " " + working.slice(recScan.end);
  }

  // 2. Detectar fechas compuestas y relativas
  const pasadoMananaRegex = /\b(pasado\s+ma[ñn]ana)\b/i;
  const pmMatch = pasadoMananaRegex.exec(working);
  if (pmMatch) {
    dueDate = addDaysToBase(baseDate, 2);
    tokens.push({
      type: "date",
      raw: pmMatch[1],
      label: "Pasado mañana",
      value: dueDate,
    });
    working =
      working.slice(0, pmMatch.index) +
      " " +
      working.slice(pmMatch.index + pmMatch[0].length);
  }

  if (!dueDate) {
    const proxSemanaRegex = /\b(pr[oó]xima\s+semana)\b/i;
    const psMatch = proxSemanaRegex.exec(working);
    if (psMatch) {
      dueDate = addDaysToBase(baseDate, 7);
      tokens.push({
        type: "date",
        raw: psMatch[1],
        label: "Próx. semana",
        value: dueDate,
      });
      working =
        working.slice(0, psMatch.index) +
        " " +
        working.slice(psMatch.index + psMatch[0].length);
    }
  }

  // Fechas relativas adicionales: "en N días", "en N semanas", "fin de semana"
  if (!dueDate) {
    const enDiasRegex = /\ben\s+(\d+)\s+d[ií]as?\b/i;
    const edMatch = enDiasRegex.exec(working);
    if (edMatch) {
      const nDays = Number(edMatch[1]);
      if (Number.isFinite(nDays) && nDays >= 0) {
        dueDate = addDaysToBase(baseDate, nDays);
        tokens.push({
          type: "date",
          raw: edMatch[0],
          label: `En ${nDays} días`,
          value: dueDate,
        });
        working =
          working.slice(0, edMatch.index) +
          " " +
          working.slice(edMatch.index + edMatch[0].length);
      }
    }
  }

  if (!dueDate) {
    const enSemanasRegex = /\ben\s+(\d+)\s+semanas?\b/i;
    const esMatch = enSemanasRegex.exec(working);
    if (esMatch) {
      const nWeeks = Number(esMatch[1]);
      if (Number.isFinite(nWeeks) && nWeeks >= 0) {
        dueDate = addDaysToBase(baseDate, nWeeks * 7);
        tokens.push({
          type: "date",
          raw: esMatch[0],
          label: `En ${nWeeks} semanas`,
          value: dueDate,
        });
        working =
          working.slice(0, esMatch.index) +
          " " +
          working.slice(esMatch.index + esMatch[0].length);
      }
    }
  }

  if (!dueDate) {
    const finDeSemanaRegex = /\b(?:este\s+)?fin\s+de\s+semana\b/i;
    const fdsMatch = finDeSemanaRegex.exec(working);
    if (fdsMatch) {
      dueDate = getNextWeekendSaturdayIso(baseDate);
      tokens.push({
        type: "date",
        raw: fdsMatch[0],
        label: "Fin de semana",
        value: dueDate,
      });
      working =
        working.slice(0, fdsMatch.index) +
        " " +
        working.slice(fdsMatch.index + fdsMatch[0].length);
    }
  }

  // Formatos numéricos de fecha: DD/MM o DD/MM/YYYY (o con -)
  if (!dueDate) {
    const numericDateRegex = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/;
    const ndMatch = numericDateRegex.exec(working);
    if (ndMatch) {
      const dayNum = Number(ndMatch[1]);
      const monthNum = Number(ndMatch[2]);
      const yearNum = ndMatch[3] ? Number(ndMatch[3]) : undefined;
      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        const monthIdx = monthNum - 1;
        let targetYear = yearNum ?? baseDate.getFullYear();
        if (yearNum === undefined) {
          const candidateDate = new Date(Date.UTC(targetYear, monthIdx, dayNum));
          const todayUtc = new Date(
            Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
          );
          if (candidateDate.getTime() < todayUtc.getTime()) {
            targetYear += 1;
          }
        }
        const resolved = new Date(Date.UTC(targetYear, monthIdx, dayNum));
        if (
          resolved.getUTCMonth() === monthIdx &&
          resolved.getUTCDate() === dayNum
        ) {
          dueDate = toISODateString(resolved);
          const displayLabel = yearNum
            ? `${dayNum}/${monthNum}/${yearNum}`
            : `${dayNum}/${monthNum}`;
          tokens.push({
            type: "date",
            raw: ndMatch[0],
            label: displayLabel,
            value: dueDate,
          });
          working =
            working.slice(0, ndMatch.index) +
            " " +
            working.slice(ndMatch.index + ndMatch[0].length);
        }
      }
    }
  }

  if (!dueDate) {
    const dayMonthRegex =
      /\b(\d{1,2})\s+(?:de\s+)?(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\b/i;
    const dmMatch = dayMonthRegex.exec(working);
    if (dmMatch) {
      const dayNum = Number(dmMatch[1]);
      const monthKey = dmMatch[2].toLowerCase();
      const monthIdx = MONTH_MAP[monthKey];
      if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
        let targetYear = baseDate.getFullYear();
        const candidateDate = new Date(Date.UTC(targetYear, monthIdx, dayNum));
        const todayUtc = new Date(
          Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())
        );
        if (candidateDate.getTime() < todayUtc.getTime()) {
          targetYear += 1;
        }
        const resolved = new Date(Date.UTC(targetYear, monthIdx, dayNum));
        if (resolved.getUTCMonth() === monthIdx) {
          dueDate = toISODateString(resolved);
          tokens.push({
            type: "date",
            raw: dmMatch[0],
            label: `${dayNum} ${monthKey.slice(0, 3)}`,
            value: dueDate,
          });
          working =
            working.slice(0, dmMatch.index) +
            " " +
            working.slice(dmMatch.index + dmMatch[0].length);
        }
      }
    }
  }

  // 2.5. Extracción de horas ("a las 18:30", "18:30")
  const timeRegex = /\b(?:a\s+las?\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i;
  const timeMatch = timeRegex.exec(working);
  if (timeMatch) {
    const hh = timeMatch[1].padStart(2, "0");
    const mm = timeMatch[2];
    const formattedTime = `${hh}:${mm}`;
    dueTime = formattedTime;
    tokens.push({
      type: "time",
      raw: timeMatch[0],
      label: formattedTime,
      value: formattedTime,
    });
    working =
      working.slice(0, timeMatch.index) +
      " " +
      working.slice(timeMatch.index + timeMatch[0].length);
  }

  // 3. Evaluar palabras individuales y tokens entrecomillados (~"Habitación Principal", #"Habitación Principal", +"María José")
  const words = working.match(/(?:[~+#]["'][^"']+["']|\S+)/g) || [];
  const keptWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();
    const cleanWord = stripTrailingPunctuation(word);
    const cleanLower = stripTrailingPunctuation(lower);

    // Etiquetas (@tag) — RN-04: 1..30 chars alfanuméricos/guiones/underscores, normalizadas en minúsculas, sin duplicados, máx 10
    if (cleanWord.startsWith("@") && cleanWord.length > 1) {
      const tagMatch = /^@([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]{1,30})$/.exec(cleanWord);
      if (tagMatch) {
        const normalizedTag = tagMatch[1].toLowerCase();
        if (!tags.includes(normalizedTag) && tags.length < 10) {
          tags.push(normalizedTag);
          tokens.push({
            type: "tag",
            raw: word,
            label: `@${normalizedTag}`,
            value: normalizedTag,
          });
          const matchedTagObj = context?.tags?.find(
            (t) => normalizeMatchKey(t.nombre) === normalizeMatchKey(normalizedTag)
          );
          if (matchedTagObj && !tagIds.includes(matchedTagObj.id)) {
            tagIds.push(matchedTagObj.id);
          }
        }
        continue;
      }
    }

    // Habitaciones explícitas con ~ (~cocina, ~"Habitación Principal", ~habitacion_principal) — RN-03
    if (word.startsWith("~") && word.length > 1) {
      const rawRoomToken = stripTrailingPunctuation(
        word.slice(1).replace(/^["']|["']$/g, "").trim()
      );
      if (roomId === undefined && rawRoomToken) {
        const matchedRoom = findMatchingRoom(rawRoomToken, context?.rooms, true);
        if (matchedRoom) {
          roomId = matchedRoom.id;
          roomName = matchedRoom.nombre;
          tokens.push({
            type: "room",
            raw: word,
            label: `~${matchedRoom.nombre}`,
            value: matchedRoom.id,
          });
          continue;
        }
      }
      keptWords.push(word);
      continue;
    }

    // Asignación a miembros del hogar (+nombre, +"María José", +maria_jose) — RN-05
    if (word.startsWith("+") && word.length > 1) {
      const rawMemberToken = stripTrailingPunctuation(
        word.slice(1).replace(/^["']|["']$/g, "").trim()
      );
      if (assigneeId === undefined && rawMemberToken) {
        const matchedMember = findMatchingMember(rawMemberToken, context?.members);
        if (matchedMember) {
          assigneeId = matchedMember.user_id;
          const displayName =
            matchedMember.user_nombre ||
            matchedMember.user_email?.split("@")[0] ||
            matchedMember.user_id;
          assigneeName = displayName;
          tokens.push({
            type: "assignee",
            raw: word,
            label: `+${displayName}`,
            value: matchedMember.user_id,
          });
          continue;
        }
      }
      keptWords.push(word);
      continue;
    }

    // Categorías (#limpieza, #compras, etc.)
    if (categoria === undefined && cleanLower in CATEGORY_MAP) {
      const catInfo = CATEGORY_MAP[cleanLower];
      categoria = catInfo.value;
      tokens.push({
        type: "category",
        raw: word,
        label: `#${catInfo.label}`,
        value: catInfo.value,
      });
      continue;
    }

    // Prioridades (p1..p5, !1..!5, !!, !!!, #urgente, !alta, !media, !baja)
    if (peso === undefined && cleanLower in PRIORITY_MAP) {
      const prioInfo = PRIORITY_MAP[cleanLower];
      peso = prioInfo.peso;
      tokens.push({
        type: "priority",
        raw: word,
        label: `${prioInfo.code} · ${prioInfo.label}`,
        value: prioInfo.peso,
      });
      continue;
    }

    // Desambiguación de #token contra habitaciones del usuario cuando no es categoría ni prioridad — RN-03
    if (word.startsWith("#") && word.length > 1 && roomId === undefined) {
      const rawHashRoom = stripTrailingPunctuation(
        word.slice(1).replace(/^["']|["']$/g, "").trim()
      );
      const matchedRoom = findMatchingRoom(rawHashRoom, context?.rooms, true);
      if (matchedRoom) {
        roomId = matchedRoom.id;
        roomName = matchedRoom.nombre;
        tokens.push({
          type: "room",
          raw: word,
          label: `~${matchedRoom.nombre}`,
          value: matchedRoom.id,
        });
        continue;
      }
    }

    // Fechas de una palabra ("hoy", "mañana", días de la semana)
    if (dueDate === undefined) {
      if (cleanLower === "hoy" || cleanLower === "today") {
        dueDate = addDaysToBase(baseDate, 0);
        tokens.push({
          type: "date",
          raw: word,
          label: "Hoy",
          value: dueDate,
        });
        continue;
      }
      if (cleanLower === "mañana" || cleanLower === "manana" || cleanLower === "tomorrow") {
        dueDate = addDaysToBase(baseDate, 1);
        tokens.push({
          type: "date",
          raw: word,
          label: "Mañana",
          value: dueDate,
        });
        continue;
      }
      if (cleanLower in WEEKDAY_MAP) {
        // Si la palabra anterior conservada era "el" o "este", la removemos del título limpio
        if (
          keptWords.length > 0 &&
          (keptWords[keptWords.length - 1].toLowerCase() === "el" ||
            keptWords[keptWords.length - 1].toLowerCase() === "este")
        ) {
          keptWords.pop();
        }
        dueDate = getNextWeekdayIso(baseDate, WEEKDAY_MAP[cleanLower]);
        const capLabel = cleanLower.charAt(0).toUpperCase() + cleanLower.slice(1);
        tokens.push({
          type: "date",
          raw: word,
          label: capLabel,
          value: dueDate,
        });
        continue;
      }
    }

    keptWords.push(word);
  }

  let cleanTitle = keptWords.join(" ").replace(/\s+/g, " ").trim();
  cleanTitle = cleanTitle.replace(/[,;]+$/, "").trim();

  return {
    cleanTitle: cleanTitle || rawInput.trim(),
    tokens,
    dueDate,
    dueTime,
    peso,
    categoria,
    recurrenceExpr,
    recurrenceRule,
    tags,
    tagIds,
    roomId,
    roomName,
    assigneeId,
    assigneeName,
  };
}

export const parseTaskInput = parseNaturalTaskInput;

export const NLP_QUICK_SUGGESTIONS: NlpSuggestionItem[] = [
  {
    id: "cat-limpieza",
    type: "category",
    token: "#limpieza",
    label: "#limpieza",
    description: "Categoría Limpieza",
  },
  {
    id: "cat-compras",
    type: "category",
    token: "#compras",
    label: "#compras",
    description: "Categoría Compra",
  },
  {
    id: "cat-mantenimiento",
    type: "category",
    token: "#mantenimiento",
    label: "#mantenimiento",
    description: "Categoría Mantenimiento",
  },
  {
    id: "cat-otro",
    type: "category",
    token: "#otro",
    label: "#otro",
    description: "Categoría Otro",
  },
  {
    id: "prio-p1",
    type: "priority",
    token: "p1",
    label: "P1 · Urgente",
    description: "Prioridad máxima (Peso 5)",
  },
  {
    id: "prio-p2",
    type: "priority",
    token: "p2",
    label: "P2 · Alta",
    description: "Prioridad alta (Peso 4)",
  },
  {
    id: "prio-p3",
    type: "priority",
    token: "p3",
    label: "P3 · Media",
    description: "Prioridad media (Peso 3)",
  },
  {
    id: "prio-p4",
    type: "priority",
    token: "p4",
    label: "P4 · Media-Baja",
    description: "Prioridad estándar (Peso 2)",
  },
  {
    id: "prio-p5",
    type: "priority",
    token: "p5",
    label: "P5 · Baja",
    description: "Prioridad baja (Peso 1)",
  },
  {
    id: "date-hoy",
    type: "date",
    token: "hoy",
    label: "Hoy",
    description: "Vence hoy mismo",
  },
  {
    id: "date-manana",
    type: "date",
    token: "mañana",
    label: "Mañana",
    description: "Vence mañana",
  },
  {
    id: "rec-7dias",
    type: "recurrence",
    token: "cada! 7 días",
    label: "cada! 7 días",
    description: "Rutina flotante al completar",
  },
  {
    id: "rec-semana",
    type: "recurrence",
    token: "cada semana",
    label: "cada semana",
    description: "Rutina semanal fija",
  },
];

const DEFAULT_TAG_SUGGESTIONS: NlpSuggestionItem[] = [
  {
    id: "tag-default-urgente",
    type: "tag",
    token: "@urgente",
    label: "@urgente",
    description: "Etiqueta rápida",
  },
  {
    id: "tag-default-hogar",
    type: "tag",
    token: "@hogar",
    label: "@hogar",
    description: "Etiqueta rápida",
  },
  {
    id: "tag-default-pendiente",
    type: "tag",
    token: "@pendiente",
    label: "@pendiente",
    description: "Etiqueta rápida",
  },
];

/**
 * Detecta si el cursor al final del texto está escribiendo un comando rápido (#, !, /, @, ~, +)
 * y devuelve sugerencias filtradas para el menú flotante estilo 21st.dev / Todoist.
 */
export function getTriggerSuggestions(
  input: string,
  context?: NlpParseContext
): {
  triggerWord: string;
  suggestions: NlpSuggestionItem[];
} | null {
  if (!input) return null;
  const match = /(?:^|\s)([#!/~@+][a-zA-Z0-9áéíóúñÁÉÍÓÚÑ!_-]*)$/.exec(input);
  if (!match) return null;

  const rawTrigger = match[1];
  const triggerWord = rawTrigger.toLowerCase();

  if (triggerWord.startsWith("/")) {
    const query = triggerWord.slice(1);
    if (!query) {
      // Mostrar una selección balanceada (categorías, prioridades, fechas y recurrencias)
      return {
        triggerWord: rawTrigger,
        suggestions: [
          NLP_QUICK_SUGGESTIONS[0], // #limpieza
          NLP_QUICK_SUGGESTIONS[1], // #compras
          NLP_QUICK_SUGGESTIONS[4], // p1
          NLP_QUICK_SUGGESTIONS[5], // p2
          NLP_QUICK_SUGGESTIONS[9], // hoy
          NLP_QUICK_SUGGESTIONS[10], // mañana
          NLP_QUICK_SUGGESTIONS[11], // cada! 7 días
          NLP_QUICK_SUGGESTIONS[12], // cada semana
        ],
      };
    }
    const filtered = NLP_QUICK_SUGGESTIONS.filter(
      (item) =>
        item.token.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
    );
    return filtered.length > 0
      ? { triggerWord: rawTrigger, suggestions: filtered }
      : null;
  }

  if (triggerWord.startsWith("#")) {
    const query = triggerWord.slice(1);
    const filtered = NLP_QUICK_SUGGESTIONS.filter(
      (item) =>
        item.type === "category" &&
        (item.token.toLowerCase().includes(query) ||
          item.label.toLowerCase().includes(query))
    );
    return filtered.length > 0
      ? { triggerWord: rawTrigger, suggestions: filtered }
      : null;
  }

  if (triggerWord.startsWith("!")) {
    const query = triggerWord.slice(1).replace(/!/g, "");
    const priorities = NLP_QUICK_SUGGESTIONS.filter(
      (item) => item.type === "priority"
    );
    const filtered = query
      ? priorities.filter(
          (item) =>
            item.token.toLowerCase().includes(query) ||
            item.label.toLowerCase().includes(query)
        )
      : priorities;
    return filtered.length > 0
      ? { triggerWord: rawTrigger, suggestions: filtered }
      : null;
  }

  if (triggerWord.startsWith("@")) {
    const query = normalizeText(triggerWord.slice(1));
    const sourceTags: NlpSuggestionItem[] =
      context?.tags && context.tags.length > 0
        ? context.tags.map((t) => {
            const slug = t.nombre
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "_");
            return {
              id: `tag-${t.id}`,
              type: "tag",
              token: `@${slug}`,
              label: `@${t.nombre}`,
              description: "Etiqueta",
            };
          })
        : DEFAULT_TAG_SUGGESTIONS;

    const filtered = query
      ? sourceTags.filter(
          (item) =>
            normalizeText(item.token).includes(query) ||
            normalizeText(item.label).includes(query)
        )
      : sourceTags;

    return filtered.length > 0
      ? { triggerWord: rawTrigger, suggestions: filtered }
      : null;
  }

  if (triggerWord.startsWith("~")) {
    const rooms = context?.rooms || [];
    if (rooms.length === 0) return null;
    const query = normalizeMatchKey(triggerWord.slice(1));
    const roomSuggestions: NlpSuggestionItem[] = rooms.map((r) => {
      const trimmed = r.nombre.trim();
      const hasSpaces = /\s/.test(trimmed);
      return {
        id: `room-${r.id}`,
        type: "room",
        token: hasSpaces ? `~"${trimmed}"` : `~${trimmed.toLowerCase()}`,
        label: `~${trimmed}`,
        description: "Hogar / Sala",
      };
    });
    const filtered = query
      ? roomSuggestions.filter((item) =>
          normalizeMatchKey(item.label).includes(query)
        )
      : roomSuggestions;
    return filtered.length > 0
      ? { triggerWord: rawTrigger, suggestions: filtered }
      : null;
  }

  if (triggerWord.startsWith("+")) {
    const members = context?.members || [];
    if (members.length === 0) return null;
    const query = normalizeMatchKey(triggerWord.slice(1));
    const memberSuggestions: NlpSuggestionItem[] = members.map((m) => {
      const displayName = (
        m.user_nombre ||
        m.user_email?.split("@")[0] ||
        m.user_id
      ).trim();
      const hasSpaces = /\s/.test(displayName);
      return {
        id: `assignee-${m.user_id}`,
        type: "assignee",
        token: hasSpaces ? `+"${displayName}"` : `+${displayName.toLowerCase()}`,
        label: `+${displayName}`,
        description: m.user_email || "Miembro del hogar",
      };
    });
    const filtered = query
      ? memberSuggestions.filter(
          (item) =>
            normalizeMatchKey(item.label).includes(query) ||
            normalizeMatchKey(item.description).includes(query)
        )
      : memberSuggestions;
    return filtered.length > 0
      ? { triggerWord: rawTrigger, suggestions: filtered }
      : null;
  }

  return null;
}


