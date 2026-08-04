import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

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

  if (loading) return <p className="container mt-4">Cargando sugerencias...</p>;

  return (
    <div className="container mt-4">
      <h2>🧠 Mejorar títulos</h2>
      <button className="btn btn-secondary mb-3" onClick={() => navigate("/tasks")}>
        Volver
      </button>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {suggestions.length === 0 ? (
        <p>No hay sugerencias disponibles.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tarea original</th>
              <th>Título sugerido</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={s.id}>
                <td>{s.original}</td>
                <td>{s.reformulada}</td>
                <td>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => acceptSuggestion(s)}
                    disabled={acceptingId === s.id}
                  >
                    {acceptingId === s.id ? "Aceptando..." : "Aceptar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RewriteTitles;
