/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo } from "react";
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

export interface ToastContextType extends ToastMethods {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
  toast: ToastMethods;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      dismissAll,
      toast: toastMethods,
      ...toastMethods,
    }),
    [toasts, showToast, dismissToast, dismissAll, toastMethods]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
