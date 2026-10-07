import { useEffect, useState, Suspense, lazy } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useToast } from "../context/ToastContext";
import EmptyState from "../components/common/EmptyState";
import TaskCard from "../components/common/TaskCard";
import ConfirmModal from "../components/ConfirmModal";
import RoomMembersModal from "../components/RoomMembersModal";
import ModalSkeleton from "../components/ui/ModalSkeleton";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import TaskViewSwitcher, { type TaskViewMode } from "../components/tasks/TaskViewSwitcher";
import TaskListView from "../components/tasks/TaskListView";
import TaskKanbanBoard from "../components/tasks/TaskKanbanBoard";
import TaskCalendarView from "../components/tasks/TaskCalendarView";
import { useRoomEvents } from "../hooks/useRoomEvents";
import { usePixelConfetti } from "../hooks/usePixelConfetti";
import type { Task, Room, TaskStatus } from "../types/task";
import type { GamificationOverview } from "../types/gamification";
import {
  LuHouse,
  LuUsers,
  LuPlus,
  LuArrowLeft,
  LuRadio,
  LuChartBar,
  LuFlame,
  LuTrophy,
  LuDownload,
} from "react-icons/lu";
import "../components/tasks/tasks.css";

// Lazy loading diferido de modales secundarios pesados (Sprint 10 Code-Splitting)
const RoomAnalyticsModal = lazy(() => import("../components/rooms/RoomAnalyticsModal"));
const RoomGamificationModal = lazy(() => import("../components/rooms/RoomGamificationModal"));
const RoomExportModal = lazy(() => import("../components/rooms/RoomExportModal"));

const RoomTasks = () => {
  const { roomId } = useParams();
  const { setRoomId } = useRoom();
  const { version, notifyUpdate } = useTaskUpdate();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Cliente de Sincronización en Vivo SSE y BroadcastChannel
  const { isConnected: isLiveConnected } = useRoomEvents(roomId);
  const { triggerCelebration } = usePixelConfetti();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [gamification, setGamification] = useState<GamificationOverview | null>(null);
  const [loading, setLoading] = useState(true);

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
      try {
        const [tasksRes, roomsRes, gamificationRes] = await Promise.all([
          api.get<Task[]>(`/rooms/${roomId}/tasks`, {
            params: { limit: 100 },
            signal: controller.signal,
          }),
          api.get<Room[]>("/rooms", {
            signal: controller.signal,
          }),
          api.get<GamificationOverview>(`/rooms/${roomId}/gamification`, {
            signal: controller.signal,
          }).catch(() => ({ data: null })),
        ]);
        setTasks(tasksRes.data);
        if (gamificationRes.data) {
          setGamification(gamificationRes.data);
        }
        const foundRoom = roomsRes.data.find((r) => r.id === roomId);
        if (foundRoom) {
          setCurrentRoom(foundRoom);
          setRoomName(foundRoom.nombre);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(err);
        toast.error("No se pudieron cargar las tareas del hogar.");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    return () => {
      controller.abort();
    };
  }, [roomId, toast, version]);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setCompletingId(taskId);
    try {
      await api.patch(`/tasks/${taskId}/status`, { estado: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, estado: newStatus } : t))
      );
      notifyUpdate();
      if (newStatus === "DONE") {
        // Disparo de confeti pixelado 8-bit y sintetizador de audio procedural
        triggerCelebration();
        toast.success("¡Tarea completada! 🎉");
      } else if (newStatus === "IN_PROGRESS") {
        toast.info("Tarea en progreso 🚀");
      } else {
        toast.info("Tarea movida a Por Hacer");
      }
    } catch (err) {
      console.error("Error al actualizar el estado de la tarea:", err);
      toast.error("Error al actualizar el estado de la tarea.");
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

  const handleAdvanceTask = async (taskId: string) => {
    try {
      await api.post(`/tasks/${taskId}/advance`);
      notifyUpdate();
      toast.success("Rutina avanzada al siguiente ciclo 🔄");
    } catch (err: unknown) {
      console.error("Error al avanzar la tarea recurrente:", err);
      toast.error("Error al avanzar la tarea recurrente.");
    }
  };

  const promptDelete = (tarea: Task) => {
    setTaskToDelete(tarea);
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete.id;
    setDeletingId(id);
    try {
      await api.delete(`/tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      notifyUpdate();
      setTaskToDelete(null);
      toast.success("Tarea eliminada correctamente");
    } catch (err) {
      console.error("Error al eliminar tarea:", err);
      toast.error("Ocurrió un error al eliminar la tarea.");
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
          <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold flex-wrap" style={{ fontSize: "24px" }}>
            <LuHouse className="text-primary" size={26} aria-hidden="true" />
            <span>{roomName ? `Tareas de ${roomName}` : "Tareas del Hogar"}</span>
            {isLiveConnected && (
              <span
                className="badge rounded-pill bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 py-1 px-2"
                style={{ fontSize: "11px", fontWeight: 600 }}
                title="Sincronización en tiempo real activa (SSE & Broadcast)"
              >
                <LuRadio size={12} className="text-success" />
                <span>En vivo</span>
              </span>
            )}
            {/* Indicador de Racha y Puntos Retro */}
            {gamification && (
              <button
                type="button"
                className="streak-header-badge"
                onClick={() => setIsGamificationModalOpen(true)}
                title="Ver racha, puntos y recompensas"
                aria-label={`Racha de ${gamification.user_current_streak} días y ${gamification.user_balance} puntos. Abrir gamificación.`}
              >
                <LuFlame size={16} aria-hidden="true" />
                <span>
                  {gamification.user_current_streak > 0
                    ? `${gamification.user_current_streak} días`
                    : "0 días"}
                </span>
                <span
                  className="badge bg-warning-subtle text-warning-emphasis px-1 py-0 rounded-pill ms-1"
                  style={{ fontSize: "11px" }}
                >
                  {gamification.user_balance} pts
                </span>
              </button>
            )}
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
            leftIcon={<LuTrophy className="text-warning" size={16} />}
            onClick={() => setIsGamificationModalOpen(true)}
            title="Ver tabla de clasificación y tienda de recompensas"
          >
            Recompensas
          </Button>

          <Button
            variant="secondary"
            size="md"
            leftIcon={<LuChartBar size={16} />}
            onClick={() => setIsAnalyticsModalOpen(true)}
            title="Ver analíticas y métricas de productividad del hogar"
          >
            Analíticas
          </Button>

          <Button
            variant="secondary"
            size="md"
            leftIcon={<LuDownload size={16} />}
            onClick={() => setIsExportModalOpen(true)}
            title="Exportar datos del hogar (JSON / CSV) o imprimir lista para la nevera"
          >
            Exportar / Imprimir
          </Button>

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
                onAdvance={handleAdvanceTask}
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
      ) : viewMode === "calendar" ? (
        <TaskCalendarView
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

      {/* Modal de Analíticas y Productividad (Lazy Loaded) */}
      {isAnalyticsModalOpen && roomId && (
        <Suspense fallback={<ModalSkeleton />}>
          <RoomAnalyticsModal
            roomId={roomId}
            roomName={roomName}
            isOpen={isAnalyticsModalOpen}
            onClose={() => setIsAnalyticsModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Modal de Gamificación, Rachas y Recompensas (Lazy Loaded) */}
      {isGamificationModalOpen && roomId && (
        <Suspense fallback={<ModalSkeleton />}>
          <RoomGamificationModal
            roomId={roomId}
            roomName={roomName}
            isOpen={isGamificationModalOpen}
            onClose={() => {
              setIsGamificationModalOpen(false);
              notifyUpdate();
            }}
            isAdmin={Boolean(currentRoom?.is_owner || currentRoom?.my_role === "ADMIN")}
          />
        </Suspense>
      )}

      {/* Modal de Exportación GDPR y Lista para la Nevera (Lazy Loaded) */}
      {isExportModalOpen && roomId && (
        <Suspense fallback={<ModalSkeleton />}>
          <RoomExportModal
            roomId={roomId}
            roomName={roomName}
            tasks={tasks}
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
          />
        </Suspense>
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
