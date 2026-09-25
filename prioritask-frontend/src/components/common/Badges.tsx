/* eslint-disable react-refresh/only-export-components */
import type { TaskStatus } from "../../types/task";

export interface PriorityBadgeProps {
  peso: number;
  className?: string;
}

export const PriorityBadge = ({ peso, className = "" }: PriorityBadgeProps) => {
  if (peso >= 4) {
    return (
      <span className={`retro-badge retro-badge-high ${className}`.trim()}>
        ⚡ Prioridad Alta
      </span>
    );
  }
  if (peso >= 2) {
    return (
      <span className={`retro-badge retro-badge-medium ${className}`.trim()}>
        🔷 Prioridad Media
      </span>
    );
  }
  return (
    <span className={`retro-badge retro-badge-low ${className}`.trim()}>
      🟢 Prioridad Baja
    </span>
  );
};

export interface StatusBadgeProps {
  status: TaskStatus | string;
  className?: string;
}

export const StatusBadge = ({ status, className = "" }: StatusBadgeProps) => {
  switch (status) {
    case "TODO":
      return (
        <span className={`retro-badge retro-badge-todo ${className}`.trim()}>
          Pendiente
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className={`retro-badge retro-badge-progress ${className}`.trim()}>
          En progreso
        </span>
      );
    case "DONE":
      return (
        <span className={`retro-badge retro-badge-done ${className}`.trim()}>
          ✅ Hecha
        </span>
      );
    default:
      return (
        <span className={`retro-badge retro-badge-todo ${className}`.trim()}>
          {status}
        </span>
      );
  }
};

export const getCategoryIcon = (cat?: string): string => {
  switch (cat?.toUpperCase()) {
    case "LIMPIEZA":
      return "🧹";
    case "COMPRA":
      return "🛒";
    case "MANTENIMIENTO":
      return "🔧";
    case "OTRO":
    default:
      return "📁";
  }
};
