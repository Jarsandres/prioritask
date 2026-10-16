import { describe, it, expect } from "vitest";
import {
  scanRecurrenceClause,
  parseRecurrenceIR,
  toRRuleParts,
  formatRRule,
  irToRecurrenceRuleConfig,
} from "../recurrenceLexer";

describe("recurrenceLexer — FSM determinista + escáner single-pass", () => {
  describe("parseRecurrenceIR (FSM)", () => {
    it("parsea 'cada lunes' a WEEKLY con byWeekdays=[1]", () => {
      const ir = parseRecurrenceIR("cada lunes");
      expect(ir).toEqual({
        frequency: "WEEKLY",
        interval: 1,
        mode: "FIXED",
        byWeekdays: [1],
      });
    });

    it("parsea listas multi-día 'cada lunes, miércoles y viernes'", () => {
      expect(parseRecurrenceIR("cada lunes, miércoles y viernes")?.byWeekdays).toEqual([1, 3, 5]);
      expect(parseRecurrenceIR("cada monday and friday")?.byWeekdays).toEqual([1, 5]);
    });

    it("parsea 'cada 2 semanas los lunes y jueves' con intervalo", () => {
      const ir = parseRecurrenceIR("cada 2 semanas los lunes y jueves");
      expect(ir?.frequency).toBe("WEEKLY");
      expect(ir?.interval).toBe(2);
      expect(ir?.byWeekdays).toEqual([1, 4]);
    });

    it("parsea 'cada! 7 días' como DAILY interval 7 FLOATING", () => {
      expect(parseRecurrenceIR("cada! 7 días")).toEqual({
        frequency: "DAILY",
        interval: 7,
        mode: "FLOATING",
      });
    });

    it("parsea el día del mes en ambos órdenes", () => {
      expect(parseRecurrenceIR("cada 15 del mes")?.dayOfMonth).toBe(15);
      expect(parseRecurrenceIR("cada día 15")?.dayOfMonth).toBe(15);
      expect(parseRecurrenceIR("cada 15 del mes")?.frequency).toBe("MONTHLY");
    });

    it("parsea 'cada último día del mes' como isLastDayOfMonth", () => {
      const ir = parseRecurrenceIR("cada último día del mes");
      expect(ir?.frequency).toBe("MONTHLY");
      expect(ir?.isLastDayOfMonth).toBe(true);
    });

    it("parsea días laborables y años", () => {
      expect(parseRecurrenceIR("cada día laborable")?.frequency).toBe("WORKDAYS");
      expect(parseRecurrenceIR("cada año")?.frequency).toBe("YEARLY");
      expect(parseRecurrenceIR("every other week")?.interval).toBe(2);
    });

    it("parsea la cláusula 'hasta/until'", () => {
      const ir = parseRecurrenceIR("cada lunes hasta 2026-12-31");
      expect(ir?.byWeekdays).toEqual([1]);
      expect(ir?.until).toBe("2026-12-31");
    });

    it("rechaza intervalos fuera de rango o expresiones sin unidad", () => {
      expect(parseRecurrenceIR("cada 0 días")).toBeNull();
      expect(parseRecurrenceIR("cada 400 días")).toBeNull();
      expect(parseRecurrenceIR("cada")).toBeNull();
      expect(parseRecurrenceIR("cada tarea")).toBeNull();
    });
  });

  describe("scanRecurrenceClause (escáner single-pass)", () => {
    it("localiza la cláusula en un input combinado y expone span", () => {
      const input = "Limpiar cocina cada lunes y jueves p1";
      const scan = scanRecurrenceClause(input);
      expect(scan.matched).toBe(true);
      expect(scan.text).toBe("cada lunes y jueves");
      expect(input.slice(scan.start, scan.end)).toBe("cada lunes y jueves");
      expect(scan.ir?.byWeekdays).toEqual([1, 4]);
    });

    it("captura la cláusula multipalabra completa (fix X3)", () => {
      const scan = scanRecurrenceClause("Regar plantas cada 2 semanas los lunes y jueves #jardin");
      expect(scan.text).toBe("cada 2 semanas los lunes y jueves");
    });

    it("no matchea cuando no hay recurrencia válida", () => {
      expect(scanRecurrenceClause("#proyecto p1 mañana a las 10:00").matched).toBe(false);
      expect(scanRecurrenceClause("Comprar leche").matched).toBe(false);
    });
  });

  describe("RRULE (RFC 5545)", () => {
    it("deriva RRuleParts y las serializa", () => {
      expect(formatRRule(toRRuleParts(parseRecurrenceIR("cada lunes y jueves")!))).toBe(
        "FREQ=WEEKLY;BYDAY=MO,TH"
      );
      expect(formatRRule(toRRuleParts(parseRecurrenceIR("cada! 7 días")!))).toBe(
        "FREQ=DAILY;INTERVAL=7"
      );
      expect(formatRRule(toRRuleParts(parseRecurrenceIR("cada 15 del mes")!))).toBe(
        "FREQ=MONTHLY;BYMONTHDAY=15"
      );
      expect(formatRRule(toRRuleParts(parseRecurrenceIR("cada último día del mes")!))).toBe(
        "FREQ=MONTHLY;BYMONTHDAY=-1"
      );
      expect(formatRRule(toRRuleParts(parseRecurrenceIR("cada día laborable")!))).toBe(
        "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
      );
      expect(formatRRule(toRRuleParts(parseRecurrenceIR("cada lunes hasta 2026-12-31")!))).toBe(
        "FREQ=WEEKLY;UNTIL=20261231;BYDAY=MO"
      );
    });
  });

  describe("irToRecurrenceRuleConfig (adaptador)", () => {
    it("mapea IR a la config del motor existente", () => {
      const cfg = irToRecurrenceRuleConfig(parseRecurrenceIR("cada 15 del mes")!);
      expect(cfg.frequency).toBe("MONTHLY");
      expect(cfg.interval).toBe(1);
      expect(cfg.mode).toBe("FIXED");
      expect(cfg.anchorDayOfMonth).toBe(15);
    });
  });
});
