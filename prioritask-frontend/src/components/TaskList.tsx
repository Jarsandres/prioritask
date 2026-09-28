import { useEffect, useState, useCallback, useRef } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useRoom } from "../context/RoomContext";
import ConfirmModal from "./ConfirmModal";
import type { Task, TaskStatus } from "../types/task";
import TaskCard from "./common/TaskCard";
import EmptyState from "./common/EmptyState";
import { Skeleton } from "./ui/Skeleton";
import { Button } from "./ui/Button";
import TaskViewSwitcher, { type TaskViewMode } from "./tasks/TaskViewSwitcher";
import TaskListView from "./tasks/TaskListView";
import TaskKanbanBoard from "./tasks/TaskKanbanBoard";
import FilterBar from "./tasks/FilterBar";
import {
  LuPlus,
  LuSparkles,
  LuListTodo,
  LuCircleCheck,
} from "react-icons/lu";
import "./tasks/tasks.css";

const TaskList = () => {
  const [tareas, setTareas] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("tasks_view_mode") as TaskViewMode) || "grid";
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const navigate = useNavigate();
  const { version, notifyUpdate } = useTaskUpdate();
  const { roomId } = useRoom();

  const handleChangeViewMode = (mode: TaskViewMode) => {
    setViewMode(mode);
    localStorage.setItem("tasks_view_mode", mode);
  };

  const fetchTareas = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (estado) params.estado = estado;
      if (categoria) params.categoria = categoria;
      if (fechaLimite) params.due_date_max = fechaLimite;
      if (busqueda) params.search = busqueda;
      if (roomId) params.room_id = roomId;

      const res = await api.get<Task[]>("/tasks", { params });
      setTareas(res.data);
    } catch (error) {
      console.error("Error al cargar tareas:", error);
    } finally {
      setLoading(false);
    }
  }, [estado, categoria, fechaLimite, busqueda, roomId]);

  useEffect(() => {
    fetchTareas();
  }, [fetchTareas, version]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchTareas();
    }, 400);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  const promptDelete = (tarea: Task) => {
    setActionError(null);
    setTaskToDelete(tarea);
  };

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

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setCompletingId(taskId);
    setActionError(null);
    try {
      await api.patch(`/tasks/${taskId}/status`, { estado: newStatus });
      setTareas((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, estado: newStatus } : t))
      );
      notifyUpdate();
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      setActionError("Error al actualizar el estado de la tarea.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleToggleComplete = async (taskId: string) => {
    const task = tareas.find((t) => t.id === taskId);
    if (!task) return;
    const nextStatus: TaskStatus = task.estado === "DONE" ? "TODO" : "DONE";
    await handleStatusChange(taskId, nextStatus);
  };

  const handleClearFilters = () => {
    setEstado("");
    setCategoria("");
    setFechaLimite("");
    setBusqueda("");
  };

  return (
    <div className="container-fluid py-2">
      {/* Cabecera de la vista de Tareas */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold" style={{ fontSize: "24px" }}>
            <LuListTodo className="text-primary" size={26} aria-hidden="true" />
            <span>Listado de Tareas</span>
          </h2>
          <p className="text-muted mb-0" style={{ fontSize: "14px" }}>
            Gestiona, filtra y organiza el trabajo de tu hogar en tiempo real.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Selector de Vistas: Grid | List | Kanban */}
          <TaskViewSwitcher
            currentMode={viewMode}
            onChangeMode={handleChangeViewMode}
          />

          <Link to="/tasks/rewrite">
            <Button variant="secondary" size="md" leftIcon={<LuSparkles size={16} />}>
              Mejorar títulos
            </Button>
          </Link>

          <Link to="/tasks/create">
            <Button variant="primary" size="md" leftIcon={<LuPlus size={16} />}>
              Nueva Tarea
            </Button>
          </Link>
        </div>
      </div>

      {/* Barra de Filtros Compacta */}
      <FilterBar
        busqueda={busqueda}
        onBusquedaChange={setBusqueda}
        estado={estado}
        onEstadoChange={setEstado}
        categoria={categoria}
        onCategoriaChange={setCategoria}
        fechaLimite={fechaLimite}
        onFechaLimiteChange={setFechaLimite}
        onClearFilters={handleClearFilters}
        totalTasks={tareas}
      />

      {/* Banner de error para mutaciones inline */}
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

      {/* Renderizado de vistas */}
      {loading ? (
        <div className="row g-3">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="col-12 col-md-6 col-lg-4">
              <div className="ui-task-card p-3">
                <div className="d-flex justify-content-between mb-3">
                  <Skeleton variant="rounded" width="80px" height="20px" className="rounded-pill" />
                  <Skeleton variant="rounded" width="60px" height="20px" className="rounded-pill" />
                </div>
                <div className="d-flex align-items-center gap-2 mb-2">
                  <Skeleton variant="circular" width="20px" height="20px" />
                  <Skeleton width="75%" height="20px" />
                </div>
                <Skeleton width="90%" height="14px" className="mb-3" />
                <div className="d-flex justify-content-between pt-2 border-top">
                  <Skeleton width="70px" height="14px" />
                  <Skeleton width="50px" height="14px" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tareas.length === 0 ? (
        <div className="p-4 text-center my-4">
          <EmptyState
            icon={<LuCircleCheck size={32} style={{ color: "#10b981" }} />}
            badge="TODO AL DÍA"
            title="¡No hay tareas pendientes!"
            description={
              estado || categoria || fechaLimite || busqueda
                ? "No se encontraron tareas con los filtros aplicados. Intenta restablecer los filtros."
                : "No hay tareas registradas en este hogar. Crea la primera tarea para comenzar."
            }
            actionLabel={
              estado || categoria || fechaLimite || busqueda
                ? "Limpiar filtros"
                : "+ Crear nueva tarea"
            }
            onAction={
              estado || categoria || fechaLimite || busqueda
                ? handleClearFilters
                : () => navigate("/tasks/create")
            }
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="row g-3">
          {tareas.map((tarea) => (
            <div key={tarea.id} className="col-12 col-md-6 col-lg-4">
              <TaskCard
                task={tarea}
                onComplete={handleToggleComplete}
                onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
                onDelete={promptDelete}
                isCompleting={completingId === tarea.id}
                isDeleting={deletingId === tarea.id}
              />
            </div>
          ))}
        </div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={tareas}
          onComplete={handleToggleComplete}
          onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      ) : (
        <TaskKanbanBoard
          tasks={tareas}
          onStatusChange={handleStatusChange}
          onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      )}

      {/* Modal de confirmación para eliminar */}
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
    </div>
  );
};

export default TaskList;
