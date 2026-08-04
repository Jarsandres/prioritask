import { useEffect, useState } from "react";
import api from "../api";

interface GroupedTask {
  id: string;
  titulo: string;
}

interface Group {
  [groupName: string]: GroupedTask[];
}

const GroupedTasks = () => {
  const [groups, setGroups] = useState<Group>({});
  const [loading, setLoading] = useState(true);
  // FE-011: Estado de error renderizado en UI en lugar de alert()
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // FE-011: AbortController para cancelar la petición si el componente se desmonta
    const controller = new AbortController();

    const fetchGroups = async () => {
      setError(null);
      try {
        const res = await api.post<{ grupos: Group }>(
          "/tasks/ai/group",
          {},
          { signal: controller.signal }
        );
        setGroups(res.data.grupos);
      } catch (err: unknown) {
        // No mostrar error si fue cancelado por desmontaje
        if (err instanceof Error && err.name === "CanceledError") {
          return;
        }
        console.error(err);
        // FE-011: Error en UI, no alert() bloqueante
        setError("Error al agrupar tareas. Inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();

    // FE-011: Cleanup que cancela la petición al desmontar
    return () => {
      controller.abort();
    };
  }, []);

  if (loading) return <p>Cargando grupos...</p>;

  return (
    <div className="container mt-4">
      <h2>🧠 Tareas agrupadas</h2>

      {/* FE-011: Error renderizado en lugar de alert() */}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {!error && Object.keys(groups).length === 0 ? (
        <p>No se encontraron grupos.</p>
      ) : (
        Object.entries(groups).map(([name, tasks]) => (
          <div className="card mb-3" key={name}>
            <div className="card-header fw-bold">{name}</div>
            <ul className="list-group list-group-flush">
              {tasks.map((t) => (
                <li key={t.id} className="list-group-item">
                  {t.titulo}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
};

export default GroupedTasks;
