import { useEffect, useState } from "react";
import api from "../../api";
import type { AIHealthStatus } from "../../types/task";

export interface AIHealthBadgeProps {
  className?: string;
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
        className={`retro-badge retro-badge-todo ${className}`.trim()}
        title="Verificando telemetría de Inteligencia Artificial..."
      >
        <span>⏳</span> <span>IA: CONECTANDO...</span>
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
        className={`retro-badge retro-badge-low ${className}`.trim()}
        title={`Circuit Breaker: ${health.circuit_state} | Éxitos: ${health.success_count} | Fallos: ${health.failure_count}`}
      >
        <span>🟢</span> <span>IA: ONLINE ({modelLabel})</span>
      </span>
    );
  }

  return (
    <span
      className={`retro-badge retro-badge-high ${className}`.trim()}
      title="El servicio de IA se encuentra degradado o en circuito abierto. Prioritask utiliza clasificación heurística por reglas."
    >
      <span>🟡</span> <span>IA: EN REPOSO / MODO HEURÍSTICO</span>
    </span>
  );
};

export default AIHealthBadge;
