import { forwardRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Card, type CardVariant } from "../ui/Card";

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

/**
 * RetroWindow: componente de compatibilidad hacia atrás que delega en la primitiva moderna <Card />.
 * Erradica definitivamente los falsos controles de ventana (─ □ ✕) y adopta el sistema de diseño Clean SaaS.
 */
export const RetroWindow = forwardRef<HTMLDivElement, RetroWindowProps>(
  (
    {
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
      ...props
    },
    ref
  ) => {
    const variantClass = getHeaderVariantClass(variant);

    return (
      <Card
        ref={ref}
        title={title}
        icon={icon}
        variant={variant as CardVariant}
        badge={badge}
        headerActions={headerActions}
        className={`retro-window ${className}`.trim()}
        headerClassName={`retro-window-header ${variantClass} ${headerClassName}`.trim()}
        bodyClassName={`retro-window-body ${bodyClassName}`.trim()}
        style={style}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

RetroWindow.displayName = "RetroWindow";

export default RetroWindow;
