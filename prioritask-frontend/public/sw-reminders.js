/**
 * Service Worker de Recordatorios Accionables de Prioritask (`sw-reminders.js`)
 *
 * Gestiona el despliegue de notificaciones nativas del sistema operativo con
 * botones de acción rápida (`Completar`, `Posponer 30 min`, `Posponer 3 h`, `Mañana 09:00`)
 * y retransmite la acción seleccionada hacia los clientes abiertos (`WindowClient`).
 */

const DEFAULT_REMINDER_ACTIONS = [
  { action: "action.complete", title: "Completar" },
  { action: "action.snooze.30m", title: "Posponer 30 min" },
  { action: "action.snooze.3h", title: "Posponer 3 h" },
  { action: "action.snooze.tomorrow9am", title: "Mañana 09:00" },
];

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "PRIORITASK_SHOW_REMINDER") {
    return;
  }

  const title = data.title || "Recordatorio de Prioritask";
  const options = {
    body: data.body || "Tienes una tarea pendiente",
    tag: `prioritask_reminder_${data.taskId || data.notificationUuid || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    actions: Array.isArray(data.actions) ? data.actions : DEFAULT_REMINDER_ACTIONS,
    data: {
      notificationUuid: data.notificationUuid,
      taskId: data.taskId,
      url: data.url || "/dashboard",
    },
  };

  if (self.registration && typeof self.registration.showNotification === "function") {
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const notifData = (notification && notification.data) || {};
  const selectedAction = event.action || "default";

  if (notification && typeof notification.close === "function") {
    notification.close();
  }

  const payload = {
    type: "PRIORITASK_NOTIFICATION_ACTION",
    action: selectedAction,
    taskId: notifData.taskId,
    notificationUuid: notifData.notificationUuid,
  };

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        if (windowClients && windowClients.length > 0) {
          for (const client of windowClients) {
            client.postMessage(payload);
          }
          const primaryClient = windowClients[0];
          if (primaryClient && "focus" in primaryClient) {
            return primaryClient.focus();
          }
          return undefined;
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(notifData.url || "/dashboard");
        }
        return undefined;
      })
  );
});
