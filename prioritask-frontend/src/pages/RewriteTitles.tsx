import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuSparkles,
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuLightbulb,
  LuFileText,
  LuRotateCw,
} from "react-icons/lu";
import api from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/common/EmptyState";
import { useToast } from "../context/ToastContext";

interface Suggestion {
  id: string;
  original: string;
  reformulada: string;
  motivo: string;
}

const RewriteTitles = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const fetchSuggestions = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<Suggestion[]>(
        "/tasks/ai/rewrite",
        {},
        { signal }
      );
      setSuggestions(res.data || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "CanceledError") {
        return;
      }
      console.error(err);
      setError("Error al obtener sugerencias para optimizar títulos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSuggestions(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchSuggestions]);

  const acceptSuggestion = async (s: Suggestion) => {
    setAcceptingId(s.id);
    try {
      await api.patch(`/tasks/${s.id}`, { titulo: s.reformulada });
      setSuggestions((prev) => prev.filter((item) => item.id !== s.id));
      toast.success(`Título optimizado: "${s.reformulada}"`);
    } catch (err: unknown) {
      console.error(err);
      toast.error(`Error al actualizar la tarea "${s.original}".`);
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="container-fluid py-3 px-2 px-md-4">
      {/* Cabecera Moderna */}
      <div className="d-flex justify-content-between align-items-start align-items-md-center mb-4 flex-column flex-md-row gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="d-flex align-items-center justify-content-center rounded-3 p-2"
              style={{
                backgroundColor: "rgba(139, 92, 246, 0.12)",
                color: "#8b5cf6",
              }}
            >
              <LuSparkles size={22} />
            </div>
            <h1 className="h3 mb-0 fw-bold" style={{ letterSpacing: "-0.02em" }}>
              Optimizador de Títulos con IA
            </h1>
          </div>
          <p className="text-muted mb-0 small">
            Reescribe títulos ambiguos para maximizar la claridad operativa y alineación del equipo
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LuRotateCw className={loading ? "spin" : ""} size={15} />}
            onClick={() => fetchSuggestions()}
            disabled={loading}
          >
            Volver a Analizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LuArrowLeft size={15} />}
            onClick={() => navigate("/tasks")}
          >
            Volver a Tareas
          </Button>
        </div>
      </div>

      {/* Banner de error */}
      {error && (
        <div
          className="alert alert-danger d-flex align-items-center justify-content-between mb-4 rounded-3 border-0 shadow-xs"
          role="alert"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => fetchSuggestions()}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Contenido Principal */}
      {loading ? (
        <div className="d-flex flex-column gap-3">
          {[1, 2, 3].map((idx) => (
            <Card key={idx} className="p-3">
              <div className="row g-3 align-items-center">
                <div className="col-12 col-md-5">
                  <Skeleton variant="rounded" width="100%" height={56} />
                </div>
                <div className="col-12 col-md-1 text-center d-none d-md-block">
                  <Skeleton variant="circular" width={24} height={24} className="mx-auto" />
                </div>
                <div className="col-12 col-md-6">
                  <Skeleton variant="rounded" width="100%" height={72} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <Card className="p-4">
          <EmptyState
            icon={<LuSparkles size={28} style={{ color: "#10b981" }} />}
            title="Todos los títulos están optimizados"
            description="No hay recomendaciones pendientes del motor de IA para las tareas de este hogar."
            actionLabel="Volver a la lista de tareas"
            onAction={() => navigate("/tasks")}
          />
        </Card>
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="text-muted small">
            {suggestions.length} sugerencia{suggestions.length !== 1 ? "s" : ""} disponible
            {suggestions.length !== 1 ? "s" : ""} para mejorar la claridad de tus tareas:
          </div>

          {suggestions.map((s) => (
            <Card key={s.id} className="p-3 shadow-xs">
              <div className="row g-3 align-items-center">
                {/* Título Original */}
                <div className="col-12 col-md-5">
                  <div
                    className="p-3 rounded-3 h-100"
                    style={{
                      backgroundColor: "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border-default, #e2e8f0)",
                    }}
                  >
                    <div className="d-flex align-items-center gap-1.5 text-muted small mb-1 fw-semibold">
                      <LuFileText size={14} />
                      <span>TÍTULO ORIGINAL</span>
                    </div>
                    <div
                      className="text-muted text-decoration-line-through fw-medium"
                      style={{ fontSize: "0.95rem" }}
                    >
                      {s.original}
                    </div>
                  </div>
                </div>

                {/* Flecha indicadora central en desktop */}
                <div className="col-12 col-md-1 text-center d-none d-md-flex justify-content-center">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle"
                    style={{
                      width: "32px",
                      height: "32px",
                      backgroundColor: "var(--bg-subtle, #f1f5f9)",
                      color: "var(--text-muted, #64748b)",
                    }}
                  >
                    <LuArrowRight size={16} />
                  </div>
                </div>

                {/* Propuesta IA */}
                <div className="col-12 col-md-6">
                  <div
                    className="p-3 rounded-3"
                    style={{
                      backgroundColor: "rgba(16, 185, 129, 0.04)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                    }}
                  >
                    <div className="d-flex align-items-center gap-1.5 small mb-1 fw-semibold text-success">
                      <LuSparkles size={14} />
                      <span>PROPUESTA IA</span>
                    </div>
                    <div
                      className="fw-bold mb-2"
                      style={{
                        color: "var(--text-heading, #0f172a)",
                        fontSize: "1rem",
                      }}
                    >
                      {s.reformulada}
                    </div>

                    {s.motivo && (
                      <div
                        className="d-flex align-items-start gap-1.5 p-2 rounded-2 mb-3 small"
                        style={{
                          backgroundColor: "rgba(245, 158, 11, 0.08)",
                          color: "#b45309",
                          fontSize: "0.82rem",
                        }}
                      >
                        <LuLightbulb size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
                        <span>{s.motivo}</span>
                      </div>
                    )}

                    <div className="d-flex justify-content-end">
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<LuCheck size={15} />}
                        onClick={() => acceptSuggestion(s)}
                        isLoading={acceptingId === s.id}
                      >
                        Aplicar Mejora
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default RewriteTitles;
