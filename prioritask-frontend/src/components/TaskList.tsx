import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

interface Tarea {
  id: string;
  titulo: string;
  descripcion?: string;
  estado: "TODO" | "IN_PROGRESS" | "DONE";
  categoria: string;
  peso: number;
  due_date?: string;
}

const TaskList = () => {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchTareas = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:8000/api/v1/tasks", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setTareas(res.data);
    } catch (error) {
      console.error("Error al cargar tareas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTareas();
  }, []);

  if (loading) return <p>Cargando tareas...</p>;

  return (
    <div className="container mt-4">
      <h2 className="mb-3">📝 Tareas pendientes</h2>
      {tareas.length === 0 ? (
        <>
          <p>No tienes tareas aún.</p>
          <button
            className="btn btn-primary mt-3"
            onClick={() => navigate("/tasks/create")}
          >
            Crear nueva tarea
          </button>
        </>
      ) : (
        <ul className="list-group">
          {tareas.map((tarea) => (
            <li
              key={tarea.id}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <div>
                <strong>{tarea.titulo}</strong> <br />
                <small className="text-muted">
                  {tarea.categoria} · {tarea.estado}
                </small>
              </div>
              {/* Aquí irán botones de Editar / Eliminar más adelante */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TaskList;

