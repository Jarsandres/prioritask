/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  ToastContainer,
  type ToastItem,
  type ToastType,
  type ToastAction,
} from "../components/ui/Toast";

export interface ToastOptions {
  title?: string;
  duration?: number;
  action?: ToastAction;
}

export interface ToastMethods {
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
}

export interface ToastActionsContextType extends ToastMethods {
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
  toast: ToastMethods;
}

export type ToastStateContextType = ToastItem[];

// Desacoplamiento de contextos para evitar re-renderizados globales al emitir notificaciones
export const ToastStateContext = createContext<ToastStateContextType>([]);
export const ToastActionsContext = createContext<ToastActionsContextType | undefined>(undefined);

// Backwards compatibility alias
export const ToastContext = ToastActionsContext;

// Componente interno para aislar la suscripción al estado de toasts únicamente al ToastContainer
const ToastContainerWrapper = ({
  onDismiss,
}: {
  onDismiss: (id: string) => void;
}) => {
  const toasts = useContext(ToastStateContext);
  return <ToastContainer toasts={toasts} onDismiss={onDismiss} />;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = options?.duration ?? 4000;

      const newToast: ToastItem = {
        id,
        type,
        message,
        title: options?.title,
        action: options?.action,
        duration,
      };

      // Limitar a máximo 5 toasts visibles para evitar saturar la interfaz
      setToasts((prev) => [...prev.slice(-4), newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const toastMethods: ToastMethods = useMemo(
    () => ({
      success: (msg: string, opt?: ToastOptions) => showToast("success", msg, opt),
      error: (msg: string, opt?: ToastOptions) => showToast("error", msg, opt),
      info: (msg: string, opt?: ToastOptions) => showToast("info", msg, opt),
      warning: (msg: string, opt?: ToastOptions) => showToast("warning", msg, opt),
    }),
    [showToast]
  );

  const actionsValue: ToastActionsContextType = useMemo(
    () => ({
      showToast,
      dismissToast,
      dismissAll,
      toast: toastMethods,
      ...toastMethods,
    }),
    [showToast, dismissToast, dismissAll, toastMethods]
  );

  return (
    <ToastStateContext.Provider value={toasts}>
      <ToastActionsContext.Provider value={actionsValue}>
        {children}
        <ToastContainerWrapper onDismiss={dismissToast} />
      </ToastActionsContext.Provider>
    </ToastStateContext.Provider>
  );
};

export const useToast = (): ToastActionsContextType => {
  const context = useContext(ToastActionsContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const useToastState = (): ToastStateContextType => {
  return useContext(ToastStateContext);
};
