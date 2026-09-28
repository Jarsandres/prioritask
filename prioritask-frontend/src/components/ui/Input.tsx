import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      containerClassName = "",
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const describedBy = [
      props["aria-describedby"],
      error ? errorId : undefined,
      !error && hint ? hintId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

    return (
      <div
        className={`ui-input-group ${props.disabled ? "is-disabled" : ""} ${containerClassName}`.trim()}
      >
        {label && (
          <label htmlFor={inputId} className="ui-input-label">
            {label}
          </label>
        )}
        <div
          className={`ui-input-wrapper ${leftIcon ? "has-left-icon" : ""} ${
            rightIcon ? "has-right-icon" : ""
          } ${props.disabled ? "is-disabled" : ""}`}
        >
          {leftIcon && <span className="ui-input-icon ui-input-left-icon">{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            type="text"
            {...props}
            aria-invalid={props["aria-invalid"] ?? Boolean(error)}
            aria-describedby={describedBy}
            className={`ui-input ${error ? "ui-input-error" : ""} ${className}`.trim()}
          />
          {rightIcon && <span className="ui-input-icon ui-input-right-icon">{rightIcon}</span>}
        </div>
        {error && (
          <p id={errorId} className="ui-input-error-msg" role="alert">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={hintId} className="ui-input-hint">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
