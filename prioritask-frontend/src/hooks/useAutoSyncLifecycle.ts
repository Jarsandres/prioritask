import { useEffect, useRef, useCallback } from "react";

export interface UseAutoSyncLifecycleOptions {
  onSync: () => Promise<void> | void;
  debounceMs?: number; // default: 500
  watchdogIntervalMs?: number; // default: 5000
  sleepThresholdMs?: number; // default: 15000
  enabled?: boolean; // default: true
}

export interface UseAutoSyncLifecycleResult {
  triggerSync: () => void;
  cancelSync: () => void;
}

/**
 * Hook de ciclo de vida para sincronización automática resiliente.
 * Inspirado en Todoist v9.31.0: debounce de 500ms tras eventos de red y reanudación
 * de suspensión/sleep para evitar 'network flaps' y colisiones de estado.
 */
export const useAutoSyncLifecycle = ({
  onSync,
  debounceMs = 500,
  watchdogIntervalMs = 5000,
  sleepThresholdMs = 15000,
  enabled = true,
}: UseAutoSyncLifecycleOptions): UseAutoSyncLifecycleResult => {
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelSync = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const triggerDebouncedSync = useCallback(() => {
    if (!enabled) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      try {
        await onSyncRef.current();
      } catch (err: unknown) {
        console.error("Error al ejecutar auto-sync lifecycle callback:", err);
      }
    }, debounceMs);
  }, [enabled, debounceMs]);

  useEffect(() => {
    if (!enabled) {
      cancelSync();
      return;
    }

    const handleOnline = () => {
      triggerDebouncedSync();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        triggerDebouncedSync();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    let lastTick = Date.now();
    const watchdogTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTick;
      lastTick = now;

      if (elapsed > watchdogIntervalMs + sleepThresholdMs) {
        triggerDebouncedSync();
      }
    }, watchdogIntervalMs);

    return () => {
      cancelSync();
      clearInterval(watchdogTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [enabled, triggerDebouncedSync, cancelSync, watchdogIntervalMs, sleepThresholdMs]);

  return {
    triggerSync: triggerDebouncedSync,
    cancelSync,
  };
};

export default useAutoSyncLifecycle;
