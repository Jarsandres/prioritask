import { useEffect, useState, useContext } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import debounce from "lodash/debounce";
import { TaskUpdateContext } from "../context/TaskUpdateContext";

interface Tarea {
  id: string;
  titulo: string;
  descripcion?: string;
  estado: "TODO" | "IN_PROGRESS" | "DONE";
  categoria: string;
  peso: number;
  due_date?: string;
  tags?: { id: string; nombre: string }[];
}

const TaskList = () => {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const navigate = useNavigate();
  const { notifyUpdate } = useContext(TaskUpdateContext);

  const fetchTareas = async () => {
    try {
      const token = localStorage.getItem("token");
      const params: any = {};

      if (estado) params.estado = estado;
      if (categoria) params.categoria = categoria;
      if (fechaLimite) params.due_date_max = fechaLimite;
      if (busqueda) params.search = busqueda;

      const res = await api.get("/tasks", {
        params,
      });

      setTareas(res.data);
    } catch (error) {
      console.error("Error al cargar tareas:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirm = window.confirm(
      "¿Estás seguro de que deseas eliminar esta tarea?"
    );
    if (!confirm) return;

    try {
      const token = localStorage.getItem("token");
      await api.delete(`/tasks/${id}`);
      setTareas(tareas.filter((t) => t.id !== id));
      notifyUpdate();
    } catch (error) {
      console.error("Error al eliminar tarea:", error);
      alert("Ocurrió un error al eliminar la tarea.");
    }
  };


  const marcarComoCompletada = async (taskId: string) => {
    try {
      const token = localStorage.getItem("token");
      await api.patch(`/tasks/${taskId}/status`, { estado: "DONE" });
      // Recargar tareas
      fetchTareas();
      notifyUpdate();
    } catch (error) {
      console.error("Error al marcar como completada:", error);
    }
  };

  useEffect(() => {
    fetchTareas();
  }, []);

  useEffect(() => {
    const debouncedFetch = debounce(() => {
      fetchTareas();
    }, 500); // Espera 500ms tras dejar de escribir

    if (busqueda) {
      debouncedFetch();
    }

    return () => {
      debouncedFetch.cancel();
    };
  }, [busqueda]);

  if (loading) return <p>Cargando tareas...</p>;

  return (
    <>
      <div className="container mt-4">
        <div className="card p-4 mb-4 shadow-sm">
          <h5 className="mb-3">
            <span role="img" aria-label="Filtro">
              🔎
            </span>{" "}
            Filtrar tareas
          </h5>

          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label htmlFor="estado" className="form-label">
                Estado
              </label>
              <select
                id="estado"
                className="form-select"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="TODO">Pendiente</option>
                <option value="IN_PROGRESS">En progreso</option>
                <option value="DONE">Completada</option>
              </select>
            </div>

            <div className="col-md-3">
              <label htmlFor="categoria" className="form-label">
                Categoría
              </label>
              <select
                id="categoria"
                className="form-select"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="LIMPIEZA">Limpieza</option>
                <option value="COMPRA">Compra</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            <div className="col-md-4">
              <label htmlFor="busqueda" className="form-label">
                Búsqueda por texto
              </label>
              <input
                id="busqueda"
                type="text"
                className="form-control"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por título o descripción"
              />
            </div>

            <div className="col-12 d-flex justify-content-end">
              <button className="btn btn-primary" onClick={fetchTareas}>
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>

        <h2 className="mb-4">
          <span role="img" aria-label="Lista">
            📝
          </span>{" "}
          Tareas pendientes
        </h2>

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
                className={`list-group-item d-flex justify-content-between align-items-center ${
                  tarea.estado === "DONE" ? "bg-light text-muted" : ""
                }`}
              >
                <div>
                  <strong>{tarea.titulo}</strong> <br />
                  <small className="text-muted">
                    {tarea.categoria} · {tarea.estado}
                  </small>
                  <div className="mt-1">
                    {tarea.tags &&
                      tarea.tags.map((tag) => (
                        <span key={tag.id} className="badge text-bg-info tag-badge">
                          #{tag.nombre}
                        </span>
                      ))}
                  </div>
                </div>

                <div>
                  {tarea.estado !== "DONE" && (
                    <button
                      className="btn btn-sm btn-success me-2"
                      onClick={() => marcarComoCompletada(tarea.id)}
                    >
                      ✅ Completar
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={() => navigate(`/tasks/edit/${tarea.id}`)}
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(tarea.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default TaskList;
