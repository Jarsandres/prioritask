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
} from "react-icons/lu";
import api from "../../api";
import { useRoom } from "../../context/RoomContext";
import { cacheManager } from "../../services/cacheManager";
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

/**
 * Estructura de datos LRU (Least Recently Used) en memoria con capacidad fija de 50 consultas.
 */
export class QueryLRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;

  constructor(capacity = 50) {
    this.capacity = capacity;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Instancia compartida del LRU Cache (Capa 2) para el Command Palette
export const searchLRUCache = new QueryLRUCache<string, SearchResultItem[]>(50);

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
  const modalRef = useRef<HTMLDivElement>(null);

  useA11yModal({
    isOpen,
    onClose,
    modalRef,
    initialFocusRef: inputRef,
  });

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

  // Búsqueda Multi-Capa (Capa 1: In-Memory 0ms, Capa 2: LRU Cache, Capa 3: Backend Debounced 150ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setTaskResults([]);
      setLoading(false);
      return;
    }

    const qLower = trimmed.toLowerCase();

    // ── CAPA 1 (0 ms): Búsqueda inmediata síncrona en memoria sobre tareas cacheadas ──
    const allCached = cacheManager.getAllCachedTasks();
    const layer1Matches: SearchResultItem[] = allCached
      .filter(
        (t) =>
          t.titulo.toLowerCase().includes(qLower) ||
          (t.descripcion && t.descripcion.toLowerCase().includes(qLower)) ||
          (t.categoria && t.categoria.toLowerCase().includes(qLower))
      )
      .map((t) => ({
        task: t,
        relevance_score: 1.0,
        matched_fields: ["titulo"],
      }));

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
