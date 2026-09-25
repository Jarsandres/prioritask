import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import RetroWindow from "../components/common/RetroWindow";
import EmptyState from "../components/common/EmptyState";
import TaskCard from "../components/common/TaskCard";
import ConfirmModal from "../components/ConfirmModal";
import type { Task } from "../types/task";

// FE-010: Tipado con interfaz Task del módulo compartido

const RoomTasks = () => {
  const { roomId } = useParams();
  const { setRoomId } = useRoom();
  const { notifyUpdate } = useTaskUpdate();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [roomName, setRoomName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  useEffect(() => {
    setRoomId(roomId ?? null);
  }, [roomId, setRoomId]);

  useEffect(() => {
    if (!roomId) return;

    // AbortController para cancelar si el componente se desmonta o roomId cambia
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
          api.get<{ id: string; nombre: string }[]>("/rooms", {
            signal: controller.signal,
          }),
        ]);
        setTasks(tasksRes.data);
        const currentRoom = roomsRes.data.find((r) => r.id === roomId);
        if (currentRoom) setRoomName(currentRoom.nombre);
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

  const marcarComoCompletada = async (taskId: string) => {
    setCompletingId(taskId);
    setActionError(null);
    try {
      await api.patch(`/tasks/${taskId}/status`, { estado: "DONE" });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, estado: "DONE" } : t))
      );
      notifyUpdate();
    } catch (err) {
      console.error("Error al marcar como completada:", err);
      setActionError("Error al actualizar el estado de la tarea.");
    } finally {
      setCompletingId(null);
    }
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

  return (
    <div className="container-fluid py-2">
      {/* Cabecera y botón de navegación */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>🏠</span> TAREAS DEL HOGAR / ROOM_TASKS.DAT
          </h2>
          <p className="retro-page-subtitle">
            {roomName ? `Hogar activo: ${roomName}` : "Listado de tareas asignadas al hogar"}
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link
            to="/dashboard"
            className="btn-retro btn-retro-outline"
            style={{ minHeight: "40px" }}
          >
            <span>⬅</span> <span>Volver al Dashboard</span>
          </Link>
          <Link
            to="/tasks/create"
            className="btn-retro btn-retro-primary"
            style={{ minHeight: "40px" }}
          >
            <span>➕</span> <span>Nueva Tarea</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      {actionError && (
        <div className="alert alert-danger alert-dismissible fade show mb-4" role="alert">
          {actionError}
          <button
            type="button"
            className="btn-close"
            onClick={() => setActionError(null)}
          ></button>
        </div>
      )}

      {/* Ventana Retro */}
      <RetroWindow
        title={`ROOM_TASKS.DAT ${roomName ? `[${roomName.toUpperCase()}]` : ""}`}
        icon="🏠"
        badge={
          <span className="retro-badge retro-badge-high">
            {tasks.length} tareas
          </span>
        }
      >
        {loading ? (
          <EmptyState
            icon="⏳"
            title="Cargando tareas del hogar..."
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="📁"
            title="No hay tareas en este hogar"
            description="Crea la primera tarea para empezar a organizar este espacio."
            actionLabel="➕ Crear Tarea"
            actionTo="/tasks/create"
          />
        ) : (
          <div className="row g-3">
            {tasks.map((t) => (
              <div key={t.id} className="col-12 col-md-6 col-lg-4">
                <TaskCard
                  task={t}
                  onComplete={marcarComoCompletada}
                  onEdit={(tarea) => navigate(`/tasks/edit/${tarea.id}`)}
                  onDelete={promptDelete}
                  isCompleting={completingId === t.id}
                  isDeleting={deletingId === t.id}
                />
              </div>
            ))}
          </div>
        )}
      </RetroWindow>

      {/* Modal de confirmación reactivo */}
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
