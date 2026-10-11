import {
  parseRecurrenceExpression,
  formatRecurrenceRule,
  toISODateString,
  type RecurrenceRuleConfig,
} from "./recurrenceEngine";

export type NlpTokenType = "date" | "priority" | "category" | "recurrence";

export interface NlpDetectedToken {
  type: NlpTokenType;
  raw: string;
  label: string;
  value: string | number;
}

export interface NlpParsedTaskResult {
  cleanTitle: string;
  tokens: NlpDetectedToken[];
  dueDate?: string;
  peso?: number;
  categoria?: string;
  recurrenceExpr?: string;
  recurrenceRule?: RecurrenceRuleConfig;
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
  p2: { peso: 4, code: "P2", label: "Alta" },
  "!2": { peso: 4, code: "P2", label: "Alta" },
  "!!": { peso: 4, code: "P2", label: "Alta" },
  p3: { peso: 3, code: "P3", label: "Media" },
  "!3": { peso: 3, code: "P3", label: "Media" },
  p4: { peso: 2, code: "P4", label: "Media-Baja" },
  "!4": { peso: 2, code: "P4", label: "Media-Baja" },
  p5: { peso: 1, code: "P5", label: "Baja" },
  "!5": { peso: 1, code: "P5", label: "Baja" },
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

/**
 * Parsea un título de tarea en lenguaje natural al estilo Todoist,
 * extrayendo tokens de fecha, prioridad (P1..P5, !!), categoría (#limpieza, #compras...)
 * y expresiones de recurrencia DSL (cada! 7 días, cada semana, etc.).
 */
export function parseNaturalTaskInput(
  rawInput: string,
  baseDate: Date = new Date()
): NlpParsedTaskResult {
  if (!rawInput || !rawInput.trim()) {
    return { cleanTitle: "", tokens: [] };
  }

  let working = rawInput;
  const tokens: NlpDetectedToken[] = [];
  let dueDate: string | undefined;
  let peso: number | undefined;
  let categoria: string | undefined;
  let recurrenceExpr: string | undefined;
  let recurrenceRule: RecurrenceRuleConfig | undefined;

  // 1. Detectar expresiones de recurrencia al estilo Todoist ("cada! 7 días", "cada semana", "every! 3 days", etc.)
  const recurrenceRegex =
    /\b((?:cada!|cada|every!|every)\s+(?:\d+\s+)?(?:d[ií]as?|semanas?|mes(?:es)?|a[ñn]os?|d[ií]a\s+laborable|workdays?|days?|weeks?|months?|years?|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?))\b/i;
  const recMatch = recurrenceRegex.exec(working);
  if (recMatch) {
    const candidateExpr = recMatch[1].trim();
    const parsed = parseRecurrenceExpression(candidateExpr);
    if (parsed) {
      recurrenceExpr = candidateExpr;
      recurrenceRule = parsed;
      tokens.push({
        type: "recurrence",
        raw: recMatch[1],
        label: formatRecurrenceRule(parsed),
        value: candidateExpr,
      });
      working =
        working.slice(0, recMatch.index) +
        " " +
        working.slice(recMatch.index + recMatch[0].length);
    }
  }

  // 2. Detectar fechas compuestas ("pasado mañana", "próxima semana", "15 oct" / "15 de octubre")
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

  // 3. Evaluar palabras individuales para fechas simples (hoy, mañana, lunes..domingo), prioridades (p1..p5, !!) y categorías (#limpieza...)
  const words = working.split(/\s+/).filter(Boolean);
  const keptWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();

    // Categorías (#limpieza, #compras, etc.)
    if (categoria === undefined && lower in CATEGORY_MAP) {
      const catInfo = CATEGORY_MAP[lower];
      categoria = catInfo.value;
      tokens.push({
        type: "category",
        raw: word,
        label: `#${catInfo.label}`,
        value: catInfo.value,
      });
      continue;
    }

    // Prioridades (p1..p5, !1..!5, !!, !!!, #urgente)
    if (peso === undefined && lower in PRIORITY_MAP) {
      const prioInfo = PRIORITY_MAP[lower];
      peso = prioInfo.peso;
      tokens.push({
        type: "priority",
        raw: word,
        label: `${prioInfo.code} · ${prioInfo.label}`,
        value: prioInfo.peso,
      });
      continue;
    }

    // Fechas de una palabra ("hoy", "mañana", días de la semana)
    if (dueDate === undefined) {
      if (lower === "hoy" || lower === "today") {
        dueDate = addDaysToBase(baseDate, 0);
        tokens.push({
          type: "date",
          raw: word,
          label: "Hoy",
          value: dueDate,
        });
        continue;
      }
      if (lower === "mañana" || lower === "manana" || lower === "tomorrow") {
        dueDate = addDaysToBase(baseDate, 1);
        tokens.push({
          type: "date",
          raw: word,
          label: "Mañana",
          value: dueDate,
        });
        continue;
      }
      if (lower in WEEKDAY_MAP) {
        // Si la palabra anterior conservada era "el" o "este", la removemos del título limpio
        if (
          keptWords.length > 0 &&
          (keptWords[keptWords.length - 1].toLowerCase() === "el" ||
            keptWords[keptWords.length - 1].toLowerCase() === "este")
        ) {
          keptWords.pop();
        }
        dueDate = getNextWeekdayIso(baseDate, WEEKDAY_MAP[lower]);
        const capLabel = lower.charAt(0).toUpperCase() + lower.slice(1);
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

  const cleanTitle = keptWords.join(" ").replace(/\s+/g, " ").trim();

  return {
    cleanTitle: cleanTitle || rawInput.trim(),
    tokens,
    dueDate,
    peso,
    categoria,
    recurrenceExpr,
    recurrenceRule,
  };
}

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

/**
 * Detecta si el cursor al final del texto está escribiendo un comando rápido (#, !, /)
 * y devuelve sugerencias filtradas para el menú flotante estilo 21st.dev / Todoist.
 */
export function getTriggerSuggestions(input: string): {
  triggerWord: string;
  suggestions: NlpSuggestionItem[];
} | null {
  if (!input) return null;
  const match = /(?:^|\s)([#!/][a-zA-Z0-9áéíóúñÁÉÍÓÚÑ!]*)$/.exec(input);
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

  return null;
}

