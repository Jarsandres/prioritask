import { useEffect, useState, useCallback } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../context/ToastContext";
import ConfirmModal from "./ConfirmModal";
import type { Task, TaskStatus } from "../types/task";
import TaskCard from "./common/TaskCard";
import EmptyState from "./common/EmptyState";
import { Skeleton } from "./ui/Skeleton";
import { Button } from "./ui/Button";
import TaskViewSwitcher, { type TaskViewMode } from "./tasks/TaskViewSwitcher";
import TaskListView from "./tasks/TaskListView";
import TaskKanbanBoard from "./tasks/TaskKanbanBoard";
import TaskCalendarView from "./tasks/TaskCalendarView";
import { useRoomEvents } from "../hooks/useRoomEvents";
import { useTasksState } from "../hooks/useTasksState";
import FilterBar from "./tasks/FilterBar";
import QuickAddTaskBar from "./tasks/QuickAddTaskBar";
import TaskPeekDrawer from "./tasks/TaskPeekDrawer";
import {
  LuPlus,
  LuSparkles,
  LuListTodo,
  LuCircleCheck,
  LuRadio,
} from "react-icons/lu";
import "./tasks/tasks.css";

const TaskList = () => {
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [debouncedBusqueda, setDebouncedBusqueda] = useState("");

  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("tasks_view_mode") as TaskViewMode) || "grid";
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [peekTask, setPeekTask] = useState<Task | null>(null);

  const navigate = useNavigate();
  const { version, notifyUpdate } = useTaskUpdate();
  const { roomId } = useRoom();
  const { toast } = useToast();

  const {
    byId,
    tasks: tareas,
    pendingById,
    ui: tasksUi,
    getTaskById,
    setTasks: setTareas,
    upsertTask,
    reconcileLiveEvent,
    toggleCompleteOptimistic,
    updateTaskOptimistic,
    setPriorityOptimistic,
    deleteTaskOptimistic,
    setFocusedTaskId,
    moveFocus,
    toggleSelectTask,
  } = useTasksState({
    onOptimisticError: (err) => toast.error(err.message),
  });

  const { isConnected: isLiveConnected } = useRoomEvents(roomId, reconcileLiveEvent);

  const handleChangeViewMode = (mode: TaskViewMode) => {
    const docWithTransition = document as Document & {
      startViewTransition?: (cb: () => void) => void;
    };
    if (typeof docWithTransition.startViewTransition === "function") {
      docWithTransition.startViewTransition(() => {
        setViewMode(mode);
      });
    } else {
      setViewMode(mode);
    }
    localStorage.setItem("tasks_view_mode", mode);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBusqueda(busqueda);
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [busqueda]);

  const fetchTareas = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (estado) params.estado = estado;
      if (categoria) params.categoria = categoria;
      if (fechaLimite) params.due_date_max = fechaLimite;
      if (debouncedBusqueda) params.search = debouncedBusqueda;
      if (roomId) params.room_id = roomId;

      const res = await api.get<Task[]>("/tasks", { params });
      setTareas(res.data);
    } catch (error) {
      console.error("Error al cargar tareas:", error);
    } finally {
      setLoading(false);
    }
  }, [estado, categoria, fechaLimite, debouncedBusqueda, roomId, setTareas]);

  useEffect(() => {
    fetchTareas();
  }, [fetchTareas, version]);

  const promptDelete = (tarea: Task) => {
    setTaskToDelete(tarea);
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete.id;
    setDeletingId(id);
    setTaskToDelete(null);
    const ok = await deleteTaskOptimistic(id);
    setDeletingId(null);
    if (ok) {
      notifyUpdate();
      toast.success("Tarea eliminada correctamente");
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setCompletingId(taskId);
    const ok = await updateTaskOptimistic(
      taskId,
      { estado: newStatus, completed: newStatus === "DONE" },
      async (id) =>
        (await api.patch<Task>(`/tasks/${id}/status`, { estado: newStatus })).data
    );
    setCompletingId(null);
    if (ok) {
      notifyUpdate();
      if (newStatus === "DONE") {
        toast.success("¡Tarea completada! 🎉");
      } else if (newStatus === "IN_PROGRESS") {
        toast.info("Tarea en progreso 🚀");
      } else {
        toast.info("Tarea movida a Por Hacer");
      }
    }
  };

  const handleToggleComplete = async (taskId: string) => {
    const prev = getTaskById(taskId);
    if (!prev) return;
    const nextStatus: TaskStatus = prev.estado === "DONE" ? "TODO" : "DONE";
    setCompletingId(taskId);
    const ok = await toggleCompleteOptimistic(taskId);
    setCompletingId(null);
    if (ok) {
      notifyUpdate();
      if (nextStatus === "DONE") {
        toast.success("¡Tarea completada! 🎉");
      } else {
        toast.info("Tarea movida a Por Hacer");
      }
    }
  };

  const handlePriorityChange = async (taskId: string, nextPeso: number) => {
    const ok = await setPriorityOptimistic(taskId, nextPeso);
    if (ok) {
      notifyUpdate();
    }
  };

  const handleAdvanceTask = async (taskId: string) => {
    try {
      const res = await api.post<Task>(`/tasks/${taskId}/advance`);
      reconcileLiveEvent({
        type: "TASK_UPDATED",
        data: { id: taskId, estado: "DONE", completed: true },
      });
      if (res.data?.id) {
        upsertTask(res.data, "prepend");
      }
      notifyUpdate();
      const nextDueStr = res.data?.due_date ? ` (próxima: ${String(res.data.due_date).slice(0, 10)})` : "";
      toast.success(`Rutina avanzada al siguiente ciclo 🔄${nextDueStr}`);
    } catch (error) {
      console.error("Error al avanzar la tarea recurrente:", error);
      toast.error("Error al avanzar la tarea recurrente.");
    }
  };

  const handleClearFilters = () => {
    setEstado("");
    setCategoria("");
    setFechaLimite("");
    setBusqueda("");
    setDebouncedBusqueda("");
  };

  return (
    <div className="container-fluid py-2">
      {/* Cabecera de la vista de Tareas */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold" style={{ fontSize: "24px" }}>
            <LuListTodo className="text-primary" size={26} aria-hidden="true" />
            <span>Listado de Tareas</span>
            {isLiveConnected && (
              <span
                className="badge rounded-pill bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 py-1 px-2 ms-2"
                style={{ fontSize: "11px", fontWeight: 600 }}
                title="Sincronización en tiempo real activa (SSE & Broadcast)"
              >
                <LuRadio size={12} className="text-success" />
                <span>En vivo</span>
              </span>
            )}
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

      {/* Entrada Rápida Inline Estilo Todoist */}
      <QuickAddTaskBar
        roomId={roomId}
        onTaskCreated={(newTask) => upsertTask(newTask, "prepend")}
        className="mb-3"
      />

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
                onEdit={(t) => setPeekTask(t)}
                onDelete={promptDelete}
                onAdvance={handleAdvanceTask}
                isCompleting={completingId === tarea.id || pendingById[tarea.id] === "completing"}
                isDeleting={deletingId === tarea.id || pendingById[tarea.id] === "deleting"}
              />
            </div>
          ))}
        </div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={tareas}
          onComplete={handleToggleComplete}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          onAdvance={handleAdvanceTask}
          onPriorityChange={handlePriorityChange}
          completingId={completingId}
          deletingId={deletingId}
          pendingById={pendingById}
          focusedTaskId={tasksUi.focusedTaskId}
          selectedTaskIds={tasksUi.selectedTaskIds}
          onFocusTask={setFocusedTaskId}
          onNavigateFocus={moveFocus}
          onToggleSelect={toggleSelectTask}
        />
      ) : viewMode === "calendar" ? (
        <TaskCalendarView
          tasks={tareas}
          onComplete={handleToggleComplete}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      ) : (
        <TaskKanbanBoard
          tasks={tareas}
          onStatusChange={handleStatusChange}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      )}

      {/* Slide-Over Task Peek Drawer (Edición y detalle sin cambio de ruta) */}
      <TaskPeekDrawer
        task={peekTask ? (byId[peekTask.id] ?? peekTask) : null}
        isOpen={Boolean(peekTask)}
        onClose={() => setPeekTask(null)}
        onComplete={handleToggleComplete}
        onDelete={promptDelete}
        onAdvance={handleAdvanceTask}
        onTaskUpdated={(updated) => {
          upsertTask(updated);
          setPeekTask(updated);
        }}
      />

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
