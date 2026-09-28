import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "ai"
  | "success";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = "",
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`.trim()}
        {...props}
      >
        {isLoading ? (
          <LuLoaderCircle
            className="ui-btn-spinner"
            size={size === "sm" ? 14 : size === "lg" ? 20 : 16}
            aria-hidden="true"
          />
        ) : (
          leftIcon && <span className="ui-btn-icon ui-btn-icon-left">{leftIcon}</span>
        )}
        {children != null && <span className="ui-btn-label">{children}</span>}
        {!isLoading && rightIcon && (
          <span className="ui-btn-icon ui-btn-icon-right">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
