import React, { useState, useMemo, useEffect } from "react";
import type { Task } from "../../types/task";
import { getTotalKudosBonusPoints } from "../../utils/kudosStore";
import { useSettings } from "../../context/SettingsContext";
import { LuFlame, LuTrophy, LuTarget, LuSparkles } from "react-icons/lu";
import "../tasks/tasks.css";

export interface DailyGoalRingProps {
  tasks: Task[];
  className?: string;
}

const DAILY_GOAL_STORAGE_KEY = "prioritask-daily-goal";
const GOAL_PRESETS = [3, 5, 8, 10];

interface KarmaRank {
  title: string;
  minPoints: number;
  color: string;
}

const KARMA_RANKS: KarmaRank[] = [
  { title: "Leyenda Todoist", minPoints: 150, color: "#7c3aed" },
  { title: "Maestro del Hogar", minPoints: 80, color: "#dc2626" },
  { title: "Experto Doméstico", minPoints: 40, color: "#059669" },
  { title: "Constante", minPoints: 15, color: "#2563eb" },
  { title: "Aprendiz", minPoints: 0, color: "#64748b" },
];

export const DailyGoalRing: React.FC<DailyGoalRingProps> = ({
  tasks,
  className = "",
}) => {
  const { settings, updateProductivity } = useSettings();
  const {
    dailyTaskGoal: dailyGoal,
    daysOff,
    vacationMode,
  } = settings.productivity;

  const [kudosBonus, setKudosBonus] = useState<number>(() =>
    getTotalKudosBonusPoints()
  );

  useEffect(() => {
    const syncKudos = () => setKudosBonus(getTotalKudosBonusPoints());
    window.addEventListener("prioritask:kudos-updated", syncKudos);
    return () => window.removeEventListener("prioritask:kudos-updated", syncKudos);
  }, []);

  const handleSelectGoal = (newGoal: number) => {
    updateProductivity({ dailyTaskGoal: newGoal });
    try {
      localStorage.setItem(DAILY_GOAL_STORAGE_KEY, String(newGoal));
    } catch {
      // Ignore storage errors
    }
  };

  const stats = useMemo(() => {
    const doneTasks = tasks.filter((t) => t.estado === "DONE");
    const completedCount = doneTasks.length;

    // Puntos Karma ponderados por prioridad (peso 1..5 -> 5..25 pts) + micro-puntos Kudos
    const baseKarmaPoints = doneTasks.reduce(
      (acc, t) => acc + (t.peso ? t.peso * 5 : 10),
      0
    );
    const karmaPoints = baseKarmaPoints + kudosBonus;

    const rank =
      KARMA_RANKS.find((r) => karmaPoints >= r.minPoints) ||
      KARMA_RANKS[KARMA_RANKS.length - 1];

    const progressRatio = Math.min(1, completedCount / Math.max(1, dailyGoal));
    const percentage = Math.round(progressRatio * 100);
    const isGoalMet = completedCount >= dailyGoal;

    // Distribución por categoría (Mapa de actividad del hogar)
    const categories = [
      { key: "LIMPIEZA", label: "Limpieza", color: "#2563eb" },
      { key: "COMPRA", label: "Compras", color: "#059669" },
      { key: "MANTENIMIENTO", label: "Mantenimiento", color: "#d97706" },
      { key: "OTRO", label: "Otros", color: "#7c3aed" },
    ];

    const total = Math.max(1, tasks.length);
    const categoryBreakdown = categories.map((cat) => {
      const catTasks = tasks.filter(
        (t) => (t.categoria || "OTRO").toUpperCase() === cat.key
      );
      const catDone = catTasks.filter((t) => t.estado === "DONE").length;
      return {
        ...cat,
        total: catTasks.length,
        done: catDone,
        share: Math.round((catTasks.length / total) * 100),
      };
    });

    // Racha activa de días y Mapa de Calor Semanal (Lun - Dom)
    const dayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const now = new Date();
    const currentDay = now.getDay(); // 0 (Dom) .. 6 (Sáb)
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() + mondayOffset);

    const completedDatesSet = new Set<string>();
    doneTasks.forEach((t) => {
      const rawDate = t.due_date || t.updated_at || t.created_at;
      if (rawDate) {
        completedDatesSet.add(String(rawDate).slice(0, 10));
      }
    });

    const weeklyHeatmap = dayLabels.map((label, idx) => {
      const d = new Date(mondayDate);
      d.setDate(mondayDate.getDate() + idx);
      const iso = d.toISOString().slice(0, 10);
      const countForDay = doneTasks.filter((t) => {
        const raw = t.due_date || t.updated_at || t.created_at;
        return raw && String(raw).slice(0, 10) === iso;
      }).length;
      // Si hay tareas completadas sin fecha explícita y hoy es ese día, las atribuimos al día actual
      const isToday = iso === now.toISOString().slice(0, 10);
      const undatedDone = isToday
        ? doneTasks.filter(
            (t) => !t.due_date && !t.updated_at && !t.created_at
          ).length
        : 0;
      const count = countForDay + undatedDone;
      return {
        label,
        iso,
        count,
        isToday,
      };
    });

    // Cálculo de racha activa (días consecutivos con tareas completadas, respetando daysOff y vacationMode)
    let streakDays = 0;
    if (completedCount > 0 || vacationMode) {
      const cursor = new Date(now);
      for (let i = 0; i < 30; i++) {
        const iso = cursor.toISOString().slice(0, 10);
        const dayOfWeek = cursor.getDay();
        if (completedDatesSet.has(iso)) {
          streakDays++;
          cursor.setDate(cursor.getDate() - 1);
        } else if (i === 0 || daysOff.includes(dayOfWeek) || vacationMode) {
          // Si es hoy, día de descanso configurado o Modo Vacaciones, no rompe la racha
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
      if (streakDays === 0) {
        streakDays = Math.min(7, Math.max(1, Math.ceil(completedCount / 2)));
      }
    }

    return {
      completedCount,
      karmaPoints,
      kudosBonus,
      rank,
      progressRatio,
      percentage,
      isGoalMet,
      categoryBreakdown,
      weeklyHeatmap,
      streakDays,
    };
  }, [tasks, dailyGoal, kudosBonus, daysOff, vacationMode]);

  // Parámetros SVG del anillo circular
  const size = 108;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - stats.progressRatio * circumference;

  return (
    <div
      className={`bento-karma-widget ${className}`.trim()}
      data-testid="daily-goal-ring-widget"
    >
      {/* Mitad Izquierda: Anillo de Meta Diaria & Karma Todoist */}
      <div className="bento-karma-ring-card">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div className="d-flex align-items-center gap-2">
            <span className="bento-badge-icon">
              <LuTarget size={16} />
            </span>
            <div>
              <h4 className="bento-card-title mb-0">Meta de Productividad</h4>
              <span className="text-muted" style={{ fontSize: "11.5px" }}>
                Inspirado en Todoist Karma
              </span>
            </div>
          </div>

          <span
            className="badge rounded-pill d-inline-flex align-items-center gap-1 px-2 py-1"
            style={{
              backgroundColor: `${stats.rank.color}18`,
              color: stats.rank.color,
              fontSize: "11px",
              fontWeight: 700,
            }}
            data-testid="karma-rank-badge"
          >
            <LuTrophy size={12} />
            <span>{stats.rank.title}</span>
          </span>
        </div>

        <div className="bento-ring-main">
          <div className="bento-svg-wrapper">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--bg-subtle)"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={
                  stats.isGoalMet
                    ? "var(--success-500, #10b981)"
                    : "var(--primary-500, #2563eb)"
                }
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{
                  transition: "stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              />
            </svg>
            <div className="bento-ring-center">
              <span
                className="bento-ring-fraction"
                data-testid="daily-goal-fraction"
              >
                {stats.completedCount}/{dailyGoal}
              </span>
              <span className="bento-ring-sublabel">
                {stats.isGoalMet ? "¡Lograda!" : "tareas"}
              </span>
            </div>
          </div>

          <div className="bento-ring-details">
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              <span className="bento-karma-points" data-testid="karma-points-value">
                <LuFlame size={15} className="text-danger me-1" />
                {stats.karmaPoints} pts Karma
              </span>
              {stats.kudosBonus > 0 && (
                <span
                  className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle"
                  style={{ fontSize: "10.5px", fontWeight: 700 }}
                  data-testid="kudos-bonus-badge"
                >
                  👏 +{stats.kudosBonus} pts Kudos
                </span>
              )}
              <span
                className="badge rounded-pill bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                style={{ fontSize: "10.5px", fontWeight: 700 }}
                data-testid="daily-streak-badge"
              >
                🔥 {stats.streakDays} {stats.streakDays === 1 ? "día" : "días"} racha
              </span>
              {vacationMode && (
                <span
                  className="badge rounded-pill bg-info-subtle text-info-emphasis border border-info-subtle"
                  style={{ fontSize: "10.5px", fontWeight: 700 }}
                  data-testid="vacation-mode-badge"
                >
                  🏖️ Modo Vacaciones
                </span>
              )}
            </div>

            <p className="text-muted small mb-2" style={{ fontSize: "12px" }}>
              {stats.isGoalMet
                ? "🎉 ¡Has superado el objetivo de tareas completadas!"
                : `Completa ${Math.max(
                    0,
                    dailyGoal - stats.completedCount
                  )} tarea(s) más para alcanzar tu meta.`}
            </p>

            {/* Selector rápido de meta diaria */}
            <div className="d-flex align-items-center gap-1 flex-wrap">
              <span className="text-muted me-1" style={{ fontSize: "11px" }}>
                Meta:
              </span>
              {GOAL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`todoist-mini-chip ${
                    dailyGoal === preset ? "active" : ""
                  }`}
                  onClick={() => handleSelectGoal(preset)}
                  data-testid={`goal-preset-${preset}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mitad Derecha: Mapa de Calor Semanal & Balance de Carga por Categoría */}
      <div className="bento-karma-breakdown-card">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div className="d-flex align-items-center gap-2">
            <span className="bento-badge-icon">
              <LuSparkles size={15} />
            </span>
            <div>
              <h4 className="bento-card-title mb-0">
                Balance de Carga Doméstica
              </h4>
              <span className="text-muted" style={{ fontSize: "11.5px" }}>
                Mapa de actividad semanal y avance por área del hogar
              </span>
            </div>
          </div>
        </div>

        {/* Mini-Mapa de Calor Semanal (Lun - Dom) */}
        <div
          className="bento-weekly-heatmap mb-3"
          data-testid="weekly-activity-heatmap"
          aria-label="Mapa de actividad semanal"
        >
          {stats.weeklyHeatmap.map((day) => {
            const intensity =
              day.count === 0
                ? 0
                : day.count === 1
                  ? 1
                  : day.count <= 3
                    ? 2
                    : 3;
            return (
              <div
                key={day.iso}
                className={`bento-heatmap-col ${day.isToday ? "is-today" : ""}`}
                title={`${day.label} (${day.iso}): ${day.count} completada(s)`}
              >
                <span
                  className={`bento-heatmap-cell level-${intensity}`}
                  data-testid={`heatmap-day-${day.label}`}
                >
                  {day.count > 0 ? day.count : ""}
                </span>
                <span className="bento-heatmap-label">{day.label}</span>
              </div>
            );
          })}
        </div>

        <div className="d-flex flex-column gap-2">
          {stats.categoryBreakdown.map((item) => (
            <div key={item.key} className="bento-category-row">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="fw-semibold" style={{ fontSize: "12.5px" }}>
                  {item.label}
                </span>
                <span className="text-muted" style={{ fontSize: "11.5px" }}>
                  {item.done}/{item.total} completadas ({item.share}%)
                </span>
              </div>
              <div className="kpi-progress-bar-bg" style={{ height: "6px" }}>
                <div
                  className="kpi-progress-bar-fill"
                  style={{
                    width: `${
                      item.total > 0
                        ? Math.round((item.done / item.total) * 100)
                        : 0
                    }%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyGoalRing;
