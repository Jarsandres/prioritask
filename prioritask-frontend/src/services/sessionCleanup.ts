import { cacheManager } from "./cacheManager";
import { IndexedDBQueueStorageAdapter } from "../sync/offlineQueue";
import { IndexedDBReminderStorage } from "../notifications/reminderScheduler";

const SESSION_LOCAL_STORAGE_KEYS = [
  "token",
  "access_token",
  "refreshToken",
  "roomId",
  "prioritask-user-settings-v1",
] as const;

const ROOM_ASSIGNEES_PREFIX = "prioritask_room_assignees_";

/**
 * Limpia de forma centralizada todas las credenciales locales, preferencias de sesión,
 * caché L1 en memoria (`cacheManager`) y almacenes IndexedDB (`offlineQueue` y `reminders`)
 * para prevenir fugas de datos entre sesiones en dispositivos compartidos.
 */
export async function clearClientSessionData(): Promise<void> {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      for (const key of SESSION_LOCAL_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }

      const dynamicKeysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(ROOM_ASSIGNEES_PREFIX)) {
          dynamicKeysToRemove.push(key);
        }
      }
      for (const key of dynamicKeysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {
      // Ignorar errores de acceso a Web Storage en contextos restringidos
    }
  }

  try {
    cacheManager.clearCache();
  } catch {
    // Continuar aunque falle la limpieza de caché en memoria
  }

  try {
    await new IndexedDBQueueStorageAdapter().clear();
  } catch {
    // Silencioso en entornos sin IndexedDB o en tests
  }

  try {
    await new IndexedDBReminderStorage().clear();
  } catch {
    // Silencioso en entornos sin IndexedDB o en tests
  }
}

export default clearClientSessionData;
