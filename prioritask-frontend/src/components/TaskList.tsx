import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import api from "../api";
import { useNavigate, useLocation, Link } from "react-router-dom";
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
import {
  useTasksState,
  computeSnoozePresetDate,
  type SnoozePresetKey,
  type TaskPriorityLevel,
} from "../hooks/useTasksState";
import {
  parseNavigationQuery,
  priorityCodeToWeightRange,
} from "../utils/navigationRouter";
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
import FilterBar from "./tasks/FilterBar";
import QuickAddTaskBar from "./tasks/QuickAddTaskBar";
import TaskPeekDrawer from "./tasks/TaskPeekDrawer";
import TaskBulkActionsBar from "./tasks/TaskBulkActionsBar";
import {
  LuPlus,
  LuSparkles,
  LuListTodo,
  LuCircleCheck,
  LuRadio,
} from "react-icons/lu";
import "./tasks/tasks.css";

const TaskList = () => {
  const location = useLocation();
  const initialQuery = useMemo(
    () => parseNavigationQuery(location.search),
    // Solo evaluar en montaje inicial; cambios posteriores los maneja el useEffect de location.search
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState(initialQuery.estado);
  const [categoria, setCategoria] = useState(initialQuery.categoria);
  const [fechaLimite, setFechaLimite] = useState(initialQuery.fechaLimite);
  const [priorityFilter, setPriorityFilter] = useState<string>(
    initialQuery.priority
  );
  const [busqueda, setBusqueda] = useState(initialQuery.q);
  const [debouncedBusqueda, setDebouncedBusqueda] = useState(initialQuery.q);

  const prevHadUrlFiltersRef = useRef<boolean>(
    Boolean(
      initialQuery.view ||
        initialQuery.estado ||
        initialQuery.categoria ||
        initialQuery.fechaLimite ||
        initialQuery.priority ||
        initialQuery.q
    )
  );
  const handledTaskIdRef = useRef<string | null>(null);

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
    ids: taskIdsOrder,
    tasks: tareas,
    pendingById,
    ui: tasksUi,
    getTaskById,
    setTasks: setTareas,
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

  useEffect(() => {
    const prefs = getViewGroupingPreferences(roomId);
    setGroupBy(prefs.groupBy);
    setSortBy(prefs.sortBy);
    setCollapsedGroupIds(prefs.collapsedGroupIds);
    setCustomSectionsState(getRoomSectionsState(roomId));
  }, [roomId]);

  const { isConnected: isLiveConnected } = useRoomEvents(roomId, reconcileLiveEvent);

  const parsedQuery = useMemo(
    () => parseNavigationQuery(location.search),
    [location.search]
  );

  // Sincronizar filtros cuando cambia location.search (Vistas Inteligentes Hoy / Próximo / Completadas / Filtros URL)
  useEffect(() => {
    const parsed = parseNavigationQuery(location.search);
    const hasFilterParams = Boolean(
      parsed.view ||
        parsed.estado ||
        parsed.categoria ||
        parsed.fechaLimite ||
        parsed.priority ||
        parsed.q
    );

    if (hasFilterParams) {
      prevHadUrlFiltersRef.current = true;
      setEstado(parsed.estado);
      setCategoria(parsed.categoria);
      setFechaLimite(parsed.fechaLimite);
      setPriorityFilter(parsed.priority);
      setBusqueda(parsed.q);
      setDebouncedBusqueda(parsed.q);
    } else if (prevHadUrlFiltersRef.current && !parsed.taskId) {
      prevHadUrlFiltersRef.current = false;
      setEstado("");
      setCategoria("");
      setFechaLimite("");
      setPriorityFilter("");
      setBusqueda("");
      setDebouncedBusqueda("");
    }
  }, [location.search]);

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

  // Deep-Linking de Tarea (?taskId=<id>, RN-01 / EC-01)
  useEffect(() => {
    const targetTaskId = parsedQuery.taskId;
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
    parsedQuery.taskId,
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
      const persistedOrder = getPersistedTaskOrder(roomId);
      if (persistedOrder.length > 0) {
        setCustomTaskOrder(persistedOrder);
      }
    } catch (error) {
      console.error("Error al cargar tareas:", error);
    } finally {
      setLoading(false);
    }
  }, [estado, categoria, fechaLimite, debouncedBusqueda, roomId, setTareas, setCustomTaskOrder]);

  useEffect(() => {
    fetchTareas();
  }, [fetchTareas, version]);

  // Atajos de teclado globales en la vista para selección múltiple (Ctrl+Shift+A y Escape)
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
        selectAllTasks(tareas.map((t) => t.id));
        return;
      }

      if (
        e.key === "Escape" &&
        !taskToDelete &&
        !peekTask &&
        tasksUi.selectedTaskIds.length > 0
      ) {
        e.preventDefault();
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tareas, taskToDelete, peekTask, tasksUi.selectedTaskIds.length, selectAllTasks, clearSelection]);

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
      notifyUpdate();
      toast.success("Tarea eliminada correctamente", {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            restoreTasksSnapshot([snapshot]);
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
            ).then(() => notifyUpdate());
          },
        },
      };
      if (newStatus === "DONE") {
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
      notifyUpdate();
      const undoOpts = {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void toggleCompleteOptimistic(taskId).then(() => notifyUpdate());
          },
        },
      };
      if (nextStatus === "DONE") {
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
      notifyUpdate();
      toast.info("Prioridad actualizada", {
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void setPriorityOptimistic(taskId, prevPeso).then(() => notifyUpdate());
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
      onCommitted: () => notifyUpdate(),
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
    setPriorityFilter("");
    setBusqueda("");
    setDebouncedBusqueda("");
    prevHadUrlFiltersRef.current = false;
    if (location.search) {
      const params = new URLSearchParams(location.search);
      const keepTaskId = params.get("taskId");
      navigate(
        keepTaskId
          ? `${location.pathname}?taskId=${encodeURIComponent(keepTaskId)}`
          : location.pathname,
        { replace: true }
      );
    }
  };

  const filteredTareas = useMemo(() => {
    if (!priorityFilter) return tareas;
    const range = priorityCodeToWeightRange(priorityFilter);
    if (range.pesoMin === null || range.pesoMax === null) return tareas;
    return tareas.filter(
      (t) => t.peso >= range.pesoMin! && t.peso <= range.pesoMax!
    );
  }, [tareas, priorityFilter]);

  const visibleTareas = useMemo(
    () => sortTasksCollection(filteredTareas, sortBy, "asc", taskIdsOrder),
    [filteredTareas, sortBy, taskIdsOrder]
  );

  const taskGroups = useMemo(
    () =>
      groupBy === "none"
        ? undefined
        : groupAndSortTasks(filteredTareas, {
            groupBy,
            sortBy,
            sortDirection: "asc",
            manualOrderIds: taskIdsOrder,
            customSectionsState,
          }),
    [filteredTareas, groupBy, sortBy, taskIdsOrder, customSectionsState]
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
    (sectionName: string) => {
      const { state: nextState, created } = createCustomSection(roomId, sectionName);
      setCustomSectionsState(nextState);
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
        visibleTareas.map((t) => t.id),
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
    [moveTaskOrderByKeyboard, visibleTareas, roomId, sortBy, toast]
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

      if (mutation.patch) {
        const prevTask = getTaskById(taskId);
        if (!prevTask) return;
        const snapshot: Partial<Task> = {};
        for (const k of Object.keys(mutation.patch) as Array<keyof Task>) {
          (snapshot as Record<keyof Task, unknown>)[k] = prevTask[k];
        }
        const ok = await updateTaskOptimistic(taskId, mutation.patch);
        if (ok) {
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
    [customSectionsState, getTaskById, notifyUpdate, roomId, toast, updateTaskOptimistic]
  );

  const smartViewLabel =
    parsedQuery.view === "today"
      ? "Vista: Hoy"
      : parsedQuery.view === "upcoming"
        ? "Vista: Próximos 7 días"
        : parsedQuery.view === "completed"
          ? "Vista: Completadas"
          : null;

  const allSelectedCompleted =
    tasksUi.selectedTaskIds.length > 0 &&
    tasksUi.selectedTaskIds.every((id) => {
      const t = byId[id];
      return t && (t.estado === "DONE" || Boolean(t.completed));
    });

  return (
    <div className="container-fluid py-2">
      {/* Cabecera de la vista de Tareas */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold" style={{ fontSize: "24px" }}>
            <LuListTodo className="text-primary" size={26} aria-hidden="true" />
            <span>Listado de Tareas</span>
            {smartViewLabel && (
              <span
                className="badge rounded-pill bg-primary-subtle text-primary border border-primary-subtle py-1 px-2 ms-1"
                style={{ fontSize: "12px", fontWeight: 600 }}
                data-testid="smart-view-badge"
              >
                {smartViewLabel}
              </span>
            )}
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
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        groupBy={groupBy}
        onGroupByChange={handleGroupByChange}
        sortBy={sortBy}
        onSortByChange={handleSortByChange}
        onAddCustomSection={handleAddCustomSection}
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
      ) : visibleTareas.length === 0 &&
        !(viewMode === "list" && groupBy === "custom_section" && customSectionsState.sections.length > 0) ? (
        <div className="p-4 text-center my-4">
          <EmptyState
            icon={<LuCircleCheck size={32} style={{ color: "#10b981" }} />}
            badge="TODO AL DÍA"
            title="¡No hay tareas pendientes!"
            description={
              estado || categoria || fechaLimite || busqueda || priorityFilter
                ? "No se encontraron tareas con los filtros aplicados. Intenta restablecer los filtros."
                : "No hay tareas registradas en este hogar. Crea la primera tarea para comenzar."
            }
            actionLabel={
              estado || categoria || fechaLimite || busqueda || priorityFilter
                ? "Limpiar filtros"
                : "+ Crear nueva tarea"
            }
            onAction={
              estado || categoria || fechaLimite || busqueda || priorityFilter
                ? handleClearFilters
                : () => navigate("/tasks/create")
            }
          />
        </div>
      ) : viewMode === "grid" ? (
        <div className="row g-3">
          {visibleTareas.map((tarea) => (
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
          tasks={visibleTareas}
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
              visibleTareas.map((t) => t.id)
            )
          }
        />
      ) : viewMode === "calendar" ? (
        <TaskCalendarView
          tasks={visibleTareas}
          onComplete={handleToggleComplete}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      ) : (
        <TaskKanbanBoard
          tasks={visibleTareas}
          onStatusChange={handleStatusChange}
          onEdit={(t) => setPeekTask(t)}
          onDelete={promptDelete}
          completingId={completingId}
          deletingId={deletingId}
        />
      )}

      {/* Barra Flotante de Acciones en Lote (Multi-Selección) */}
      <TaskBulkActionsBar
        selectedCount={tasksUi.selectedTaskIds.length}
        totalVisibleCount={visibleTareas.length}
        allSelectedCompleted={allSelectedCompleted}
        onSelectAll={() => selectAllTasks(visibleTareas.map((t) => t.id))}
        onClearSelection={clearSelection}
        onBulkComplete={handleBulkComplete}
        onBulkPriority={handleBulkPriority}
        onBulkSnooze={handleBulkSnooze}
        onBulkCategory={handleBulkCategory}
        onBulkDelete={handleBulkDelete}
      />

      {/* Slide-Over Task Peek Drawer (Edición y detalle sin cambio de ruta) */}
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
