export interface OfflineMutation {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  data?: unknown;
  params?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

const DB_NAME = "prioritask_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "offline_mutations";

// In-memory fallback para entornos de testing (Vitest/JSDOM sin indexedDB completo) o navegadores en modo privado restrictivo
const memoryStore = new Map<string, OfflineMutation>();

const isIndexedDBAvailable = (): boolean => {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error("IndexedDB no está disponible en este entorno"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Error al abrir base de datos IndexedDB"));
    };
  });
};

/**
 * Encola una mutación destructiva o de creación en IndexedDB con orden cronológico (FIFO).
 */
export const enqueueMutation = async (
  mutation: Omit<OfflineMutation, "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
  }
): Promise<OfflineMutation> => {
  const finalMutation: OfflineMutation = {
    id: mutation.id || `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    url: mutation.url,
    method: mutation.method,
    data: mutation.data,
    params: mutation.params,
    headers: mutation.headers,
    timestamp: mutation.timestamp || Date.now(),
  };

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(finalMutation);

      req.onsuccess = () => {
        // Mantener sincronizado también el fallback en memoria
        memoryStore.set(finalMutation.id, finalMutation);
        resolve(finalMutation);
      };

      req.onerror = () => {
        // Fallback a memoria
        memoryStore.set(finalMutation.id, finalMutation);
        resolve(finalMutation);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    // Si IndexedDB falla o no está disponible, guardar en memoria
    memoryStore.set(finalMutation.id, finalMutation);
    return finalMutation;
  }
};

/**
 * Obtiene todas las mutaciones pendientes en orden FIFO (más antiguas primero).
 */
export const getPendingMutations = async (): Promise<OfflineMutation[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as OfflineMutation[]) || [];
        results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(results);
      };

      req.onerror = () => {
        const memResults = Array.from(memoryStore.values()).sort(
          (a, b) => a.timestamp - b.timestamp
        );
        resolve(memResults);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    const memResults = Array.from(memoryStore.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
    return memResults;
  }
};

/**
 * Elimina una mutación procesada exitosamente de IndexedDB.
 */
export const removeMutation = async (id: string): Promise<void> => {
  memoryStore.delete(id);
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        resolve();
      };

      req.onerror = () => {
        resolve();
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    // Si falla IndexedDB, ya se eliminó de memoria
    return Promise.resolve();
  }
};

/**
 * Limpia todas las mutaciones encoladas.
 */
export const clearQueue = async (): Promise<void> => {
  memoryStore.clear();
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => {
        resolve();
      };

      req.onerror = () => {
        resolve();
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return Promise.resolve();
  }
};
