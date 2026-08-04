import { useState, useCallback, useRef, useEffect } from "react";

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useAsync<T>() {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (asyncFunction: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
      // Abort previous running request if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await asyncFunction(controller.signal);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") {
          return undefined;
        }
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Ocurrió un error inesperado";
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
        return undefined;
      }
    },
    []
  );

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({ data: null, loading: false, error: null });
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData: (data: T | null) => setState((prev) => ({ ...prev, data })),
  };
}
