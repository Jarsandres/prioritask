import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
  actionVariant?: string;
  className?: string;
}

export const EmptyState = ({
  icon,
  title,
  description,
  badge,
  actionLabel,
  onAction,
  actionTo,
  actionVariant = "btn-retro-primary",
  className = "",
}: EmptyStateProps) => {
  return (
    <div className={`retro-empty-state ${className}`.trim()}>
      {icon && <div className="retro-empty-icon mb-3">{icon}</div>}
      {badge && (
        <div
          className="badge bg-secondary mb-3 px-3 py-2 text-uppercase"
          style={{ letterSpacing: "1px" }}
        >
          {badge}
        </div>
      )}
      <h3 className="fw-bold mb-2">{title}</h3>
      {description && (
        <p className="text-muted mb-4 mx-auto" style={{ maxWidth: "450px" }}>
          {description}
        </p>
      )}
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className={`btn-retro ${actionVariant} px-4 py-2 mt-2`}
          style={{ minHeight: "44px" }}
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionTo && onAction && (
        <button
          type="button"
          className={`btn-retro ${actionVariant} px-4 py-2 mt-2`}
          style={{ minHeight: "44px" }}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
