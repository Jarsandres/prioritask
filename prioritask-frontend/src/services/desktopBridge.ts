import type { PrioritaskDesktopBridge } from "../types/desktop";

/**
 * Adaptador de utilidades para interactuar de forma segura con el proceso principal
 * de Electron en entornos desktop o degradar elegantemente a no-op en navegadores web.
 */

function getDesktop(): PrioritaskDesktopBridge | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.prioritaskDesktop;
}

/**
 * Indica si la aplicación está ejecutándose dentro del wrapper Electron Companion.
 */
export function isDesktopAvailable(): boolean {
  const desktop = getDesktop();
  return Boolean(desktop?.isDesktop);
}

/**
 * Suscribe un listener al evento de reactivación tras suspensión emitido por Electron (powerMonitor).
 * Retorna una función para cancelar la suscripción.
 */
export function onDesktopWakeup(callback: () => void): () => void {
  const desktop = getDesktop();
  if (desktop?.ipc?.onWakeup) {
    try {
      return desktop.ipc.onWakeup(callback);
    } catch (err) {
      console.warn("[DesktopBridge] Error suscribiendo a onDesktopWakeup:", err);
    }
  }
  return () => {};
}

/**
 * Suscribe un listener al evento de tarea capturada vía ventana flotante Quick Add.
 * Retorna una función para cancelar la suscripción.
 */
export function onDesktopAddTask(callback: (task: unknown) => void): () => void {
  const desktop = getDesktop();
  if (desktop?.ipc?.onAddTask) {
    try {
      return desktop.ipc.onAddTask(callback);
    } catch (err) {
      console.warn("[DesktopBridge] Error suscribiendo a onDesktopAddTask:", err);
    }
  }
  return () => {};
}

/**
 * Envía una tarea creada desde la vista Quick Add hacia la ventana principal de la aplicación.
 */
export function notifyQuickAddCreated(taskData: unknown): void {
  const desktop = getDesktop();
  if (desktop?.ipc?.quickAddAddTask) {
    try {
      desktop.ipc.quickAddAddTask(taskData);
    } catch (err) {
      console.warn("[DesktopBridge] Error notificando quickAddAddTask:", err);
    }
  }
}

/**
 * Solicita una sincronización inmediata a través del canal IPC desktop.
 */
export function requestDesktopSync(): void {
  const desktop = getDesktop();
  if (desktop?.ipc?.sendRequestSync) {
    try {
      desktop.ipc.sendRequestSync();
    } catch (err) {
      console.warn("[DesktopBridge] Error en requestDesktopSync:", err);
    }
  }
}

/**
 * Configura si la ventana actual es la encargada de la lógica principal de sincronización.
 */
export function setDesktopMainLogicWindow(isMain: boolean): void {
  const desktop = getDesktop();
  if (desktop?.ipc?.setMainLogicWindow) {
    try {
      desktop.ipc.setMainLogicWindow(isMain);
    } catch (err) {
      console.warn("[DesktopBridge] Error en setDesktopMainLogicWindow:", err);
    }
  }
}
