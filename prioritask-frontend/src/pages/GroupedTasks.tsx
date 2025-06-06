import { useEffect, useState } from "react";
import api from "../api";

interface Group {
  [groupName: string]: { id: string; titulo: string }[];
}

const GroupedTasks = () => {
  const [groups, setGroups] = useState<Group>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await api.post("/tasks/ai/group", {});
        setGroups(res.data.grupos);
      } catch (err) {
        console.error(err);
        alert("Error al agrupar tareas");
      } finally {
        setLoading(false);
      }
    };
    fetchGroups();
  }, []);

  if (loading) return <p>Cargando grupos...</p>;

  return (
    <div className="container mt-4">
      <h2>🧠 Tareas agrupadas</h2>
      {Object.keys(groups).length === 0 ? (
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
