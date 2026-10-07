import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
} from "react-icons/lu";
import api from "../../api";
import { useRoom } from "../../context/RoomContext";
import type { TaskSearchResponse, SearchResultItem } from "../../types/search";
import type { Room } from "../../types/task";
import "./CommandPaletteModal.css";

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGamification?: () => void;
  onOpenShortcuts?: () => void;
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

interface TaskCommandItem {
  id: string;
  type: "task";
  title: string;
  subtitle: string;
  searchItem: SearchResultItem;
  action: () => void;
}

type PaletteCommandItem = ActionCommandItem | RoomCommandItem | TaskCommandItem;

export const CommandPaletteModal = ({
  isOpen,
  onClose,
  onOpenGamification,
  onOpenShortcuts,
}: CommandPaletteModalProps) => {
  const navigate = useNavigate();
  const { rooms, activeRoom, selectRoom } = useRoom();

  const [query, setQuery] = useState("");
  const [taskResults, setTaskResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);

  // Autoenfocar input al abrir
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTaskResults([]);
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Lista base de acciones rápidas
  const defaultActions: ActionCommandItem[] = useMemo(() => {
    return [
      {
        id: "act-create-task",
        type: "action",
        title: "Nueva Tarea",
        subtitle: "Crear una nueva tarea en el hogar",
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
          navigate("/tasks");
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
          navigate("/dashboard");
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
          navigate("/history");
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
          navigate("/tags");
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
          navigate("/profile");
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
  }, [navigate, onClose, onOpenGamification, onOpenShortcuts]);

  // Lista de salas disponibles
  const roomItems: RoomCommandItem[] = useMemo(() => {
    const qLower = query.trim().toLowerCase();
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
        navigate(`/rooms/${room.id}/tasks`);
      },
    }));
  }, [rooms, query, activeRoom, selectRoom, onClose, navigate]);

  // Filtrado de acciones por query
  const filteredActions = useMemo(() => {
    const qLower = query.trim().toLowerCase();
    if (!qLower) return defaultActions;
    return defaultActions.filter(
      (a) =>
        a.title.toLowerCase().includes(qLower) ||
        a.subtitle.toLowerCase().includes(qLower)
    );
  }, [defaultActions, query]);

  // Conversión de resultados de búsqueda de tareas
  const taskCommandItems: TaskCommandItem[] = useMemo(() => {
    return taskResults.map((item) => ({
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
          navigate(`/rooms/${item.task.room_id}/tasks`);
        } else {
          navigate("/tasks");
        }
      },
    }));
  }, [taskResults, onClose, selectRoom, navigate]);

  // Petición al API con debounce para tareas
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setTaskResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const params: Record<string, string | number> = {
          q: trimmed,
          limit: 15,
        };
        if (activeRoom?.id) {
          params.room_id = activeRoom.id;
        }

        const res = await api.get<TaskSearchResponse>("/tasks/search", {
          params,
          signal: controller.signal,
        });
        setTaskResults(res.data.results || []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        // Búsqueda silenciosa en caso de error de red
        setTaskResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activeRoom]);

  // Lista aplanada de todos los elementos seleccionables en orden
  const flatItems: PaletteCommandItem[] = useMemo(() => {
    return [...taskCommandItems, ...roomItems, ...filteredActions];
  }, [taskCommandItems, roomItems, filteredActions]);

  // Mantener selectedIndex dentro de los límites
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Manejo de teclado (↑, ↓, Enter, Esc)
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
    [flatItems, selectedIndex, onClose]
  );

  // Scroll automático hacia el elemento activo en navegación de teclado
  useEffect(() => {
    if (!itemsContainerRef.current) return;
    const activeEl = itemsContainerRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="command-palette-container"
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
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Buscar tareas, cambiar de hogar o ejecutar acción..."
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
                const statusClass = `command-palette-badge-status-${task.estado.toLowerCase()}`;

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
                        <LuSquareCheck size={18} />
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
                      <span className={`command-palette-badge ${statusClass}`}>
                        {task.estado}
                      </span>
                      <LuArrowRight size={14} className="text-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sección 2: Hogares */}
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

          {/* Sección 3: Acciones Rápidas */}
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
              <kbd>↵</kbd> Seleccionar
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
