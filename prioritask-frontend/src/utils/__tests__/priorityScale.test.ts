import { describe, it, expect } from "vitest";
import {
  PRIORITY_SCALE,
  isHighPriority,
  isPriorityCode,
  pesoToPriorityLevel,
  priorityCodeToWeight,
  priorityEntryForWeight,
  weightToPriorityBadge,
} from "../priorityScale";

describe("priorityScale — fuente única de la escala de prioridad", () => {
  it("mapea peso 5 → P1 y peso 4 → P2 sin colapsarlos", () => {
    expect(weightToPriorityBadge(5)).toEqual({
      code: "p1",
      label: "P1",
      colorClass: "command-palette-priority-p1",
    });
    expect(weightToPriorityBadge(4)).toEqual({
      code: "p2",
      label: "P2",
      colorClass: "command-palette-priority-p2",
    });
  });

  it("mapea peso 3 → P3 y peso 2/1/undefined → P4", () => {
    expect(weightToPriorityBadge(3).code).toBe("p3");
    expect(weightToPriorityBadge(2).code).toBe("p4");
    expect(weightToPriorityBadge(1).code).toBe("p4");
    expect(weightToPriorityBadge(undefined).code).toBe("p4");

    expect(pesoToPriorityLevel(5)).toBe("p1");
    expect(pesoToPriorityLevel(4)).toBe("p2");
    expect(pesoToPriorityLevel(3)).toBe("p3");
    expect(pesoToPriorityLevel(2)).toBe("p4");
    expect(pesoToPriorityLevel(undefined)).toBe("p4");
  });

  it("expone la inversa canónica para seleccionar niveles explícitamente", () => {
    expect(priorityCodeToWeight("p1")).toBe(5);
    expect(priorityCodeToWeight("p2")).toBe(4);
    expect(priorityCodeToWeight("p3")).toBe(3);
    expect(priorityCodeToWeight("p4")).toBe(1);
  });

  it("isHighPriority(5)=true, isHighPriority(4)=true, isHighPriority(3)=false", () => {
    expect(isHighPriority(5)).toBe(true);
    expect(isHighPriority(4)).toBe(true);
    expect(isHighPriority(3)).toBe(false);
    expect(isHighPriority(2)).toBe(false);
    expect(isHighPriority(undefined)).toBe(false);
  });

  it("mantiene etiquetas y rangos consistentes en toda la escala", () => {
    expect(PRIORITY_SCALE.map((entry) => entry.code)).toEqual([
      "p1",
      "p2",
      "p3",
      "p4",
    ]);
    expect(priorityEntryForWeight(5).name).toBe("Urgente");
    expect(priorityEntryForWeight(5).minWeight).toBe(5);
    expect(priorityEntryForWeight(4).minWeight).toBe(4);
    expect(priorityEntryForWeight(3).minWeight).toBe(3);
    expect(priorityEntryForWeight(2).minWeight).toBe(1);
    expect(priorityEntryForWeight(2).maxWeight).toBe(2);
    expect(isPriorityCode("P1")).toBe(false);
    expect(isPriorityCode("p1")).toBe(true);
    expect(isPriorityCode("p5")).toBe(false);
  });
});
