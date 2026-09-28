import type { ReactNode } from "react";
import {
  LuCircleCheck,
  LuCircleAlert,
  LuTriangleAlert,
  LuInfo,
  LuX,
} from "react-icons/lu";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  action?: ToastAction;
  duration?: number;
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const getToastIcon = (type: ToastType): ReactNode => {
  switch (type) {
    case "success":
      return <LuCircleCheck size={18} className="text-success" aria-hidden="true" />;
    case "error":
      return <LuCircleAlert size={18} className="text-danger" aria-hidden="true" />;
    case "warning":
      return <LuTriangleAlert size={18} className="text-warning" aria-hidden="true" />;
    case "info":
    default:
      return <LuInfo size={18} className="text-primary" aria-hidden="true" />;
  }
};

export const Toast = ({ toast, onDismiss }: ToastProps) => {
  const isAlert = toast.type === "error";

  return (
    <div
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      className={`ui-toast ui-toast-${toast.type}`}
    >
      <div className="ui-toast-icon">{getToastIcon(toast.type)}</div>
      <div className="ui-toast-content">
        {toast.title && <div className="ui-toast-title">{toast.title}</div>}
        <div className="ui-toast-message">{toast.message}</div>
        {toast.action && (
          <button
            type="button"
            className="ui-toast-action"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="ui-toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
      >
        <LuX size={15} aria-hidden="true" />
      </button>
    </div>
  );
};

export const ToastContainer = ({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) => {
  if (toasts.length === 0) return null;

  return (
    <aside className="ui-toast-container" aria-label="Notificaciones del sistema">
      {toasts.map((item) => (
        <Toast key={item.id} toast={item} onDismiss={onDismiss} />
      ))}
    </aside>
  );
};

export default Toast;
