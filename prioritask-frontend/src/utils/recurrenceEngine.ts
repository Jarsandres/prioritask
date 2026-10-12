import type { Subtask, Task } from "../types/task";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos y Constantes del Motor de Recurrencia (Prioritask)
// Compatible con erasableSyntaxOnly (TypeScript 5.8+)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Modo de cálculo de la siguiente fecha de vencimiento:
 * - `FIXED` ("every ..."): Anclado al calendario original (`currentDueDate`).
 *   Mantiene la cadencia fija (ej. todos los lunes, o el día 15 de cada mes)
 *   independientemente de cuándo se complete la tarea.
 * - `FLOATING` ("every! ..."): Anclado a la fecha real de finalización (`completedAt`).
 *   Calcula el próximo vencimiento sumando el intervalo a partir del momento en que
 *   el usuario completa la tarea (ideal para mantenimiento, limpieza o hábitos).
 */
export type RecurrenceMode = "FIXED" | "FLOATING";

/**
 * Frecuencias soportadas (extiende las frecuencias del backend DAILY | WEEKLY | MONTHLY
 * con WORKDAYS y YEARLY).
 */
export type RecurrenceFrequency =
  | "DAILY"
  | "WORKDAYS"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY";

/**
 * Política de ajuste cuando una ocurrencia cae en fin de semana (sábado o domingo).
 */
export type WeekendPolicy = "ALLOW" | "NEXT_MONDAY" | "PREVIOUS_FRIDAY";

/**
 * Día de la semana en convención UTC/JS (0 = Domingo, 1 = Lunes, ..., 6 = Sábado).
 */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Regla completa de recurrencia para Prioritask.
 */
export interface RecurrenceRuleConfig {
  /** Frecuencia base del ciclo */
  frequency: RecurrenceFrequency;
  /** Intervalo multiplicador (>= 1 y <= 365) */
  interval: number;
  /**
   * Modo de recurrencia:
   * - `FIXED`: Calendario fijo (`every`)
   * - `FLOATING`: Flotante al completar (`every!`)
   */
  mode: RecurrenceMode;
  /**
   * Días de la semana específicos (0 = Dom ... 6 = Sáb) para reglas WEEKLY.
   * Si se especifica, la tarea se programa en esos días dentro de la cadencia semanal.
   */
  byWeekdays?: WeekdayIndex[];
  /**
   * Día original del mes (1..31) para evitar el "efecto deriva de febrero"
   * (ej. 31 ene -> 28 feb -> 31 mar en lugar de quedarse en 28 mar).
   */
  anchorDayOfMonth?: number;
  /**
   * Si es `true`, en frecuencia MONTHLY fuerza siempre el último día del mes
   * (28, 29, 30 o 31 según corresponda).
   */
  isLastDayOfMonth?: boolean;
  /**
   * Fecha límite opcional de la serie recurrente (inclusive).
   */
  endDate?: Date | string | null;
  /**
   * Número máximo de ocurrencias permitidas antes de finalizar la rutina.
   */
  maxOccurrences?: number | null;
  /**
   * Contador de ocurrencias ya completadas.
   */
  occurrencesCompleted?: number;
  /**
   * En modo `FIXED`, si la tarea estaba vencida por varios ciclos al completarse,
   * salta automáticamente los ciclos pasados hasta situarse en el futuro respecto a `completedAt`.
   * Por defecto `true`.
   */
  catchUpOverdue?: boolean;
  /**
   * Ajuste opcional cuando la fecha calculada cae en sábado o domingo.
   * Por defecto `"ALLOW"`.
   */
  weekendPolicy?: WeekendPolicy;
  /**
   * En modo `FLOATING`, conserva la hora/minuto original de `currentDueDate`
   * aunque la fecha base se tome de `completedAt`. Por defecto `true`.
   */
  preserveTimeOfDay?: boolean;
  /**
   * Si es `true`, al avanzar una tarea con subtareas, clona el checklist
   * reiniciando `completada = false`. Por defecto `true`.
   */
  resetSubtasks?: boolean;
}

export interface CalculateNextDueInput {
  /** Fecha de vencimiento programada actualmente para la tarea */
  currentDueDate: Date | string;
  /** Fecha real de finalización (por defecto `new Date()`) */
  completedAt?: Date | string;
  /** Configuración de la regla de recurrencia */
  rule: RecurrenceRuleConfig;
}

export interface NextDueCalculationResult {
  /** Siguiente fecha de vencimiento (o `null` si la serie expiró por `endDate` o `maxOccurrences`) */
  nextDueDate: Date | null;
  /** Indica si la regla ha llegado a su fin y no debe generar más tareas */
  isSeriesEnded: boolean;
  /** Motivo de finalización de la serie si `isSeriesEnded` es `true` */
  endedReason?: "END_DATE_REACHED" | "MAX_OCCURRENCES_REACHED";
  /** Fecha base efectiva desde la que se calculó el salto */
  effectiveAnchorDate: Date;
  /** Ciclos omitidos por catch-up cuando una tarea `FIXED` se completa con retraso */
  skippedOccurrences: number;
  /** Regla actualizada (con `anchorDayOfMonth` y `occurrencesCompleted` incrementado) */
  updatedRule: RecurrenceRuleConfig;
}

export interface AdvanceTaskResult {
  /** Tarea actual marcada como `DONE` */
  completedTask: Task;
  /** Nueva instancia de tarea para el siguiente ciclo (o `null` si la serie terminó) */
  nextTask: Omit<Task, "id"> | null;
  /** Subtareas reiniciadas para el nuevo ciclo */
  resetSubtasksPayload: Array<Pick<Subtask, "titulo" | "orden" | "completada">>;
  /** Detalle del cálculo de recurrencia */
  calculation: NextDueCalculationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades Internas de Calendario (UTC-safe para evitar desfases por DST)
// ─────────────────────────────────────────────────────────────────────────────

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 365;
const MAX_CATCHUP_ITERATIONS = 1000;

/**
 * Convierte un valor `Date | string` en una instancia `Date` válida.
 * Si recibe una cadena `YYYY-MM-DD` (formato de `<input type="date">` en Prioritask),
 * la interpreta a las 00:00:00 UTC para evitar desfases de huso horario.
 */
export function parseDateInput(input: Date | string): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new Error("Fecha inválida proporcionada al motor de recurrencia");
    }
    return new Date(input.getTime());
  }

  const trimmed = input.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      throw new Error(`Fecha de calendario inexistente: ${trimmed}`);
    }
    return dt;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`No se pudo parsear la fecha: ${trimmed}`);
  }
  return parsed;
}

/**
 * Formatea un `Date` a `YYYY-MM-DD` (UTC), compatible con el estado `dueDate` de `TaskForm.tsx`.
 */
export function toISODateString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Devuelve el número de días del mes en UTC (28..31), considerando años bisiestos.
 */
export function getDaysInMonthUTC(year: number, monthZeroIndexed: number): number {
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonthsAnchoredUTC(
  date: Date,
  monthsToAdd: number,
  anchorDay: number,
  isLastDayOfMonth = false
): Date {
  const safeAnchor = Math.min(31, Math.max(1, Math.trunc(anchorDay)));
  const totalMonths =
    date.getUTCFullYear() * 12 + date.getUTCMonth() + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const maxDay = getDaysInMonthUTC(targetYear, targetMonth);
  const targetDay = isLastDayOfMonth ? maxDay : Math.min(safeAnchor, maxDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

function addYearsAnchoredUTC(
  date: Date,
  yearsToAdd: number,
  anchorDay: number,
  isLastDayOfMonth = false
): Date {
  const safeAnchor = Math.min(31, Math.max(1, Math.trunc(anchorDay)));
  const targetYear = date.getUTCFullYear() + yearsToAdd;
  const targetMonth = date.getUTCMonth();
  const maxDay = getDaysInMonthUTC(targetYear, targetMonth);
  const targetDay = isLastDayOfMonth ? maxDay : Math.min(safeAnchor, maxDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

/**
 * Avanza `interval` días laborables (lunes a viernes).
 * Si parte de un sábado o domingo, el primer día laborable siguiente cuenta como el paso 1.
 */
function addWorkdaysUTC(date: Date, workdaysToAdd: number): Date {
  let cursor = new Date(date.getTime());
  let remaining = workdaysToAdd;

  while (remaining > 0) {
    cursor = addDaysUTC(cursor, 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining -= 1;
    }
  }
  return cursor;
}

/**
 * Convierte el día de la semana JS (0 = Dom .. 6 = Sáb) a orden ISO-8601 (1 = Lun .. 7 = Dom)
 * para que los ciclos semanales agrupen correctamente de lunes a domingo.
 */
function toIsoWeekday(dow: WeekdayIndex): number {
  return dow === 0 ? 7 : dow;
}

/**
 * Calcula la siguiente ocurrencia cuando hay lista de días de la semana (`byWeekdays`),
 * p. ej. "cada lunes, miércoles y viernes" con soporte para intervalos de N semanas
 * siguiendo semanas ISO (lunes a domingo).
 */
function stepByWeekdaysUTC(
  baseDate: Date,
  intervalWeeks: number,
  byWeekdays: WeekdayIndex[]
): Date {
  const sortedIsoDays = Array.from(new Set(byWeekdays))
    .filter((d): d is WeekdayIndex => Number.isInteger(d) && d >= 0 && d <= 6)
    .map(toIsoWeekday)
    .sort((a, b) => a - b);

  if (sortedIsoDays.length === 0) {
    return addDaysUTC(baseDate, intervalWeeks * 7);
  }

  const currentIsoDow = toIsoWeekday(baseDate.getUTCDay() as WeekdayIndex);
  const nextIsoDayInSameWeek = sortedIsoDays.find((d) => d > currentIsoDow);

  if (nextIsoDayInSameWeek !== undefined) {
    return addDaysUTC(baseDate, nextIsoDayInSameWeek - currentIsoDow);
  }

  // Ya pasamos el último día configurado de la semana ISO actual (lunes..domingo):
  // Saltamos al primer día configurado de la semana correspondiente según `intervalWeeks`.
  const firstTargetIsoDow = sortedIsoDays[0];
  const daysUntilNextWeekFirstTarget = 7 - currentIsoDow + firstTargetIsoDow;
  const extraWeeksOffset = (intervalWeeks - 1) * 7;
  return addDaysUTC(
    baseDate,
    daysUntilNextWeekFirstTarget + extraWeeksOffset
  );
}

/**
 * Aplica la política de fin de semana (`ALLOW`, `NEXT_MONDAY`, `PREVIOUS_FRIDAY`).
 */
export function applyWeekendPolicy(
  date: Date,
  policy: WeekendPolicy = "ALLOW"
): Date {
  if (policy === "ALLOW") {
    return date;
  }

  const dow = date.getUTCDay();
  if (dow === 6) {
    // Sábado -> Viernes (-1) o Lunes (+2)
    return addDaysUTC(date, policy === "PREVIOUS_FRIDAY" ? -1 : 2);
  }
  if (dow === 0) {
    // Domingo -> Viernes (-2) o Lunes (+1)
    return addDaysUTC(date, policy === "PREVIOUS_FRIDAY" ? -2 : 1);
  }
  return date;
}

/**
 * Si una ocurrencia previa en modo FIXED fue desplazada por `weekendPolicy` (p. ej. el 31 de enero
 * cayó en sábado y se movió al lunes 2 de febrero con `NEXT_MONDAY`, o el 1 de noviembre cayó en
 * domingo y se movió al viernes 30 de octubre con `PREVIOUS_FRIDAY`), recupera la fecha nominal
 * original de la rejilla antes de sumar meses/años para no saltar ni repetir un mes.
 */
function resolveNominalAnchorDate(
  anchorDate: Date,
  rule: RecurrenceRuleConfig,
  resolvedAnchorDay: number
): Date {
  if (
    rule.mode !== "FIXED" ||
    !rule.weekendPolicy ||
    rule.weekendPolicy === "ALLOW"
  ) {
    return anchorDate;
  }

  const dow = anchorDate.getUTCDay();

  if (
    rule.frequency === "WEEKLY" &&
    rule.byWeekdays &&
    rule.byWeekdays.length > 0
  ) {
    if (
      rule.weekendPolicy === "NEXT_MONDAY" &&
      dow === 1 &&
      !rule.byWeekdays.includes(1)
    ) {
      for (const offset of [1, 2]) {
        const unshifted = addDaysUTC(anchorDate, -offset);
        if (rule.byWeekdays.includes(unshifted.getUTCDay() as WeekdayIndex)) {
          return unshifted;
        }
      }
    }
    if (
      rule.weekendPolicy === "PREVIOUS_FRIDAY" &&
      dow === 5 &&
      !rule.byWeekdays.includes(5)
    ) {
      for (const offset of [1, 2]) {
        const unshifted = addDaysUTC(anchorDate, offset);
        if (rule.byWeekdays.includes(unshifted.getUTCDay() as WeekdayIndex)) {
          return unshifted;
        }
      }
    }
    return anchorDate;
  }

  if (rule.frequency !== "MONTHLY" && rule.frequency !== "YEARLY") {
    return anchorDate;
  }

  const isLast = Boolean(rule.isLastDayOfMonth);

  if (rule.weekendPolicy === "NEXT_MONDAY" && dow === 1) {
    for (const offset of [1, 2]) {
      const unshifted = addDaysUTC(anchorDate, -offset);
      const maxDay = getDaysInMonthUTC(
        unshifted.getUTCFullYear(),
        unshifted.getUTCMonth()
      );
      const expectedDay = isLast ? maxDay : Math.min(resolvedAnchorDay, maxDay);
      if (
        unshifted.getUTCDate() === expectedDay &&
        anchorDate.getUTCDate() !== expectedDay
      ) {
        return unshifted;
      }
    }
  }

  if (rule.weekendPolicy === "PREVIOUS_FRIDAY" && dow === 5) {
    for (const offset of [1, 2]) {
      const unshifted = addDaysUTC(anchorDate, offset);
      const maxDay = getDaysInMonthUTC(
        unshifted.getUTCFullYear(),
        unshifted.getUTCMonth()
      );
      const expectedDay = isLast ? maxDay : Math.min(resolvedAnchorDay, maxDay);
      if (
        unshifted.getUTCDate() === expectedDay &&
        anchorDate.getUTCDate() !== expectedDay
      ) {
        return unshifted;
      }
    }
  }

  return anchorDate;
}

/**
 * Ejecuta un único salto de recurrencia desde `fromDate` según la regla.
 */
function stepSingleOccurrence(
  fromDate: Date,
  rule: RecurrenceRuleConfig,
  anchorDay: number
): Date {
  const { frequency, interval } = rule;

  switch (frequency) {
    case "DAILY":
      return addDaysUTC(fromDate, interval);

    case "WORKDAYS":
      return addWorkdaysUTC(fromDate, interval);

    case "WEEKLY":
      if (rule.byWeekdays && rule.byWeekdays.length > 0) {
        return stepByWeekdaysUTC(fromDate, interval, rule.byWeekdays);
      }
      return addDaysUTC(fromDate, interval * 7);

    case "MONTHLY":
      return addMonthsAnchoredUTC(
        fromDate,
        interval,
        anchorDay,
        Boolean(rule.isLastDayOfMonth)
      );

    case "YEARLY":
      return addYearsAnchoredUTC(
        fromDate,
        interval,
        anchorDay,
        Boolean(rule.isLastDayOfMonth)
      );
  }
}

function applyRuleWeekendPolicy(date: Date, rule: RecurrenceRuleConfig): Date {
  if (rule.frequency !== "WORKDAYS" && rule.weekendPolicy) {
    return applyWeekendPolicy(date, rule.weekendPolicy);
  }
  return date;
}

function resolveInclusiveEndDateUTC(endDateInput: Date | string): Date {
  if (typeof endDateInput === "string") {
    const trimmed = endDateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const dt = parseDateInput(trimmed);
      dt.setUTCHours(23, 59, 59, 999);
      return dt;
    }
  }
  const parsed = parseDateInput(endDateInput);
  if (
    parsed.getUTCHours() === 0 &&
    parsed.getUTCMinutes() === 0 &&
    parsed.getUTCSeconds() === 0 &&
    parsed.getUTCMilliseconds() === 0
  ) {
    const endOfDay = new Date(parsed.getTime());
    endOfDay.setUTCHours(23, 59, 59, 999);
    return endOfDay;
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor Principal de Cálculo de Recurrencia (Fija vs. Flotante)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula la próxima fecha de vencimiento de una tarea recurrente diferenciando entre:
 *
 * 1. **Recurrencia Fija (`mode: "FIXED"`, estilo `every week` / `cada mes`)**:
 *    - Toma como ancla `currentDueDate`.
 *    - Preserva el día ancla del mes (`anchorDayOfMonth`) para evitar deriva en meses cortos.
 *    - Si `catchUpOverdue !== false` y la tarea se completa después de varios ciclos vencidos,
 *      avanza por la rejilla fija del calendario hasta superar `completedAt`.
 *
 * 2. **Recurrencia Flotante al Completar (`mode: "FLOATING"`, estilo `every! 7 days` / `cada! 7 días`)**:
 *    - Toma como ancla `completedAt` (fecha real de finalización).
 *    - Garantiza que el usuario disponga siempre del intervalo completo de descanso/espera
 *      entre la finalización real y el siguiente vencimiento.
 */
export function calculateNextDueDate(
  input: CalculateNextDueInput
): NextDueCalculationResult {
  const { rule } = input;

  if (
    !Number.isInteger(rule.interval) ||
    rule.interval < MIN_INTERVAL ||
    rule.interval > MAX_INTERVAL
  ) {
    throw new Error(
      `El intervalo de recurrencia debe ser un entero entre ${MIN_INTERVAL} y ${MAX_INTERVAL}`
    );
  }

  if (
    rule.maxOccurrences !== undefined &&
    rule.maxOccurrences !== null &&
    (!Number.isInteger(rule.maxOccurrences) || rule.maxOccurrences < 1)
  ) {
    throw new Error(
      "El límite maxOccurrences debe ser un entero positivo (>= 1)"
    );
  }

  const currentDue = parseDateInput(input.currentDueDate);
  const completedAt = input.completedAt
    ? parseDateInput(input.completedAt)
    : new Date();

  if (
    typeof input.completedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.completedAt.trim())
  ) {
    completedAt.setUTCHours(
      currentDue.getUTCHours(),
      currentDue.getUTCMinutes(),
      currentDue.getUTCSeconds(),
      currentDue.getUTCMilliseconds()
    );
  }

  const completedCount = (rule.occurrencesCompleted ?? 0) + 1;

  // 1. Verificar límite de ocurrencias máximas (maxOccurrences)
  if (
    rule.maxOccurrences !== undefined &&
    rule.maxOccurrences !== null &&
    completedCount >= rule.maxOccurrences
  ) {
    return {
      nextDueDate: null,
      isSeriesEnded: true,
      endedReason: "MAX_OCCURRENCES_REACHED",
      effectiveAnchorDate:
        rule.mode === "FLOATING" ? completedAt : currentDue,
      skippedOccurrences: 0,
      updatedRule: {
        ...rule,
        occurrencesCompleted: completedCount,
      },
    };
  }

  // 2. Determinar la fecha ancla según modo FIXED vs FLOATING
  let effectiveAnchor: Date;
  if (rule.mode === "FLOATING") {
    effectiveAnchor = new Date(completedAt.getTime());
    if (rule.preserveTimeOfDay !== false) {
      effectiveAnchor.setUTCHours(
        currentDue.getUTCHours(),
        currentDue.getUTCMinutes(),
        currentDue.getUTCSeconds(),
        currentDue.getUTCMilliseconds()
      );
    }
  } else {
    effectiveAnchor = new Date(currentDue.getTime());
  }

  // El día ancla del mes en modo FIXED se fija al día original de la serie;
  // en modo FLOATING se actualiza al día en que se completó la tarea.
  const resolvedAnchorDay =
    rule.mode === "FIXED"
      ? (rule.anchorDayOfMonth ?? currentDue.getUTCDate())
      : effectiveAnchor.getUTCDate();

  const gridAnchor = resolveNominalAnchorDate(
    effectiveAnchor,
    rule,
    resolvedAnchorDay
  );

  // 3. Calcular el siguiente salto sobre la rejilla nominal y aplicar política de fin de semana.
  // Si `PREVIOUS_FRIDAY` desplaza el candidato hacia atrás hasta `<= effectiveAnchor`,
  // avanzamos en la rejilla hasta encontrar una fecha estrictamente posterior al ancla.
  let rawCandidate = stepSingleOccurrence(
    gridAnchor,
    rule,
    resolvedAnchorDay
  );
  let candidate = applyRuleWeekendPolicy(rawCandidate, rule);

  let anchorGuard = 0;
  while (
    candidate.getTime() <= effectiveAnchor.getTime() &&
    anchorGuard < MAX_CATCHUP_ITERATIONS
  ) {
    rawCandidate = stepSingleOccurrence(rawCandidate, rule, resolvedAnchorDay);
    candidate = applyRuleWeekendPolicy(rawCandidate, rule);
    anchorGuard += 1;
  }

  let skippedOccurrences = 0;

  // 4. Catch-up inteligente en modo FIXED cuando la tarea estaba atrasada varios ciclos
  const shouldCatchUp =
    rule.mode === "FIXED" && (rule.catchUpOverdue ?? true);

  if (shouldCatchUp && candidate.getTime() <= completedAt.getTime()) {
    let guard = 0;
    while (
      candidate.getTime() <= completedAt.getTime() &&
      guard < MAX_CATCHUP_ITERATIONS
    ) {
      rawCandidate = stepSingleOccurrence(
        rawCandidate,
        rule,
        resolvedAnchorDay
      );
      candidate = applyRuleWeekendPolicy(rawCandidate, rule);
      skippedOccurrences += 1;
      guard += 1;
    }
  }

  // 5. Verificar fecha de fin de serie (endDate, inclusiva del día completo cuando es fecha sin hora)
  if (rule.endDate !== undefined && rule.endDate !== null) {
    const parsedEndDate = resolveInclusiveEndDateUTC(rule.endDate);
    if (candidate.getTime() > parsedEndDate.getTime()) {
      return {
        nextDueDate: null,
        isSeriesEnded: true,
        endedReason: "END_DATE_REACHED",
        effectiveAnchorDate: effectiveAnchor,
        skippedOccurrences,
        updatedRule: {
          ...rule,
          anchorDayOfMonth: resolvedAnchorDay,
          occurrencesCompleted: completedCount,
        },
      };
    }
  }

  return {
    nextDueDate: candidate,
    isSeriesEnded: false,
    effectiveAnchorDate: effectiveAnchor,
    skippedOccurrences,
    updatedRule: {
      ...rule,
      anchorDayOfMonth: resolvedAnchorDay,
      occurrencesCompleted: completedCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 1: Parser y Formateador de Lenguaje Natural (Estilo Todoist ES / EN)
// Soporta "every! 7 days", "cada! 2 semanas", "every workday", "every mon, fri"
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_TOKEN_MAP: Record<string, WeekdayIndex> = {
  sun: 0,
  sunday: 0,
  dom: 0,
  domingo: 0,
  domingos: 0,
  mon: 1,
  monday: 1,
  lun: 1,
  lunes: 1,
  tue: 2,
  tuesday: 2,
  mar: 2,
  martes: 2,
  wed: 3,
  wednesday: 3,
  mie: 3,
  miercoles: 3,
  miércoles: 3,
  thu: 4,
  thursday: 4,
  jue: 4,
  jueves: 4,
  fri: 5,
  friday: 5,
  vie: 5,
  viernes: 5,
  sat: 6,
  saturday: 6,
  sab: 6,
  sabado: 6,
  sábado: 6,
  sabados: 6,
  sábados: 6,
};

function parseWeekdayList(rawList: string): WeekdayIndex[] | null {
  const cleaned = rawList
    .replace(/^(?:on|los|el|las|la|:)\s+/i, "")
    .trim();
  if (!cleaned) return null;

  const tokens = cleaned
    .split(/\s*(?:,|\by\b|\band\b)\s*/)
    .map((t) => t.replace(/^(?:el|los|la|las)\s+/, "").trim())
    .filter(Boolean);

  if (tokens.length === 0 || !tokens.every((t) => t in WEEKDAY_TOKEN_MAP)) {
    return null;
  }

  // Ordenar por convención ISO (lunes a domingo) pero manteniendo los valores WeekdayIndex (0..6)
  return Array.from(new Set(tokens.map((t) => WEEKDAY_TOKEN_MAP[t]))).sort(
    (a, b) => toIsoWeekday(a) - toIsoWeekday(b)
  );
}

/**
 * Parsea expresiones de recurrencia en lenguaje natural (inglés y español) al estilo Todoist:
 * - `"every! 7 days"` / `"cada! 7 días"` -> `{ mode: "FLOATING", frequency: "DAILY", interval: 7 }`
 * - `"every week"` / `"cada semana"` -> `{ mode: "FIXED", frequency: "WEEKLY", interval: 1 }`
 * - `"every workday"` / `"cada día laborable"` -> `{ mode: "FIXED", frequency: "WORKDAYS", interval: 1 }`
 * - `"every mon, wed, fri"` / `"every monday, wednesday and friday"` -> `{ mode: "FIXED", frequency: "WEEKLY", byWeekdays: [1, 3, 5] }`
 * - `"every 2 weeks on mon, thu"` / `"cada 2 semanas los lunes y jueves"` -> `{ mode: "FIXED", frequency: "WEEKLY", interval: 2, byWeekdays: [1, 4] }`
 * - `"every last day of month"` / `"cada último día del mes"` -> `{ mode: "FIXED", frequency: "MONTHLY", isLastDayOfMonth: true }`
 * - Soporta sufijo `"until YYYY-MM-DD"` o `"hasta YYYY-MM-DD"`.
 */
export function parseRecurrenceExpression(
  expression: string
): RecurrenceRuleConfig | null {
  const normalized = expression
    .trim()
    .toLowerCase()
    .replace(/\s*\(al completar\)\s*$/, "")
    .replace(/\s+/g, " ");
  if (!normalized) return null;

  // Extraer cláusula opcional "until YYYY-MM-DD" / "hasta [el] YYYY-MM-DD"
  let endDate: Date | undefined;
  let coreExpr = normalized;
  const untilMatch = /\s+(?:until|hasta(?:\s+el)?)\s+(\d{4}-\d{2}-\d{2})$/.exec(
    normalized
  );
  if (untilMatch) {
    try {
      endDate = parseDateInput(untilMatch[1]);
    } catch {
      return null;
    }
    coreExpr = normalized.slice(0, untilMatch.index).trim();
  }

  // Atajos de una sola palabra
  if (coreExpr === "daily" || coreExpr === "diario" || coreExpr === "diaria") {
    return { frequency: "DAILY", interval: 1, mode: "FIXED", endDate };
  }
  if (coreExpr === "weekly" || coreExpr === "semanal") {
    return { frequency: "WEEKLY", interval: 1, mode: "FIXED", endDate };
  }
  if (coreExpr === "monthly" || coreExpr === "mensual") {
    return { frequency: "MONTHLY", interval: 1, mode: "FIXED", endDate };
  }
  if (
    coreExpr === "yearly" ||
    coreExpr === "annually" ||
    coreExpr === "anual"
  ) {
    return { frequency: "YEARLY", interval: 1, mode: "FIXED", endDate };
  }

  // Detectar prefijo "every" / "every!" / "cada" / "cada!"
  const prefixMatch = /^(every|cada)(!)?\s+(.+)$/.exec(coreExpr);
  if (!prefixMatch) return null;

  const mode: RecurrenceMode = prefixMatch[2] === "!" ? "FLOATING" : "FIXED";
  const body = prefixMatch[3].trim();

  // Caso: último día del mes ("last day of month" / "último día del mes")
  if (
    body === "last day of month" ||
    body === "ultimo dia del mes" ||
    body === "último día del mes" ||
    body === "el ultimo dia del mes" ||
    body === "el último día del mes"
  ) {
    return {
      frequency: "MONTHLY",
      interval: 1,
      mode,
      isLastDayOfMonth: true,
      endDate,
    };
  }

  // Caso: día específico del mes ("every 15th", "every 15th of the month", "cada día 15", "cada 15 del mes")
  const dayOfMonthEnMatch =
    /^(\d{1,2})(?:st|nd|rd|th)(?:\s+(?:day\s+)?of\s+(?:the\s+)?month)?$/.exec(
      body
    );
  const dayOfMonthEsMatch =
    /^(?:d[ií]a\s+(\d{1,2})(?:\s+del\s+mes)?|(\d{1,2})\s+del\s+mes)$/.exec(
      body
    );
  const rawDayOfMonth =
    dayOfMonthEnMatch?.[1] ?? dayOfMonthEsMatch?.[1] ?? dayOfMonthEsMatch?.[2];
  if (rawDayOfMonth !== undefined) {
    const anchorDayOfMonth = Number(rawDayOfMonth);
    if (anchorDayOfMonth < 1 || anchorDayOfMonth > 31) return null;
    return {
      frequency: "MONTHLY",
      interval: 1,
      mode,
      anchorDayOfMonth,
      endDate,
    };
  }

  // Caso: días laborables ("workday", "workdays", "weekday", "día laborable", "días laborables")
  const workdayMatch =
    /^(?:(\d+)\s+)?(?:workdays?|weekdays?|d[ií]as?\s+laborables?|d[ií]as?\s+h[aá]biles?)$/.exec(
      body
    );
  if (workdayMatch) {
    const interval = workdayMatch[1] ? Number(workdayMatch[1]) : 1;
    if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) return null;
    return {
      frequency: "WORKDAYS",
      interval,
      mode,
      endDate,
    };
  }

  // Caso: "other day/week/month/year" ("every other week" -> interval 2)
  const otherUnitMatch = /^other\s+(day|week|month|year)$/.exec(body);
  if (otherUnitMatch) {
    const unit = otherUnitMatch[1];
    const freqMap: Record<string, RecurrenceFrequency> = {
      day: "DAILY",
      week: "WEEKLY",
      month: "MONTHLY",
      year: "YEARLY",
    };
    return {
      frequency: freqMap[unit],
      interval: 2,
      mode,
      endDate,
    };
  }

  // Caso combinado: "[N] weeks/semanas [on/los/:] <weekdays>"
  // Ej: "every 2 weeks on mon, thu", "cada 2 semanas los lunes y jueves", "cada 2 semanas: lunes, jueves"
  const multiWeekDaysMatch =
    /^(?:(\d+)\s+)?(?:weeks?|semanas?)(?:\s*(?::|\bon\b|\blos\b|\bel\b)\s*|\s+)(.+)$/.exec(
      body
    );
  if (multiWeekDaysMatch) {
    const interval = multiWeekDaysMatch[1]
      ? Number(multiWeekDaysMatch[1])
      : 1;
    if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) return null;
    const byWeekdays = parseWeekdayList(multiWeekDaysMatch[2]);
    if (byWeekdays) {
      return {
        frequency: "WEEKLY",
        interval,
        mode,
        byWeekdays,
        endDate,
      };
    }
  }

  // Caso estándar: "[N] <unit>" (ej. "7 days", "2 weeks", "month", "3 meses")
  const unitMatch =
    /^(?:(\d+)\s+)?(days?|d[ií]as?|weeks?|semanas?|months?|mes(?:es)?|years?|a[ñn]os?)$/.exec(
      body
    );
  if (unitMatch) {
    const interval = unitMatch[1] ? Number(unitMatch[1]) : 1;
    if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) return null;

    const rawUnit = unitMatch[2];
    let frequency: RecurrenceFrequency;
    if (rawUnit.startsWith("d")) {
      frequency = "DAILY";
    } else if (rawUnit.startsWith("w") || rawUnit.startsWith("s")) {
      frequency = "WEEKLY";
    } else if (rawUnit.startsWith("m")) {
      frequency = "MONTHLY";
    } else {
      frequency = "YEARLY";
    }

    return {
      frequency,
      interval,
      mode,
      endDate,
    };
  }

  // Caso: lista directa de días de la semana ("every mon, wed, fri" / "every monday and friday" / "cada lunes, miércoles y viernes")
  const byWeekdays = parseWeekdayList(body);
  if (byWeekdays) {
    return {
      frequency: "WEEKLY",
      interval: 1,
      mode,
      byWeekdays,
      endDate,
    };
  }

  return null;
}

const WEEKDAY_NAMES_ES: Record<WeekdayIndex, string> = {
  0: "domingo",
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
};

/**
 * Convierte una `RecurrenceRuleConfig` en una etiqueta legible en español para la UI de Prioritask.
 */
export function formatRecurrenceRule(rule: RecurrenceRuleConfig): string {
  const prefix = rule.mode === "FLOATING" ? "Cada! " : "Cada ";
  const modeSuffix = rule.mode === "FLOATING" ? " (al completar)" : "";

  if (rule.frequency === "MONTHLY" && rule.isLastDayOfMonth) {
    return `${prefix}último día del mes${modeSuffix}`;
  }

  if (
    rule.frequency === "WEEKLY" &&
    rule.byWeekdays &&
    rule.byWeekdays.length > 0
  ) {
    const sortedDays = Array.from(new Set(rule.byWeekdays)).sort(
      (a, b) => toIsoWeekday(a) - toIsoWeekday(b)
    );
    const dayLabels = sortedDays.map((d) => WEEKDAY_NAMES_ES[d]).join(", ");
    if (rule.interval > 1) {
      return `${prefix}${rule.interval} semanas: ${dayLabels}${modeSuffix}`;
    }
    return `${prefix}${dayLabels}${modeSuffix}`;
  }

  const { interval, frequency } = rule;
  let unitLabel: string;

  switch (frequency) {
    case "DAILY":
      unitLabel = interval === 1 ? "día" : `${interval} días`;
      break;
    case "WORKDAYS":
      unitLabel =
        interval === 1 ? "día laborable" : `${interval} días laborables`;
      break;
    case "WEEKLY":
      unitLabel = interval === 1 ? "semana" : `${interval} semanas`;
      break;
    case "MONTHLY":
      unitLabel = interval === 1 ? "mes" : `${interval} meses`;
      break;
    case "YEARLY":
      unitLabel = interval === 1 ? "año" : `${interval} años`;
      break;
  }

  return `${prefix}${unitLabel}${modeSuffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature 2 y 3: Previsualización de Calendario y Avance Integral de Tarea
// (Incluye auto-reset de Subtasks para rutinas de Limpieza / Mantenimiento)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera una lista con las próximas `count` fechas de vencimiento proyectadas,
 * útil para previsualizar el calendario en `TaskCalendarView` o `TaskForm`.
 */
export function previewUpcomingOccurrences(
  startDueDate: Date | string,
  rule: RecurrenceRuleConfig,
  count = 5
): Date[] {
  if (count <= 0) return [];

  const dates: Date[] = [];
  let cursorDate: Date | string = startDueDate;
  let currentRule: RecurrenceRuleConfig = {
    ...rule,
    anchorDayOfMonth:
      rule.anchorDayOfMonth ?? parseDateInput(startDueDate).getUTCDate(),
  };

  for (let i = 0; i < count; i += 1) {
    const result = calculateNextDueDate({
      currentDueDate: cursorDate,
      completedAt: cursorDate,
      rule: currentRule,
    });

    if (result.isSeriesEnded || !result.nextDueDate) {
      break;
    }

    dates.push(result.nextDueDate);
    cursorDate = result.nextDueDate;
    currentRule = result.updatedRule;
  }

  return dates;
}

/**
 * Ejecuta la transición completa de una tarea recurrente de Prioritask al completarse:
 * - Marca la tarea actual como `DONE`.
 * - Calcula la siguiente ocurrencia respetando `FIXED` vs `FLOATING`.
 * - Clona los metadatos de la tarea (`titulo`, `descripcion`, `categoria`, `peso`, `room_id`, `tags`).
 * - Reinicia automáticamente las subtareas (`completada: false`) si `resetSubtasks !== false`.
 */
export function advanceTaskRecurrence(
  task: Task,
  rule: RecurrenceRuleConfig,
  completedAt: Date | string = new Date()
): AdvanceTaskResult {
  const baseDueDate = task.due_date ?? completedAt;

  const calculation = calculateNextDueDate({
    currentDueDate: baseDueDate,
    completedAt,
    rule,
  });

  const completedTask: Task = {
    ...task,
    estado: "DONE",
  };

  const shouldResetSubtasks = rule.resetSubtasks ?? true;
  const resetSubtasksPayload =
    shouldResetSubtasks && task.subtasks
      ? task.subtasks
          .filter((st) => !st.deleted_at)
          .sort((a, b) => a.orden - b.orden)
          .map((st, idx) => ({
            titulo: st.titulo,
            orden: idx,
            completada: false,
          }))
      : [];

  if (calculation.isSeriesEnded || !calculation.nextDueDate) {
    return {
      completedTask,
      nextTask: null,
      resetSubtasksPayload: [],
      calculation,
    };
  }

  const nextTask: Omit<Task, "id"> = {
    titulo: task.titulo,
    descripcion: task.descripcion,
    estado: "TODO",
    categoria: task.categoria,
    peso: task.peso,
    due_date: toISODateString(calculation.nextDueDate),
    room_id: task.room_id,
    tags: task.tags ? [...task.tags] : undefined,
    is_recurring: true,
    subtasks_count: resetSubtasksPayload.length,
    subtasks_completed_count: 0,
  };

  return {
    completedTask,
    nextTask,
    resetSubtasksPayload,
    calculation,
  };
}
