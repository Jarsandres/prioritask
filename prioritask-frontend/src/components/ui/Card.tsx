import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

export type CardVariant =
  | "default"
  | "primary"
  | "magenta"
  | "green"
  | "amber"
  | "admin";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  headerActions?: ReactNode;
  variant?: CardVariant;
  footer?: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  noBodyWrap?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      title,
      subtitle,
      icon,
      badge,
      headerActions,
      variant = "default",
      footer,
      headerClassName = "",
      bodyClassName = "",
      noBodyWrap = false,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const hasHeader =
      title != null ||
      subtitle != null ||
      icon != null ||
      badge != null ||
      headerActions != null;

    return (
      <div
        ref={ref}
        className={`ui-card ui-card-${variant} ${className}`.trim()}
        {...props}
      >
        {hasHeader && (
          <div className={`ui-card-header ${headerClassName}`.trim()}>
            <div className="ui-card-header-main">
              {icon && <span className="ui-card-icon">{icon}</span>}
              <div>
                {title != null && <h3 className="ui-card-title">{title}</h3>}
                {subtitle != null && <p className="ui-card-subtitle">{subtitle}</p>}
              </div>
            </div>
            {(badge || headerActions) && (
              <div className="ui-card-header-actions">
                {badge}
                {headerActions}
              </div>
            )}
          </div>
        )}
        {noBodyWrap ? (
          children
        ) : (
          <div className={`ui-card-body ${bodyClassName}`.trim()}>{children}</div>
        )}
        {footer && <div className="ui-card-footer">{footer}</div>}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardHeader = ({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`ui-card-header ${className}`.trim()} {...props}>
    {children}
  </div>
);

export const CardTitle = ({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`ui-card-title ${className}`.trim()} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`ui-card-subtitle ${className}`.trim()} {...props}>
    {children}
  </p>
);

export const CardBody = ({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`ui-card-body ${className}`.trim()} {...props}>
    {children}
  </div>
);

export const CardFooter = ({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`ui-card-footer ${className}`.trim()} {...props}>
    {children}
  </div>
);

export default Card;
