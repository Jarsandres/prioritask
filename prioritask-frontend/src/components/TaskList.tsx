import { useEffect, useState, useCallback, useRef } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { getCurrentRoomId } from "../utils/room";
import ConfirmModal from "./ConfirmModal";
import type { Task } from "../types/task";
import RetroWindow from "./common/RetroWindow";
import TaskCard from "./common/TaskCard";
import EmptyState from "./common/EmptyState";

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
  const { version, notifyUpdate } = useTaskUpdate();

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
  useEffect(() => {
    fetchTareas();
  }, [fetchTareas, version]);

  // FE-001: debounce para búsqueda de texto con useRef para estabilidad del timer
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchTareas();
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleClearFilters = () => {
    setEstado("");
    setCategoria("");
    setFechaLimite("");
    setBusqueda("");
  };

  if (loading) {
    return (
      <div className="container mt-4 d-flex justify-content-center">
        <RetroWindow
          title="SISTEMA PRIORITASK"
          className="p-4 text-center my-5"
          style={{ maxWidth: "420px", width: "100%" }}
        >
          <div className="py-4">
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Cargando...</span>
            </div>
            <p className="fw-bold mb-1">Cargando tareas...</p>
            <small className="text-muted">Leyendo registros del sistema...</small>
          </div>
        </RetroWindow>
      </div>
    );
  }

  return (
    <>
      <div className="container mt-4">
        {/* Panel de Filtros Retro Window */}
        <RetroWindow
          title="FILTRAR TAREAS"
          icon="🔎"
          className="mb-4"
        >
          <div className="row g-3 align-items-end">
            <div className="col-12 col-sm-6 col-md-3">
              <label htmlFor="estado" className="form-label fw-bold small">
                Estado
              </label>
              <select
                id="estado"
                className="form-select retro-select"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="TODO">Pendiente</option>
                <option value="IN_PROGRESS">En progreso</option>
                <option value="DONE">Completada</option>
              </select>
            </div>

            <div className="col-12 col-sm-6 col-md-3">
              <label htmlFor="categoria" className="form-label fw-bold small">
                Categoría
              </label>
              <select
                id="categoria"
                className="form-select retro-select"
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

            <div className="col-12 col-sm-6 col-md-2">
              <label htmlFor="fechaLimite" className="form-label fw-bold small">
                Fecha límite
              </label>
              <input
                id="fechaLimite"
                type="date"
                className="form-control retro-input"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
              />
            </div>

            <div className="col-12 col-sm-6 col-md-4">
              <label htmlFor="busqueda" className="form-label fw-bold small">
                Búsqueda por texto
              </label>
              <input
                id="busqueda"
                type="text"
                className="form-control retro-input"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por título o descripción"
              />
            </div>

            <div className="col-12 d-flex justify-content-end gap-2 flex-wrap">
              <button
                type="button"
                className="btn-retro btn-retro-outline"
                style={{ minHeight: "44px" }}
                onClick={handleClearFilters}
              >
                <span>🔄</span> Limpiar filtros
              </button>
              <button
                type="button"
                className="btn-retro btn-retro-primary"
                style={{ minHeight: "44px" }}
                onClick={fetchTareas}
                disabled={loading}
              >
                <span>🔎</span> Aplicar filtros
              </button>
            </div>
          </div>
        </RetroWindow>

        {/* Acciones de la vista */}
        <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
          <h2 className="mb-0 fw-bold d-flex align-items-center gap-2">
            <span role="img" aria-label="Lista">📝</span>
            <span>Tareas pendientes</span>
          </h2>
          <div className="d-flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn-retro btn-retro-magenta"
              style={{ minHeight: "44px" }}
              onClick={() => navigate("/tasks/rewrite")}
            >
              🧠 Mejorar títulos
            </button>
            <button
              type="button"
              className="btn-retro btn-retro-primary"
              style={{ minHeight: "44px" }}
              onClick={() => navigate("/tasks/create")}
            >
              ➕ Crear nueva tarea
            </button>
          </div>
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

        {/* Lista en cuadrícula de tarjetas Retro Window o Empty State */}
        {tareas.length === 0 ? (
          <div className="retro-window p-4 text-center my-4">
            <EmptyState
              icon="🖥️"
              badge="[ OK · SISTEMA DESPEJADO ]"
              title="¡Escritorio despejado!"
              description="No hay tareas pendientes para los filtros seleccionados. Disfruta tu momento o crea una nueva tarea."
              actionLabel="➕ Crear nueva tarea"
              onAction={() => navigate("/tasks/create")}
            />
          </div>
        ) : (
          <div className="row g-3">
            {tareas.map((tarea) => (
              <div key={tarea.id} className="col-12 col-md-6 col-lg-4">
                <TaskCard
                  task={tarea}
                  onComplete={marcarComoCompletada}
                  onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
                  onDelete={promptDelete}
                  isCompleting={completingId === tarea.id}
                  isDeleting={deletingId === tarea.id}
                />
              </div>
            ))}
          </div>
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
