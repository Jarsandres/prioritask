import { useEffect, useState, useContext, useCallback, useRef } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { TaskUpdateContext } from "../context/TaskUpdateContext";
import { getCurrentRoomId } from "../utils/room";
import ConfirmModal from "./ConfirmModal";
import type { Task } from "../types/task";

// FE-010: Reutilizamos la interfaz Task del módulo de tipos compartidos

const TaskList = () => {
  const [tareas, setTareas] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // FE-002: Estado para deshabilitar el botón "Eliminar" de la fila en proceso
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Estado para deshabilitar "Completar" mientras se procesa
  const [completingId, setCompletingId] = useState<string | null>(null);
  // FE-014: Estado de error para acciones inline
  const [actionError, setActionError] = useState<string | null>(null);
  // FE-017: Estado para modal de confirmación
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const navigate = useNavigate();
  const { notifyUpdate } = useContext(TaskUpdateContext);

  // FE-001: fetchTareas en useCallback con sus dependencias de filtro
  // FE-009: Eliminadas las variables `token` que no se usaban (el interceptor las gestiona)
  const fetchTareas = useCallback(async () => {
    setLoading(true);
    try {
      // FE-010: params tipado en lugar de `any`
      const params: Record<string, string> = {};

      if (estado) params.estado = estado;
      if (categoria) params.categoria = categoria;
      if (fechaLimite) params.due_date_max = fechaLimite;
      if (busqueda) params.search = busqueda;
      const roomId = getCurrentRoomId();
      if (roomId) params.room_id = roomId;

      const res = await api.get<Task[]>("/tasks", { params });
      setTareas(res.data);
    } catch (error) {
      console.error("Error al cargar tareas:", error);
    } finally {
      setLoading(false);
    }
  }, [estado, categoria, fechaLimite, busqueda]);

  // FE-001: Carga inicial y reacción al estado global de actualizaciones
  const { version } = useContext(TaskUpdateContext);
  useEffect(() => {
    fetchTareas();
  }, [fetchTareas, version]);

  // FE-001: useEffect separado para filtros discretos (sin debounce)
  // Nota: fetchTareas ya incluye estado/categoria/fechaLimite en sus deps,
  // por lo que el useEffect de arriba se disparará automáticamente cuando cambian.
  // Añadimos un efecto explícito para claridad y para manejar el reset de busqueda.

  // FE-001: debounce para búsqueda de texto con useRef para estabilidad del timer
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // FE-001: Se elimina la condición `if (busqueda)` para que también
    // dispare cuando busqueda queda vacío (limpieza del filtro)
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchTareas();
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nota: fetchTareas no se incluye aquí porque el debounce de texto ya lo maneja arriba.
  // El useEffect de [fetchTareas, version] cubre los cambios de estado/categoria/fechaLimite.

  // FE-017: Apertura de modal de confirmación
  const promptDelete = (tarea: Task) => {
    setActionError(null);
    setTaskToDelete(tarea);
  };

  // FE-002 + FE-014 + FE-017: Confirmar eliminación vía modal sin alert()
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete.id;
    setDeletingId(id);
    setActionError(null);
    try {
      await api.delete(`/tasks/${id}`);
      setTareas((prev) => prev.filter((t) => t.id !== id));
      notifyUpdate();
      setTaskToDelete(null);
    } catch (error) {
      console.error("Error al eliminar tarea:", error);
      setActionError("Ocurrió un error al eliminar la tarea.");
    } finally {
      setDeletingId(null);
    }
  };

  // FE-002 + FE-014: "Completar" sin alert()
  const marcarComoCompletada = async (taskId: string) => {
    setCompletingId(taskId);
    setActionError(null);
    try {
      await api.patch(`/tasks/${taskId}/status`, { estado: "DONE" });
      setTareas((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, estado: "DONE" } : t))
      );
      notifyUpdate();
    } catch (error) {
      console.error("Error al marcar como completada:", error);
      setActionError("Error al actualizar el estado de la tarea.");
    } finally {
      setCompletingId(null);
    }
  };

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

            <div className="col-md-2">
              <label htmlFor="fechaLimite" className="form-label">
                Fecha límite
              </label>
              <input
                id="fechaLimite"
                type="date"
                className="form-control"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
              />
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
              <button
                className="btn btn-primary"
                onClick={fetchTareas}
                disabled={loading}
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
        <div className="d-flex justify-content-end mt-3 gap-2">
          <button
            className="btn btn-outline-secondary"
            onClick={() => navigate("/tasks/rewrite")}
          >
            🧠 Mejorar títulos
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/tasks/create")}
          >
            Crear nueva tarea
          </button>
        </div>

        {/* FE-014: Banner de error inline para acciones destructivas/mutaciones */}
        {actionError && (
          <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert">
            {actionError}
            <button
              type="button"
              className="btn-close"
              onClick={() => setActionError(null)}
            ></button>
          </div>
        )}

        <h2 className="mb-4 mt-4">
          <span role="img" aria-label="Lista">
            📝
          </span>{" "}
          Tareas pendientes
        </h2>

        {tareas.length === 0 ? (
          <p>No tienes tareas aún.</p>
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
                      disabled={completingId === tarea.id || deletingId === tarea.id}
                    >
                      {completingId === tarea.id ? "..." : "✅ Completar"}
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={() => navigate(`/tasks/edit/${tarea.id}`)}
                    disabled={deletingId === tarea.id || completingId === tarea.id}
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => promptDelete(tarea)}
                    disabled={deletingId === tarea.id || completingId === tarea.id}
                  >
                    {deletingId === tarea.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FE-017: Modal de confirmación reactivo */}
      <ConfirmModal
        isOpen={!!taskToDelete}
        title="Eliminar tarea"
        message={`¿Estás seguro de que deseas eliminar la tarea "${taskToDelete?.titulo}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        variant="danger"
        isLoading={!!deletingId}
        onConfirm={handleConfirmDelete}
        onCancel={() => setTaskToDelete(null)}
      />
    </>
  );
};

export default TaskList;
