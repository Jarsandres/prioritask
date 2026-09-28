import { useEffect, useState } from "react";
import { LuSparkles, LuLoader, LuTriangleAlert } from "react-icons/lu";
import api from "../../api";
import type { AIHealthStatus } from "../../types/task";

export interface AIHealthBadgeProps {
  className?: string;
  showDetails?: boolean;
}

export const AIHealthBadge = ({ className = "" }: AIHealthBadgeProps) => {
  const [health, setHealth] = useState<AIHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const res = await api.get<AIHealthStatus>("/tasks/ai/health", {
          signal: controller.signal,
        });
        if (isMounted) {
          setHealth(res.data);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        if (isMounted) {
          setHealth(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkHealth();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <span
        className={`d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill small fw-medium ${className}`.trim()}
        style={{
          backgroundColor: "var(--bg-subtle, #f1f5f9)",
          color: "var(--text-muted, #64748b)",
          border: "1px solid var(--border-default, #e2e8f0)",
          fontSize: "0.75rem",
        }}
        title="Verificando telemetría de Inteligencia Artificial..."
      >
        <LuLoader className="spin" size={12} />
        <span>IA: Conectando...</span>
      </span>
    );
  }

  const isHealthy =
    health &&
    health.status === "healthy" &&
    health.circuit_state === "CLOSED";

  if (isHealthy) {
    const modelLabel = health.model || "Qwen 2.5";
    return (
      <span
        className={`d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill small fw-medium ${className}`.trim()}
        style={{
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          color: "#059669",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          fontSize: "0.75rem",
        }}
        title={`Circuit Breaker: ${health.circuit_state} | Éxitos: ${health.success_count} | Fallos: ${health.failure_count}`}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#10b981",
            boxShadow: "0 0 0 2px rgba(16, 185, 129, 0.3)",
          }}
        />
        <LuSparkles size={12} />
        <span>IA Online ({modelLabel})</span>
      </span>
    );
  }

  return (
    <span
      className={`d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill small fw-medium ${className}`.trim()}
      style={{
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        color: "#d97706",
        border: "1px solid rgba(245, 158, 11, 0.25)",
        fontSize: "0.75rem",
      }}
      title="El servicio de IA se encuentra degradado o en circuito abierto. Prioritask utiliza clasificación heurística por reglas."
    >
      <LuTriangleAlert size={12} />
      <span>Modo Heurístico</span>
    </span>
  );
};

export default AIHealthBadge;
