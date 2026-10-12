import {
  generateSyncUuid,
  type OfflineSyncEngine,
} from "../sync/offlineQueue";

/**
 * Motor de Alarmas en Segundo Plano y Notificaciones Nativas Accionables
 * (`BackgroundReminderScheduler`)
 *
 * Inspirado en el subsistema de notificaciones de Todoist Desktop (`webpack/electron/electron.js`):
 * - Retención explícita anti-Garbage-Collection (`activeNotifications = new Map()`,
 *   equivalente a `Jt = new Map` en `electron.js:1:33175`) hasta el evento `close`.
 * - Disparo exclusivo desde la ventana líder (`isMainLogicWindow`) para evitar
 *   notificaciones duplicadas cuando múltiples pestañas están abiertas.
 * - Acciones rápidas de notificación (`action.complete`, `action.snooze.30m`,
 *   `action.snooze.3h`, `action.snooze.tomorrow9am`) conectadas directamente
 *   con `OfflineSyncEngine`.
 * - Recuperación ante suspensión del sistema operativo (`triggerWakeupCatchUp`).
 */

export type ReminderStatus =
  | "scheduled"
  | "fired"
  | "snoozed"
  | "completed"
  | "cancelled";

export type ReminderSnoozePreset = "30m" | "3h" | "tomorrow9am";

export type ReminderQuickAction =
  | "action.complete"
  | "action.snooze.30m"
  | "action.snooze.3h"
  | "action.snooze.tomorrow9am";

export interface ScheduledReminderRecord {
  id: string;
  taskId: string;
  title: string;
  body?: string;
  fireAtIso: string;
  fireAtEpochMs: number;
  status: ReminderStatus;
  notificationUuid?: string;
  snoozeCount: number;
  updatedAtMs: number;
}

export interface ReminderActionDescriptor {
  action: ReminderQuickAction;
  title: string;
}

export const REMINDER_QUICK_ACTIONS: readonly ReminderActionDescriptor[] = [
  { action: "action.complete", title: "Completar" },
  { action: "action.snooze.30m", title: "Posponer 30 min" },
  { action: "action.snooze.3h", title: "Posponer 3 h" },
  { action: "action.snooze.tomorrow9am", title: "Mañana 09:00" },
] as const;

/**
 * Calcula la nueva fecha de disparo tras posponer un recordatorio:
 * - `"30m"`: +1.800.000 ms (30 minutos)
 * - `"3h"`: +10.800.000 ms (3 horas)
 * - `"tomorrow9am"`: Día siguiente a las 09:00:00.000 (hora local)
 */
export function computeReminderSnoozeDate(
  preset: ReminderSnoozePreset,
  baseDate: Date = new Date()
): Date {
  const baseMs = baseDate.getTime();
  if (preset === "30m") {
    return new Date(baseMs + 1_800_000);
  }
  if (preset === "3h") {
    return new Date(baseMs + 10_800_000);
  }
  const tomorrow = new Date(baseMs);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia de Recordatorios en IndexedDB con Fallback en Memoria
// ─────────────────────────────────────────────────────────────────────────────

export interface ReminderStorageAdapter {
  loadAll(): Promise<ScheduledReminderRecord[]>;
  save(record: ScheduledReminderRecord): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

const REMINDERS_DB_NAME = "prioritask_reminders_db";
const REMINDERS_DB_VERSION = 1;
const REMINDERS_STORE_NAME = "reminders";

export class IndexedDBReminderStorage implements ReminderStorageAdapter {
  private readonly memoryStore = new Map<string, ScheduledReminderRecord>();

  private isIndexedDBSupported(): boolean {
    return (
      typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
    );
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.isIndexedDBSupported()) {
        return reject(new Error("IndexedDB no soportado en este entorno."));
      }
      const req = window.indexedDB.open(
        REMINDERS_DB_NAME,
        REMINDERS_DB_VERSION
      );
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(REMINDERS_STORE_NAME)) {
          db.createObjectStore(REMINDERS_STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error("Error abriendo IndexedDB de recordatorios"));
    });
  }

  async loadAll(): Promise<ScheduledReminderRecord[]> {
    try {
      const db = await this.openDatabase();
      return await new Promise<ScheduledReminderRecord[]>((resolve) => {
        const tx = db.transaction(REMINDERS_STORE_NAME, "readonly");
        const store = tx.objectStore(REMINDERS_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = (req.result as ScheduledReminderRecord[] | undefined) ?? [];
          if (items.length > 0) {
            for (const item of items) {
              this.memoryStore.set(item.id, structuredClone(item));
            }
            resolve(items.map((i) => structuredClone(i)));
          } else {
            resolve(
              Array.from(this.memoryStore.values()).map((i) =>
                structuredClone(i)
              )
            );
          }
        };
        req.onerror = () => {
          resolve(
            Array.from(this.memoryStore.values()).map((i) => structuredClone(i))
          );
        };
        tx.oncomplete = () => db.close();
      });
    } catch {
      return Array.from(this.memoryStore.values()).map((i) =>
        structuredClone(i)
      );
    }
  }

  async save(record: ScheduledReminderRecord): Promise<void> {
    const cloned = structuredClone(record);
    this.memoryStore.set(cloned.id, cloned);

    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(REMINDERS_STORE_NAME, "readwrite");
        const store = tx.objectStore(REMINDERS_STORE_NAME);
        store.put(cloned);
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
      // Fallback en memoria ya actualizado
    }
  }

  async delete(id: string): Promise<void> {
    this.memoryStore.delete(id);
    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(REMINDERS_STORE_NAME, "readwrite");
        const store = tx.objectStore(REMINDERS_STORE_NAME);
        store.delete(id);
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
      // Ignorar si IDB no está disponible
    }
  }

  async clear(): Promise<void> {
    this.memoryStore.clear();
    try {
      const db = await this.openDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(REMINDERS_STORE_NAME, "readwrite");
        const store = tx.objectStore(REMINDERS_STORE_NAME);
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
      // Ignorar si IDB no está disponible
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Planificador BackgroundReminderScheduler
// ─────────────────────────────────────────────────────────────────────────────

export interface NativeNotificationLike {
  close?: () => void;
  onclose?: (() => void) | null;
  onclick?: (() => void) | null;
  addEventListener?: (type: string, listener: () => void) => void;
}

export interface NotificationDispatchPayload {
  notificationUuid: string;
  taskId: string;
  title: string;
  body: string;
  actions: readonly ReminderActionDescriptor[];
  onClose: () => void;
}

export type NotificationDispatcher = (
  payload: NotificationDispatchPayload
) => Promise<unknown> | unknown;

export interface BackgroundReminderSchedulerOptions {
  storage?: ReminderStorageAdapter;
  syncEngine?: OfflineSyncEngine;
  isMainLogicWindow?: boolean | (() => boolean);
  notificationDispatcher?: NotificationDispatcher;
  checkIntervalMs?: number;
}

export class BackgroundReminderScheduler {
  private readonly storage: ReminderStorageAdapter;
  private syncEngine?: OfflineSyncEngine;
  private isMainLogicWindowSource: boolean | (() => boolean);
  private readonly notificationDispatcher?: NotificationDispatcher;
  private readonly checkIntervalMs: number;

  /**
   * Mapa anti-GC (`Jt = new Map` en `webpack/electron/electron.js:1:33175`).
   * Retiene la referencia viva a cada instancia de `Notification` hasta que el
   * usuario interactúa con ella o el sistema emite `close`.
   */
  private readonly activeNotifications = new Map<string, unknown>();

  /** Caché en memoria indexada por `taskId`. */
  private readonly remindersByTask = new Map<string, ScheduledReminderRecord>();

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: BackgroundReminderSchedulerOptions = {}) {
    this.storage = options.storage ?? new IndexedDBReminderStorage();
    this.syncEngine = options.syncEngine;
    this.isMainLogicWindowSource = options.isMainLogicWindow ?? true;
    this.notificationDispatcher = options.notificationDispatcher;
    this.checkIntervalMs = options.checkIntervalMs ?? 15_000;
  }

  async initialize(): Promise<void> {
    this.remindersByTask.clear();
    const persisted = await this.storage.loadAll();
    for (const record of persisted) {
      this.remindersByTask.set(record.taskId, structuredClone(record));
    }
  }

  setMainLogicWindow(isLeader: boolean | (() => boolean)): void {
    this.isMainLogicWindowSource = isLeader;
  }

  setSyncEngine(engine: OfflineSyncEngine): void {
    this.syncEngine = engine;
  }

  private checkIsMainLogicWindow(): boolean {
    if (typeof this.isMainLogicWindowSource === "function") {
      return this.isMainLogicWindowSource();
    }
    return this.isMainLogicWindowSource;
  }

  /**
   * Devuelve el número de notificaciones activas retenidas en memoria contra GC.
   */
  getActiveNotificationCount(): number {
    return this.activeNotifications.size;
  }

  /**
   * Libera explícitamente la referencia viva de una notificación (`cleanReference` en Todoist).
   */
  releaseNotificationReference(notificationUuid: string): boolean {
    const existing = this.activeNotifications.get(notificationUuid) as
      | NativeNotificationLike
      | undefined;
    if (existing && typeof existing.close === "function") {
      try {
        existing.close();
      } catch {
        // Ignorar errores al cerrar notificación nativa
      }
    }
    return this.activeNotifications.delete(notificationUuid);
  }

  getReminders(): ScheduledReminderRecord[] {
    return Array.from(this.remindersByTask.values()).map((r) =>
      structuredClone(r)
    );
  }

  getReminderByTaskId(taskId: string): ScheduledReminderRecord | undefined {
    const found = this.remindersByTask.get(taskId);
    return found ? structuredClone(found) : undefined;
  }

  /**
   * Programa o actualiza un recordatorio para una tarea.
   */
  async scheduleReminder(input: {
    taskId: string;
    title: string;
    body?: string;
    fireAt: string | Date | number;
    syncWithEngine?: boolean;
  }): Promise<ScheduledReminderRecord> {
    const fireAtDate =
      input.fireAt instanceof Date
        ? input.fireAt
        : new Date(input.fireAt);
    const fireAtEpochMs = fireAtDate.getTime();
    const fireAtIso = fireAtDate.toISOString();

    const existing = this.remindersByTask.get(input.taskId);
    const record: ScheduledReminderRecord = {
      id: existing?.id ?? `rem_${input.taskId}`,
      taskId: input.taskId,
      title: input.title,
      body: input.body ?? "Recordatorio de tarea pendiente",
      fireAtIso,
      fireAtEpochMs,
      status: "scheduled",
      snoozeCount: existing?.snoozeCount ?? 0,
      updatedAtMs: Date.now(),
    };

    this.remindersByTask.set(input.taskId, record);
    await this.storage.save(record);

    if (input.syncWithEngine && this.syncEngine) {
      await this.syncEngine.dispatchMutation("task_schedule_reminder", {
        id: input.taskId,
        reminder_at: fireAtIso,
      });
    }

    return structuredClone(record);
  }

  async cancelReminder(taskId: string): Promise<void> {
    const existing = this.remindersByTask.get(taskId);
    if (!existing) return;

    if (existing.notificationUuid) {
      this.releaseNotificationReference(existing.notificationUuid);
    }

    existing.status = "cancelled";
    existing.updatedAtMs = Date.now();
    this.remindersByTask.set(taskId, existing);
    await this.storage.save(existing);
  }

  /**
   * Evalúa todos los recordatorios pendientes cuyo `fireAtEpochMs <= nowMs`.
   * Solo dispara notificaciones si esta instancia es `isMainLogicWindow === true`.
   */
  async evaluateDueReminders(
    nowMs: number = Date.now()
  ): Promise<ScheduledReminderRecord[]> {
    if (!this.checkIsMainLogicWindow()) {
      return [];
    }

    const firedRecords: ScheduledReminderRecord[] = [];

    for (const record of this.remindersByTask.values()) {
      if (
        (record.status === "scheduled" || record.status === "snoozed") &&
        record.fireAtEpochMs <= nowMs
      ) {
        const notificationUuid = generateSyncUuid();
        record.status = "fired";
        record.notificationUuid = notificationUuid;
        record.updatedAtMs = nowMs;

        this.remindersByTask.set(record.taskId, record);
        await this.storage.save(record);

        await this.dispatchNativeNotification(record, notificationUuid);
        firedRecords.push(structuredClone(record));
      }
    }

    return firedRecords;
  }

  /**
   * Ejecuta una evaluación inmediata de recuperación tras salir el sistema de
   * suspensión o hibernación (`powerMonitor.on("resume")` / wakeup).
   */
  async triggerWakeupCatchUp(
    nowMs: number = Date.now()
  ): Promise<ScheduledReminderRecord[]> {
    return this.evaluateDueReminders(nowMs);
  }

  /**
   * Procesa la acción seleccionada por el usuario en la notificación nativa
   * (`action.complete`, `action.snooze.30m`, `action.snooze.3h`, `action.snooze.tomorrow9am`).
   */
  async handleNotificationAction(
    notificationUuid: string,
    taskId: string,
    action: ReminderQuickAction,
    nowDate: Date = new Date()
  ): Promise<ScheduledReminderRecord | null> {
    this.releaseNotificationReference(notificationUuid);

    const nowMs = nowDate.getTime();
    let record = this.remindersByTask.get(taskId);

    if (!record) {
      const existingTask = this.syncEngine?.getTaskById(taskId);
      record = {
        id: `rem_${taskId}`,
        taskId,
        title: existingTask?.titulo ?? "Tarea",
        body: existingTask?.descripcion ?? "",
        fireAtIso: nowDate.toISOString(),
        fireAtEpochMs: nowMs,
        status: "fired",
        notificationUuid,
        snoozeCount: 0,
        updatedAtMs: nowMs,
      };
    }

    if (action === "action.complete") {
      record.status = "completed";
      record.updatedAtMs = nowMs;
      this.remindersByTask.set(taskId, record);
      await this.storage.save(record);

      if (this.syncEngine) {
        await this.syncEngine.dispatchMutation(
          "task_complete",
          { id: taskId },
          { timestamp: nowMs }
        );
      }

      return structuredClone(record);
    }

    const presetMap: Record<
      Exclude<ReminderQuickAction, "action.complete">,
      ReminderSnoozePreset
    > = {
      "action.snooze.30m": "30m",
      "action.snooze.3h": "3h",
      "action.snooze.tomorrow9am": "tomorrow9am",
    };

    const preset = presetMap[action];
    if (preset) {
      const nextFireDate = computeReminderSnoozeDate(preset, nowDate);
      const nextIso = nextFireDate.toISOString();

      record.status = "snoozed";
      record.fireAtEpochMs = nextFireDate.getTime();
      record.fireAtIso = nextIso;
      record.snoozeCount += 1;
      record.updatedAtMs = nowMs;

      this.remindersByTask.set(taskId, record);
      await this.storage.save(record);

      if (this.syncEngine) {
        await this.syncEngine.dispatchMutation(
          "task_schedule_reminder",
          {
            id: taskId,
            reminder_at: nextIso,
          },
          { timestamp: nowMs }
        );
      }

      return structuredClone(record);
    }

    return structuredClone(record);
  }

  startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => {
      void this.evaluateDueReminders();
    }, this.checkIntervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async dispatchNativeNotification(
    record: ScheduledReminderRecord,
    notificationUuid: string
  ): Promise<void> {
    const cleanReference = () => {
      this.activeNotifications.delete(notificationUuid);
    };

    const payload: NotificationDispatchPayload = {
      notificationUuid,
      taskId: record.taskId,
      title: record.title,
      body: record.body ?? "Recordatorio de Prioritask",
      actions: REMINDER_QUICK_ACTIONS,
      onClose: cleanReference,
    };

    if (this.notificationDispatcher) {
      const instance = await this.notificationDispatcher(payload);
      const retainedInstance = instance ?? {
        notificationUuid,
        taskId: record.taskId,
      };
      this.activeNotifications.set(notificationUuid, retainedInstance);
      this.bindCloseHandler(retainedInstance, cleanReference);
      return;
    }

    // Enviar al Service Worker de recordatorios si está activo
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      navigator.serviceWorker?.controller
    ) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: "PRIORITASK_SHOW_REMINDER",
          notificationUuid,
          taskId: record.taskId,
          title: payload.title,
          body: payload.body,
          actions: REMINDER_QUICK_ACTIONS,
        });
        this.activeNotifications.set(notificationUuid, {
          notificationUuid,
          taskId: record.taskId,
          viaServiceWorker: true,
        });
        return;
      } catch {
        // Fallback a Notification API de ventana
      }
    }

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "granted"
    ) {
      try {
        const nativeNotif = new window.Notification(payload.title, {
          body: payload.body,
          tag: `prioritask_reminder_${record.taskId}`,
          data: {
            notificationUuid,
            taskId: record.taskId,
          },
        });
        this.activeNotifications.set(notificationUuid, nativeNotif);
        this.bindCloseHandler(nativeNotif, cleanReference);
        return;
      } catch {
        // Fallback en entornos sin permiso o constructor restringido
      }
    }

    // Retener descriptor lógico hasta su cierre o acción explícita
    this.activeNotifications.set(notificationUuid, {
      notificationUuid,
      taskId: record.taskId,
    });
  }

  private bindCloseHandler(
    instance: unknown,
    cleanReference: () => void
  ): void {
    if (!instance || typeof instance !== "object") return;
    const notif = instance as NativeNotificationLike;

    if (typeof notif.addEventListener === "function") {
      notif.addEventListener("close", cleanReference);
    }

    const prevOnClose = notif.onclose;
    notif.onclose = () => {
      if (typeof prevOnClose === "function") {
        prevOnClose();
      }
      cleanReference();
    };
  }
}
