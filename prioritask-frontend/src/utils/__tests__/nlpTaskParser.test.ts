import { describe, it, expect } from "vitest";
import {
  parseNaturalTaskInput,
  getTriggerSuggestions,
} from "../nlpTaskParser";

describe("nlpTaskParser — Natural Language Task Input Engine", () => {
  // Base date: Miércoles 15 de Octubre de 2025
  const baseDate = new Date(2025, 9, 15, 10, 0, 0);

  it("retorna título vacío y sin tokens cuando el input está vacío", () => {
    const res = parseNaturalTaskInput("   ", baseDate);
    expect(res.cleanTitle).toBe("");
    expect(res.tokens).toHaveLength(0);
  });

  it("extrae fecha 'mañana', prioridad 'p1' y categoría '#limpieza' dejando el título limpio", () => {
    const res = parseNaturalTaskInput(
      "Fregar suelos de cocina mañana p1 #limpieza",
      baseDate
    );

    expect(res.cleanTitle).toBe("Fregar suelos de cocina");
    expect(res.dueDate).toBe("2025-10-16");
    expect(res.peso).toBe(5);
    expect(res.categoria).toBe("LIMPIEZA");
    expect(res.tokens).toHaveLength(3);
  });

  it("detecta fechas compuestas ('pasado mañana', '20 oct') y días de la semana ('el viernes')", () => {
    const resPasado = parseNaturalTaskInput(
      "Cambiar bombilla pasado mañana #mantenimiento",
      baseDate
    );
    expect(resPasado.cleanTitle).toBe("Cambiar bombilla");
    expect(resPasado.dueDate).toBe("2025-10-17");
    expect(resPasado.categoria).toBe("MANTENIMIENTO");

    const resViernes = parseNaturalTaskInput(
      "Comprar detergente el viernes #compras !!",
      baseDate
    );
    expect(resViernes.cleanTitle).toBe("Comprar detergente");
    expect(resViernes.dueDate).toBe("2025-10-17"); // Miércoles 15 -> Viernes 17
    expect(resViernes.categoria).toBe("COMPRA");
    expect(resViernes.peso).toBe(4); // !! -> P2 (Alta, peso 4)

    const resDiaMes = parseNaturalTaskInput(
      "Revisar caldera 25 oct p3",
      baseDate
    );
    expect(resDiaMes.cleanTitle).toBe("Revisar caldera");
    expect(resDiaMes.dueDate).toBe("2025-10-25");
    expect(resDiaMes.peso).toBe(3);
  });

  it("detecta expresiones DSL de recurrencia ('cada! 7 días', 'cada semana') y las integra con recurrenceEngine", () => {
    const res = parseNaturalTaskInput(
      "Limpiar filtro lavavajillas cada! 7 días #limpieza p2",
      baseDate
    );

    expect(res.cleanTitle).toBe("Limpiar filtro lavavajillas");
    expect(res.recurrenceExpr).toBe("cada! 7 días");
    expect(res.recurrenceRule).toBeDefined();
    expect(res.recurrenceRule?.mode).toBe("FLOATING");
    expect(res.recurrenceRule?.interval).toBe(7);
    expect(res.categoria).toBe("LIMPIEZA");
    expect(res.peso).toBe(4);
  });

  it("ofrece sugerencias contextuales al escribir triggers '#', '!' o '/' al final del texto", () => {
    const hashSuggestions = getTriggerSuggestions("Comprar leche #comp");
    expect(hashSuggestions).not.toBeNull();
    expect(hashSuggestions?.triggerWord).toBe("#comp");
    expect(hashSuggestions?.suggestions[0].token).toBe("#compras");

    const bangSuggestions = getTriggerSuggestions("Arreglar grifo !");
    expect(bangSuggestions).not.toBeNull();
    expect(bangSuggestions?.suggestions.some((s) => s.token === "p1")).toBe(
      true
    );

    const slashSuggestions = getTriggerSuggestions("Limpiar cristales /");
    expect(slashSuggestions).not.toBeNull();
    expect(slashSuggestions?.suggestions.length).toBeGreaterThanOrEqual(6);
    expect(
      slashSuggestions?.suggestions.some((s) => s.type === "recurrence")
    ).toBe(true);
    expect(
      slashSuggestions?.suggestions.some((s) => s.type === "date")
    ).toBe(true);

    // Filtrado tras '/' con texto (/hoy, /cada)
    const slashDateFilter = getTriggerSuggestions("Sacar basura /hoy");
    expect(slashDateFilter).not.toBeNull();
    expect(slashDateFilter?.triggerWord).toBe("/hoy");
    expect(slashDateFilter?.suggestions[0].token).toBe("hoy");

    const slashRecurrenceFilter = getTriggerSuggestions("Regar plantas /cada");
    expect(slashRecurrenceFilter).not.toBeNull();
    expect(
      slashRecurrenceFilter?.suggestions.every((s) => s.type === "recurrence")
    ).toBe(true);

    expect(getTriggerSuggestions("Texto normal sin trigger")).toBeNull();
  });
});
