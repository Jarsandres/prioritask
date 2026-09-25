import type { CSSProperties, ReactNode } from "react";

export type RetroWindowVariant =
  | "primary"
  | "magenta"
  | "green"
  | "amber"
  | "admin";

export interface RetroWindowProps {
  title: ReactNode;
  icon?: ReactNode;
  variant?: RetroWindowVariant;
  badge?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  style?: CSSProperties;
}

const getHeaderVariantClass = (variant?: RetroWindowVariant): string => {
  switch (variant) {
    case "magenta":
      return "retro-window-header-magenta";
    case "green":
      return "retro-window-header-green";
    case "amber":
      return "retro-window-header-amber";
    case "admin":
      return "retro-window-header-admin";
    case "primary":
    default:
      return "";
  }
};

export const RetroWindow = ({
  title,
  icon,
  variant = "primary",
  badge,
  headerActions,
  children,
  className = "",
  headerClassName = "",
  bodyClassName = "",
  style,
}: RetroWindowProps) => {
  const variantClass = getHeaderVariantClass(variant);

  return (
    <div className={`retro-window ${className}`.trim()} style={style}>
      <div className={`retro-window-header ${variantClass} ${headerClassName}`.trim()}>
        <div className="d-flex align-items-center gap-2 text-truncate pe-2">
          {icon && (
            <span role="img" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="text-truncate">{title}</span>
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {badge}
          {headerActions}
          <div className="retro-window-controls ms-1" aria-hidden="true">
            <span className="retro-window-btn">─</span>
            <span className="retro-window-btn">□</span>
            <span className="retro-window-btn">✕</span>
          </div>
        </div>
      </div>
      <div className={`retro-window-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
};

export default RetroWindow;
