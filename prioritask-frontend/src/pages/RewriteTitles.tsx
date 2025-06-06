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
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const res = await api.post("/tasks/ai/rewrite", {});
        setSuggestions(res.data);
      } catch (err) {
        console.error(err);
        alert("Error al obtener sugerencias");
      } finally {
        setLoading(false);
      }
    };
    fetchSuggestions();
  }, []);

  const acceptSuggestion = async (s: Suggestion) => {
    try {
      await api.patch(`/tasks/${s.id}`, { titulo: s.reformulada });
      setSuggestions((prev) => prev.filter((item) => item.id !== s.id));
    } catch (err) {
      console.error(err);
      alert("Error al actualizar tarea");
    }
  };

  if (loading) return <p>Cargando sugerencias...</p>;

  return (
    <div className="container mt-4">
      <h2>🧠 Mejorar títulos</h2>
      <button className="btn btn-secondary mb-3" onClick={() => navigate("/tasks")}>Volver</button>
      {suggestions.length === 0 ? (
        <p>No hay sugerencias disponibles.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Tarea original</th>
              <th>Título sugerido</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={s.id}>
                <td>{s.original}</td>
                <td>{s.reformulada}</td>
                <td>
                  <button className="btn btn-primary btn-sm" onClick={() => acceptSuggestion(s)}>
                    Aceptar
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
