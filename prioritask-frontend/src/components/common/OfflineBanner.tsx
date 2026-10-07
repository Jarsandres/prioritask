import { useState, useEffect } from "react";
import { LuWifiOff, LuWifi } from "react-icons/lu";
import useNetworkStatus from "../../hooks/useNetworkStatus";

export const OfflineBanner = () => {
  const { isOffline, isOnline, wasOffline } = useNetworkStatus();
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (wasOffline && isOnline) {
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [wasOffline, isOnline]);

  if (!isOffline && !showRestored) {
    return null;
  }

  if (showRestored) {
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
          ¡Conexión restablecida! Sincronizando datos...
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
      aria-label="Aviso de pérdida de conexión a internet"
    >
      <div
        className="rounded-circle d-flex align-items-center justify-content-center p-2 flex-shrink-0"
        style={{
          backgroundColor: "rgba(245, 158, 11, 0.18)",
          color: "#f59e0b",
          border: "1px solid rgba(245, 158, 11, 0.3)",
        }}
      >
        <LuWifiOff size={20} aria-hidden="true" />
      </div>
      <div>
        <div
          className="fw-bold small d-flex align-items-center gap-2"
          style={{ color: "#fef08a", letterSpacing: "0.2px" }}
        >
          <span>Estás navegando en modo sin conexión</span>
          <span
            className="badge rounded-pill bg-warning text-dark px-2 py-0"
            style={{ fontSize: "10px", fontWeight: 700 }}
          >
            OFFLINE
          </span>
        </div>
        <p
          className="mb-0 text-white-50"
          style={{ fontSize: "12px", lineHeight: "1.3" }}
        >
          Las acciones se conservarán localmente hasta que vuelva la conexión.
        </p>
      </div>
    </aside>
  );
};

export default OfflineBanner;
