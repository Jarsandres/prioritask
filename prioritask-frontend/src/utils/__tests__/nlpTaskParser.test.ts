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

  it("extrae múltiples etiquetas @tag normalizadas, deduplicadas, con tagIds y límite máximo de 10 (RN-04)", () => {
    const context = {
      tags: [
        { id: "tag-1", nombre: "Ferretería" },
        { id: "tag-2", nombre: "Hogar" },
      ],
    };

    const res = parseNaturalTaskInput(
      "Comprar bombillas LED @Ferreteria @HOGAR @ferreteria @extra_tag",
      baseDate,
      context
    );

    expect(res.cleanTitle).toBe("Comprar bombillas LED");
    expect(res.tags).toEqual(["ferreteria", "hogar", "extra_tag"]);
    expect(res.tagIds).toEqual(["tag-1", "tag-2"]);

    // Límite máximo de 10 etiquetas
    const manyTagsInput =
      "Tarea masiva @t1 @t2 @t3 @t4 @t5 @t6 @t7 @t8 @t9 @t10 @t11 @t12";
    const resLimit = parseNaturalTaskInput(manyTagsInput, baseDate);
    expect(resLimit.cleanTitle).toBe("Tarea masiva");
    expect(resLimit.tags).toHaveLength(10);
    expect(resLimit.tags).not.toContain("t11");
  });

  it("resuelve habitaciones con ~sala, ~\"Habitación Principal\" y #sala insensible a tildes/mayúsculas (RN-03 / EC-04)", () => {
    const context = {
      rooms: [
        { id: "room-cocina", nombre: "Cocina Principal" },
        { id: "room-ninos", nombre: "Habitación Niños" },
      ],
    };

    const resTildeSimple = parseNaturalTaskInput(
      "Fregar platos ~cocina !alta",
      baseDate,
      context
    );
    expect(resTildeSimple.cleanTitle).toBe("Fregar platos");
    expect(resTildeSimple.roomId).toBe("room-cocina");
    expect(resTildeSimple.roomName).toBe("Cocina Principal");
    expect(resTildeSimple.peso).toBe(4);

    const resQuotedRoom = parseNaturalTaskInput(
      'Ordenar juguetes ~"Habitación Niños"',
      baseDate,
      context
    );
    expect(resQuotedRoom.cleanTitle).toBe("Ordenar juguetes");
    expect(resQuotedRoom.roomId).toBe("room-ninos");

    const resHashRoom = parseNaturalTaskInput(
      "Cambiar cortinas #habitacion_ninos",
      baseDate,
      context
    );
    expect(resHashRoom.cleanTitle).toBe("Cambiar cortinas");
    expect(resHashRoom.roomId).toBe("room-ninos");

    // Si #token o ~token no coincide con ninguna sala ni categoría, se conserva en cleanTitle
    const resUnknown = parseNaturalTaskInput(
      "Pintar pared ~garaje #proyectoX",
      baseDate,
      context
    );
    expect(resUnknown.cleanTitle).toBe("Pintar pared ~garaje #proyectoX");
    expect(resUnknown.roomId).toBeUndefined();
  });

  it("resuelve asignación +miembro y +\"María José\" contra miembros del hogar o conserva el token si no coincide (RN-05)", () => {
    const context = {
      members: [
        {
          user_id: "user-maria",
          user_nombre: "María José",
          user_email: "maria.jose@prioritask.dev",
        },
        {
          user_id: "user-carlos",
          user_nombre: "Carlos Ruiz",
          user_email: "carlos@prioritask.dev",
        },
      ],
    };

    const resFirst = parseNaturalTaskInput(
      "Sacar reciclaje +maria mañana",
      baseDate,
      context
    );
    expect(resFirst.cleanTitle).toBe("Sacar reciclaje");
    expect(resFirst.assigneeId).toBe("user-maria");
    expect(resFirst.assigneeName).toBe("María José");
    expect(resFirst.dueDate).toBe("2025-10-16");

    const resQuoted = parseNaturalTaskInput(
      'Preparar cena +"María José"',
      baseDate,
      context
    );
    expect(resQuoted.cleanTitle).toBe("Preparar cena");
    expect(resQuoted.assigneeId).toBe("user-maria");

    // Miembro inexistente -> conserva +desconocido en cleanTitle (RN-05)
    const resUnknown = parseNaturalTaskInput(
      "Llamar técnico +roberto",
      baseDate,
      context
    );
    expect(resUnknown.cleanTitle).toBe("Llamar técnico +roberto");
    expect(resUnknown.assigneeId).toBeUndefined();
  });

  it("preserva el texto original como cleanTitle cuando la entrada consiste únicamente en tokens NLP (RN-01 / EC-01)", () => {
    const res = parseNaturalTaskInput("mañana p1 #limpieza", baseDate);
    expect(res.cleanTitle).toBe("mañana p1 #limpieza");
    expect(res.dueDate).toBe("2025-10-16");
    expect(res.peso).toBe(5);
    expect(res.categoria).toBe("LIMPIEZA");
  });

  it("ofrece sugerencias contextuales para '@', '~' y '+' basadas en NlpParseContext", () => {
    const context = {
      tags: [
        { id: "t1", nombre: "Supermercado" },
        { id: "t2", nombre: "Urgente" },
      ],
      rooms: [
        { id: "r1", nombre: "Cocina" },
        { id: "r2", nombre: "Salón Principal" },
      ],
      members: [
        {
          user_id: "u1",
          user_nombre: "María José",
          user_email: "maria@hogar.es",
        },
      ],
    };

    const atSuggestions = getTriggerSuggestions("Comprar pan @sup", context);
    expect(atSuggestions).not.toBeNull();
    expect(atSuggestions?.suggestions[0].token).toBe("@supermercado");

    const tildeSuggestions = getTriggerSuggestions("Barrer ~sal", context);
    expect(tildeSuggestions).not.toBeNull();
    expect(tildeSuggestions?.suggestions[0].token).toBe('~"Salón Principal"');

    const plusSuggestions = getTriggerSuggestions("Repasar +mar", context);
    expect(plusSuggestions).not.toBeNull();
    expect(plusSuggestions?.suggestions[0].token).toBe('+"María José"');
  });
});

