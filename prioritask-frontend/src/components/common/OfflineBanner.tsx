import { useState, useEffect, useCallback, useRef } from "react";
import { LuWifiOff, LuWifi, LuRefreshCw } from "react-icons/lu";
import useNetworkStatus from "../../hooks/useNetworkStatus";
import {
  getPendingMutations,
  removeMutation,
  type OfflineMutation,
} from "../../services/offlineQueue";
import api from "../../api";
import { useToast } from "../../context/ToastContext";
import { useTaskUpdate } from "../../context/TaskUpdateContext";

export const OfflineBanner = () => {
  const { isOffline, isOnline, wasOffline } = useNetworkStatus();
  const [showRestored, setShowRestored] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const { toast } = useToast();
  const { notifyUpdate } = useTaskUpdate();
  const isSyncingRef = useRef(false);

  // Consultar periódicamente o ante cambios de red el conteo de mutaciones encoladas
  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingMutations();
      setPendingCount(pending.length);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 4000);
    return () => clearInterval(interval);
  }, [refreshPendingCount, isOffline]);

  // Función de sincronización FIFO de mutaciones offline
  const syncOfflineQueue = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const mutations: OfflineMutation[] = await getPendingMutations();
      if (mutations.length === 0) {
        setIsSyncing(false);
        isSyncingRef.current = false;
        return;
      }

      for (const mutation of mutations) {
        try {
          await api.request({
            url: mutation.url,
            method: mutation.method,
            data: mutation.data,
            params: mutation.params,
            headers: mutation.headers,
            // Bandera para evitar re-encolado recursivo
            ...({ _isOfflineSync: true } as object),
          });
          await removeMutation(mutation.id);
        } catch (err) {
          console.error("Error sincronizando mutación offline:", mutation, err);
          // Si es un error del cliente 4xx (excepto 408/429), descartar para no bloquear la cola
          const statusCode = (err as { response?: { status?: number } })?.response?.status;
          if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
            await removeMutation(mutation.id);
          }
        }
      }

      const remaining = await getPendingMutations();
      setPendingCount(remaining.length);

      if (remaining.length === 0) {
        toast.success("¡Todas las tareas sincronizadas con éxito! ✅");
        notifyUpdate();
      }
    } catch (err) {
      console.error("Fallo general durante la sincronización offline:", err);
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [toast, notifyUpdate]);

  // Escuchar cuando el navegador vuelve a estar online
  useEffect(() => {
    const handleWindowOnline = () => {
      syncOfflineQueue();
    };

    window.addEventListener("online", handleWindowOnline);

    if (wasOffline && isOnline) {
      setShowRestored(true);
      syncOfflineQueue();
      const timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("online", handleWindowOnline);
      };
    }

    return () => {
      window.removeEventListener("online", handleWindowOnline);
    };
  }, [wasOffline, isOnline, syncOfflineQueue]);

  if (!isOffline && !showRestored && pendingCount === 0) {
    return null;
  }

  if (showRestored && !isOffline) {
    return (
      <aside
        className="offline-banner position-fixed shadow-lg rounded-pill px-4 py-2 d-flex align-items-center gap-2 border animate-fade-in"
        style={{
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          color: "#34d399",
          borderColor: "rgba(52, 211, 153, 0.4)",
          maxWidth: "92vw",
        }}
        role="status"
        aria-live="polite"
        aria-label="Conexión a internet restablecida"
      >
        <LuWifi size={18} className="text-success" aria-hidden="true" />
        <span className="fw-semibold small text-white">
          {isSyncing
            ? "¡Conexión restablecida! Sincronizando datos..."
            : "¡Conexión a internet restablecida!"}
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="offline-banner position-fixed shadow-lg rounded-4 px-3 py-2 px-md-4 py-md-3 d-flex align-items-center gap-3 border animate-bounce-subtle"
      style={{
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        color: "#ffffff",
        borderColor: "rgba(245, 158, 11, 0.45)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(245, 158, 11, 0.15)",
        maxWidth: "92vw",
        width: "max-content",
      }}
      role="alert"
      aria-live="assertive"
      aria-label="Aviso de modo sin conexión y cola de cambios offline"
    >
      <div
        className="rounded-circle d-flex align-items-center justify-content-center p-2 flex-shrink-0"
        style={{
          backgroundColor: "rgba(245, 158, 11, 0.18)",
          color: "#f59e0b",
          border: "1px solid rgba(245, 158, 11, 0.3)",
        }}
      >
        {isSyncing ? (
          <LuRefreshCw size={20} className="ui-btn-spinner" aria-hidden="true" />
        ) : (
          <LuWifiOff size={20} aria-hidden="true" />
        )}
      </div>
      <div>
        <div
          className="fw-bold small d-flex align-items-center gap-2"
          style={{ color: "#fef08a", letterSpacing: "0.2px" }}
        >
          <span>
            {isOffline ? "Estás navegando en modo sin conexión" : "Sincronizando tareas"}
          </span>
          <span
            className="badge rounded-pill bg-warning text-dark px-2 py-0"
            style={{ fontSize: "10px", fontWeight: 700 }}
          >
            {isOffline ? "OFFLINE" : "SYNC"}
          </span>
        </div>
        <p
          className="mb-0 text-white-50"
          style={{ fontSize: "12px", lineHeight: "1.3" }}
        >
          {pendingCount > 0
            ? `${pendingCount} ${
                pendingCount === 1 ? "cambio guardado" : "cambios guardados"
              } offline esperando conexión ⏳`
            : "Las acciones se conservarán localmente hasta que vuelva la conexión."}
        </p>
      </div>
    </aside>
  );
};

export default OfflineBanner;
