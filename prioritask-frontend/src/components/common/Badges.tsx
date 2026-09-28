/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import {
  LuSparkles,
  LuShoppingCart,
  LuWrench,
  LuFolder,
  LuFlame,
  LuClock,
  LuCircleCheck,
  LuCheck,
  LuRepeat,
} from "react-icons/lu";
import type { TaskStatus } from "../../types/task";

export interface CategoryIconProps {
  category?: string;
  className?: string;
  size?: number;
}

export const CategoryIcon = ({
  category,
  className = "",
  size = 14,
}: CategoryIconProps) => {
  switch (category?.toUpperCase()) {
    case "LIMPIEZA":
      return <LuSparkles className={className} size={size} aria-hidden="true" />;
    case "COMPRA":
      return <LuShoppingCart className={className} size={size} aria-hidden="true" />;
    case "MANTENIMIENTO":
      return <LuWrench className={className} size={size} aria-hidden="true" />;
    case "OTRO":
    default:
      return <LuFolder className={className} size={size} aria-hidden="true" />;
  }
};

export const getCategoryIcon = (cat?: string): ReactNode => {
  return <CategoryIcon category={cat} />;
};

export interface PriorityBadgeProps {
  peso: number;
  className?: string;
}

export const PriorityBadge = ({ peso, className = "" }: PriorityBadgeProps) => {
  if (peso >= 4) {
    return (
      <span className={`retro-badge retro-badge-high ${className}`.trim()}>
        <LuFlame size={13} aria-hidden="true" /> Prioridad Alta
      </span>
    );
  }
  if (peso >= 2) {
    return (
      <span className={`retro-badge retro-badge-medium ${className}`.trim()}>
        <LuClock size={13} aria-hidden="true" /> Prioridad Media
      </span>
    );
  }
  return (
    <span className={`retro-badge retro-badge-low ${className}`.trim()}>
      <LuCircleCheck size={13} aria-hidden="true" /> Prioridad Baja
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
          <LuClock size={12} aria-hidden="true" /> En progreso
        </span>
      );
    case "DONE":
      return (
        <span className={`retro-badge retro-badge-done ${className}`.trim()}>
          <LuCheck size={12} aria-hidden="true" /> Hecha
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

export interface RecurringBadgeProps {
  className?: string;
}

export const RecurringBadge = ({ className = "" }: RecurringBadgeProps) => (
  <span
    className={`retro-badge retro-badge-progress ${className}`.trim()}
    title="Rutina periódica recurrente"
  >
    <LuRepeat size={12} aria-hidden="true" /> <span>Rutina</span>
  </span>
);
