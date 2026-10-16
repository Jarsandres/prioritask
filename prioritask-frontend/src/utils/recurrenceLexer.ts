// ─────────────────────────────────────────────────────────────────────────────
// recurrenceLexer — Gramática léxica + FSM determinista para recurrencia NL
//
// Objetivo: parsear expresiones de recurrencia en lenguaje natural ES/EN
// ("cada lunes", "el 15 de cada mes", "mañana a las 18:00") a una IR tipada y a
// RRULE (RFC 5545 §3.3.10), con un escáner de UNA sola pasada y CERO dependencias.
//
// Diseño: ver notes/03-nlp-recurrence-grammar.md (§6-7). Tabla de transiciones
// explícita, maximal-munch acotado y rechazo determinista.
// ─────────────────────────────────────────────────────────────────────────────

import type { RecurrenceRuleConfig } from "./recurrenceEngine";

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo (convención JS)

export type RecurrenceFrequencyNL =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY"
  | "WORKDAYS";

export type RecurrenceModeNL = "FIXED" | "FLOATING";

/** Representación intermedia, agnóstica de persistencia. */
export interface RecurrenceIR {
  frequency: RecurrenceFrequencyNL;
  interval: number;
  mode: RecurrenceModeNL;
  byWeekdays?: WeekdayIndex[];
  dayOfMonth?: number;
  isLastDayOfMonth?: boolean;
  until?: string; // ISO-8601 YYYY-MM-DD
}

export type RRuleFreq =
  | "SECONDLY"
  | "MINUTELY"
  | "HOURLY"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY";

/** Subconjunto de RECUR de RFC 5545 §3.3.10 que Prioritask necesita. */
export interface RRuleParts {
  FREQ: RRuleFreq;
  INTERVAL?: number;
  COUNT?: number;
  UNTIL?: string;
  BYDAY?: string[];
  BYMONTHDAY?: number[];
  BYMONTH?: number[];
  WKST?: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
}

export interface RecurrenceScanResult {
  matched: boolean;
  /** Offsets del match en el input original: [start, end). */
  start: number;
  end: number;
  /** Subcadena exacta consumida (la "cláusula" de recurrencia). */
  text: string;
  ir?: RecurrenceIR;
  rrule?: RRuleParts;
}

// ─── Constantes léxicas ──────────────────────────────────────────────────────

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 365;

const DAY_CODES: readonly string[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const WORKDAY_CODES: readonly string[] = ["MO", "TU", "WE", "TH", "FR"];

const WEEKDAY_WORDS: Record<string, WeekdayIndex> = {
  domingo: 0, dom: 0, sunday: 0, sun: 0,
  lunes: 1, lun: 1, monday: 1, mon: 1,
  martes: 2, mar: 2, tuesday: 2, tue: 2,
  miercoles: 3, mie: 3, wednesday: 3, wed: 3,
  jueves: 4, jue: 4, thursday: 4, thu: 4,
  viernes: 5, vie: 5, friday: 5, fri: 5,
  sabado: 6, sab: 6, saturday: 6, sat: 6,
};

const UNIT_WORDS: Record<string, RecurrenceFrequencyNL> = {
  dias: "DAILY", days: "DAILY",
  semana: "WEEKLY", semanas: "WEEKLY", week: "WEEKLY", weeks: "WEEKLY",
  mes: "MONTHLY", meses: "MONTHLY", month: "MONTHLY", months: "MONTHLY",
  ano: "YEARLY", anos: "YEARLY", year: "YEARLY", years: "YEARLY",
};

const WORD_CLASSES: Record<string, TokenClass> = {
  cada: "BOUNCE", every: "BOUNCE",
  el: "DET", la: "DET", los: "DET", las: "DET",
  de: "FILLER", del: "FILLER", of: "FILLER", the: "FILLER",
  y: "CONJ", e: "CONJ", and: "CONJ",
  ultimo: "ORDINAL_LAST", ultima: "ORDINAL_LAST", last: "ORDINAL_LAST",
  dia: "DAY_WORD", day: "DAY_WORD",
  mes: "MONTH_WORD", month: "MONTH_WORD",
  laborable: "WORKDAY", laborables: "WORKDAY", habil: "WORKDAY", habiles: "WORKDAY",
  workday: "WORKDAY", workdays: "WORKDAY", weekday: "WORKDAY", weekdays: "WORKDAY",
  hasta: "UNTIL", until: "UNTIL",
  otro: "OTHER_WORD", otra: "OTHER_WORD", other: "OTHER_WORD",
};

// ─── Tokenizador acotado (una pasada) ────────────────────────────────────────

type TokenClass =
  | "BOUNCE"
  | "BANG"
  | "NUMBER"
  | "UNIT"
  | "WORKDAY"
  | "WEEKDAY"
  | "DET"
  | "FILLER"
  | "CONJ"
  | "ORDINAL_LAST"
  | "DAY_WORD"
  | "MONTH_WORD"
  | "UNTIL"
  | "ISO_DATE"
  | "OTHER_WORD"
  | "COMMA"
  | "OTHER"
  | "EOF";

interface Token {
  cls: TokenClass;
  raw: string;
  start: number;
  end: number;
  number?: number;
  weekday?: WeekdayIndex;
  frequency?: RecurrenceFrequencyNL;
  iso?: string;
}

function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

const WORD_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ]+/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const NUM_RE = /^\d{1,3}/;

/** Lee el siguiente token a partir de `from` (ignora espacios). Nunca retrocede. */
function nextToken(input: string, from: number): Token {
  let i = from;
  while (i < input.length && isSpace(input[i])) i += 1;
  const start = i;
  if (i >= input.length) return { cls: "EOF", raw: "", start, end: i };

  const ch = input[i];
  if (ch === "!") return { cls: "BANG", raw: "!", start, end: i + 1 };
  if (ch === ",") return { cls: "COMMA", raw: ",", start, end: i + 1 };

  const rest = input.slice(i);
  const iso = ISO_RE.exec(rest);
  if (iso) return { cls: "ISO_DATE", raw: iso[0], start, end: i + iso[0].length, iso: iso[0] };

  const num = NUM_RE.exec(rest);
  if (num) return { cls: "NUMBER", raw: num[0], start, end: i + num[0].length, number: Number(num[0]) };

  const word = WORD_RE.exec(rest);
  if (word) {
    const raw = word[0];
    const key = normalizeWord(raw);
    const wd = WEEKDAY_WORDS[key];
    if (wd !== undefined) return { cls: "WEEKDAY", raw, start, end: i + raw.length, weekday: wd };
    const unit = UNIT_WORDS[key];
    if (unit !== undefined) return { cls: "UNIT", raw, start, end: i + raw.length, frequency: unit };
    const cls = WORD_CLASSES[key];
    if (cls !== undefined) return { cls, raw, start, end: i + raw.length };
    return { cls: "OTHER", raw, start, end: i + raw.length };
  }

  return { cls: "OTHER", raw: ch, start, end: i + 1 };
}

// ─── FSM determinista ────────────────────────────────────────────────────────

interface FsmResult {
  ir: RecurrenceIR;
  end: number;
}

function validInterval(interval: number): boolean {
  return Number.isInteger(interval) && interval >= MIN_INTERVAL && interval <= MAX_INTERVAL;
}

/** Consume una lista de días ("lunes, miércoles y viernes" / "mon and fri"). */
function collectWeekdays(
  input: string,
  start: number
): { days: WeekdayIndex[]; end: number } | null {
  let cursor = start;
  const tok = nextToken(input, cursor);
  if (tok.cls !== "WEEKDAY" || tok.weekday === undefined) return null;
  const days: WeekdayIndex[] = [tok.weekday];
  cursor = tok.end;

  for (;;) {
    const sep = nextToken(input, cursor);
    if (sep.cls !== "CONJ" && sep.cls !== "COMMA") break;
    let c2 = sep.end;
    let det = nextToken(input, c2);
    if (det.cls === "DET") {
      c2 = det.end;
      det = nextToken(input, c2);
    }
    if (det.cls !== "WEEKDAY" || det.weekday === undefined) break;
    days.push(det.weekday);
    cursor = det.end;
  }

  const unique = Array.from(new Set(days)).sort((a, b) => toIsoDay(a) - toIsoDay(b));
  return { days: unique, end: cursor };
}

function toIsoDay(d: WeekdayIndex): number {
  return d === 0 ? 7 : d;
}

/** Cierra la IR consumiendo la cláusula opcional "hasta/until YYYY-MM-DD". */
function closeWithUntil(ir: RecurrenceIR, input: string, coreEnd: number): FsmResult {
  let cursor = coreEnd;
  const tok = nextToken(input, cursor);
  if (tok.cls === "UNTIL") {
    const iso = nextToken(input, tok.end);
    if (iso.cls === "ISO_DATE" && iso.iso) {
      ir.until = iso.iso;
      cursor = iso.end;
    }
  }
  return { ir, end: cursor };
}

/**
 * Ejecuta la FSM desde un token `cada|every` en `bounceStart`.
 * Devuelve la IR + offset final, o `null` si el fragmento no es una recurrencia válida.
 */
function runFsm(input: string, bounceStart: number): FsmResult | null {
  let cursor = bounceStart;
  let tok = nextToken(input, cursor);
  if (tok.cls !== "BOUNCE") return null;
  cursor = tok.end;

  let mode: RecurrenceModeNL = "FIXED";
  tok = nextToken(input, cursor);
  if (tok.cls === "BANG") {
    mode = "FLOATING";
    cursor = tok.end;
    tok = nextToken(input, cursor);
  }

  // ── Ramas de nodo inicial ────────────────────────────────────────────────
  // (A) último día del mes
  if (tok.cls === "ORDINAL_LAST") {
    cursor = tok.end;
    tok = nextToken(input, cursor);
    if (tok.cls === "DAY_WORD") {
      cursor = tok.end;
      tok = nextToken(input, cursor);
    }
    while (tok.cls === "FILLER" || tok.cls === "MONTH_WORD" || tok.cls === "DET") {
      cursor = tok.end;
      tok = nextToken(input, cursor);
    }
    return closeWithUntil(
      { frequency: "MONTHLY", interval: 1, mode, isLastDayOfMonth: true },
      input,
      cursor
    );
  }

  // (B) dígito inicial: intervalo ("cada 2 semanas") o día del mes ("cada 15 del mes")
  if (tok.cls === "NUMBER") {
    const n = tok.number ?? 0;
    cursor = tok.end;
    const after = nextToken(input, cursor);

    if (after.cls === "UNIT" && after.frequency) {
      return afterUnit(input, after.end, mode, n, after.frequency);
    }
    if (after.cls === "DAY_WORD") {
      // "cada 15 día ..." poco común → tratar como día del mes
      return consumeDayOfMonth(input, after.end, mode, n);
    }
    // "cada 15 del mes"
    while (after.cls === "FILLER" || after.cls === "MONTH_WORD" || after.cls === "DET") {
      cursor = after.end;
      return consumeDayOfMonth(input, cursor, mode, n);
    }
    return null;
  }

  // (C) "every other week" → interval 2
  if (tok.cls === "OTHER_WORD") {
    cursor = tok.end;
    tok = nextToken(input, cursor);
    if (tok.cls === "UNIT" && tok.frequency) {
      return afterUnit(input, tok.end, mode, 2, tok.frequency);
    }
    return null;
  }

  // (D) "cada día laborable" / "cada día 15"
  if (tok.cls === "DAY_WORD") {
    cursor = tok.end;
    const after = nextToken(input, cursor);
    if (after.cls === "WORKDAY") {
      return closeWithUntil({ frequency: "WORKDAYS", interval: 1, mode }, input, after.end);
    }
    if (after.cls === "NUMBER") {
      return consumeDayOfMonth(input, after.end, mode, after.number ?? 0);
    }
    // "cada día" (sin calificador) → DAILY
    return closeWithUntil({ frequency: "DAILY", interval: 1, mode }, input, cursor);
  }

  // (E) "cada laborable"
  if (tok.cls === "WORKDAY") {
    return closeWithUntil({ frequency: "WORKDAYS", interval: 1, mode }, input, tok.end);
  }

  // (F) "cada semana/mes/..." (sin intervalo explícito)
  if (tok.cls === "UNIT" && tok.frequency) {
    return afterUnit(input, tok.end, mode, 1, tok.frequency);
  }

  // (G) "cada lunes" (lista directa)
  if (tok.cls === "WEEKDAY") {
    const list = collectWeekdays(input, cursor);
    if (list) {
      return closeWithUntil(
        { frequency: "WEEKLY", interval: 1, mode, byWeekdays: list.days },
        input,
        list.end
      );
    }
  }

  return null;
}

/** Tras consumir una unidad: admite una lista de días opcional ("2 semanas los lunes y jueves"). */
function afterUnit(
  input: string,
  unitEnd: number,
  mode: RecurrenceModeNL,
  interval: number,
  unitFrequency: RecurrenceFrequencyNL
): FsmResult | null {
  if (!validInterval(interval)) return null;

  let cursor = unitEnd;
  let tok = nextToken(input, cursor);
  if (tok.cls === "DET" || tok.cls === "FILLER") {
    cursor = tok.end;
    tok = nextToken(input, cursor);
  }
  if (tok.cls === "WEEKDAY") {
    const list = collectWeekdays(input, cursor);
    if (list) {
      return closeWithUntil(
        { frequency: "WEEKLY", interval, mode, byWeekdays: list.days },
        input,
        list.end
      );
    }
  }

  return closeWithUntil({ frequency: unitFrequency, interval, mode }, input, unitEnd);
}

/** Consume "N [de]l mes" y valida 1..31. */
function consumeDayOfMonth(
  input: string,
  afterDayNumber: number,
  mode: RecurrenceModeNL,
  day: number
): FsmResult | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  let cursor = afterDayNumber;
  let tok = nextToken(input, cursor);
  while (tok.cls === "FILLER" || tok.cls === "MONTH_WORD" || tok.cls === "DET") {
    cursor = tok.end;
    tok = nextToken(input, cursor);
  }
  return closeWithUntil({ frequency: "MONTHLY", interval: 1, mode, dayOfMonth: day }, input, cursor);
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Escanea el input en UNA sola pasada y devuelve la primera cláusula de
 * recurrencia válida, con su span y la IR derivada.
 */
export function scanRecurrenceClause(input: string): RecurrenceScanResult {
  if (!input) return { matched: false, start: -1, end: -1, text: "" };

  let i = 0;
  while (i < input.length) {
    const tok = nextToken(input, i);
    if (tok.cls === "EOF") break;
    if (tok.cls === "BOUNCE") {
      const res = runFsm(input, tok.start);
      if (res) {
        return {
          matched: true,
          start: tok.start,
          end: res.end,
          text: input.slice(tok.start, res.end).trim(),
          ir: res.ir,
          rrule: toRRuleParts(res.ir),
        };
      }
    }
    i = tok.end > i ? tok.end : i + 1;
  }

  return { matched: false, start: -1, end: -1, text: "" };
}

/** Parsea una expresión de recurrencia completa a IR (o `null`). */
export function parseRecurrenceIR(text: string): RecurrenceIR | null {
  const scan = scanRecurrenceClause(text);
  return scan.matched && scan.ir ? scan.ir : null;
}

/** Deriva los componentes RRULE (RFC 5545) desde la IR. */
export function toRRuleParts(ir: RecurrenceIR): RRuleParts {
  const parts: RRuleParts = { FREQ: ir.frequency === "WORKDAYS" ? "WEEKLY" : ir.frequency };
  if (ir.interval > 1) parts.INTERVAL = ir.interval;
  if (ir.until) parts.UNTIL = ir.until.replace(/-/g, "");
  if (ir.isLastDayOfMonth) parts.BYMONTHDAY = [-1];
  else if (ir.dayOfMonth !== undefined) parts.BYMONTHDAY = [ir.dayOfMonth];

  if (ir.frequency === "WORKDAYS") parts.BYDAY = [...WORKDAY_CODES];
  else if (ir.byWeekdays && ir.byWeekdays.length > 0) {
    parts.BYDAY = ir.byWeekdays.map((d) => DAY_CODES[d]);
  }
  return parts;
}

/** Serializa componentes RRULE a la forma `KEY=VALUE;...`. */
export function formatRRule(parts: RRuleParts): string {
  const out: string[] = [`FREQ=${parts.FREQ}`];
  if (parts.INTERVAL !== undefined) out.push(`INTERVAL=${parts.INTERVAL}`);
  if (parts.COUNT !== undefined) out.push(`COUNT=${parts.COUNT}`);
  if (parts.UNTIL) out.push(`UNTIL=${parts.UNTIL}`);
  if (parts.BYDAY && parts.BYDAY.length > 0) out.push(`BYDAY=${parts.BYDAY.join(",")}`);
  if (parts.BYMONTHDAY && parts.BYMONTHDAY.length > 0) {
    out.push(`BYMONTHDAY=${parts.BYMONTHDAY.join(",")}`);
  }
  if (parts.BYMONTH && parts.BYMONTH.length > 0) out.push(`BYMONTH=${parts.BYMONTH.join(",")}`);
  if (parts.WKST) out.push(`WKST=${parts.WKST}`);
  return out.join(";");
}

/** Adapta la IR a la `RecurrenceRuleConfig` del motor existente. */
export function irToRecurrenceRuleConfig(ir: RecurrenceIR): RecurrenceRuleConfig {
  return {
    frequency: ir.frequency,
    interval: ir.interval,
    mode: ir.mode,
    ...(ir.byWeekdays ? { byWeekdays: ir.byWeekdays } : {}),
    ...(ir.dayOfMonth !== undefined ? { anchorDayOfMonth: ir.dayOfMonth } : {}),
    ...(ir.isLastDayOfMonth ? { isLastDayOfMonth: true } : {}),
    ...(ir.until ? { endDate: ir.until } : {}),
  };
}
