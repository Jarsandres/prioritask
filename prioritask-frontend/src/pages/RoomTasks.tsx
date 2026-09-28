import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import EmptyState from "../components/common/EmptyState";
import TaskCard from "../components/common/TaskCard";
import ConfirmModal from "../components/ConfirmModal";
import RoomMembersModal from "../components/RoomMembersModal";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import TaskViewSwitcher, { type TaskViewMode } from "../components/tasks/TaskViewSwitcher";
import TaskListView from "../components/tasks/TaskListView";
import TaskKanbanBoard from "../components/tasks/TaskKanbanBoard";
import type { Task, Room, TaskStatus } from "../types/task";
import {
  LuHouse,
  LuUsers,
  LuPlus,
  LuArrowLeft,
} from "react-icons/lu";
import "../components/tasks/tasks.css";

const RoomTasks = () => {
  const { roomId } = useParams();
  const { setRoomId } = useRoom();
  const { notifyUpdate } = useTaskUpdate();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("tasks_view_mode") as TaskViewMode) || "grid";
  });

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const handleChangeViewMode = (mode: TaskViewMode) => {
    setViewMode(mode);
    localStorage.setItem("tasks_view_mode", mode);
  };

  useEffect(() => {
    setRoomId(roomId ?? null);
  }, [roomId, setRoomId]);

  useEffect(() => {
    if (!roomId) return;
    const controller = new AbortController();

    const fetchTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const [tasksRes, roomsRes] = await Promise.all([
          api.get<Task[]>(`/rooms/${roomId}/tasks`, {
            params: { limit: 100 },
            signal: controller.signal,
          }),
          api.get<Room[]>("/rooms", {
            signal: controller.signal,
          }),
        ]);
        setTasks(tasksRes.data);
        const foundRoom = roomsRes.data.find((r) => r.id === roomId);
        if (foundRoom) {
          setCurrentRoom(foundRoom);
          setRoomName(foundRoom.nombre);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(err);
        setError("No se pudieron cargar las tareas del hogar.");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    return () => {
      controller.abort();
    };
  }, [roomId]);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setCompletingId(taskId);
    setActionError(null);
    try {
      await api.patch(`/tasks/${taskId}/status`, { estado: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, estado: newStatus } : t))
      );
      notifyUpdate();
    } catch (err) {
      console.error("Error al actualizar el estado de la tarea:", err);
      setActionError("Error al actualizar el estado de la tarea.");
    } finally {
      setCompletingId(null);
    }
  };

  const handleToggleComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const nextStatus: TaskStatus = task.estado === "DONE" ? "TODO" : "DONE";
    await handleStatusChange(taskId, nextStatus);
  };

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
      setTasks((prev) => prev.filter((t) => t.id !== id));
      notifyUpdate();
      setTaskToDelete(null);
    } catch (err) {
      console.error("Error al eliminar tarea:", err);
      setActionError("Ocurrió un error al eliminar la tarea.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMembersChanged = async () => {
    notifyUpdate();
    try {
      const res = await api.get<Room[]>("/rooms");
      const stillMember = res.data.some((r) => r.id === roomId);
      if (!stillMember) {
        navigate("/dashboard");
      }
    } catch {
      navigate("/dashboard");
    }
  };

  return (
    <div className="container-fluid py-2">
      {/* Cabecera y acciones */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link
              to="/dashboard"
              className="text-muted d-flex align-items-center gap-1 text-decoration-none small"
              title="Volver al Dashboard"
            >
              <LuArrowLeft size={16} />
              <span>Dashboard</span>
            </Link>
          </div>
          <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold" style={{ fontSize: "24px" }}>
            <LuHouse className="text-primary" size={26} aria-hidden="true" />
            <span>{roomName ? `Tareas de ${roomName}` : "Tareas del Hogar"}</span>
          </h2>
          <p className="text-muted mb-0" style={{ fontSize: "14px" }}>
            {tasks.length} tarea(s) registradas en este espacio.
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Switcher de Vistas */}
          <TaskViewSwitcher
            currentMode={viewMode}
            onChangeMode={handleChangeViewMode}
          />

          <Button
            variant="secondary"
            size="md"
            leftIcon={<LuUsers size={16} />}
            onClick={() => setIsMembersModalOpen(true)}
          >
            Convivientes
          </Button>

          <Link to="/tasks/create">
            <Button variant="primary" size="md" leftIcon={<LuPlus size={16} />}>
              Nueva Tarea
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

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
          {[1, 2, 3].map((idx) => (
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
      ) : tasks.length === 0 ? (
        <div className="p-4 text-center my-4">
          <EmptyState
            icon={<LuHouse size={28} />}
            title="No hay tareas en este hogar"
            description="Comienza creando la primera tarea para organizar las actividades del hogar."
            actionLabel="+ Crear nueva tarea"
            onAction={() => navigate("/tasks/create")}
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="row g-3">
          {tasks.map((task) => (
            <div key={task.id} className="col-12 col-md-6 col-lg-4">
              <TaskCard
                task={task}
                onComplete={handleToggleComplete}
                onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
                onDelete={promptDelete}
                isCompleting={completingId === task.id}
                isDeleting={deletingId === task.id}
              />
            </div>
          ))}
        </div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={tasks}
          onComplete={handleToggleComplete}
          onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      ) : (
        <TaskKanbanBoard
          tasks={tasks}
          onStatusChange={handleStatusChange}
          onEdit={(t) => navigate(`/tasks/edit/${t.id}`)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      )}

      {/* Modal de Convivientes del Hogar */}
      {isMembersModalOpen && roomId && (
        <RoomMembersModal
          roomId={roomId}
          roomName={roomName}
          isOwner={Boolean(currentRoom?.is_owner)}
          myRole={currentRoom?.my_role ?? null}
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          onMembersChanged={handleMembersChanged}
          ownerId={currentRoom?.owner_id}
          ownerEmail={currentRoom?.owner}
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

export default RoomTasks;
