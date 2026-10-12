import { useEffect, useState, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
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
import TaskBulkActionsBar from "../components/tasks/TaskBulkActionsBar";
import { useRoomEvents, type RoomSyncEvent } from "../hooks/useRoomEvents";
import {
  useTasksState,
  computeSnoozePresetDate,
  type SnoozePresetKey,
  type TaskPriorityLevel,
} from "../hooks/useTasksState";
import { parseNavigationQuery } from "../utils/navigationRouter";
import { usePixelConfetti } from "../hooks/usePixelConfetti";
import { cacheManager } from "../services/cacheManager";
import {
  getRoomTaskAssignees,
  toggleMemberTaskAssignmentLocal,
  getMemberInitials,
  type QuickAssignee,
  type KudosEmoji,
} from "../utils/kudosStore";
import {
  getRoomSectionsState,
  saveRoomSectionsState,
  createCustomSection,
  renameCustomSection,
  deleteCustomSection,
  assignTaskToCustomSection,
  getPersistedTaskOrder,
  getViewGroupingPreferences,
  saveViewGroupingPreferences,
  sortTasksCollection,
  groupAndSortTasks,
  type TaskGroupByMode,
  type TaskSortByMode,
  type TaskGroupSection,
  type RoomSectionsState,
} from "../utils/taskGroupingAndSorting";
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
  const location = useLocation();
  const { setRoomId } = useRoom();
  const { notifyUpdate } = useTaskUpdate();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { triggerCelebration } = usePixelConfetti();

  const cachedData = roomId ? cacheManager.getRoomTasks(roomId) : null;
  const cachedGamification = roomId ? cacheManager.getRoomGamification(roomId) : null;

  const {
    byId,
    ids: taskIdsOrder,
    tasks,
    pendingById,
    ui: tasksUi,
    getTaskById,
    setTasks,
    upsertTask,
    restoreTasksSnapshot,
    setCustomTaskOrder,
    reorderTasks,
    moveTaskOrderByKeyboard,
    reconcileLiveEvent,
    toggleCompleteOptimistic,
    updateTaskOptimistic,
    setPriorityOptimistic,
    deleteTaskOptimistic,
    batchToggleCompleteOptimistic,
    batchUpdateTasksOptimistic,
    batchDeleteTasksOptimistic,
    setFocusedTaskId,
    moveFocus,
    toggleSelectTask,
    selectAllTasks,
    selectTaskRange,
    clearSelection,
  } = useTasksState({
    initialTasks: cachedData?.tasks || [],
    onOptimisticError: (err) => toast.error(err.message),
  });

  const [groupBy, setGroupBy] = useState<TaskGroupByMode>(
    () => getViewGroupingPreferences(roomId).groupBy
  );
  const [sortBy, setSortBy] = useState<TaskSortByMode>(
    () => getViewGroupingPreferences(roomId).sortBy
  );
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>(
    () => getViewGroupingPreferences(roomId).collapsedGroupIds
  );
  const [customSectionsState, setCustomSectionsState] = useState<RoomSectionsState>(
    () => getRoomSectionsState(roomId)
  );
  const [newRoomSectionName, setNewRoomSectionName] = useState("");

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
  const handledTaskIdRef = useRef<string | null>(null);

  const clearTaskIdFromUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("taskId")) return;
    params.delete("taskId");
    const nextSearch = params.toString();
    navigate(
      nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname,
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

  // Deep-Linking de Tarea en el hogar (?taskId=<id>, RN-01 / EC-01)
  useEffect(() => {
    const parsed = parseNavigationQuery(location.search);
    const targetTaskId = parsed.taskId;
    if (!targetTaskId) {
      handledTaskIdRef.current = null;
      return;
    }

    const existingTask = byId[targetTaskId];
    if (existingTask) {
      if (handledTaskIdRef.current !== targetTaskId) {
        handledTaskIdRef.current = targetTaskId;
        setFocusedTaskId(targetTaskId);
        setPeekTask(existingTask);
      }
      return;
    }

    if (!loading && handledTaskIdRef.current !== targetTaskId) {
      handledTaskIdRef.current = targetTaskId;
      let cancelled = false;
      api
        .get<Task>(`/tasks/${targetTaskId}`)
        .then((res) => {
          if (cancelled || !res.data?.id) return;
          upsertTask(res.data);
          setFocusedTaskId(res.data.id);
          setPeekTask(res.data);
        })
        .catch(() => {
          if (cancelled) return;
          toast.warning(
            "La tarea solicitada no existe o no está disponible."
          );
          clearTaskIdFromUrl();
        });

      return () => {
        cancelled = true;
      };
    }
  }, [
    location.search,
    byId,
    loading,
    upsertTask,
    setFocusedTaskId,
    toast,
    clearTaskIdFromUrl,
  ]);

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
    const prefs = getViewGroupingPreferences(roomId);
    setGroupBy(prefs.groupBy);
    setSortBy(prefs.sortBy);
    setCollapsedGroupIds(prefs.collapsedGroupIds);
    setCustomSectionsState(getRoomSectionsState(roomId));
  }, [roomId, setRoomId]);

  // Atajos de teclado globales en la vista del hogar para selección múltiple (Ctrl+Shift+A y Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.matches('input, textarea, select, [contenteditable="true"]'))
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllTasks(tasks.map((t) => t.id));
        return;
      }

      const anyModalOpen =
        Boolean(taskToDelete) ||
        Boolean(peekTask) ||
        isMembersModalOpen ||
        isAnalyticsModalOpen ||
        isGamificationModalOpen ||
        isExportModalOpen ||
        isKioskModalOpen;

      if (e.key === "Escape" && !anyModalOpen && tasksUi.selectedTaskIds.length > 0) {
        e.preventDefault();
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    tasks,
    taskToDelete,
    peekTask,
    isMembersModalOpen,
    isAnalyticsModalOpen,
    isGamificationModalOpen,
    isExportModalOpen,
    isKioskModalOpen,
    tasksUi.selectedTaskIds.length,
    selectAllTasks,
    clearSelection,
  ]);

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
        const persistedOrder = getPersistedTaskOrder(roomId);
        if (persistedOrder.length > 0) {
          setCustomTaskOrder(persistedOrder);
        }
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
  }, [roomId, toast, setTasks, setCustomTaskOrder]);

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
    const prev = getTaskById(taskId);
    const prevStatus = prev?.estado ?? "TODO";
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
      const undoOpts = {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void updateTaskOptimistic(
              taskId,
              { estado: prevStatus, completed: prevStatus === "DONE" },
              async (id) =>
                (await api.patch<Task>(`/tasks/${id}/status`, { estado: prevStatus })).data
            ).then(() => {
              if (roomId) {
                cacheManager.updateTaskInCache(roomId, { id: taskId, estado: prevStatus });
              }
              notifyUpdate();
            });
          },
        },
      };
      if (newStatus === "DONE") {
        triggerCelebration();
        toast.success("¡Tarea completada! 🎉", undoOpts);
      } else if (newStatus === "IN_PROGRESS") {
        toast.info("Tarea en progreso 🚀", undoOpts);
      } else {
        toast.info("Tarea movida a Por Hacer", undoOpts);
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
      const undoOpts = {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void toggleCompleteOptimistic(taskId).then(() => {
              if (roomId) {
                cacheManager.updateTaskInCache(roomId, { id: taskId, estado: prev.estado });
              }
              notifyUpdate();
            });
          },
        },
      };
      if (nextStatus === "DONE") {
        triggerCelebration();
        toast.success("¡Tarea completada! 🎉", undoOpts);
      } else {
        toast.info("Tarea movida a Por Hacer", undoOpts);
      }
    }
  };

  const handlePriorityChange = async (taskId: string, nextPeso: number) => {
    const prevPeso = getTaskById(taskId)?.peso ?? 1;
    const ok = await setPriorityOptimistic(taskId, nextPeso);
    if (ok) {
      if (roomId) {
        cacheManager.updateTaskInCache(roomId, { id: taskId, peso: nextPeso });
      }
      notifyUpdate();
      toast.info("Prioridad actualizada", {
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void setPriorityOptimistic(taskId, prevPeso).then(() => {
              if (roomId) {
                cacheManager.updateTaskInCache(roomId, { id: taskId, peso: prevPeso });
              }
              notifyUpdate();
            });
          },
        },
      });
    }
  };

  const handleSnoozeTask = async (
    taskId: string,
    preset: SnoozePresetKey,
    customDate?: string
  ) => {
    const prev = getTaskById(taskId);
    if (!prev) return;
    const prevDue = prev.due_date;
    const prevReminder = prev.reminder_at;
    const { due_date, reminder_at, label } = computeSnoozePresetDate(
      preset,
      new Date(),
      customDate
    );
    const ok = await updateTaskOptimistic(taskId, {
      due_date: due_date ?? undefined,
      reminder_at,
    });
    if (ok) {
      if (roomId) {
        cacheManager.updateTaskInCache(roomId, {
          id: taskId,
          due_date: due_date ?? undefined,
          reminder_at,
        });
      }
      notifyUpdate();
      toast.success(`Tarea pospuesta (${label}) ⏰`, {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void updateTaskOptimistic(taskId, {
              due_date: prevDue,
              reminder_at: prevReminder ?? null,
            }).then(() => notifyUpdate());
          },
        },
      });
    }
  };

  const handleBulkComplete = async () => {
    const count = tasksUi.selectedTaskIds.length;
    if (count === 0) return;
    const res = await batchToggleCompleteOptimistic(
      tasksUi.selectedTaskIds,
      undefined,
      roomId
    );
    if (res.ok) {
      if (res.nextCompleted) {
        triggerCelebration();
      }
      notifyUpdate();
      toast.success(
        res.nextCompleted
          ? `${count} tarea(s) completada(s) 🎉`
          : `${count} tarea(s) reabierta(s)`,
        {
          duration: 6000,
          action: {
            label: "Deshacer",
            onClick: () => {
              void res.undo().then(() => notifyUpdate());
            },
          },
        }
      );
    }
  };

  const handleBulkPriority = async (peso: number, level: TaskPriorityLevel) => {
    const count = tasksUi.selectedTaskIds.length;
    if (count === 0) return;
    const res = await batchUpdateTasksOptimistic(
      tasksUi.selectedTaskIds,
      { peso },
      roomId
    );
    if (res.ok) {
      notifyUpdate();
      toast.info(`Prioridad ${level.toUpperCase()} aplicada a ${count} tarea(s)`, {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void res.undo().then(() => notifyUpdate());
          },
        },
      });
    }
  };

  const handleBulkSnooze = async (preset: SnoozePresetKey, customDate?: string) => {
    const count = tasksUi.selectedTaskIds.length;
    if (count === 0) return;
    const { due_date, reminder_at, label } = computeSnoozePresetDate(
      preset,
      new Date(),
      customDate
    );
    const res = await batchUpdateTasksOptimistic(
      tasksUi.selectedTaskIds,
      { due_date: due_date ?? undefined, reminder_at },
      roomId
    );
    if (res.ok) {
      notifyUpdate();
      toast.success(`${count} tarea(s) pospuesta(s): ${label} ⏰`, {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void res.undo().then(() => notifyUpdate());
          },
        },
      });
    }
  };

  const handleBulkCategory = async (nextCategoria: string) => {
    const count = tasksUi.selectedTaskIds.length;
    if (count === 0) return;
    const res = await batchUpdateTasksOptimistic(
      tasksUi.selectedTaskIds,
      { categoria: nextCategoria },
      roomId
    );
    if (res.ok) {
      notifyUpdate();
      toast.info(`Categoría ${nextCategoria} aplicada a ${count} tarea(s)`, {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void res.undo().then(() => notifyUpdate());
          },
        },
      });
    }
  };

  const handleBulkDelete = async () => {
    const count = tasksUi.selectedTaskIds.length;
    if (count === 0) return;
    const res = await batchDeleteTasksOptimistic(tasksUi.selectedTaskIds, {
      graceMs: 5000,
      roomId,
      onCommitted: (deletedIds) => {
        if (roomId) {
          for (const id of deletedIds) {
            cacheManager.removeTaskFromCache(roomId, id);
          }
        }
        notifyUpdate();
      },
    });
    if (res.ok) {
      toast.success(`${count} tarea(s) eliminada(s)`, {
        duration: 5500,
        action: {
          label: "Deshacer",
          onClick: () => {
            void res.undo().then(() => notifyUpdate());
          },
        },
      });
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
    const snapshot = {
      task: { ...taskToDelete },
      index: Math.max(0, taskIdsOrder.indexOf(id)),
    };
    setDeletingId(id);
    setTaskToDelete(null);
    const ok = await deleteTaskOptimistic(id);
    setDeletingId(null);
    if (ok) {
      if (roomId) {
        cacheManager.removeTaskFromCache(roomId, id);
      }
      notifyUpdate();
      toast.success("Tarea eliminada correctamente", {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            restoreTasksSnapshot([snapshot]);
            if (roomId) {
              cacheManager.addTaskToCache(roomId, snapshot.task);
            }
            void api
              .post("/tasks/", {
                titulo: snapshot.task.titulo,
                descripcion: snapshot.task.descripcion ?? null,
                categoria: snapshot.task.categoria,
                estado: snapshot.task.estado,
                peso: snapshot.task.peso,
                due_date: snapshot.task.due_date ?? null,
                reminder_at: snapshot.task.reminder_at ?? null,
              })
              .then(() => notifyUpdate())
              .catch(() => {});
          },
        },
      });
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

  const sortedTasks = useMemo(
    () => sortTasksCollection(tasks, sortBy, "asc", taskIdsOrder),
    [tasks, sortBy, taskIdsOrder]
  );

  const taskGroups = useMemo(
    () =>
      groupBy === "none"
        ? undefined
        : groupAndSortTasks(tasks, {
            groupBy,
            sortBy,
            sortDirection: "asc",
            manualOrderIds: taskIdsOrder,
            customSectionsState,
            assigneesMap,
          }),
    [tasks, groupBy, sortBy, taskIdsOrder, customSectionsState, assigneesMap]
  );

  const handleGroupByChange = useCallback(
    (nextMode: TaskGroupByMode) => {
      setGroupBy(nextMode);
      saveViewGroupingPreferences(roomId, { groupBy: nextMode });
    },
    [roomId]
  );

  const handleSortByChange = useCallback(
    (nextSort: TaskSortByMode) => {
      setSortBy(nextSort);
      saveViewGroupingPreferences(roomId, { sortBy: nextSort });
    },
    [roomId]
  );

  const handleToggleCollapseGroup = useCallback(
    (groupId: string) => {
      setCollapsedGroupIds((prev) => {
        const next = prev.includes(groupId)
          ? prev.filter((id) => id !== groupId)
          : [...prev, groupId];
        saveViewGroupingPreferences(roomId, { collapsedGroupIds: next });
        return next;
      });
    },
    [roomId]
  );

  const handleAddCustomSection = useCallback(
    (rawName: string) => {
      const trimmed = rawName.trim();
      if (!trimmed) return;
      const { state: nextState, created } = createCustomSection(roomId, trimmed);
      setCustomSectionsState(nextState);
      setNewRoomSectionName("");
      if (created) {
        toast.success(`Sección "${created.name}" creada`);
      }
    },
    [roomId, toast]
  );

  const handleRenameCustomSection = useCallback(
    (sectionId: string, nextName: string) => {
      const nextState = renameCustomSection(roomId, sectionId, nextName);
      setCustomSectionsState(nextState);
      toast.info(`Sección renombrada a "${nextName}"`);
    },
    [roomId, toast]
  );

  const handleDeleteCustomSection = useCallback(
    (sectionId: string) => {
      const prevState = customSectionsState;
      const targetSec = prevState.sections.find((s) => s.id === sectionId);
      const nextState = deleteCustomSection(roomId, sectionId);
      setCustomSectionsState(nextState);
      toast.info(
        `Sección "${targetSec?.name ?? sectionId}" eliminada (las tareas volvieron a General)`,
        {
          duration: 6000,
          action: {
            label: "Deshacer",
            onClick: () => {
              saveRoomSectionsState(roomId, prevState);
              setCustomSectionsState(prevState);
            },
          },
        }
      );
    },
    [customSectionsState, roomId, toast]
  );

  const handleReorderTasks = useCallback(
    (sourceTaskId: string, targetTaskId: string, position: "before" | "after" = "before") => {
      const res = reorderTasks(sourceTaskId, targetTaskId, position, roomId);
      if (res.ok) {
        if (sortBy !== "manual") {
          setSortBy("manual");
          saveViewGroupingPreferences(roomId, { sortBy: "manual" });
        }
        toast.info("Orden de tarea actualizado", {
          duration: 5000,
          action: {
            label: "Deshacer",
            onClick: () => res.undo(),
          },
        });
      }
    },
    [reorderTasks, roomId, sortBy, toast]
  );

  const handleMoveTaskOrder = useCallback(
    (taskId: string, direction: "up" | "down") => {
      const res = moveTaskOrderByKeyboard(
        taskId,
        direction,
        sortedTasks.map((t) => t.id),
        roomId
      );
      if (res.ok) {
        if (sortBy !== "manual") {
          setSortBy("manual");
          saveViewGroupingPreferences(roomId, { sortBy: "manual" });
        }
        toast.info(
          direction === "up"
            ? "Tarea movida hacia arriba (Alt+↑)"
            : "Tarea movida hacia abajo (Alt+↓)",
          {
            duration: 5000,
            action: {
              label: "Deshacer",
              onClick: () => res.undo(),
            },
          }
        );
      }
    },
    [moveTaskOrderByKeyboard, sortedTasks, roomId, sortBy, toast]
  );

  const handleDropTaskInGroup = useCallback(
    async (taskId: string, group: TaskGroupSection) => {
      const mutation = group.dropMutation;
      if (!mutation) return;

      if (mutation.customSectionId !== undefined) {
        const prevState = customSectionsState;
        const nextState = assignTaskToCustomSection(
          roomId,
          taskId,
          mutation.customSectionId
        );
        setCustomSectionsState(nextState);
        toast.success(`Tarea movida a ${mutation.descriptionLabel}`, {
          duration: 5500,
          action: {
            label: "Deshacer",
            onClick: () => {
              saveRoomSectionsState(roomId, prevState);
              setCustomSectionsState(prevState);
            },
          },
        });
        return;
      }

      if (mutation.assignee !== undefined && mutation.assignee !== null) {
        await handleAssignMemberToTask(taskId, mutation.assignee);
        return;
      }

      if (mutation.patch) {
        const prevTask = getTaskById(taskId);
        if (!prevTask) return;
        const snapshot: Partial<Task> = {};
        for (const k of Object.keys(mutation.patch) as Array<keyof Task>) {
          (snapshot as Record<keyof Task, unknown>)[k] = prevTask[k];
        }
        const ok = await updateTaskOptimistic(taskId, mutation.patch);
        if (ok) {
          if (roomId) {
            cacheManager.updateTaskInCache(roomId, {
              id: taskId,
              ...mutation.patch,
            });
          }
          notifyUpdate();
          toast.success(`Tarea movida a ${mutation.descriptionLabel}`, {
            duration: 5500,
            action: {
              label: "Deshacer",
              onClick: () => {
                void updateTaskOptimistic(taskId, snapshot).then(() =>
                  notifyUpdate()
                );
              },
            },
          });
        }
      }
    },
    [
      customSectionsState,
      getTaskById,
      handleAssignMemberToTask,
      notifyUpdate,
      roomId,
      toast,
      updateTaskOptimistic,
    ]
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

          {/* Selectores de Agrupación y Ordenación en el Hogar */}
          <select
            className="filter-select"
            aria-label="Agrupar tareas por"
            data-testid="filter-groupby-select"
            value={groupBy}
            onChange={(e) => handleGroupByChange(e.target.value as TaskGroupByMode)}
          >
            <option value="none">Agrupar: Ninguno</option>
            <option value="custom_section">Agrupar: Secciones del Hogar</option>
            <option value="due_date">Agrupar: Fecha límite</option>
            <option value="priority">Agrupar: Prioridad (P1-P4)</option>
            <option value="category">Agrupar: Categoría</option>
            <option value="status">Agrupar: Estado</option>
            <option value="assignee">Agrupar: Asignado</option>
          </select>

          <select
            className="filter-select"
            aria-label="Ordenar tareas por"
            data-testid="filter-sortby-select"
            value={sortBy}
            onChange={(e) => handleSortByChange(e.target.value as TaskSortByMode)}
          >
            <option value="manual">Ordenar: Manual (Drag &amp; Drop)</option>
            <option value="priority">Ordenar: Prioridad (P1 → P4)</option>
            <option value="due_date">Ordenar: Fecha de vencimiento</option>
            <option value="title">Ordenar: Alfabético (A → Z)</option>
            <option value="created_at">Ordenar: Más recientes</option>
          </select>

          {groupBy === "custom_section" && (
            <div className="d-inline-flex align-items-center gap-1">
              <input
                type="text"
                className="filter-select"
                style={{ width: "160px", cursor: "text" }}
                placeholder="Nueva sección..."
                aria-label="Nombre de nueva sección del hogar"
                data-testid="add-custom-section-input"
                value={newRoomSectionName}
                onChange={(e) => setNewRoomSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomSection(newRoomSectionName);
                  }
                }}
              />
              <button
                type="button"
                className="filter-chip active d-inline-flex align-items-center gap-1"
                style={{ height: "36px", padding: "0 10px" }}
                onClick={() => handleAddCustomSection(newRoomSectionName)}
                data-testid="add-custom-section-btn"
              >
                <LuPlus size={14} aria-hidden="true" />
                <span>+ Sección</span>
              </button>
            </div>
          )}

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
      ) : sortedTasks.length === 0 &&
        !(viewMode === "list" && groupBy === "custom_section" && customSectionsState.sections.length > 0) ? (
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
          {sortedTasks.map((task) => (
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
          tasks={sortedTasks}
          groups={taskGroups}
          collapsedGroupIds={collapsedGroupIds}
          onToggleCollapseGroup={handleToggleCollapseGroup}
          onDropTaskInGroup={handleDropTaskInGroup}
          onReorderTasks={handleReorderTasks}
          onMoveTaskOrder={handleMoveTaskOrder}
          onRenameCustomSection={handleRenameCustomSection}
          onDeleteCustomSection={handleDeleteCustomSection}
          onComplete={handleToggleComplete}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          onAdvance={handleAdvanceTask}
          onPriorityChange={handlePriorityChange}
          onSnoozeTask={handleSnoozeTask}
          completingId={completingId}
          deletingId={deletingId}
          pendingById={pendingById}
          focusedTaskId={tasksUi.focusedTaskId}
          selectedTaskIds={tasksUi.selectedTaskIds}
          onFocusTask={setFocusedTaskId}
          onNavigateFocus={moveFocus}
          onToggleSelect={toggleSelectTask}
          onSelectRange={(targetId) =>
            selectTaskRange(
              targetId,
              undefined,
              sortedTasks.map((t) => t.id)
            )
          }
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

      {/* Barra Flotante de Acciones en Lote (Multi-Selección) */}
      <TaskBulkActionsBar
        selectedCount={tasksUi.selectedTaskIds.length}
        totalVisibleCount={tasks.length}
        allSelectedCompleted={
          tasksUi.selectedTaskIds.length > 0 &&
          tasksUi.selectedTaskIds.every((id) => {
            const t = byId[id];
            return t && (t.estado === "DONE" || Boolean(t.completed));
          })
        }
        onSelectAll={() => selectAllTasks(tasks.map((t) => t.id))}
        onClearSelection={clearSelection}
        onBulkComplete={handleBulkComplete}
        onBulkPriority={handleBulkPriority}
        onBulkSnooze={handleBulkSnooze}
        onBulkCategory={handleBulkCategory}
        onBulkDelete={handleBulkDelete}
      />

      {/* Slide-Over Task Peek Drawer (Edición y detalle sin cambio de página) */}
      <TaskPeekDrawer
        task={peekTask ? (byId[peekTask.id] ?? peekTask) : null}
        isOpen={Boolean(peekTask)}
        onClose={() => {
          setPeekTask(null);
          clearTaskIdFromUrl();
        }}
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
