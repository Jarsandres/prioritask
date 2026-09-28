import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Button from "../ui/Button";

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
  actionVariant = "primary",
  className = "",
}: EmptyStateProps) => {
  // Mapear variantes retro a variantes de Button si es necesario
  const mappedVariant = actionVariant.includes("danger")
    ? "danger"
    : actionVariant.includes("outline")
    ? "outline"
    : actionVariant.includes("secondary")
    ? "secondary"
    : "primary";

  return (
    <div
      className={`d-flex flex-column align-items-center justify-content-center text-center py-5 px-3 ${className}`.trim()}
      style={{ minHeight: "220px" }}
    >
      {icon && (
        <div
          className="d-flex align-items-center justify-content-center rounded-circle mb-3 shadow-xs"
          style={{
            width: "56px",
            height: "56px",
            backgroundColor: "var(--bg-subtle, #f1f5f9)",
            border: "1px solid var(--border-default, #e2e8f0)",
            color: "var(--text-muted, #64748b)",
            fontSize: "1.75rem",
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      {badge && (
        <div className="mb-2">
          <span
            className="badge rounded-pill px-3 py-1.5 fw-medium"
            style={{
              backgroundColor: "var(--bg-subtle, #f1f5f9)",
              color: "var(--text-muted, #64748b)",
              border: "1px solid var(--border-default, #e2e8f0)",
              fontSize: "0.75rem",
              letterSpacing: "0.03em",
            }}
          >
            {badge}
          </span>
        </div>
      )}
      <h3
        className="fw-bold mb-1"
        style={{
          color: "var(--text-heading, #0f172a)",
          fontSize: "1.2rem",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="mb-4 mx-auto"
          style={{
            maxWidth: "460px",
            color: "var(--text-muted, #64748b)",
            fontSize: "0.92rem",
            lineHeight: "1.5",
          }}
        >
          {description}
        </p>
      )}
      {actionLabel && actionTo && (
        <Link to={actionTo} style={{ textDecoration: "none" }}>
          <Button variant={mappedVariant} size="md">
            {actionLabel}
          </Button>
        </Link>
      )}
      {actionLabel && !actionTo && onAction && (
        <Button variant={mappedVariant} size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
