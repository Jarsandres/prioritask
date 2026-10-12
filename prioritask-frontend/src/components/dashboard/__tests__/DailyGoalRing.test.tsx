import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import DailyGoalRing from "../DailyGoalRing";
import { toggleTaskKudo, addTaskKudo } from "../../../utils/kudosStore";
import type { Task } from "../../../types/task";

const mockTasks: Task[] = [
  {
    id: "t-1",
    titulo: "Aspirar alfombra",
    categoria: "LIMPIEZA",
    peso: 5, // 25 pts Karma
    estado: "DONE",
  },
  {
    id: "t-2",
    titulo: "Comprar fruta",
    categoria: "COMPRA",
    peso: 4, // 20 pts Karma
    estado: "DONE",
  },
  {
    id: "t-3",
    titulo: "Revisar grifo",
    categoria: "MANTENIMIENTO",
    peso: 3,
    estado: "TODO",
  },
];

describe("DailyGoalRing Component (Todoist Karma & Bento Activity)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("calcula correctamente los puntos Karma ponderados por prioridad, el rango y el progreso de meta diaria", () => {
    render(<DailyGoalRing tasks={mockTasks} />);

    expect(screen.getByTestId("daily-goal-ring-widget")).toBeInTheDocument();
    expect(screen.getByTestId("daily-goal-fraction")).toHaveTextContent("2/5");
    // 25 + 20 = 45 pts Karma -> Rango 'Experto Doméstico' (minPoints: 40)
    expect(screen.getByTestId("karma-points-value")).toHaveTextContent(
      "45 pts Karma"
    );
    expect(screen.getByTestId("karma-rank-badge")).toHaveTextContent(
      "Experto Doméstico"
    );
    expect(screen.getByTestId("daily-streak-badge")).toHaveTextContent(/racha/i);
    expect(screen.getByTestId("weekly-activity-heatmap")).toBeInTheDocument();
  });

  it("permite cambiar la meta diaria (3, 5, 8, 10) y persiste la selección en localStorage", () => {
    render(<DailyGoalRing tasks={mockTasks} />);

    fireEvent.click(screen.getByTestId("goal-preset-3"));
    expect(screen.getByTestId("daily-goal-fraction")).toHaveTextContent("2/3");
    expect(localStorage.getItem("prioritask-daily-goal")).toBe("3");
  });

  it("suma los micro-puntos de Kudos al total de Karma en tiempo real (misma pestaña y evento storage multi-pestaña) y muestra el badge de reconocimiento", () => {
    render(<DailyGoalRing tasks={mockTasks} />);
    expect(screen.queryByTestId("kudos-bonus-badge")).not.toBeInTheDocument();

    act(() => {
      // Tarea pesada (peso 5 -> x2): 🔥 otorga 3 * 2 = +6 micro-puntos
      toggleTaskKudo("t-1", "🔥", 5, true);
    });

    // 45 + 6 = 51 pts Karma
    expect(screen.getByTestId("karma-points-value")).toHaveTextContent(
      "51 pts Karma"
    );
    expect(screen.getByTestId("kudos-bonus-badge")).toHaveTextContent(
      "+6 pts Kudos"
    );

    act(() => {
      // addTaskKudo con ❤️ en tarea pesada/verificada suma +4 micro-puntos (2 * 2)
      addTaskKudo("t-1", "❤️", { isHeavyOrVerified: true });
    });

    // 51 + 4 = 55 pts Karma (+10 pts Kudos)
    expect(screen.getByTestId("karma-points-value")).toHaveTextContent(
      "55 pts Karma"
    );
    expect(screen.getByTestId("kudos-bonus-badge")).toHaveTextContent(
      "+10 pts Kudos"
    );

    // Simular actualización desde otra pestaña vía StorageEvent
    act(() => {
      localStorage.setItem("prioritask_kudos_bonus_points_v1", "14");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "prioritask_kudos_bonus_points_v1",
          newValue: "14",
        })
      );
    });

    // 45 + 14 = 59 pts Karma
    expect(screen.getByTestId("karma-points-value")).toHaveTextContent(
      "59 pts Karma"
    );
    expect(screen.getByTestId("kudos-bonus-badge")).toHaveTextContent(
      "+14 pts Kudos"
    );
  });

  it("muestra el badge de Modo Vacaciones y protege la racha cuando vacationMode está activo en SettingsContext", () => {
    localStorage.setItem(
      "prioritask-user-settings-v1",
      JSON.stringify({
        productivity: {
          dailyTaskGoal: 8,
          weeklyTaskGoal: 25,
          daysOff: [0, 6],
          vacationMode: true,
          celebrateGoalCompletion: true,
        },
      })
    );

    render(<DailyGoalRing tasks={[]} />);

    expect(screen.getByTestId("daily-goal-fraction")).toHaveTextContent("0/8");
    expect(screen.getByTestId("vacation-mode-badge")).toHaveTextContent(
      /Modo Vacaciones/i
    );
    expect(screen.getByTestId("daily-streak-badge")).toHaveTextContent(
      /1 día racha/i
    );
  });
});
