import { describe, expect, it } from "vitest";
import type { Task } from "../../types/task";
import {
  advanceTaskRecurrence,
  applyWeekendPolicy,
  calculateNextDueDate,
  formatRecurrenceRule,
  parseDateInput,
  parseRecurrenceExpression,
  previewUpcomingOccurrences,
  toISODateString,
} from "../recurrenceEngine";

describe("recurrenceEngine", () => {
  describe("1. Recurrencia Fija de Calendario (FIXED - estilo 'every')", () => {
    it("debe avanzar exactamente el intervalo desde currentDueDate cuando se completa a tiempo", () => {
      const result = calculateNextDueDate({
        currentDueDate: "2026-10-05", // Lunes
        completedAt: "2026-10-05",
        rule: {
          frequency: "WEEKLY",
          interval: 1,
          mode: "FIXED",
        },
      });

      expect(result.isSeriesEnded).toBe(false);
      expect(result.skippedOccurrences).toBe(0);
      expect(toISODateString(result.nextDueDate!)).toBe("2026-10-12");
    });

    it("debe mantener la rejilla fija y hacer catch-up de ciclos vencidos si se completa tarde", () => {
      // Tarea semanal que vencía el 1 de octubre, pero se completa el 10 de octubre:
      // Ciclo 1: 8 oct (ya pasó respecto al 10 oct) -> salta al Ciclo 2: 15 oct.
      const result = calculateNextDueDate({
        currentDueDate: "2026-10-01",
        completedAt: "2026-10-10",
        rule: {
          frequency: "WEEKLY",
          interval: 1,
          mode: "FIXED",
          catchUpOverdue: true,
        },
      });

      expect(toISODateString(result.nextDueDate!)).toBe("2026-10-15");
      expect(result.skippedOccurrences).toBe(1);
    });

    it("debe permitir desactivar catchUpOverdue para avanzar un único paso estricto", () => {
      const result = calculateNextDueDate({
        currentDueDate: "2026-10-01",
        completedAt: "2026-10-10",
        rule: {
          frequency: "WEEKLY",
          interval: 1,
          mode: "FIXED",
          catchUpOverdue: false,
        },
      });

      expect(toISODateString(result.nextDueDate!)).toBe("2026-10-08");
      expect(result.skippedOccurrences).toBe(0);
    });

    it("debe evitar la deriva de fin de mes (31 ene -> 28 feb -> 31 mar) preservando anchorDayOfMonth", () => {
      const step1 = calculateNextDueDate({
        currentDueDate: "2026-01-31",
        completedAt: "2026-01-31",
        rule: {
          frequency: "MONTHLY",
          interval: 1,
          mode: "FIXED",
        },
      });

      expect(toISODateString(step1.nextDueDate!)).toBe("2026-02-28");
      expect(step1.updatedRule.anchorDayOfMonth).toBe(31);

      const step2 = calculateNextDueDate({
        currentDueDate: step1.nextDueDate!,
        completedAt: "2026-02-28",
        rule: step1.updatedRule,
      });

      // Recupera el día 31 en marzo en lugar de quedarse anclado en el 28
      expect(toISODateString(step2.nextDueDate!)).toBe("2026-03-31");
    });

    it("debe manejar años bisiestos en recurrencia anual (29 feb 2024 -> 28 feb 2025 -> 29 feb 2028)", () => {
      const step1 = calculateNextDueDate({
        currentDueDate: "2024-02-29",
        completedAt: "2024-02-29",
        rule: {
          frequency: "YEARLY",
          interval: 1,
          mode: "FIXED",
        },
      });

      expect(toISODateString(step1.nextDueDate!)).toBe("2025-02-28");
      expect(step1.updatedRule.anchorDayOfMonth).toBe(29);

      const stepLeap = calculateNextDueDate({
        currentDueDate: step1.nextDueDate!,
        completedAt: "2025-02-28",
        rule: {
          ...step1.updatedRule,
          interval: 3, // 2025 + 3 = 2028 (bisiesto)
        },
      });

      expect(toISODateString(stepLeap.nextDueDate!)).toBe("2028-02-29");
    });
  });

  describe("2. Recurrencia Flotante al Completar (FLOATING - estilo 'every! 7 days')", () => {
    it("debe calcular el próximo vencimiento desde completedAt cuando se completa con retraso", () => {
      // Vencía el 1 de octubre, se completa el 10 de octubre con 'every! 7 days' -> 17 de octubre
      const floatingResult = calculateNextDueDate({
        currentDueDate: "2026-10-01",
        completedAt: "2026-10-10",
        rule: {
          frequency: "DAILY",
          interval: 7,
          mode: "FLOATING",
        },
      });

      expect(toISODateString(floatingResult.nextDueDate!)).toBe("2026-10-17");
    });

    it("debe adelantar el próximo ciclo si la tarea flotante se completa antes de su fecha límite", () => {
      // Vencía el 10 de octubre, pero se completó el 6 de octubre con 'every! 7 days' -> 13 de octubre
      const floatingEarly = calculateNextDueDate({
        currentDueDate: "2026-10-10",
        completedAt: "2026-10-06",
        rule: {
          frequency: "DAILY",
          interval: 7,
          mode: "FLOATING",
        },
      });

      expect(toISODateString(floatingEarly.nextDueDate!)).toBe("2026-10-13");
    });

    it("debe preservar la hora original de currentDueDate en modo FLOATING por defecto", () => {
      const result = calculateNextDueDate({
        currentDueDate: "2026-10-01T09:30:00.000Z",
        completedAt: "2026-10-04T22:15:00.000Z",
        rule: {
          frequency: "DAILY",
          interval: 5,
          mode: "FLOATING",
        },
      });

      expect(result.nextDueDate!.toISOString()).toBe("2026-10-09T09:30:00.000Z");
    });
  });

  describe("3. Funcionalidades Avanzadas (Parser DSL, Días Laborables, Subtareas y Previsualización)", () => {
    it("debe parsear expresiones Todoist en inglés y español diferenciando 'every' vs 'every!'", () => {
      const floating7Days = parseRecurrenceExpression("every! 7 days");
      expect(floating7Days).toEqual({
        frequency: "DAILY",
        interval: 7,
        mode: "FLOATING",
        endDate: undefined,
      });

      const spanishFloating = parseRecurrenceExpression(
        "cada! 2 semanas hasta 2026-12-31"
      );
      expect(spanishFloating?.mode).toBe("FLOATING");
      expect(spanishFloating?.frequency).toBe("WEEKLY");
      expect(spanishFloating?.interval).toBe(2);
      expect(toISODateString(spanishFloating!.endDate as Date)).toBe("2026-12-31");

      const workdaysRule = parseRecurrenceExpression("cada día laborable");
      expect(workdaysRule).toEqual({
        frequency: "WORKDAYS",
        interval: 1,
        mode: "FIXED",
        endDate: undefined,
      });

      const multiWeekday = parseRecurrenceExpression("every mon, wed, fri");
      expect(multiWeekday).toEqual({
        frequency: "WEEKLY",
        interval: 1,
        mode: "FIXED",
        byWeekdays: [1, 3, 5],
        endDate: undefined,
      });

      const lastDayRule = parseRecurrenceExpression("every last day of month");
      expect(lastDayRule?.isLastDayOfMonth).toBe(true);
    });

    it("debe saltar fines de semana correctamente en frecuencia WORKDAYS y con weekendPolicy", () => {
      // Viernes 2026-10-09 + 1 día laborable -> Lunes 2026-10-12
      const workdayStep = calculateNextDueDate({
        currentDueDate: "2026-10-09",
        completedAt: "2026-10-09",
        rule: {
          frequency: "WORKDAYS",
          interval: 1,
          mode: "FIXED",
        },
      });
      expect(toISODateString(workdayStep.nextDueDate!)).toBe("2026-10-12");

      // Sábado 2026-10-10 con política NEXT_MONDAY -> 2026-10-12
      const shiftedMonday = applyWeekendPolicy(
        parseDateInput("2026-10-10"),
        "NEXT_MONDAY"
      );
      expect(toISODateString(shiftedMonday)).toBe("2026-10-12");

      // Domingo 2026-10-11 con política PREVIOUS_FRIDAY -> 2026-10-09
      const shiftedFriday = applyWeekendPolicy(
        parseDateInput("2026-10-11"),
        "PREVIOUS_FRIDAY"
      );
      expect(toISODateString(shiftedFriday)).toBe("2026-10-09");
    });

    it("debe avanzar una tarea de Prioritask clonando metadatos y reiniciando subtareas", () => {
      const sampleTask: Task = {
        id: "task-123",
        titulo: "Limpieza profunda de cocina",
        descripcion: "Desengrasar campana y horno",
        estado: "IN_PROGRESS",
        categoria: "LIMPIEZA",
        peso: 4,
        due_date: "2026-10-01",
        is_recurring: true,
        subtasks: [
          {
            id: "sub-1",
            task_id: "task-123",
            titulo: "Limpiar filtros campana",
            completada: true,
            orden: 1,
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "sub-2",
            task_id: "task-123",
            titulo: "Desinfectar encimera",
            completada: true,
            orden: 2,
            created_at: "2026-10-01T00:00:00Z",
            updated_at: "2026-10-01T00:00:00Z",
          },
        ],
      };

      const advanced = advanceTaskRecurrence(
        sampleTask,
        {
          frequency: "DAILY",
          interval: 7,
          mode: "FLOATING",
        },
        "2026-10-05"
      );

      expect(advanced.completedTask.estado).toBe("DONE");
      expect(advanced.nextTask).not.toBeNull();
      expect(advanced.nextTask?.estado).toBe("TODO");
      expect(advanced.nextTask?.due_date).toBe("2026-10-12");
      expect(advanced.resetSubtasksPayload).toEqual([
        { titulo: "Limpiar filtros campana", orden: 0, completada: false },
        { titulo: "Desinfectar encimera", orden: 1, completada: false },
      ]);
    });

    it("debe finalizar la serie al alcanzar endDate o maxOccurrences y previsualizar ocurrencias", () => {
      const previews = previewUpcomingOccurrences(
        "2026-10-01",
        {
          frequency: "WEEKLY",
          interval: 1,
          mode: "FIXED",
          endDate: "2026-10-20",
        },
        5
      );

      expect(previews.map(toISODateString)).toEqual([
        "2026-10-08",
        "2026-10-15",
      ]);

      const formatted = formatRecurrenceRule({
        frequency: "DAILY",
        interval: 7,
        mode: "FLOATING",
      });
      expect(formatted).toBe("Cada! 7 días (al completar)");
    });

    it("debe rechazar intervalos fuera de rango, maxOccurrences inválidos y fechas de calendario inexistentes", () => {
      expect(() => parseDateInput("2026-02-30")).toThrow();
      expect(() =>
        calculateNextDueDate({
          currentDueDate: "2026-10-01",
          rule: { frequency: "DAILY", interval: 0, mode: "FIXED" },
        })
      ).toThrow();
      expect(() =>
        calculateNextDueDate({
          currentDueDate: "2026-10-01",
          rule: {
            frequency: "DAILY",
            interval: 1,
            mode: "FIXED",
            maxOccurrences: 0,
          },
        })
      ).toThrow();
    });

    it("debe parsear nombres completos de días en inglés ('every monday, wednesday and friday') sin romper por la letra 'y' y devolver null en fechas 'until' inválidas", () => {
      const fullEnglish = parseRecurrenceExpression(
        "every monday, wednesday and friday"
      );
      expect(fullEnglish).toEqual({
        frequency: "WEEKLY",
        interval: 1,
        mode: "FIXED",
        byWeekdays: [1, 3, 5],
        endDate: undefined,
      });

      const floatingSunday = parseRecurrenceExpression("every! sunday");
      expect(floatingSunday).toEqual({
        frequency: "WEEKLY",
        interval: 1,
        mode: "FLOATING",
        byWeekdays: [0],
        endDate: undefined,
      });

      // Una fecha inexistente en 'until' debe devolver null en vez de lanzar excepción
      expect(
        parseRecurrenceExpression("every day until 2026-02-30")
      ).toBeNull();
    });

    it("debe soportar combinación de byWeekdays con interval > 1 (semanas ISO lunes-domingo y completado a mitad de semana)", () => {
      const parsedMultiWeek = parseRecurrenceExpression(
        "cada 2 semanas los lunes y jueves"
      );
      expect(parsedMultiWeek).toEqual({
        frequency: "WEEKLY",
        interval: 2,
        mode: "FIXED",
        byWeekdays: [1, 4],
        endDate: undefined,
      });
      expect(formatRecurrenceRule(parsedMultiWeek!)).toBe(
        "Cada 2 semanas: lunes, jueves"
      );
      // Round-trip del formato generado
      expect(
        parseRecurrenceExpression(formatRecurrenceRule(parsedMultiWeek!))
      ).toEqual(parsedMultiWeek);

      // Si vencía el lunes 2026-10-05 y se completa el martes 2026-10-06 (mitad de semana activa),
      // el siguiente vencimiento es el jueves 2026-10-08 de esa misma semana activa:
      const midActiveWeek = calculateNextDueDate({
        currentDueDate: "2026-10-05",
        completedAt: "2026-10-06",
        rule: parsedMultiWeek!,
      });
      expect(toISODateString(midActiveWeek.nextDueDate!)).toBe("2026-10-08");

      // Al completar el jueves 2026-10-08, salta la semana de descanso y pasa al lunes 2026-10-19:
      const nextCycle = calculateNextDueDate({
        currentDueDate: "2026-10-08",
        completedAt: "2026-10-08",
        rule: midActiveWeek.updatedRule,
      });
      expect(toISODateString(nextCycle.nextDueDate!)).toBe("2026-10-19");

      // Agrupación ISO lunes-domingo: "every 2 weeks on monday, sunday"
      // Lunes 2026-10-05 y Domingo 2026-10-11 pertenecen a la misma semana ISO:
      const monSunRule = parseRecurrenceExpression(
        "every 2 weeks on monday, sunday"
      )!;
      expect(monSunRule.byWeekdays).toEqual([1, 0]);
      const stepToSunday = calculateNextDueDate({
        currentDueDate: "2026-10-05",
        completedAt: "2026-10-05",
        rule: monSunRule,
      });
      expect(toISODateString(stepToSunday.nextDueDate!)).toBe("2026-10-11");

      const stepAfterSunday = calculateNextDueDate({
        currentDueDate: "2026-10-11",
        completedAt: "2026-10-11",
        rule: stepToSunday.updatedRule,
      });
      expect(toISODateString(stepAfterSunday.nextDueDate!)).toBe("2026-10-19");
    });

    it("debe evitar bloqueos o retrocesos al pasado cuando weekendPolicy es PREVIOUS_FRIDAY o NEXT_MONDAY", () => {
      // Viernes 2026-10-09 con DAILY + PREVIOUS_FRIDAY:
      // Sábado 10 y Domingo 11 se ajustarían al Viernes 9 (que es <= currentDueDate),
      // por lo que debe avanzar hasta el Lunes 2026-10-12:
      const dailyPrevFriday = calculateNextDueDate({
        currentDueDate: "2026-10-09",
        completedAt: "2026-10-09",
        rule: {
          frequency: "DAILY",
          interval: 1,
          mode: "FIXED",
          weekendPolicy: "PREVIOUS_FRIDAY",
        },
      });
      expect(toISODateString(dailyPrevFriday.nextDueDate!)).toBe("2026-10-12");

      // Mensual el día 1 con PREVIOUS_FRIDAY:
      // 1 oct (jue) -> 1 nov (dom, ajustado a vie 30 oct) -> 1 dic (mar)
      const monthlyDay1Previews = previewUpcomingOccurrences(
        "2026-10-01",
        {
          frequency: "MONTHLY",
          interval: 1,
          mode: "FIXED",
          weekendPolicy: "PREVIOUS_FRIDAY",
        },
        3
      );
      expect(monthlyDay1Previews.map(toISODateString)).toEqual([
        "2026-10-30",
        "2026-12-01",
        "2027-01-01",
      ]);

      // Mensual el día 31 con NEXT_MONDAY:
      // 31 dic 2025 (mié) -> 31 ene 2026 (sáb -> lun 2 feb) -> 28 feb 2026 (sáb -> lun 2 mar) -> 31 mar 2026 (mar)
      const monthlyDay31Previews = previewUpcomingOccurrences(
        "2025-12-31",
        {
          frequency: "MONTHLY",
          interval: 1,
          mode: "FIXED",
          weekendPolicy: "NEXT_MONDAY",
        },
        3
      );
      expect(monthlyDay31Previews.map(toISODateString)).toEqual([
        "2026-02-02",
        "2026-03-02",
        "2026-03-31",
      ]);
      // Semanal cada 2 semanas en sábado con NEXT_MONDAY:
      // Sáb 3 oct -> Sáb 17 oct (lun 19 oct) -> Sáb 31 oct (lun 2 nov)
      const biweeklySatNextMonday = previewUpcomingOccurrences(
        "2026-10-03",
        {
          frequency: "WEEKLY",
          interval: 2,
          mode: "FIXED",
          byWeekdays: [6],
          weekendPolicy: "NEXT_MONDAY",
        },
        2
      );
      expect(biweeklySatNextMonday.map(toISODateString)).toEqual([
        "2026-10-19",
        "2026-11-02",
      ]);
    });

    it("debe tratar endDate de solo fecha como inclusivo de todo el día y alinear completedAt de solo fecha con la hora de currentDueDate", () => {
      // El candidato cae el 2026-10-15 a las 09:30 UTC y endDate es "2026-10-15" (inclusive)
      const withinEndDay = calculateNextDueDate({
        currentDueDate: "2026-10-08T09:30:00.000Z",
        completedAt: "2026-10-08T10:00:00.000Z",
        rule: {
          frequency: "WEEKLY",
          interval: 1,
          mode: "FIXED",
          endDate: "2026-10-15",
        },
      });
      expect(withinEndDay.isSeriesEnded).toBe(false);
      expect(withinEndDay.nextDueDate?.toISOString()).toBe(
        "2026-10-15T09:30:00.000Z"
      );

      // Si currentDueDate tiene hora (09:30 UTC) y completedAt es fecha pura "2026-10-08",
      // el catch-up debe reconocer que el ciclo del 2026-10-08 ya se alcanzó y saltar al 2026-10-15:
      const dateOnlyCompletedCatchUp = calculateNextDueDate({
        currentDueDate: "2026-10-01T09:30:00.000Z",
        completedAt: "2026-10-08",
        rule: {
          frequency: "WEEKLY",
          interval: 1,
          mode: "FIXED",
          catchUpOverdue: true,
        },
      });
      expect(dateOnlyCompletedCatchUp.skippedOccurrences).toBe(1);
      expect(dateOnlyCompletedCatchUp.nextDueDate?.toISOString()).toBe(
        "2026-10-15T09:30:00.000Z"
      );
    });

    it("debe parsear día específico del mes ('every 15th', 'cada día 15', 'cada 15 del mes') y 'hasta el YYYY-MM-DD'", () => {
      const en15th = parseRecurrenceExpression("every 15th");
      expect(en15th).toEqual({
        frequency: "MONTHLY",
        interval: 1,
        mode: "FIXED",
        anchorDayOfMonth: 15,
        endDate: undefined,
      });

      const es15thUntil = parseRecurrenceExpression(
        "cada! día 15 del mes hasta el 2026-12-31"
      );
      expect(es15thUntil?.frequency).toBe("MONTHLY");
      expect(es15thUntil?.mode).toBe("FLOATING");
      expect(es15thUntil?.anchorDayOfMonth).toBe(15);
      expect(toISODateString(es15thUntil!.endDate as Date)).toBe("2026-12-31");

      expect(parseRecurrenceExpression("every 32nd")).toBeNull();
      expect(parseRecurrenceExpression("cada día 0")).toBeNull();
    });
  });
});

