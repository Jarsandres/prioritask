import { describe, it, expect } from "vitest";
import {
  BackgroundReminderScheduler,
  IndexedDBReminderStorage,
  computeReminderSnoozeDate,
} from "../reminderScheduler";
import {
  OfflineSyncEngine,
  IndexedDBQueueStorageAdapter,
  createSimulatedSyncTransport,
} from "../../sync/offlineQueue";
import type { Task } from "../../types/task";

describe("BackgroundReminderScheduler (Todoist-inspired Notifications & Anti-GC Retention)", () => {
  it("fires due reminders exclusively on mainLogicWindow and retains active notification references until close", async () => {
    const reminderStorage = new IndexedDBReminderStorage();
    await reminderStorage.clear();

    const closedCallbacks: Record<string, () => void> = {};
    const dispatchedNotifications: string[] = [];

    const followerScheduler = new BackgroundReminderScheduler({
      storage: reminderStorage,
      isMainLogicWindow: false,
      notificationDispatcher: (payload) => {
        dispatchedNotifications.push(`follower:${payload.taskId}`);
        return { close: () => payload.onClose() };
      },
    });

    const leaderScheduler = new BackgroundReminderScheduler({
      storage: reminderStorage,
      isMainLogicWindow: true,
      notificationDispatcher: (payload) => {
        dispatchedNotifications.push(`leader:${payload.taskId}`);
        closedCallbacks[payload.notificationUuid] = payload.onClose;
        return {
          close: () => payload.onClose(),
        };
      },
    });

    await followerScheduler.initialize();
    await leaderScheduler.initialize();

    const dueMs = 1_760_000_000_000;
    await followerScheduler.scheduleReminder({
      taskId: "task_rem_1",
      title: "Pagar factura de luz",
      fireAt: dueMs,
    });
    await leaderScheduler.initialize();

    // La ventana seguidora NO debe disparar notificaciones duplicadas
    const followerFired = await followerScheduler.evaluateDueReminders(
      dueMs + 100
    );
    expect(followerFired).toHaveLength(0);
    expect(dispatchedNotifications).toHaveLength(0);

    // La ventana líder SÍ dispara la notificación y retiene la referencia anti-GC
    const leaderFired = await leaderScheduler.evaluateDueReminders(dueMs + 100);
    expect(leaderFired).toHaveLength(1);
    expect(leaderFired[0].status).toBe("fired");
    expect(dispatchedNotifications).toEqual(["leader:task_rem_1"]);
    expect(leaderScheduler.getActiveNotificationCount()).toBe(1);

    const notifUuid = leaderFired[0].notificationUuid!;
    expect(notifUuid).toBeDefined();

    // Al cerrarse la notificación nativa, se limpia su referencia del Map anti-GC
    closedCallbacks[notifUuid]();
    expect(leaderScheduler.getActiveNotificationCount()).toBe(0);
  });

  it("handles quick actions (action.complete and action.snooze.30m/3h/tomorrow9am) integrated with OfflineSyncEngine", async () => {
    const reminderStorage = new IndexedDBReminderStorage();
    await reminderStorage.clear();

    const queueStorage = new IndexedDBQueueStorageAdapter();
    await queueStorage.clear();

    const initialTask: Task = {
      id: "task_actionable_1",
      titulo: "Sacar la basura",
      categoria: "Hogar",
      peso: 2,
      estado: "TODO",
      version: 1,
    };

    const { transport } = createSimulatedSyncTransport([initialTask]);
    const syncEngine = new OfflineSyncEngine({
      storage: queueStorage,
      transport,
    });
    await syncEngine.initialize([initialTask]);

    const scheduler = new BackgroundReminderScheduler({
      storage: reminderStorage,
      syncEngine,
      isMainLogicWindow: true,
    });
    await scheduler.initialize();

    const baseDate = new Date("2026-05-10T14:00:00.000Z");
    await scheduler.scheduleReminder({
      taskId: "task_actionable_1",
      title: "Sacar la basura",
      fireAt: baseDate.getTime() - 1000,
    });

    const fired = await scheduler.evaluateDueReminders(baseDate.getTime());
    expect(fired).toHaveLength(1);
    expect(scheduler.getActiveNotificationCount()).toBe(1);

    const notifUuid = fired[0].notificationUuid!;

    // 1. Posponer 30 minutos desde la acción rápida de la notificación
    const snoozed30m = await scheduler.handleNotificationAction(
      notifUuid,
      "task_actionable_1",
      "action.snooze.30m",
      baseDate
    );

    expect(scheduler.getActiveNotificationCount()).toBe(0);
    expect(snoozed30m?.status).toBe("snoozed");
    expect(snoozed30m?.fireAtEpochMs).toBe(baseDate.getTime() + 1_800_000);
    expect(syncEngine.getTaskById("task_actionable_1")?.reminder_at).toBe(
      new Date(baseDate.getTime() + 1_800_000).toISOString()
    );

    // Verificar cálculo de 3h y mañana a las 09:00
    const snooze3hDate = computeReminderSnoozeDate("3h", baseDate);
    expect(snooze3hDate.getTime()).toBe(baseDate.getTime() + 10_800_000);

    const snoozeTomorrow = computeReminderSnoozeDate("tomorrow9am", baseDate);
    expect(snoozeTomorrow.getHours()).toBe(9);
    expect(snoozeTomorrow.getMinutes()).toBe(0);

    // 2. Completar la tarea desde la acción rápida de la notificación
    const completedRecord = await scheduler.handleNotificationAction(
      "notif_uuid_2",
      "task_actionable_1",
      "action.complete",
      new Date(baseDate.getTime() + 60_000)
    );

    expect(completedRecord?.status).toBe("completed");
    expect(syncEngine.getTaskById("task_actionable_1")?.estado).toBe("DONE");
    expect(syncEngine.getTaskById("task_actionable_1")?.completed).toBe(true);
  });

  it("evaluates overdue alarms accumulated during OS sleep via triggerWakeupCatchUp", async () => {
    const reminderStorage = new IndexedDBReminderStorage();
    await reminderStorage.clear();

    const scheduler = new BackgroundReminderScheduler({
      storage: reminderStorage,
      isMainLogicWindow: true,
    });
    await scheduler.initialize();

    await scheduler.scheduleReminder({
      taskId: "task_sleep_1",
      title: "Regar plantas",
      fireAt: 1000,
    });
    await scheduler.scheduleReminder({
      taskId: "task_sleep_2",
      title: "Revisar caldera",
      fireAt: 2000,
    });
    await scheduler.scheduleReminder({
      taskId: "task_future_3",
      title: "Comprar pan",
      fireAt: 9000,
    });

    // El sistema despierta en T = 5000ms
    const caughtUp = await scheduler.triggerWakeupCatchUp(5000);
    expect(caughtUp.map((r) => r.taskId)).toEqual([
      "task_sleep_1",
      "task_sleep_2",
    ]);
    expect(scheduler.getReminderByTaskId("task_future_3")?.status).toBe(
      "scheduled"
    );
  });
});
