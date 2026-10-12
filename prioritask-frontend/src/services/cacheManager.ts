import type { Task, Subtask } from "../types/task";
import type { GamificationOverview } from "../types/gamification";
import type { SearchResultItem } from "../types/search";

/**
 * Tiempo de vida por defecto de la caché L1 en memoria (60 segundos).
 */
export const CACHE_TTL_MS = 60_000;

export interface RoomCacheEntry {
  tasks: Task[];
  timestamp: number;
  gamification?: GamificationOverview | null;
}

export interface GetRoomTasksResult {
  tasks: Task[];
  isStale: boolean;
}

type CacheListener = () => void;

class CacheManager {
  private roomCache = new Map<string, RoomCacheEntry>();
  private listeners = new Set<CacheListener>();

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("Error in cache listener:", err);
      }
    });
  }

  /**
   * Suscribe un listener reactivo a los cambios de la caché.
   */
  public subscribe(listener: CacheListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Obtiene las tareas cacheadas para una sala junto con su estado de frescura (isStale).
   * Si no existen tareas en caché, devuelve null.
   */
  public getRoomTasks(roomId: string): GetRoomTasksResult | null {
    if (!roomId) return null;
    const entry = this.roomCache.get(roomId);
    if (!entry) return null;

    const isStale = Date.now() - entry.timestamp > CACHE_TTL_MS;
    return {
      tasks: [...entry.tasks],
      isStale,
    };
  }

  /**
   * Almacena o actualiza la lista completa de tareas de una sala con timestamp actual.
   */
  public setRoomTasks(roomId: string, tasks: Task[]): void {
    if (!roomId) return;
    const existing = this.roomCache.get(roomId);
    this.roomCache.set(roomId, {
      tasks: [...tasks],
      timestamp: Date.now(),
      gamification: existing?.gamification,
    });
    this.notify();
  }

  /**
   * Añade una nueva tarea a la caché de la sala (al inicio de la lista).
   */
  public addTaskToCache(roomId: string, task: Task): void {
    if (!roomId || !task?.id) return;
    const entry = this.roomCache.get(roomId);
    if (!entry) {
      this.roomCache.set(roomId, {
        tasks: [task],
        timestamp: Date.now(),
      });
    } else {
      const exists = entry.tasks.some((t) => t.id === task.id);
      if (exists) {
        entry.tasks = entry.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t));
      } else {
        entry.tasks = [task, ...entry.tasks];
      }
    }
    this.notify();
  }

  /**
   * Actualiza parcialmente o totalmente una tarea existente en la caché.
   */
  public updateTaskInCache(
    roomId: string,
    taskUpdate: Partial<Task> & { id: string }
  ): void {
    if (!roomId || !taskUpdate?.id) return;
    const entry = this.roomCache.get(roomId);
    if (!entry) return;

    let updated = false;
    entry.tasks = entry.tasks.map((t) => {
      if (t.id === taskUpdate.id) {
        updated = true;
        return { ...t, ...taskUpdate };
      }
      return t;
    });

    if (updated) {
      this.notify();
    }
  }

  /**
   * Elimina una tarea de la caché de la sala especificada.
   */
  public removeTaskFromCache(roomId: string, taskId: string): void {
    if (!roomId || !taskId) return;
    const entry = this.roomCache.get(roomId);
    if (!entry) return;

    const initialLength = entry.tasks.length;
    entry.tasks = entry.tasks.filter((t) => t.id !== taskId);
    if (entry.tasks.length !== initialLength) {
      this.notify();
    }
  }

  /**
   * Actualiza el progreso o lista de subtareas de una tarea en caché.
   */
  public updateSubtaskInCache(
    roomId: string,
    taskId: string,
    payload: {
      subtask?: Subtask;
      subtasks_count?: number;
      subtasks_completed_count?: number;
    }
  ): void {
    if (!roomId || !taskId) return;
    const entry = this.roomCache.get(roomId);
    if (!entry) return;

    let modified = false;
    entry.tasks = entry.tasks.map((t) => {
      if (t.id !== taskId) return t;
      modified = true;

      let updatedSubtasks = t.subtasks;
      if (payload.subtask) {
        if (updatedSubtasks?.some((s) => s.id === payload.subtask?.id)) {
          updatedSubtasks = updatedSubtasks.map((s) =>
            s.id === payload.subtask?.id ? payload.subtask! : s
          );
        } else if (updatedSubtasks) {
          updatedSubtasks = [...updatedSubtasks, payload.subtask];
        }
      }

      const total =
        payload.subtasks_count ??
        (updatedSubtasks ? updatedSubtasks.length : t.subtasks_count);
      const completed =
        payload.subtasks_completed_count ??
        (updatedSubtasks
          ? updatedSubtasks.filter((s) => s.completada).length
          : t.subtasks_completed_count);

      return {
        ...t,
        subtasks: updatedSubtasks,
        subtasks_count: total,
        subtasks_completed_count: completed,
      };
    });

    if (modified) {
      this.notify();
    }
  }

  /**
   * Incrementa o decrementa el contador de comentarios en la tarea cacheada.
   */
  public updateCommentsCountInCache(
    roomId: string,
    taskId: string,
    diffOrTotal: number | { comments_count: number }
  ): void {
    if (!roomId || !taskId) return;
    const entry = this.roomCache.get(roomId);
    if (!entry) return;

    let modified = false;
    entry.tasks = entry.tasks.map((t) => {
      if (t.id !== taskId) return t;
      modified = true;
      const count =
        typeof diffOrTotal === "number"
          ? Math.max(0, (t.comments_count ?? 0) + diffOrTotal)
          : diffOrTotal.comments_count;
      return {
        ...t,
        comments_count: count,
      };
    });

    if (modified) {
      this.notify();
    }
  }

  /**
   * Incrementa o decrementa el contador de adjuntos en la tarea cacheada.
   */
  public updateAttachmentsCountInCache(
    roomId: string,
    taskId: string,
    diffOrTotal: number | { attachments_count: number }
  ): void {
    if (!roomId || !taskId) return;
    const entry = this.roomCache.get(roomId);
    if (!entry) return;

    let modified = false;
    entry.tasks = entry.tasks.map((t) => {
      if (t.id !== taskId) return t;
      modified = true;
      const count =
        typeof diffOrTotal === "number"
          ? Math.max(0, (t.attachments_count ?? 0) + diffOrTotal)
          : diffOrTotal.attachments_count;
      return {
        ...t,
        attachments_count: count,
      };
    });

    if (modified) {
      this.notify();
    }
  }

  /**
   * Marca una sala como inválida (stale) forzando revalidación en segundo plano.
   */
  public invalidateRoom(roomId: string): void {
    if (!roomId) return;
    const entry = this.roomCache.get(roomId);
    if (entry) {
      entry.timestamp = 0; // Marca como caducado
      this.notify();
    }
  }

  /**
   * Obtiene los datos de gamificación en caché para una sala.
   */
  public getRoomGamification(roomId: string): GamificationOverview | null {
    if (!roomId) return null;
    const entry = this.roomCache.get(roomId);
    return entry?.gamification ?? null;
  }

  /**
   * Guarda los datos de gamificación en caché para una sala.
   */
  public setRoomGamification(roomId: string, data: GamificationOverview): void {
    if (!roomId) return;
    const entry = this.roomCache.get(roomId);
    if (entry) {
      entry.gamification = data;
    } else {
      this.roomCache.set(roomId, {
        tasks: [],
        timestamp: Date.now(),
        gamification: data,
      });
    }
    this.notify();
  }

  /**
   * Devuelve todas las tareas únicas almacenadas en todas las salas cacheadas.
   * Utilizado para búsqueda instantánea Capa 1.
   */
  public getAllCachedTasks(): Task[] {
    const taskMap = new Map<string, Task>();
    this.roomCache.forEach((entry) => {
      entry.tasks.forEach((task) => {
        taskMap.set(task.id, task);
      });
    });
    return Array.from(taskMap.values());
  }

  /**
   * Limpia toda la caché L1 en memoria.
   */
  public clearCache(): void {
    this.roomCache.clear();
    this.notify();
  }
}

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

export const cacheManager = new CacheManager();
export default cacheManager;
