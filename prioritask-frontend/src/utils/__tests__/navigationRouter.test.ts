import { describe, it, expect, vi } from "vitest";
import {
  buildNavigationUrl,
  isSafeNavigationEntityId,
  navigateTo,
  parseCommandPaletteInput,
  parseNavigationQuery,
  priorityCodeToWeightRange,
  weightToPriorityBadge,
} from "../navigationRouter";

describe("navigationRouter — Motor de Navegación Estructurada Todoist Desktop v9.31.0", () => {
  describe("isSafeNavigationEntityId", () => {
    it("acepta identificadores alfanuméricos, guiones y guiones bajos válidos", () => {
      expect(isSafeNavigationEntityId("task-123_abc")).toBe(true);
      expect(isSafeNavigationEntityId("550e8400-e29b-41d4-a716-446655440000")).toBe(
        true
      );
    });

    it("rechaza claves de contaminación de prototipos y cadenas maliciosas", () => {
      expect(isSafeNavigationEntityId("__proto__")).toBe(false);
      expect(isSafeNavigationEntityId("constructor")).toBe(false);
      expect(isSafeNavigationEntityId("prototype")).toBe(false);
      expect(isSafeNavigationEntityId("<script>alert(1)</script>")).toBe(false);
      expect(isSafeNavigationEntityId("")).toBe(false);
      expect(isSafeNavigationEntityId(null)).toBe(false);
      expect(isSafeNavigationEntityId(undefined)).toBe(false);
      expect(isSafeNavigationEntityId("a".repeat(130))).toBe(false);
    });
  });

  describe("priorityCodeToWeightRange & weightToPriorityBadge", () => {
    it("mapea códigos p1..p4 a rangos de peso 1..5 y viceversa", () => {
      expect(priorityCodeToWeightRange("p1")).toEqual({
        priority: "p1",
        pesoMin: 5,
        pesoMax: 5,
        label: "P1 (Urgente)",
      });
      expect(priorityCodeToWeightRange("P2")).toEqual({
        priority: "p2",
        pesoMin: 4,
        pesoMax: 4,
        label: "P2 (Alta)",
      });
      expect(priorityCodeToWeightRange("p3")).toEqual({
        priority: "p3",
        pesoMin: 3,
        pesoMax: 3,
        label: "P3 (Media)",
      });
      expect(priorityCodeToWeightRange("p4")).toEqual({
        priority: "p4",
        pesoMin: 1,
        pesoMax: 2,
        label: "P4 (Baja)",
      });
      expect(priorityCodeToWeightRange("invalid")).toEqual({
        priority: "",
        pesoMin: null,
        pesoMax: null,
        label: "",
      });

      expect(weightToPriorityBadge(5).code).toBe("p1");
      expect(weightToPriorityBadge(4).code).toBe("p2");
      expect(weightToPriorityBadge(3).code).toBe("p3");
      expect(weightToPriorityBadge(2).code).toBe("p4");
      expect(weightToPriorityBadge(undefined).code).toBe("p4");
    });
  });

  describe("buildNavigationUrl", () => {
    it("construye rutas de Vistas Inteligentes (today, upcoming, inbox, completed)", () => {
      expect(buildNavigationUrl({ view: { type: "today" } })).toBe(
        "/tasks?view=today"
      );
      expect(buildNavigationUrl({ view: { type: "upcoming" } })).toBe(
        "/tasks?view=upcoming"
      );
      expect(buildNavigationUrl({ view: { type: "completed" } })).toBe(
        "/tasks?view=completed"
      );
      expect(buildNavigationUrl({ view: { type: "inbox" } })).toBe("/tasks");
      expect(
        buildNavigationUrl({ view: { type: "today", roomId: "room-42" } })
      ).toBe("/rooms/room-42/tasks?view=today");
    });

    it("construye rutas para salas, etiquetas, prioridades, categorías, búsqueda y páginas estáticas", () => {
      expect(
        buildNavigationUrl({ view: { type: "room", roomId: "room-abc" } })
      ).toBe("/rooms/room-abc/tasks");
      expect(
        buildNavigationUrl({ view: { type: "tag", tagName: "urgente" } })
      ).toBe("/tags?q=urgente");
      expect(buildNavigationUrl({ view: { type: "tag" } })).toBe("/tags");
      expect(
        buildNavigationUrl({ view: { type: "priority", priority: "p1" } })
      ).toBe("/tasks?priority=p1");
      expect(
        buildNavigationUrl({
          view: { type: "category", categoria: "limpieza" },
        })
      ).toBe("/tasks?categoria=LIMPIEZA");
      expect(
        buildNavigationUrl({
          view: { type: "search", searchQuery: "comprar leche" },
        })
      ).toBe("/tasks?q=comprar%20leche");
      expect(buildNavigationUrl({ view: { type: "dashboard" } })).toBe(
        "/dashboard"
      );
      expect(buildNavigationUrl({ view: { type: "analytics" } })).toBe(
        "/analytics"
      );
      expect(buildNavigationUrl({ view: { type: "history" } })).toBe(
        "/history"
      );
      expect(buildNavigationUrl({ view: { type: "profile" } })).toBe(
        "/profile"
      );
      expect(buildNavigationUrl({ view: { type: "grouped" } })).toBe(
        "/tasks/grouped"
      );
      expect(buildNavigationUrl({ view: { type: "assign" } })).toBe(
        "/tasks/assign"
      );
    });

    it("construye deep-links de tareas (?taskId=) validando IDs seguros", () => {
      expect(buildNavigationUrl({ task: { id: "task-99" } })).toBe(
        "/tasks?taskId=task-99"
      );
      expect(
        buildNavigationUrl({ task: { id: "task-99", roomId: "room-7" } })
      ).toBe("/rooms/room-7/tasks?taskId=task-99");
      expect(buildNavigationUrl({ task: { id: "__proto__" } })).toBe("/tasks");
    });
  });

  describe("parseNavigationQuery", () => {
    const fixedNow = new Date("2026-10-12T10:00:00.000Z");

    it("hidrata correctamente ?view=today, ?view=upcoming y ?view=completed", () => {
      const todayParsed = parseNavigationQuery("?view=today", fixedNow);
      expect(todayParsed.view).toBe("today");
      expect(todayParsed.fechaLimite).toBe("2026-10-12");

      const upcomingParsed = parseNavigationQuery("?view=upcoming", fixedNow);
      expect(upcomingParsed.view).toBe("upcoming");
      expect(upcomingParsed.fechaLimite).toBe("2026-10-19");

      const completedParsed = parseNavigationQuery("?view=completed", fixedNow);
      expect(completedParsed.view).toBe("completed");
      expect(completedParsed.estado).toBe("DONE");
    });

    it("parsea ?priority=p1..p4, ?categoria=LIMPIEZA, ?q=texto y ?taskId=abc-123", () => {
      const parsed = parseNavigationQuery(
        "?priority=p2&categoria=limpieza&q=aspirar&taskId=abc-123",
        fixedNow
      );
      expect(parsed.priority).toBe("p2");
      expect(parsed.pesoMin).toBe(4);
      expect(parsed.pesoMax).toBe(4);
      expect(parsed.categoria).toBe("LIMPIEZA");
      expect(parsed.q).toBe("aspirar");
      expect(parsed.taskId).toBe("abc-123");
    });

    it("ignora taskIds maliciosos en parseNavigationQuery", () => {
      expect(
        parseNavigationQuery("?taskId=__proto__", fixedNow).taskId
      ).toBeNull();
      expect(
        parseNavigationQuery("?taskId=<script>", fixedNow).taskId
      ).toBeNull();
    });
  });

  describe("parseCommandPaletteInput", () => {
    it("detecta los prefijos semánticos >, #, @, ! y búsqueda general", () => {
      expect(parseCommandPaletteInput("> tema")).toEqual({
        mode: "actions",
        cleanQuery: "tema",
        priorityFilter: null,
      });
      expect(parseCommandPaletteInput("# cocina")).toEqual({
        mode: "rooms",
        cleanQuery: "cocina",
        priorityFilter: null,
      });
      expect(parseCommandPaletteInput("@urgente")).toEqual({
        mode: "tags",
        cleanQuery: "urgente",
        priorityFilter: null,
      });
      expect(parseCommandPaletteInput("!p1 pagar recibo")).toEqual({
        mode: "priority",
        cleanQuery: "pagar recibo",
        priorityFilter: "p1",
      });
      expect(parseCommandPaletteInput("p2 comprar fruta")).toEqual({
        mode: "priority",
        cleanQuery: "comprar fruta",
        priorityFilter: "p2",
      });
      expect(parseCommandPaletteInput("barrer terraza")).toEqual({
        mode: "all",
        cleanQuery: "barrer terraza",
        priorityFilter: null,
      });
    });
  });

  describe("navigateTo", () => {
    it("invoca navigate con la URL construida y opciones opcionales", () => {
      const mockNavigate = vi.fn();
      const url = navigateTo(
        mockNavigate,
        { task: { id: "t-55", roomId: "r-10" } },
        { replace: true }
      );
      expect(url).toBe("/rooms/r-10/tasks?taskId=t-55");
      expect(mockNavigate).toHaveBeenCalledWith(
        "/rooms/r-10/tasks?taskId=t-55",
        { replace: true }
      );
    });
  });
});
