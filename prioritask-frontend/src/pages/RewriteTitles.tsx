import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import RetroWindow from "../components/common/RetroWindow";
import EmptyState from "../components/common/EmptyState";

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

  useEffect(() => {
    const controller = new AbortController();

    const fetchSuggestions = async () => {
      setError(null);
      try {
        const res = await api.post<Suggestion[]>(
          "/tasks/ai/rewrite",
          {},
          { signal: controller.signal }
        );
        setSuggestions(res.data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") {
          return;
        }
        console.error(err);
        setError("Error al obtener sugerencias para mejorar títulos.");
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();

    return () => {
      controller.abort();
    };
  }, []);

  const acceptSuggestion = async (s: Suggestion) => {
    setAcceptingId(s.id);
    setError(null);
    try {
      await api.patch(`/tasks/${s.id}`, { titulo: s.reformulada });
      setSuggestions((prev) => prev.filter((item) => item.id !== s.id));
    } catch (err: unknown) {
      console.error(err);
      setError(`Error al actualizar la tarea "${s.original}".`);
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="container-fluid py-2">
      {/* Botón Volver y Cabecera */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>🧠</span> OPTIMIZADOR DE TÍTULOS CON IA / TITLE_OPTIMIZER.EXE
          </h2>
          <p className="retro-page-subtitle">
            Reescribe títulos ambiguos para maximizar la claridad operativa
          </p>
        </div>
        <button
          type="button"
          className="btn-retro btn-retro-outline"
          style={{ minHeight: "40px" }}
          onClick={() => navigate("/tasks")}
        >
          <span>⬅</span> <span>Volver a Tareas</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Ventana Retro Principal */}
      <RetroWindow
        title="AI_TITLE_OPTIMIZER.EXE - SUGERENCIAS ACTIVAS"
        icon="🧠"
        variant="magenta"
      >
        {loading ? (
          <EmptyState
            icon="⏳"
            title="Consultando red neuronal..."
            description="Analizando sintaxis y contexto de tus títulos actuales."
          />
        ) : suggestions.length === 0 ? (
          <EmptyState
            icon="✨"
            title="Todos los títulos están optimizados"
            description="No hay recomendaciones pendientes del motor neuronal de Prioritask."
            actionLabel="Volver a la lista de tareas"
            onAction={() => navigate("/tasks")}
          />
        ) : (
          <div className="d-flex flex-column gap-3">
            {suggestions.map((s) => (
              <div key={s.id} className="retro-compare-card p-3">
                <div className="row g-3 align-items-center">
                  <div className="col-12 col-md-5">
                    <div className="retro-compare-box">
                      <span className="retro-compare-label text-muted">
                        📁 TÍTULO ORIGINAL:
                      </span>
                      <div className="retro-compare-text">{s.original}</div>
                    </div>
                  </div>

                  <div className="col-12 col-md-1 text-center d-none d-md-block">
                    <span className="retro-compare-arrow">➔</span>
                  </div>

                  <div className="col-12 col-md-6">
                    <div className="retro-compare-box">
                      <span className="retro-compare-label text-success">
                        ✨ TÍTULO RECOMENDADO POR IA:
                      </span>
                      <div className="retro-compare-text fw-bold text-success">
                        {s.reformulada}
                      </div>
                      {s.motivo && (
                        <div className="retro-compare-reason">
                          <span>💡 Motivo: </span>
                          <span>{s.motivo}</span>
                        </div>
                      )}
                      <div className="mt-3 d-flex justify-content-end">
                        <button
                          type="button"
                          className="btn-retro btn-retro-primary"
                          style={{ minHeight: "44px" }}
                          onClick={() => acceptSuggestion(s)}
                          disabled={acceptingId === s.id}
                        >
                          <span>💾</span>
                          <span>
                            {acceptingId === s.id
                              ? "Aplicando..."
                              : "Aplicar Mejora"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroWindow>
    </div>
  );
};

export default RewriteTitles;
