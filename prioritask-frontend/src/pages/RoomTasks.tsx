import { useEffect, useState, useCallback, useMemo, Suspense, lazy } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useToast } from "../context/ToastContext";
import EmptyState from "../components/common/EmptyState";
import TaskCard from "../components/common/TaskCard";
import ConfirmModal from "../components/ConfirmModal";
import RoomMembersModal from "../components/RoomMembersModal";
import KitchenKioskModal from "../components/rooms/KitchenKioskModal";
import ModalSkeleton from "../components/ui/ModalSkeleton";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import TaskViewSwitcher, { type TaskViewMode } from "../components/tasks/TaskViewSwitcher";
import TaskListView from "../components/tasks/TaskListView";
import TaskKanbanBoard from "../components/tasks/TaskKanbanBoard";
import TaskCalendarView from "../components/tasks/TaskCalendarView";
import QuickAddTaskBar from "../components/tasks/QuickAddTaskBar";
import TaskPeekDrawer from "../components/tasks/TaskPeekDrawer";
import { useRoomEvents, type RoomSyncEvent } from "../hooks/useRoomEvents";
import { useTasksState } from "../hooks/useTasksState";
import { usePixelConfetti } from "../hooks/usePixelConfetti";
import { cacheManager } from "../services/cacheManager";
import {
  getRoomTaskAssignees,
  toggleMemberTaskAssignmentLocal,
  getMemberInitials,
  type QuickAssignee,
  type KudosEmoji,
} from "../utils/kudosStore";
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
  LuMonitor,
  LuCrown,
  LuX,
} from "react-icons/lu";
import "../components/tasks/tasks.css";

// Lazy loading diferido de modales secundarios pesados (Sprint 10 Code-Splitting)
const RoomAnalyticsModal = lazy(() => import("../components/rooms/RoomAnalyticsModal"));
const RoomGamificationModal = lazy(() => import("../components/rooms/RoomGamificationModal"));
const RoomExportModal = lazy(() => import("../components/rooms/RoomExportModal"));

const RoomTasks = () => {
  const { roomId } = useParams();
  const { setRoomId } = useRoom();
  const { notifyUpdate } = useTaskUpdate();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { triggerCelebration } = usePixelConfetti();

  const cachedData = roomId ? cacheManager.getRoomTasks(roomId) : null;
  const cachedGamification = roomId ? cacheManager.getRoomGamification(roomId) : null;

  const {
    byId,
    tasks,
    pendingById,
    ui: tasksUi,
    getTaskById,
    setTasks,
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
    initialTasks: cachedData?.tasks || [],
    onOptimisticError: (err) => toast.error(err.message),
  });

  const [roomName, setRoomName] = useState<string>("");
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isGamificationModalOpen, setIsGamificationModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isKioskModalOpen, setIsKioskModalOpen] = useState(false);
  const [gamification, setGamification] = useState<GamificationOverview | null>(() => cachedGamification);
  const [loading, setLoading] = useState<boolean>(() => !cachedData);

  const [assigneesMap, setAssigneesMap] = useState<Record<string, QuickAssignee[]>>(() =>
    roomId ? getRoomTaskAssignees(roomId) : {}
  );
  const [activeAssigneeForClick, setActiveAssigneeForClick] = useState<QuickAssignee | null>(null);

  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    return (localStorage.getItem("tasks_view_mode") as TaskViewMode) || "grid";
  });

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [peekTask, setPeekTask] = useState<Task | null>(null);

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
    setRoomId(roomId ?? null);
    if (roomId) {
      setAssigneesMap(getRoomTaskAssignees(roomId));
    }
  }, [roomId, setRoomId]);

  // Carga inicial y cambio de sala con entrega SWR instantánea (0ms de espera visual)
  useEffect(() => {
    if (!roomId) return;
    const controller = new AbortController();

    // Comprobar si existen datos en caché L1
    const cacheHit = cacheManager.getRoomTasks(roomId);
    if (cacheHit) {
      setTasks(cacheHit.tasks);
      setLoading(false);
      const cachedGam = cacheManager.getRoomGamification(roomId);
      if (cachedGam) setGamification(cachedGam);
    } else {
      setLoading(true);
    }

    const fetchTasks = async () => {
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
        cacheManager.setRoomTasks(roomId, tasksRes.data);

        if (gamificationRes.data) {
          setGamification(gamificationRes.data);
          cacheManager.setRoomGamification(roomId, gamificationRes.data);
        }

        const foundRoom = roomsRes.data.find((r) => r.id === roomId);
        if (foundRoom) {
          setCurrentRoom(foundRoom);
          setRoomName(foundRoom.nombre);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(err);
        if (!cacheHit) {
          toast.error("No se pudieron cargar las tareas del hogar.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    return () => {
      controller.abort();
    };
  }, [roomId, toast, setTasks]);

  // Conciliación In-Place O(1) reactiva para SSE y BroadcastChannel (Cero Flicker y Cero Skeletons destructivos)
  const handleLiveEvent = useCallback(
    (event: RoomSyncEvent) => {
      if (!event || !event.type) return;

      reconcileLiveEvent(event);

      if (
        event.type === "POINTS_AWARDED" ||
        event.type === "STREAK_UPDATED" ||
        event.type === "REWARD_REDEEMED"
      ) {
        // Refrescar datos de gamificación en segundo plano sin skeletons destructivos
        if (roomId) {
          api
            .get<GamificationOverview>(`/rooms/${roomId}/gamification`)
            .then((res) => {
              if (res.data) {
                setGamification(res.data);
                cacheManager.setRoomGamification(roomId, res.data);
              }
            })
            .catch(() => {});
        }
      }
    },
    [roomId, reconcileLiveEvent]
  );

  // Cliente de Sincronización en Vivo SSE y BroadcastChannel con conciliación atómica
  const { isConnected: isLiveConnected } = useRoomEvents(roomId, handleLiveEvent);

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
      if (roomId) {
        cacheManager.updateTaskInCache(roomId, { id: taskId, estado: newStatus });
      }
      notifyUpdate();
      if (newStatus === "DONE") {
        triggerCelebration();
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
      if (roomId) {
        cacheManager.updateTaskInCache(roomId, { id: taskId, estado: nextStatus });
      }
      notifyUpdate();
      if (nextStatus === "DONE") {
        triggerCelebration();
        toast.success("¡Tarea completada! 🎉");
      } else {
        toast.info("Tarea movida a Por Hacer");
      }
    }
  };

  const handlePriorityChange = async (taskId: string, nextPeso: number) => {
    const ok = await setPriorityOptimistic(taskId, nextPeso);
    if (ok) {
      if (roomId) {
        cacheManager.updateTaskInCache(roomId, { id: taskId, peso: nextPeso });
      }
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
      if (roomId) {
        cacheManager.updateTaskInCache(roomId, {
          id: taskId,
          estado: "DONE",
          completed: true,
        });
      }
      if (res.data?.id) {
        upsertTask(res.data, "prepend");
        if (roomId) {
          cacheManager.addTaskToCache(roomId, res.data);
        }
      }
      notifyUpdate();
      const nextDueStr = res.data?.due_date
        ? ` (próxima: ${String(res.data.due_date).slice(0, 10)})`
        : "";
      toast.success(`Rutina avanzada al siguiente ciclo 🔄${nextDueStr}`);
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
    setTaskToDelete(null);
    const ok = await deleteTaskOptimistic(id);
    setDeletingId(null);
    if (ok) {
      if (roomId) {
        cacheManager.removeTaskFromCache(roomId, id);
      }
      notifyUpdate();
      toast.success("Tarea eliminada correctamente");
    }
  };

  const handleMembersChanged = async () => {
    notifyUpdate();
    try {
      const res = await api.get<Room[]>("/rooms");
      const found = res.data.find((r) => r.id === roomId);
      if (!found) {
        navigate("/dashboard");
      } else {
        setCurrentRoom(found);
      }
    } catch {
      navigate("/dashboard");
    }
  };

  // Lista unificada de convivientes para asignación rápida Drag & Drop o Clic accesible
  const assignableMembers = useMemo<QuickAssignee[]>(() => {
    const list: QuickAssignee[] = [];
    const seen = new Set<string>();

    if (currentRoom?.owner_id) {
      const ownerLabel = currentRoom.owner
        ? currentRoom.owner.split("@")[0]
        : "Anfitrión";
      list.push({
        userId: currentRoom.owner_id,
        label: ownerLabel,
        role: "ADMIN",
        isOwner: true,
      });
      seen.add(currentRoom.owner_id);
    }

    if (currentRoom?.members) {
      for (const m of currentRoom.members) {
        if (!seen.has(m.user_id)) {
          const display =
            m.user_nombre ||
            (m.user_email ? m.user_email.split("@")[0] : `Miembro ${m.user_id.slice(0, 4)}`);
          list.push({
            userId: m.user_id,
            label: display,
            role: m.role,
            isOwner: m.user_id === currentRoom.owner_id,
          });
          seen.add(m.user_id);
        }
      }
    }

    if (list.length === 0) {
      list.push({
        userId: "self-owner",
        label: "Tú (Hogar)",
        role: "ADMIN",
        isOwner: true,
      });
    }

    return list;
  }, [currentRoom]);

  const handleAssignMemberToTask = useCallback(
    async (taskId: string, member: QuickAssignee) => {
      const effRoomId = roomId || "default";
      const { added, allMap } = toggleMemberTaskAssignmentLocal(effRoomId, taskId, member);
      setAssigneesMap({ ...allMap });

      if (added) {
        toast.success(`Tarea asignada a ${member.label} 👤`);
        try {
          await api.post("/tasks/assign", {
            task_id: taskId,
            user_id: member.userId,
          });
        } catch {
          // Mantener asignación optimista local incluso si el ID es de sesión local
        }
      } else {
        toast.info(`Asignación de ${member.label} retirada`);
        try {
          await api.delete(`/tasks/${taskId}/assignees/${member.userId}`);
        } catch {
          // Ignorar error de red en desvinculación optimista
        }
      }
    },
    [roomId, toast]
  );

  const handleKudosReaction = useCallback(
    (_taskId: string, emoji: KudosEmoji, deltaPoints: number) => {
      if (deltaPoints > 0) {
        toast.success(`¡Kudo ${emoji} enviado! (+${deltaPoints} pts de reconocimiento)`);
      }
    },
    [toast]
  );

  return (
    <div className="container-fluid py-2">
      {/* Cabecera y acciones */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
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
            leftIcon={<LuMonitor className="text-primary" size={16} />}
            onClick={() => setIsKioskModalOpen(true)}
            title="Abrir Modo Kiosco / Tablet de Cocina (Always-On Display + Pomodoro)"
            data-testid="open-kiosk-mode-btn"
          >
            Modo Kiosco
          </Button>

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

      {/* Barra de Asignación Rápida Drag & Drop de Convivientes (Fase 4 Roadmap) */}
      <div
        className="room-member-avatars-bar mb-3"
        data-testid="room-member-avatars-bar"
        aria-label="Asignación rápida de convivientes"
      >
        <span className="room-member-bar-label">
          <LuUsers size={14} className="text-primary" />
          <span>Asignación rápida (arrastra a una tarea o haz clic):</span>
        </span>

        <div className="room-member-avatars-list">
          {assignableMembers.map((member) => {
            const isSelected = activeAssigneeForClick?.userId === member.userId;
            return (
              <button
                key={member.userId}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/x-prioritask-member",
                    JSON.stringify(member)
                  );
                  e.dataTransfer.setData("text/plain", member.userId);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() =>
                  setActiveAssigneeForClick((prev) =>
                    prev?.userId === member.userId ? null : member
                  )
                }
                className={`room-member-avatar-pill ${isSelected ? "active" : ""}`}
                title={`Arrastra sobre una tarea o haz clic para asignar a ${member.label}`}
                aria-pressed={isSelected}
                data-testid={`member-avatar-${member.userId}`}
              >
                <span className="room-member-avatar-circle">
                  {member.isOwner ? (
                    <LuCrown size={11} />
                  ) : (
                    getMemberInitials(member.label)
                  )}
                </span>
                <span className="room-member-avatar-name">{member.label}</span>
              </button>
            );
          })}
        </div>

        {activeAssigneeForClick && (
          <div
            className="room-member-active-hint"
            data-testid="active-assignee-banner"
          >
            <span>
              Modo clic activo para <strong>{activeAssigneeForClick.label}</strong>
            </span>
            <button
              type="button"
              className="room-member-hint-close"
              onClick={() => setActiveAssigneeForClick(null)}
              aria-label="Cancelar modo asignación rápida"
            >
              <LuX size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Barra de creación rápida inline (Todoist Quick-Add) */}
      <QuickAddTaskBar
        roomId={roomId || null}
        onTaskCreated={(createdTask) => {
          upsertTask(createdTask, "prepend");
          if (roomId) cacheManager.addTaskToCache(roomId, createdTask);
          notifyUpdate();
        }}
      />

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
                onEdit={(t) => setPeekTask(t)}
                onDelete={promptDelete}
                onAdvance={handleAdvanceTask}
                isCompleting={
                  pendingById[task.id] === "completing" ||
                  completingId === task.id
                }
                isDeleting={
                  pendingById[task.id] === "deleting" ||
                  deletingId === task.id
                }
                assignedMembers={assigneesMap[task.id] || []}
                onAssignMember={handleAssignMemberToTask}
                activeAssigneeForClick={activeAssigneeForClick}
                onKudosReaction={handleKudosReaction}
              />
            </div>
          ))}
        </div>
      ) : viewMode === "list" ? (
        <TaskListView
          tasks={tasks}
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
          assigneesMap={assigneesMap}
          onAssignMember={handleAssignMemberToTask}
          activeAssigneeForClick={activeAssigneeForClick}
        />
      ) : viewMode === "calendar" ? (
        <TaskCalendarView
          tasks={tasks}
          onComplete={handleToggleComplete}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      ) : (
        <TaskKanbanBoard
          tasks={tasks}
          onStatusChange={handleStatusChange}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
          assigneesMap={assigneesMap}
          onAssignMember={handleAssignMemberToTask}
          activeAssigneeForClick={activeAssigneeForClick}
          onKudosReaction={handleKudosReaction}
        />
      )}

      {/* Slide-Over Task Peek Drawer (Edición y detalle sin cambio de página) */}
      <TaskPeekDrawer
        task={peekTask ? (byId[peekTask.id] ?? peekTask) : null}
        isOpen={Boolean(peekTask)}
        onClose={() => setPeekTask(null)}
        onComplete={handleToggleComplete}
        onDelete={promptDelete}
        onAdvance={handleAdvanceTask}
        onKudosReaction={handleKudosReaction}
        onTaskUpdated={(updated) => {
          upsertTask(updated);
          if (roomId) {
            cacheManager.updateTaskInCache(roomId, updated);
          }
          setPeekTask(updated);
        }}
      />

      {/* Modo Kiosco / Tablet de Cocina (Always-On Display + Pomodoro) */}
      <KitchenKioskModal
        isOpen={isKioskModalOpen}
        onClose={() => setIsKioskModalOpen(false)}
        roomName={roomName || "Mi Hogar"}
        tasks={tasks}
        onToggleComplete={handleToggleComplete}
        isLiveConnected={isLiveConnected}
        assigneesMap={assigneesMap}
        onKudosReaction={handleKudosReaction}
      />

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
