import type { Task, TaskStatus } from "../types/task";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Esquema de Datos: Comandos de Sincronización, Sobre IPC y Cola Local
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipos de comando soportados por el motor de sincronización de Prioritask
 * (inspirado en el protocolo de comandos por lotes de Todoist Sync).
 */
export type SyncCommandType =
  | "task_create"
  | "task_update"
  | "task_complete"
  | "task_uncomplete"
  | "task_delete";

/**
 * Estado del ciclo de vida de un comando dentro de la cola local.
 */
export type SyncCommandStatus =
  | "pending"
  | "inflight"
  | "synced"
  | "conflict_resolved"
  | "failed";

/**
 * Argumentos tipados por tipo de comando.
 */
export interface TaskCreateArgs {
  titulo: string;
  descripcion?: string;
  categoria?: string;
  peso?: number;
  estado?: TaskStatus;
  due_date?: string;
  room_id?: string | null;
}

export interface TaskUpdateArgs {
  id: string;
  titulo?: string;
  descripcion?: string;
  categoria?: string;
  peso?: number;
  estado?: TaskStatus;
  due_date?: string;
  expected_updated_at?: string;
}

export interface TaskStatusToggleArgs {
  id: string;
  expected_updated_at?: string;
}

export interface TaskDeleteArgs {
  id: string;
}

export type SyncCommandArgsMap = {
  task_create: TaskCreateArgs;
  task_update: TaskUpdateArgs;
  task_complete: TaskStatusToggleArgs;
  task_uncomplete: TaskStatusToggleArgs;
  task_delete: TaskDeleteArgs;
};

/**
 * Estructura de un comando de mutación atómico encolable offline.
 * - `uuid`: Identificador único de idempotencia para el comando (evita duplicados en reintentos).
 * - `temp_id`: ID temporal generado en cliente para creaciones offline (`task_create`).
 * - `type`: Verbo de dominio de la mutación.
 * - `args`: Payload de la operación.
 * - `timestamp`: Marca de tiempo Unix (ms) para ordenamiento causal FIFO y resolución LWW.
 */
export interface SyncCommand<T extends SyncCommandType = SyncCommandType> {
  uuid: string;
  temp_id?: string;
  type: T;
  args: SyncCommandArgsMap[T];
  timestamp: number;
  status: SyncCommandStatus;
  retryCount: number;
  lastError?: string;
}

/**
 * Snapshot previo de una entidad para permitir rollback atómico si la mutación
 * optimista es rechazada definitivamente por el servidor.
 */
export interface OptimisticSnapshot {
  commandUuid: string;
  entityId: string;
  previousState: Task | null; // `null` si la tarea no existía antes (ej. `task_create`)
}

/**
 * Estado completo de la cola local persistente y metadatos de sincronización.
 */
export interface LocalSyncQueueState {
  /** Cursor incremental devuelto por el servidor (`"*"` para sincronización inicial). */
  syncToken: string;
  /** Cola FIFO de comandos pendientes de confirmación remota. */
  pendingCommands: SyncCommand[];
  /** Mapa de traducción `temp_id -> server_id` para referencias cruzadas offline. */
  tempIdMapping: Record<string, string>;
  /** Historial de snapshots para rollback en caso de fallo irrecuperable. */
  snapshots: Record<string, OptimisticSnapshot>;
  /** Marca de tiempo de la última sincronización exitosa. */
  lastSyncedAt: number | null;
}

/**
 * Sobre de transporte IPC observado en el puente Electron de Todoist
 * (`webpack/todoist-main-preload/preload.js` y `webpack/electron/electron.js`).
 */
export interface DesktopBridgeEnvelope<TPayload = unknown> {
  type:
    | "com.todoist.ipc.request"
    | "com.todoist.ipc.response"
    | "com.todoist.ipc.push"
    | "com.todoist.ipc.pull";
  id: string;
  method:
    | "completeItem"
    | "uncompleteItem"
    | "addTask"
    | "quickAddAddTask"
    | "createReminder"
    | "sendRequestSync"
    | "handleWakeup"
    | "isMainLogicWindow"
    | "setMainLogicWindow";
  data?: TPayload;
}

/**
 * Respuesta individual por comando dentro de un lote de sincronización.
 */
export type CommandSyncResult =
  | "ok"
  | {
      error_code: number;
      error: string;
      error_tag: "CONFLICT_STALE_TIMESTAMP" | "ENTITY_NOT_FOUND" | "VALIDATION_ERROR";
      retryable: boolean;
      server_record?: Task;
    };

/**
 * Petición enviada por lotes (`flushQueue`) al endpoint de sincronización.
 */
export interface SyncBatchRequest {
  sync_token: string;
  commands: Array<Pick<SyncCommand, "uuid" | "temp_id" | "type" | "args" | "timestamp">>;
}

/**
 * Respuesta devuelta por el servidor tras procesar un lote de comandos.
 */
export interface SyncBatchResponse {
  sync_token: string;
  full_sync: boolean;
  sync_status: Record<string, CommandSyncResult>;
  temp_id_mapping: Record<string, string>;
  items?: Task[];
}

/**
 * Estrategia de resolución de conflictos cuando el estado remoto diverge del optimista.
 */
export type ConflictResolutionStrategy = "server-wins" | "client-wins" | "last-write-wins" | "field-merge";

export interface ConflictResolutionReport {
  commandUuid: string;
  entityId: string;
  strategy: ConflictResolutionStrategy;
  winner: "client" | "server" | "merged";
  resolvedTask: Task;
}

export interface FlushQueueResult {
  syncedCommandUuids: string[];
  failedCommandUuids: string[];
  conflictsResolved: ConflictResolutionReport[];
  tempIdMappingsApplied: Record<string, string>;
  newSyncToken: string;
  remainingPendingCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Utilidades Criptográficas / Generación de UUIDs sin dependencias externas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera un UUID v4 estándar (o fallback determinista hexagonal similar a `function A()`
 * observada en `webpack/electron/electron.js`).
 */
export function generateSyncUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const segment = (): string =>
    Math.floor(65536 * (1 + Math.random()))
      .toString(16)
      .substring(1);
  return `${segment()}${segment()}-${segment()}-${segment()}-${segment()}-${segment()}${segment()}${segment()}`;
}

export function generateTempTaskId(): string {
  return `temp_${generateSyncUuid()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith("temp_");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Adaptador de Persistencia Local (IndexedDB con Fallback en Memoria)
// ─────────────────────────────────────────────────────────────────────────────

export interface QueueStorageAdapter {
  loadState(): Promise<LocalSyncQueueState | null>;
  saveState(state: LocalSyncQueueState): Promise<void>;
  clear(): Promise<void>;
}

const IDB_DATABASE_NAME = "prioritask_sync_engine_db";
const IDB_DATABASE_VERSION = 1;
const IDB_STORE_NAME = "sync_queue_state";
const IDB_STATE_KEY = "canonical_queue_state";

export class IndexedDBQueueStorageAdapter implements QueueStorageAdapter {
  private memoryFallback: LocalSyncQueueState | null = null;

  private isIndexedDBSupported(): boolean {
    return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.isIndexedDBSupported()) {
        return reject(new Error("IndexedDB no disponible en este entorno."));
      }
      const req = window.indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Error abriendo IndexedDB"));
    });
  }

  async loadState(): Promise<LocalSyncQueueState | null> {
    try {
      const db = await this.openDatabase();
      return await new Promise<LocalSyncQueueState | null>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, "readonly");
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.get(IDB_STATE_KEY);

        req.onsuccess = () => {
          const result = (req.result as LocalSyncQueueState | undefined) ?? this.memoryFallback;
          resolve(result ? structuredClone(result) : null);
        };
        req.onerror = () => {
          resolve(this.memoryFallback ? structuredClone(this.memoryFallback) : null);
        };
        tx.oncomplete = () => db.close();
      });
    } catch {
      return this.memoryFallback ? structuredClone(this.memoryFallback) : null;
    }
  }

  async saveState(state: LocalSyncQueueState): Promise<void> {
    const snapshot = structuredClone(state);
    this.memoryFallback = snapshot;

    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, "readwrite");
        const store = tx.objectStore(IDB_STORE_NAME);
        store.put(snapshot, IDB_STATE_KEY);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      });
    } catch {
      // El fallback en memoria ya conserva el snapshot
    }
  }

  async clear(): Promise<void> {
    this.memoryFallback = null;
    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE_NAME, "readwrite");
        const store = tx.objectStore(IDB_STORE_NAME);
        store.clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      });
    } catch {
      // Ignorar si IndexedDB no está disponible
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Transporte de Sincronización y Simulador de Resolución de Conflictos
// ─────────────────────────────────────────────────────────────────────────────

export type SyncTransportExecutor = (
  batch: SyncBatchRequest
) => Promise<SyncBatchResponse>;

/**
 * Crea un simulador de servidor Sync que mantiene estado remoto en memoria,
 * asigna IDs reales a `temp_id`, emite nuevos `sync_token` y simula conflictos
 * concurrentes cuando `updated_at` en el servidor es más reciente que el comando.
 */
export function createSimulatedSyncTransport(
  initialServerTasks: Task[] = []
): {
  transport: SyncTransportExecutor;
  serverStore: Map<string, Task>;
  injectConcurrentServerEdit: (task: Task) => void;
} {
  const serverStore = new Map<string, Task>(
    initialServerTasks.map((t) => [t.id, structuredClone(t)])
  );
  let tokenCounter = 1000;

  return {
    serverStore,
    injectConcurrentServerEdit(task: Task) {
      serverStore.set(task.id, structuredClone(task));
    },
    transport: async (batch: SyncBatchRequest): Promise<SyncBatchResponse> => {
      const sync_status: Record<string, CommandSyncResult> = {};
      const temp_id_mapping: Record<string, string> = {};

      for (const cmd of batch.commands) {
        if (cmd.type === "task_create") {
          const args = cmd.args as TaskCreateArgs;
          const tempId = cmd.temp_id ?? generateTempTaskId();
          const realId = `srv_task_${++tokenCounter}_${cmd.uuid.slice(0, 6)}`;
          temp_id_mapping[tempId] = realId;

          const nowIso = new Date(cmd.timestamp).toISOString();
          const createdTask: Task = {
            id: realId,
            titulo: args.titulo,
            descripcion: args.descripcion ?? "",
            categoria: args.categoria ?? "Hogar",
            peso: args.peso ?? 1,
            estado: args.estado ?? "TODO",
            due_date: args.due_date,
            room_id: args.room_id ?? null,
            created_at: nowIso,
            updated_at: nowIso,
          };
          serverStore.set(realId, createdTask);
          sync_status[cmd.uuid] = "ok";
          continue;
        }

        if (cmd.type === "task_update") {
          const args = cmd.args as TaskUpdateArgs;
          const resolvedId = temp_id_mapping[args.id] ?? args.id;
          const existing = serverStore.get(resolvedId);

          if (!existing) {
            sync_status[cmd.uuid] = {
              error_code: 404,
              error: `La tarea ${resolvedId} no existe en el servidor.`,
              error_tag: "ENTITY_NOT_FOUND",
              retryable: false,
            };
            continue;
          }

          const serverUpdatedMs = existing.updated_at
            ? Date.parse(existing.updated_at)
            : 0;
          const expectedUpdatedMs = args.expected_updated_at
            ? Date.parse(args.expected_updated_at)
            : cmd.timestamp;

          // Detectar conflicto si el servidor tiene una versión modificada con posterioridad
          if (serverUpdatedMs > cmd.timestamp || (args.expected_updated_at && serverUpdatedMs > expectedUpdatedMs)) {
            sync_status[cmd.uuid] = {
              error_code: 409,
              error: "Conflicto de concurrencia: la tarea fue modificada en otro dispositivo.",
              error_tag: "CONFLICT_STALE_TIMESTAMP",
              retryable: false,
              server_record: structuredClone(existing),
            };
            continue;
          }

          const updated: Task = {
            ...existing,
            ...(args.titulo !== undefined ? { titulo: args.titulo } : {}),
            ...(args.descripcion !== undefined ? { descripcion: args.descripcion } : {}),
            ...(args.categoria !== undefined ? { categoria: args.categoria } : {}),
            ...(args.peso !== undefined ? { peso: args.peso } : {}),
            ...(args.estado !== undefined ? { estado: args.estado } : {}),
            ...(args.due_date !== undefined ? { due_date: args.due_date } : {}),
            updated_at: new Date(cmd.timestamp).toISOString(),
          };
          serverStore.set(resolvedId, updated);
          sync_status[cmd.uuid] = "ok";
          continue;
        }

        if (cmd.type === "task_complete" || cmd.type === "task_uncomplete") {
          const args = cmd.args as TaskStatusToggleArgs;
          const resolvedId = temp_id_mapping[args.id] ?? args.id;
          const existing = serverStore.get(resolvedId);

          if (!existing) {
            sync_status[cmd.uuid] = {
              error_code: 404,
              error: `La tarea ${resolvedId} no existe en el servidor.`,
              error_tag: "ENTITY_NOT_FOUND",
              retryable: false,
            };
            continue;
          }

          const serverUpdatedMs = existing.updated_at
            ? Date.parse(existing.updated_at)
            : 0;
          if (serverUpdatedMs > cmd.timestamp) {
            sync_status[cmd.uuid] = {
              error_code: 409,
              error: "Conflicto de estado: la tarea tiene una marca temporal más reciente en el servidor.",
              error_tag: "CONFLICT_STALE_TIMESTAMP",
              retryable: false,
              server_record: structuredClone(existing),
            };
            continue;
          }

          const updated: Task = {
            ...existing,
            estado: cmd.type === "task_complete" ? "DONE" : "TODO",
            updated_at: new Date(cmd.timestamp).toISOString(),
          };
          serverStore.set(resolvedId, updated);
          sync_status[cmd.uuid] = "ok";
          continue;
        }

        if (cmd.type === "task_delete") {
          const args = cmd.args as TaskDeleteArgs;
          const resolvedId = temp_id_mapping[args.id] ?? args.id;
          serverStore.delete(resolvedId);
          sync_status[cmd.uuid] = "ok";
        }
      }

      return {
        sync_token: `sync_tok_${++tokenCounter}`,
        full_sync: batch.sync_token === "*",
        sync_status,
        temp_id_mapping,
        items: Array.from(serverStore.values()).map((t) => structuredClone(t)),
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Motor Principal: OfflineSyncEngine (Optimistic UI + Persistent Queue + Flush)
// ─────────────────────────────────────────────────────────────────────────────

export interface OfflineSyncEngineOptions {
  storage?: QueueStorageAdapter;
  transport?: SyncTransportExecutor;
  conflictStrategy?: ConflictResolutionStrategy;
  maxBatchSize?: number;
  isMainLogicWindow?: boolean;
}

export type SyncStateListener = (
  tasks: Task[],
  queueState: Readonly<LocalSyncQueueState>
) => void;

export class OfflineSyncEngine {
  private readonly storage: QueueStorageAdapter;
  private transport: SyncTransportExecutor;
  private readonly conflictStrategy: ConflictResolutionStrategy;
  private readonly maxBatchSize: number;
  private isMainLogicWindow: boolean;

  /** Estado local en memoria para la UI (Optimistic Store). */
  private readonly taskStore = new Map<string, Task>();

  /** Estado de la cola y cursores de sincronización. */
  private queueState: LocalSyncQueueState = {
    syncToken: "*",
    pendingCommands: [],
    tempIdMapping: {},
    snapshots: {},
    lastSyncedAt: null,
  };

  private readonly listeners = new Set<SyncStateListener>();
  private isFlushing = false;

  constructor(options: OfflineSyncEngineOptions = {}) {
    this.storage = options.storage ?? new IndexedDBQueueStorageAdapter();
    this.transport =
      options.transport ?? createSimulatedSyncTransport().transport;
    this.conflictStrategy = options.conflictStrategy ?? "last-write-wins";
    this.maxBatchSize = options.maxBatchSize ?? 100;
    this.isMainLogicWindow = options.isMainLogicWindow ?? true;
  }

  /**
   * Inicializa el motor restaurando la cola persistida y poblando el estado inicial.
   */
  async initialize(initialTasks: Task[] = []): Promise<void> {
    this.taskStore.clear();
    for (const task of initialTasks) {
      this.taskStore.set(task.id, structuredClone(task));
    }

    const persisted = await this.storage.loadState();
    if (persisted) {
      this.queueState = persisted;
      // Re-aplicar mutaciones pendientes sobre el estado base cargado
      for (const cmd of this.queueState.pendingCommands) {
        this.applyMutationToMemory(cmd, false);
      }
    }
    this.notifyListeners();
  }

  /**
   * Permite suscribir componentes de React al estado optimista de tareas y de la cola.
   */
  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getTasks(), this.getQueueState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Devuelve la lista actual de tareas (incluyendo mutaciones optimistas no sincronizadas).
   */
  getTasks(): Task[] {
    return Array.from(this.taskStore.values()).map((t) => structuredClone(t));
  }

  /**
   * Devuelve una tarea específica resolviendo automáticamente su `temp_id` si ya fue mapeado.
   */
  getTaskById(id: string): Task | undefined {
    const resolvedId = this.resolveEntityId(id);
    const found = this.taskStore.get(resolvedId);
    return found ? structuredClone(found) : undefined;
  }

  /**
   * Devuelve una copia inmutable del estado actual de la cola local.
   */
  getQueueState(): Readonly<LocalSyncQueueState> {
    return structuredClone(this.queueState);
  }

  /**
   * Configura si esta instancia actúa como `mainLogicWindow` (patrón de líder único
   * observado en `webpack/electron/electron.js` para evitar condiciones de carrera).
   */
  setMainLogicWindow(isLeader: boolean): void {
    this.isMainLogicWindow = isLeader;
  }

  /**
   * Reemplaza el transporte de red en tiempo de ejecución.
   */
  setTransport(transport: SyncTransportExecutor): void {
    this.transport = transport;
  }

  /**
   * (a) Registro optimista del cambio en el estado local y
   * (b) Encolado persistente de la mutación.
   */
  async dispatchMutation<T extends SyncCommandType>(
    type: T,
    args: SyncCommandArgsMap[T],
    options?: { uuid?: string; tempId?: string; timestamp?: number }
  ): Promise<{ command: SyncCommand<T>; optimisticTask: Task | null }> {
    const timestamp = options?.timestamp ?? Date.now();
    const uuid = options?.uuid ?? generateSyncUuid();
    const tempId =
      type === "task_create"
        ? options?.tempId ?? generateTempTaskId()
        : undefined;

    const command: SyncCommand<T> = {
      uuid,
      ...(tempId ? { temp_id: tempId } : {}),
      type,
      args: structuredClone(args),
      timestamp,
      status: "pending",
      retryCount: 0,
    };

    // 1. Aplicar cambio optimista en memoria y guardar snapshot de rollback
    const optimisticTask = this.applyMutationToMemory(command, true);

    // 2. Encolar comando en orden cronológico FIFO y persistir
    this.queueState.pendingCommands.push(command);
    this.queueState.pendingCommands.sort((a, b) => a.timestamp - b.timestamp);
    await this.storage.saveState(this.queueState);

    // 3. Notificar inmediatamente a la UI (desacoplada de la red)
    this.notifyListeners();

    return { command, optimisticTask };
  }

  /**
   * Procesa mensajes provenientes de un puente IPC externo (como el Quick Add o
   * notificaciones nativas observadas en `preload.js` / `electron.js`).
   */
  async handleBridgeEnvelope(envelope: DesktopBridgeEnvelope): Promise<void> {
    switch (envelope.method) {
      case "completeItem": {
        const taskId = String(envelope.data ?? "");
        if (taskId) {
          await this.dispatchMutation("task_complete", { id: taskId });
        }
        break;
      }
      case "uncompleteItem": {
        const taskId = String(envelope.data ?? "");
        if (taskId) {
          await this.dispatchMutation("task_uncomplete", { id: taskId });
        }
        break;
      }
      case "addTask":
      case "quickAddAddTask": {
        const payload = (envelope.data ?? {}) as Partial<TaskCreateArgs>;
        if (payload.titulo) {
          await this.dispatchMutation("task_create", {
            titulo: payload.titulo,
            descripcion: payload.descripcion,
            categoria: payload.categoria,
            peso: payload.peso,
            due_date: payload.due_date,
            room_id: payload.room_id,
          });
        }
        break;
      }
      case "sendRequestSync":
      case "handleWakeup": {
        await this.flushQueue();
        break;
      }
      case "setMainLogicWindow": {
        this.setMainLogicWindow(true);
        break;
      }
      default:
        break;
    }
  }

  /**
   * (c) Función de reprocesamiento por lotes (`flushQueue`) con resolución de conflictos,
   * reconciliación de `temp_id_mapping` y rollback selectivo.
   */
  async flushQueue(): Promise<FlushQueueResult> {
    if (this.isFlushing || !this.isMainLogicWindow) {
      return {
        syncedCommandUuids: [],
        failedCommandUuids: [],
        conflictsResolved: [],
        tempIdMappingsApplied: {},
        newSyncToken: this.queueState.syncToken,
        remainingPendingCount: this.queueState.pendingCommands.length,
      };
    }

    if (this.queueState.pendingCommands.length === 0) {
      return {
        syncedCommandUuids: [],
        failedCommandUuids: [],
        conflictsResolved: [],
        tempIdMappingsApplied: {},
        newSyncToken: this.queueState.syncToken,
        remainingPendingCount: 0,
      };
    }

    this.isFlushing = true;
    const syncedCommandUuids: string[] = [];
    const failedCommandUuids: string[] = [];
    const conflictsResolved: ConflictResolutionReport[] = [];
    const tempIdMappingsApplied: Record<string, string> = {};

    try {
      // Procesar en lotes de tamaño `maxBatchSize` respetando el orden FIFO
      const batchCommands = this.queueState.pendingCommands
        .slice(0, this.maxBatchSize)
        .map((cmd) => {
          cmd.status = "inflight";
          return this.rewriteCommandWithResolvedIds(cmd);
        });

      const requestPayload: SyncBatchRequest = {
        sync_token: this.queueState.syncToken,
        commands: batchCommands.map((c) => ({
          uuid: c.uuid,
          ...(c.temp_id ? { temp_id: c.temp_id } : {}),
          type: c.type,
          args: c.args,
          timestamp: c.timestamp,
        })),
      };

      const response = await this.transport(requestPayload);

      // 1. Aplicar mapeos `temp_id -> server_id` en el store local y en comandos futuros
      if (response.temp_id_mapping) {
        for (const [tempId, realId] of Object.entries(response.temp_id_mapping)) {
          this.queueState.tempIdMapping[tempId] = realId;
          tempIdMappingsApplied[tempId] = realId;
          this.replaceTempIdInMemory(tempId, realId);
        }
      }

      // 2. Evaluar el resultado de cada comando en el lote
      const processedUuids = new Set<string>();

      for (const cmd of batchCommands) {
        const result = response.sync_status[cmd.uuid];
        if (!result || result === "ok") {
          cmd.status = "synced";
          syncedCommandUuids.push(cmd.uuid);
          processedUuids.add(cmd.uuid);
          delete this.queueState.snapshots[cmd.uuid];
          continue;
        }

        // Si el error es de conflicto de versión (`CONFLICT_STALE_TIMESTAMP`), resolver conflicto
        if (result.error_tag === "CONFLICT_STALE_TIMESTAMP" && result.server_record) {
          const report = this.resolveConflict(cmd, result.server_record);
          conflictsResolved.push(report);
          cmd.status = "conflict_resolved";
          syncedCommandUuids.push(cmd.uuid);
          processedUuids.add(cmd.uuid);
          delete this.queueState.snapshots[cmd.uuid];
          continue;
        }

        // Si es un error transitorio y retryable, mantener en la cola
        if (result.retryable) {
          const originalCmd = this.queueState.pendingCommands.find(
            (c) => c.uuid === cmd.uuid
          );
          if (originalCmd) {
            originalCmd.status = "pending";
            originalCmd.retryCount += 1;
            originalCmd.lastError = result.error;
          }
          continue;
        }

        // Error permanente (ej. 404/422): revertir cambio optimista usando el snapshot y desencolar
        this.rollbackOptimisticCommand(cmd.uuid);
        failedCommandUuids.push(cmd.uuid);
        processedUuids.add(cmd.uuid);
      }

      // 3. Limpiar comandos completados/descartados y actualizar `syncToken`
      this.queueState.pendingCommands = this.queueState.pendingCommands
        .filter((cmd) => !processedUuids.has(cmd.uuid))
        .map((cmd) => this.rewriteCommandWithResolvedIds(cmd));

      if (response.sync_token) {
        this.queueState.syncToken = response.sync_token;
      }
      this.queueState.lastSyncedAt = Date.now();

      await this.storage.saveState(this.queueState);
      this.notifyListeners();

      return {
        syncedCommandUuids,
        failedCommandUuids,
        conflictsResolved,
        tempIdMappingsApplied,
        newSyncToken: this.queueState.syncToken,
        remainingPendingCount: this.queueState.pendingCommands.length,
      };
    } catch (networkErr) {
      // Ante fallo de red durante el flush, devolver los comandos a `pending` sin perder datos
      for (const cmd of this.queueState.pendingCommands) {
        if (cmd.status === "inflight") {
          cmd.status = "pending";
          cmd.retryCount += 1;
          cmd.lastError =
            networkErr instanceof Error ? networkErr.message : String(networkErr);
        }
      }
      await this.storage.saveState(this.queueState);
      this.notifyListeners();
      throw networkErr;
    } finally {
      this.isFlushing = false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Métodos Internos: Aplicación Optimista, Traducción de IDs y Conflictos
  // ───────────────────────────────────────────────────────────────────────────

  private resolveEntityId(id: string): string {
    let current = id;
    const visited = new Set<string>();
    while (this.queueState.tempIdMapping[current] && !visited.has(current)) {
      visited.add(current);
      current = this.queueState.tempIdMapping[current];
    }
    return current;
  }

  private applyMutationToMemory(
    command: SyncCommand,
    recordSnapshot: boolean
  ): Task | null {
    const isoTimestamp = new Date(command.timestamp).toISOString();

    if (command.type === "task_create") {
      const args = command.args as TaskCreateArgs;
      const entityId = this.resolveEntityId(
        command.temp_id ?? generateTempTaskId()
      );
      if (recordSnapshot && !this.queueState.snapshots[command.uuid]) {
        this.queueState.snapshots[command.uuid] = {
          commandUuid: command.uuid,
          entityId,
          previousState: null,
        };
      }

      const newTask: Task = {
        id: entityId,
        titulo: args.titulo,
        descripcion: args.descripcion ?? "",
        categoria: args.categoria ?? "Hogar",
        peso: args.peso ?? 1,
        estado: args.estado ?? "TODO",
        due_date: args.due_date,
        room_id: args.room_id ?? null,
        created_at: isoTimestamp,
        updated_at: isoTimestamp,
      };
      this.taskStore.set(entityId, newTask);
      return structuredClone(newTask);
    }

    if (command.type === "task_update") {
      const args = command.args as TaskUpdateArgs;
      const entityId = this.resolveEntityId(args.id);
      const existing = this.taskStore.get(entityId);
      if (!existing) return null;

      if (recordSnapshot && !this.queueState.snapshots[command.uuid]) {
        this.queueState.snapshots[command.uuid] = {
          commandUuid: command.uuid,
          entityId,
          previousState: structuredClone(existing),
        };
      }

      const updated: Task = {
        ...existing,
        ...(args.titulo !== undefined ? { titulo: args.titulo } : {}),
        ...(args.descripcion !== undefined ? { descripcion: args.descripcion } : {}),
        ...(args.categoria !== undefined ? { categoria: args.categoria } : {}),
        ...(args.peso !== undefined ? { peso: args.peso } : {}),
        ...(args.estado !== undefined ? { estado: args.estado } : {}),
        ...(args.due_date !== undefined ? { due_date: args.due_date } : {}),
        updated_at: isoTimestamp,
      };
      this.taskStore.set(entityId, updated);
      return structuredClone(updated);
    }

    if (command.type === "task_complete" || command.type === "task_uncomplete") {
      const args = command.args as TaskStatusToggleArgs;
      const entityId = this.resolveEntityId(args.id);
      const existing = this.taskStore.get(entityId);
      if (!existing) return null;

      if (recordSnapshot && !this.queueState.snapshots[command.uuid]) {
        this.queueState.snapshots[command.uuid] = {
          commandUuid: command.uuid,
          entityId,
          previousState: structuredClone(existing),
        };
      }

      const updated: Task = {
        ...existing,
        estado: command.type === "task_complete" ? "DONE" : "TODO",
        updated_at: isoTimestamp,
      };
      this.taskStore.set(entityId, updated);
      return structuredClone(updated);
    }

    if (command.type === "task_delete") {
      const args = command.args as TaskDeleteArgs;
      const entityId = this.resolveEntityId(args.id);
      const existing = this.taskStore.get(entityId) ?? null;

      if (recordSnapshot && !this.queueState.snapshots[command.uuid]) {
        this.queueState.snapshots[command.uuid] = {
          commandUuid: command.uuid,
          entityId,
          previousState: existing ? structuredClone(existing) : null,
        };
      }

      this.taskStore.delete(entityId);
      return null;
    }

    return null;
  }

  private replaceTempIdInMemory(tempId: string, realId: string): void {
    const existing = this.taskStore.get(tempId);
    if (existing) {
      this.taskStore.delete(tempId);
      this.taskStore.set(realId, {
        ...existing,
        id: realId,
      });
    }

    for (const snap of Object.values(this.queueState.snapshots)) {
      if (snap.entityId === tempId) {
        snap.entityId = realId;
      }
      if (snap.previousState?.id === tempId) {
        snap.previousState.id = realId;
      }
    }
  }

  private rewriteCommandWithResolvedIds(cmd: SyncCommand): SyncCommand {
    const cloned = structuredClone(cmd);
    if (cloned.type !== "task_create" && "id" in cloned.args) {
      const targetId = (cloned.args as { id: string }).id;
      (cloned.args as { id: string }).id = this.resolveEntityId(targetId);
    }
    return cloned;
  }

  private resolveConflict(
    command: SyncCommand,
    serverRecord: Task
  ): ConflictResolutionReport {
    const entityId = serverRecord.id;
    const localRecord = this.taskStore.get(entityId);
    const serverTime = serverRecord.updated_at
      ? Date.parse(serverRecord.updated_at)
      : 0;

    if (this.conflictStrategy === "client-wins" && localRecord) {
      const resolved: Task = {
        ...serverRecord,
        ...localRecord,
        id: entityId,
        updated_at: new Date(Math.max(Date.now(), serverTime + 1)).toISOString(),
      };
      this.taskStore.set(entityId, resolved);
      return {
        commandUuid: command.uuid,
        entityId,
        strategy: "client-wins",
        winner: "client",
        resolvedTask: structuredClone(resolved),
      };
    }

    if (this.conflictStrategy === "field-merge" && localRecord) {
      const snapshot = this.queueState.snapshots[command.uuid]?.previousState;
      const merged: Task = { ...serverRecord };

      // Conservar campos modificados explícitamente por el cliente respecto al snapshot base
      if (snapshot) {
        if (localRecord.titulo !== snapshot.titulo) merged.titulo = localRecord.titulo;
        if (localRecord.descripcion !== snapshot.descripcion) {
          merged.descripcion = localRecord.descripcion;
        }
        if (localRecord.estado !== snapshot.estado) merged.estado = localRecord.estado;
        if (localRecord.peso !== snapshot.peso) merged.peso = localRecord.peso;
        if (localRecord.categoria !== snapshot.categoria) {
          merged.categoria = localRecord.categoria;
        }
      }
      merged.updated_at = new Date(Math.max(command.timestamp, serverTime)).toISOString();
      this.taskStore.set(entityId, merged);

      return {
        commandUuid: command.uuid,
        entityId,
        strategy: "field-merge",
        winner: "merged",
        resolvedTask: structuredClone(merged),
      };
    }

    if (this.conflictStrategy === "last-write-wins" && localRecord) {
      if (command.timestamp >= serverTime) {
        const resolved: Task = {
          ...serverRecord,
          ...localRecord,
          id: entityId,
          updated_at: new Date(command.timestamp).toISOString(),
        };
        this.taskStore.set(entityId, resolved);
        return {
          commandUuid: command.uuid,
          entityId,
          strategy: "last-write-wins",
          winner: "client",
          resolvedTask: structuredClone(resolved),
        };
      }
    }

    // Por defecto (`server-wins` o cuando `serverTime > command.timestamp` en LWW)
    const canonical = structuredClone(serverRecord);
    this.taskStore.set(entityId, canonical);
    return {
      commandUuid: command.uuid,
      entityId,
      strategy: this.conflictStrategy,
      winner: "server",
      resolvedTask: canonical,
    };
  }

  private rollbackOptimisticCommand(commandUuid: string): void {
    const snapshot = this.queueState.snapshots[commandUuid];
    if (!snapshot) return;

    const resolvedId = this.resolveEntityId(snapshot.entityId);
    if (snapshot.previousState === null) {
      this.taskStore.delete(resolvedId);
    } else {
      this.taskStore.set(resolvedId, structuredClone(snapshot.previousState));
    }
    delete this.queueState.snapshots[commandUuid];
  }

  private notifyListeners(): void {
    const tasks = this.getTasks();
    const state = this.getQueueState();
    for (const listener of this.listeners) {
      listener(tasks, state);
    }
  }
}
