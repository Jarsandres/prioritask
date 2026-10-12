import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useA11yModal from "../../hooks/useA11yModal";
import {
  LuSearch,
  LuX,
  LuSquareCheck,
  LuHouse,
  LuPlus,
  LuChartBar,
  LuTrophy,
  LuKeyboard,
  LuClock,
  LuTag,
  LuUser,
  LuArrowRight,
  LuLoader,
  LuCalendarCheck,
  LuCalendarRange,
  LuCircleCheck,
  LuSun,
  LuMoon,
  LuFlame,
  LuCheck,
} from "react-icons/lu";
import api from "../../api";
import { useRoom } from "../../context/RoomContext";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../context/ToastContext";
import { useTaskUpdate } from "../../context/TaskUpdateContext";
import { cacheManager, searchLRUCache } from "../../services/cacheManager";
import { enqueueMutation } from "../../services/offlineQueue";
import {
  navigateTo,
  parseCommandPaletteInput,
  priorityCodeToWeightRange,
  weightToPriorityBadge,
} from "../../utils/navigationRouter";
import type { TaskSearchResponse, SearchResultItem } from "../../types/search";
import type { Room, Tag, Task, TaskStatus } from "../../types/task";
import "./CommandPaletteModal.css";

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGamification?: () => void;
  onOpenShortcuts?: () => void;
  onOpenQuickAdd?: () => void;
}

interface ActionCommandItem {
  id: string;
  type: "action";
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action: () => void;
}

interface RoomCommandItem {
  id: string;
  type: "room";
  title: string;
  subtitle: string;
  room: Room;
  action: () => void;
}

interface TagCommandItem {
  id: string;
  type: "tag";
  title: string;
  subtitle: string;
  tag: Tag;
  action: () => void;
}

interface TaskCommandItem {
  id: string;
  type: "task";
  title: string;
  subtitle: string;
  searchItem: SearchResultItem;
  action: () => void;
}

type PaletteCommandItem =
  | ActionCommandItem
  | RoomCommandItem
  | TagCommandItem
  | TaskCommandItem;

export const CommandPaletteModal = ({
  isOpen,
  onClose,
  onOpenGamification,
  onOpenShortcuts,
  onOpenQuickAdd,
}: CommandPaletteModalProps) => {
  const navigate = useNavigate();
  const { rooms, activeRoom, selectRoom } = useRoom();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { notifyUpdate } = useTaskUpdate();

  const [query, setQuery] = useState("");
  const [taskResults, setTaskResults] = useState<SearchResultItem[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useA11yModal({
    isOpen,
    onClose,
    modalRef,
    initialFocusRef: inputRef,
  });

  const parsedInput = useMemo(() => parseCommandPaletteInput(query), [query]);

  // Autoenfocar input y cargar etiquetas al abrir
  useEffect(() => {
    if (!isOpen) return;

    setQuery("");
    setTaskResults([]);
    setSelectedIndex(0);
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    const controller = new AbortController();
    api
      .get<Tag[]>("/tags", { signal: controller.signal })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setAvailableTags(res.data);
        }
      })
      .catch(() => {
        // Manejo silencioso si falla la carga opcional de etiquetas
      });

    return () => {
      clearTimeout(focusTimer);
      controller.abort();
    };
  }, [isOpen]);

  // Acción rápida inline: Completar o reabrir tarea sin cerrar la paleta (RN-02)
  const handleInlineToggleTaskComplete = useCallback(
    async (task: Task, e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();

      const wasDone = task.estado === "DONE" || Boolean(task.completed);
      const nextEstado: TaskStatus = wasDone ? "TODO" : "DONE";
      const nextCompleted = !wasDone;

      const applyLocalTaskState = (
        targetId: string,
        estadoVal: TaskStatus,
        completedVal: boolean
      ) => {
        setTaskResults((prev) =>
          prev.map((item) =>
            item.task.id === targetId
              ? {
                  ...item,
                  task: {
                    ...item.task,
                    estado: estadoVal,
                    completed: completedVal,
                  },
                }
              : item
          )
        );
        if (task.room_id) {
          cacheManager.updateTaskInCache(task.room_id, {
            id: targetId,
            estado: estadoVal,
            completed: completedVal,
          });
        }
      };

      // Actualización optimista inmediata
      applyLocalTaskState(task.id, nextEstado, nextCompleted);

      try {
        await api.patch<Task>(`/tasks/${task.id}`, {
          estado: nextEstado,
          completed: nextCompleted,
        });
      } catch (err: unknown) {
        const isNetworkError =
          typeof err === "object" &&
          err !== null &&
          !("response" in err && (err as { response?: unknown }).response);
        if (isNetworkError) {
          await enqueueMutation({
            url: `/tasks/${task.id}`,
            method: "PATCH",
            data: { estado: nextEstado, completed: nextCompleted },
          });
        } else {
          // Revertir si hubo error de servidor (4xx/5xx)
          applyLocalTaskState(task.id, task.estado, Boolean(task.completed));
          toast.error("No se pudo actualizar el estado de la tarea.");
          return;
        }
      }

      notifyUpdate();
      toast.success(wasDone ? "Tarea reabierta" : "Tarea completada", {
        duration: 6000,
        action: {
          label: "Deshacer",
          onClick: () => {
            applyLocalTaskState(task.id, task.estado, Boolean(task.completed));
            void api
              .patch<Task>(`/tasks/${task.id}`, {
                estado: task.estado,
                completed: Boolean(task.completed),
              })
              .then(() => notifyUpdate())
              .catch(() => {});
          },
        },
      });
    },
    [notifyUpdate, toast]
  );

  // Lista base de acciones rápidas estilo Todoist Desktop
  const defaultActions: ActionCommandItem[] = useMemo(() => {
    return [
      {
        id: "act-quick-add",
        type: "action",
        title: "Captura Rápida (Quick Add)",
        subtitle: "Abrir ventana flotante de creación con NLP (C / Ctrl+Espacio)",
        icon: <LuPlus size={18} />,
        action: () => {
          onClose();
          if (onOpenQuickAdd) {
            onOpenQuickAdd();
          } else {
            navigate("/tasks/create");
          }
        },
      },
      {
        id: "act-view-today",
        type: "action",
        title: "Ir a Hoy",
        subtitle: "Ver tareas que vencen hoy (/tasks?view=today)",
        icon: <LuCalendarCheck size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "today" } });
        },
      },
      {
        id: "act-view-upcoming",
        type: "action",
        title: "Ir a Próximo (7 días)",
        subtitle: "Ver agenda de tareas de los próximos 7 días (/tasks?view=upcoming)",
        icon: <LuCalendarRange size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "upcoming" } });
        },
      },
      {
        id: "act-view-completed",
        type: "action",
        title: "Ver Tareas Completadas",
        subtitle: "Consultar tareas finalizadas (/tasks?view=completed)",
        icon: <LuCircleCheck size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "completed" } });
        },
      },
      {
        id: "act-toggle-theme",
        type: "action",
        title: "Alternar Tema Claro / Oscuro",
        subtitle: `Cambiar apariencia actual (${
          theme === "dark" ? "Oscuro → Claro" : "Claro → Oscuro"
        })`,
        icon: theme === "dark" ? <LuSun size={18} /> : <LuMoon size={18} />,
        action: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "act-priority-p1",
        type: "action",
        title: "Filtrar Prioridad P1 (Urgente)",
        subtitle: "Ver tareas de máxima urgencia (/tasks?priority=p1)",
        icon: <LuFlame size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "priority", priority: "p1" } });
        },
      },
      {
        id: "act-priority-p2",
        type: "action",
        title: "Filtrar Prioridad P2 (Alta)",
        subtitle: "Ver tareas de prioridad alta (/tasks?priority=p2)",
        icon: <LuFlame size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "priority", priority: "p2" } });
        },
      },
      {
        id: "act-create-task",
        type: "action",
        title: "Nueva Tarea (Formulario Completo)",
        subtitle: "Crear una nueva tarea avanzada en el hogar",
        icon: <LuPlus size={18} />,
        action: () => {
          onClose();
          navigate("/tasks/create");
        },
      },
      {
        id: "act-all-tasks",
        type: "action",
        title: "Mis Tareas Generales",
        subtitle: "Ver listado personal de tareas pendientes",
        icon: <LuSquareCheck size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "inbox" } });
        },
      },
      {
        id: "act-gamification",
        type: "action",
        title: "Rachas y Recompensas",
        subtitle: "Ver tabla de clasificación y tienda de premios",
        icon: <LuTrophy size={18} />,
        action: () => {
          onClose();
          if (onOpenGamification) {
            onOpenGamification();
          }
        },
      },
      {
        id: "act-analytics",
        type: "action",
        title: "Ver Analíticas",
        subtitle: "Gráficos de productividad y tasa de completado",
        icon: <LuChartBar size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "dashboard" } });
        },
      },
      {
        id: "act-history",
        type: "action",
        title: "Historial de Actividad",
        subtitle: "Auditoría de cambios y eventos recientes",
        icon: <LuClock size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "history" } });
        },
      },
      {
        id: "act-tags",
        type: "action",
        title: "Gestionar Etiquetas",
        subtitle: "Crear y organizar tags de tareas",
        icon: <LuTag size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "tag" } });
        },
      },
      {
        id: "act-profile",
        type: "action",
        title: "Mi Perfil de Usuario",
        subtitle: "Configuración de cuenta e información personal",
        icon: <LuUser size={18} />,
        action: () => {
          onClose();
          navigateTo(navigate, { view: { type: "profile" } });
        },
      },
      {
        id: "act-shortcuts",
        type: "action",
        title: "Atajos de Teclado",
        subtitle: "Ver guía de accesibilidad y teclas de acceso rápido",
        icon: <LuKeyboard size={18} />,
        action: () => {
          onClose();
          if (onOpenShortcuts) {
            onOpenShortcuts();
          }
        },
      },
    ];
  }, [
    navigate,
    onClose,
    onOpenGamification,
    onOpenShortcuts,
    onOpenQuickAdd,
    theme,
    toggleTheme,
  ]);

  // Lista de salas disponibles (filtradas según modo semántico `#` o general)
  const roomItems: RoomCommandItem[] = useMemo(() => {
    if (
      parsedInput.mode === "actions" ||
      parsedInput.mode === "tags" ||
      parsedInput.mode === "priority"
    ) {
      return [];
    }

    const qLower = parsedInput.cleanQuery.toLowerCase();
    const filteredRooms = qLower
      ? rooms.filter((r) => r.nombre.toLowerCase().includes(qLower))
      : rooms;

    return filteredRooms.map((room) => ({
      id: `room-${room.id}`,
      type: "room",
      title: room.nombre,
      subtitle:
        room.id === activeRoom?.id
          ? "Hogar activo actualmente"
          : "Cambiar y ver tareas de este hogar",
      room,
      action: () => {
        selectRoom(room.id);
        onClose();
        navigateTo(navigate, { view: { type: "room", roomId: room.id } });
      },
    }));
  }, [rooms, parsedInput, activeRoom, selectRoom, onClose, navigate]);

  // Lista de etiquetas disponibles (`@tag`)
  const tagItems: TagCommandItem[] = useMemo(() => {
    if (parsedInput.mode !== "tags" && parsedInput.mode !== "all") {
      return [];
    }
    const qLower = parsedInput.cleanQuery.toLowerCase();
    if (parsedInput.mode === "all" && !qLower) {
      return [];
    }
    const matched = qLower
      ? availableTags.filter((t) => t.nombre.toLowerCase().includes(qLower))
      : availableTags;

    return matched.map((tag) => ({
      id: `tag-${tag.id}`,
      type: "tag",
      title: `@${tag.nombre}`,
      subtitle: `Filtrar por etiqueta "${tag.nombre}"`,
      tag,
      action: () => {
        onClose();
        navigateTo(navigate, { view: { type: "tag", tagName: tag.nombre } });
      },
    }));
  }, [availableTags, parsedInput, onClose, navigate]);

  // Filtrado de acciones rápidas por query y modo semántico
  const filteredActions = useMemo(() => {
    if (parsedInput.mode === "rooms" || parsedInput.mode === "tags") {
      return [];
    }
    if (parsedInput.mode === "priority" && parsedInput.priorityFilter) {
      const prioCode = parsedInput.priorityFilter.toLowerCase();
      return defaultActions.filter((a) =>
        a.title.toLowerCase().includes(prioCode)
      );
    }

    const qLower = parsedInput.cleanQuery.toLowerCase();
    if (!qLower) return defaultActions;
    return defaultActions.filter(
      (a) =>
        a.title.toLowerCase().includes(qLower) ||
        a.subtitle.toLowerCase().includes(qLower)
    );
  }, [defaultActions, parsedInput]);

  // Conversión de resultados de búsqueda de tareas con apertura directa en TaskPeekDrawer (RN-01)
  const taskCommandItems: TaskCommandItem[] = useMemo(() => {
    if (parsedInput.mode === "actions" || parsedInput.mode === "rooms") {
      return [];
    }

    let items = taskResults;
    if (parsedInput.mode === "priority" && parsedInput.priorityFilter) {
      const range = priorityCodeToWeightRange(parsedInput.priorityFilter);
      if (range.pesoMin !== null && range.pesoMax !== null) {
        items = items.filter(
          (item) =>
            item.task.peso >= range.pesoMin! && item.task.peso <= range.pesoMax!
        );
      }
    }

    return items.map((item) => ({
      id: `task-${item.task.id}`,
      type: "task",
      title: item.task.titulo,
      subtitle: item.task.descripcion
        ? item.task.descripcion.substring(0, 80)
        : `Categoría: ${item.task.categoria || "General"}`,
      searchItem: item,
      action: () => {
        onClose();
        if (item.task.room_id) {
          selectRoom(item.task.room_id);
        }
        navigateTo(navigate, {
          task: {
            id: item.task.id,
            roomId: item.task.room_id,
          },
        });
      },
    }));
  }, [taskResults, parsedInput, onClose, selectRoom, navigate]);

  // Búsqueda Multi-Capa (Capa 1: In-Memory 0ms, Capa 2: LRU Cache, Capa 3: Backend Debounced 150ms)
  useEffect(() => {
    if (parsedInput.mode === "actions" || parsedInput.mode === "rooms") {
      setTaskResults([]);
      setLoading(false);
      return;
    }

    const searchText = parsedInput.cleanQuery;
    const isPriorityOnlySearch =
      parsedInput.mode === "priority" &&
      Boolean(parsedInput.priorityFilter) &&
      !searchText;

    if (!searchText && !isPriorityOnlySearch) {
      setTaskResults([]);
      setLoading(false);
      return;
    }

    const qLower = searchText.toLowerCase();
    const prioRange = parsedInput.priorityFilter
      ? priorityCodeToWeightRange(parsedInput.priorityFilter)
      : null;

    // ── CAPA 1 (0 ms): Búsqueda inmediata síncrona en memoria sobre tareas cacheadas ──
    const allCached = cacheManager.getAllCachedTasks();
    const layer1Matches: SearchResultItem[] = allCached
      .filter((t) => {
        const matchesPrio =
          !prioRange ||
          prioRange.pesoMin === null ||
          prioRange.pesoMax === null ||
          (t.peso >= prioRange.pesoMin && t.peso <= prioRange.pesoMax);
        if (!matchesPrio) return false;
        if (!qLower) return true;
        return (
          t.titulo.toLowerCase().includes(qLower) ||
          Boolean(t.descripcion && t.descripcion.toLowerCase().includes(qLower)) ||
          Boolean(t.categoria && t.categoria.toLowerCase().includes(qLower)) ||
          Boolean(t.tags?.some((tag) => tag.nombre.toLowerCase().includes(qLower)))
        );
      })
      .map((t) => ({
        task: t,
        relevance_score: 1.0,
        matched_fields: ["titulo"],
      }));

    if (isPriorityOnlySearch) {
      setTaskResults(layer1Matches);
      setLoading(false);
      return;
    }

    // ── CAPA 2 (LRU Cache): Consulta de resultados previos cacheados de consultas idénticas ──
    const lruCached = searchLRUCache.get(qLower);

    if (lruCached && lruCached.length > 0) {
      const mergedMap = new Map<string, SearchResultItem>();
      lruCached.forEach((item) => mergedMap.set(item.task.id, item));
      layer1Matches.forEach((item) => {
        if (!mergedMap.has(item.task.id)) mergedMap.set(item.task.id, item);
      });
      setTaskResults(Array.from(mergedMap.values()));
    } else if (layer1Matches.length > 0) {
      setTaskResults(layer1Matches);
    }

    // ── CAPA 3 (Backend asíncrono con debounce de 150ms y FTS enriquecido) ──
    const controller = new AbortController();
    if (!lruCached && layer1Matches.length === 0) {
      setLoading(true);
    }

    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string | number> = {
          q: searchText,
          limit: 15,
        };
        if (activeRoom?.id) {
          params.room_id = activeRoom.id;
        }

        const res = await api.get<TaskSearchResponse>("/tasks/search", {
          params,
          signal: controller.signal,
        });

        const remoteResults = res.data.results || [];

        // Guardar en Capa 2 (LRU)
        searchLRUCache.set(qLower, remoteResults);

        // Fusión atómica deduplicada por id de tarea
        const finalMap = new Map<string, SearchResultItem>();
        remoteResults.forEach((item) => finalMap.set(item.task.id, item));
        layer1Matches.forEach((item) => {
          if (!finalMap.has(item.task.id)) {
            finalMap.set(item.task.id, item);
          }
        });

        setTaskResults(Array.from(finalMap.values()));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        // Fallback silencioso en caso de desconexión manteniendo los resultados de Capa 1
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [parsedInput, activeRoom?.id]);

  // Lista aplanada de todos los elementos seleccionables en orden según modo semántico
  const flatItems: PaletteCommandItem[] = useMemo(() => {
    if (parsedInput.mode === "actions") {
      return [...filteredActions];
    }
    if (parsedInput.mode === "rooms") {
      return [...roomItems];
    }
    if (parsedInput.mode === "tags") {
      return [...tagItems, ...taskCommandItems];
    }
    return [
      ...taskCommandItems,
      ...tagItems,
      ...roomItems,
      ...filteredActions,
    ];
  }, [parsedInput.mode, taskCommandItems, tagItems, roomItems, filteredActions]);

  // Mantener selectedIndex dentro de los límites
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Manejo de teclado (↑, ↓, Enter, Ctrl+Enter, Esc)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < flatItems.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : Math.max(0, flatItems.length - 1)
        );
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const selected = flatItems[selectedIndex];
        if (selected && selected.type === "task") {
          e.preventDefault();
          void handleInlineToggleTaskComplete(selected.searchItem.task, e);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = flatItems[selectedIndex];
        if (selected) {
          selected.action();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [flatItems, selectedIndex, onClose, handleInlineToggleTaskComplete]
  );

  // Scroll automático hacia el elemento activo en navegación de teclado
  useEffect(() => {
    if (!itemsContainerRef.current) return;
    const activeEl = itemsContainerRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView?.({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const modePillLabel =
    parsedInput.mode === "actions"
      ? "> Comandos"
      : parsedInput.mode === "rooms"
        ? "# Hogares"
        : parsedInput.mode === "tags"
          ? "@ Etiquetas"
          : parsedInput.mode === "priority"
            ? `! Prioridad ${parsedInput.priorityFilter?.toUpperCase() || ""}`
            : null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="command-palette-container retro-bottom-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de Comandos de Prioritask"
      >
        {/* Barra de Búsqueda */}
        <div className="command-palette-header">
          <LuSearch
            size={20}
            className="command-palette-search-icon"
            aria-hidden="true"
          />
          {modePillLabel && (
            <span
              className="command-palette-mode-pill"
              data-testid="command-palette-mode-pill"
            >
              {modePillLabel.trim()}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Buscar tareas, > comando, # hogar, @ etiqueta o !p1..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls="command-palette-results"
          />
          {query && (
            <button
              type="button"
              className="command-palette-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              <LuX size={16} />
            </button>
          )}
          <span className="command-palette-esc-badge" aria-hidden="true">
            ESC
          </span>
        </div>

        {/* Lista de Resultados */}
        <div
          id="command-palette-results"
          ref={itemsContainerRef}
          className="command-palette-body"
          role="listbox"
        >
          {loading && (
            <div className="command-palette-loading">
              <LuLoader className="spinner-border-sm" size={16} />
              <span>Buscando en tareas...</span>
            </div>
          )}

          {/* Sección 1: Tareas encontradas */}
          {taskCommandItems.length > 0 && (
            <div role="group" aria-label="Tareas encontradas">
              <div className="command-palette-section-title">
                Tareas Encontradas ({taskCommandItems.length})
              </div>
              {taskCommandItems.map((item) => {
                const globalIndex = flatItems.findIndex((x) => x.id === item.id);
                const isSelected = globalIndex === selectedIndex;
                const task = item.searchItem.task;
                const isDone =
                  task.estado === "DONE" || Boolean(task.completed);
                const statusClass = `command-palette-badge-status-${task.estado.toLowerCase()}`;
                const priorityBadge = weightToPriorityBadge(task.peso);
                const shortDueDate = task.due_date
                  ? String(task.due_date).slice(0, 10)
                  : null;

                return (
                  <div
                    key={item.id}
                    data-index={globalIndex}
                    data-testid={`palette-task-item-${task.id}`}
                    className={`command-palette-item ${isSelected ? "active" : ""}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                  >
                    <div className="command-palette-item-main">
                      <button
                        type="button"
                        data-testid={`palette-complete-task-${task.id}`}
                        className={`command-palette-check-btn ${
                          isDone ? "is-done" : ""
                        }`}
                        aria-label={
                          isDone
                            ? `Reabrir tarea ${task.titulo}`
                            : `Completar tarea ${task.titulo}`
                        }
                        title={
                          isDone
                            ? "Reabrir tarea (Ctrl+Enter)"
                            : "Completar tarea sin salir (Ctrl+Enter)"
                        }
                        onClick={(e) => {
                          void handleInlineToggleTaskComplete(task, e);
                        }}
                      >
                        <LuCheck size={12} aria-hidden="true" />
                      </button>
                      <div className="command-palette-item-text">
                        <span
                          className={`command-palette-item-title ${
                            isDone ? "is-done" : ""
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="command-palette-item-subtitle">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>
                    <div className="command-palette-item-meta">
                      <span
                        className={`command-palette-priority-badge ${priorityBadge.colorClass}`}
                      >
                        {priorityBadge.label}
                      </span>
                      {shortDueDate && (
                        <span className="command-palette-due-badge">
                          {shortDueDate}
                        </span>
                      )}
                      <span className={`command-palette-badge ${statusClass}`}>
                        {task.estado}
                      </span>
                      <LuArrowRight size={14} className="text-muted" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sección 2: Etiquetas (@tag) */}
          {tagItems.length > 0 && (
            <div role="group" aria-label="Etiquetas">
              <div className="command-palette-section-title">
                Etiquetas ({tagItems.length})
              </div>
              {tagItems.map((item) => {
                const globalIndex = flatItems.findIndex((x) => x.id === item.id);
                const isSelected = globalIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={globalIndex}
                    className={`command-palette-item ${isSelected ? "active" : ""}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="command-palette-item-main">
                      <div className="command-palette-item-icon">
                        <LuTag size={18} />
                      </div>
                      <div className="command-palette-item-text">
                        <span className="command-palette-item-title">
                          {item.title}
                        </span>
                        <span className="command-palette-item-subtitle">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>
                    <div className="command-palette-item-meta">
                      <LuArrowRight size={14} className="text-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sección 3: Hogares (#) */}
          {roomItems.length > 0 && (
            <div role="group" aria-label="Hogares y Salas">
              <div className="command-palette-section-title">
                Hogares ({roomItems.length})
              </div>
              {roomItems.map((item) => {
                const globalIndex = flatItems.findIndex((x) => x.id === item.id);
                const isSelected = globalIndex === selectedIndex;
                const isCurrent = item.room.id === activeRoom?.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={globalIndex}
                    className={`command-palette-item ${isSelected ? "active" : ""}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="command-palette-item-main">
                      <div className="command-palette-item-icon">
                        <LuHouse size={18} />
                      </div>
                      <div className="command-palette-item-text">
                        <span className="command-palette-item-title">
                          {item.title}
                        </span>
                        <span className="command-palette-item-subtitle">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>
                    {isCurrent && (
                      <div className="command-palette-item-meta">
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                          Activo
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sección 4: Acciones Rápidas (>) */}
          {filteredActions.length > 0 && (
            <div role="group" aria-label="Acciones Rápidas">
              <div className="command-palette-section-title">
                Acciones Rápidas ({filteredActions.length})
              </div>
              {filteredActions.map((item) => {
                const globalIndex = flatItems.findIndex((x) => x.id === item.id);
                const isSelected = globalIndex === selectedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-index={globalIndex}
                    className={`command-palette-item ${isSelected ? "active" : ""}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="command-palette-item-main">
                      <div className="command-palette-item-icon">{item.icon}</div>
                      <div className="command-palette-item-text">
                        <span className="command-palette-item-title">
                          {item.title}
                        </span>
                        <span className="command-palette-item-subtitle">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>
                    <div className="command-palette-item-meta">
                      <LuArrowRight size={14} className="text-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sin coincidencias */}
          {!loading && flatItems.length === 0 && (
            <div className="command-palette-empty">
              No se encontraron resultados para &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer accesible con pistas de navegación */}
        <div className="command-palette-footer">
          <div className="command-palette-footer-shortcuts">
            <span className="command-palette-footer-shortcut">
              <kbd>↑</kbd> <kbd>↓</kbd> Navegar
            </span>
            <span className="command-palette-footer-shortcut">
              <kbd>↵</kbd> Abrir
            </span>
            <span className="command-palette-footer-shortcut">
              <kbd>Ctrl+↵</kbd> Completar
            </span>
            <span className="command-palette-footer-shortcut">
              <kbd>ESC</kbd> Cerrar
            </span>
          </div>
          <span className="d-none d-sm-inline text-muted">
            Prioritask Command Engine
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPaletteModal;
