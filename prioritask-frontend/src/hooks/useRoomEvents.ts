import { useEffect, useRef, useState, useCallback } from "react";
import { useToast } from "../context/ToastContext";
import { useTaskUpdate } from "../context/TaskUpdateContext";

export type RoomEventType =
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "SUBTASK_TOGGLED"
  | "COMMENT_ADDED"
  | "COMMENT_DELETED"
  | "POINTS_AWARDED"
  | "STREAK_UPDATED"
  | "REWARD_REDEEMED"
  | "ping";

export interface RoomSyncEvent<T = unknown> {
  type: RoomEventType;
  data: T;
  roomId: string;
  timestamp: number;
  sourceTabId?: string;
}

export interface UseRoomEventsReturn {
  isConnected: boolean;
  lastEvent: RoomSyncEvent | null;
}

const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

export const useRoomEvents = (roomId?: string | null): UseRoomEventsReturn => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<RoomSyncEvent | null>(null);

  const { toast } = useToast();
  const { notifyUpdate } = useTaskUpdate();

  // Mantener referencias estables para evitar re-suscripciones innecesarias
  const notifyUpdateRef = useRef(notifyUpdate);
  useEffect(() => {
    notifyUpdateRef.current = notifyUpdate;
  }, [notifyUpdate]);

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const handleIncomingEvent = useCallback(
    (eventType: RoomEventType, data: unknown, isFromBroadcast = false) => {
      if (eventType === "ping") return;

      const eventPayload: RoomSyncEvent = {
        type: eventType,
        data,
        roomId: roomId || "",
        timestamp: Date.now(),
        sourceTabId: TAB_ID,
      };

      setLastEvent(eventPayload);

      // Reactividad: invalidar queries y refrescar listas de tareas
      notifyUpdateRef.current();

      // Toast sutil informando a los miembros del hogar
      const eventMessages: Record<string, string> = {
        TASK_CREATED: "Nueva tarea agregada en el hogar",
        TASK_UPDATED: "Una tarea fue modificada en el hogar",
        TASK_DELETED: "Una tarea fue eliminada en el hogar",
        SUBTASK_TOGGLED: "Progreso de subtarea actualizado",
        COMMENT_ADDED: "Nuevo comentario añadido en una tarea",
        COMMENT_DELETED: "Comentario eliminado en una tarea",
        POINTS_AWARDED: "¡Puntos otorgados en el hogar! 🪙",
        STREAK_UPDATED: "¡Racha de tareas actualizada! 🔥",
        REWARD_REDEEMED: "¡Alguien ha canjeado una recompensa! 🎁",
      };

      const message =
        eventMessages[eventType] || "Cambio detectado en la sala...";

      toastRef.current.info(message, {
        duration: 3500,
      });

      // Si el evento provino del SSE de esta pestaña, propagar a otras pestañas
      if (!isFromBroadcast && broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage(eventPayload);
        } catch (err) {
          console.warn("Error transmitiendo en BroadcastChannel:", err);
        }
      }
    },
    [roomId]
  );

  useEffect(() => {
    if (!roomId) {
      setIsConnected(false);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setIsConnected(false);
      return;
    }

    // Inicializar canal BroadcastChannel para sincronización inter-pestañas
    let channel: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel("prioritask_sync");
        broadcastChannelRef.current = channel;

        channel.onmessage = (ev: MessageEvent<RoomSyncEvent>) => {
          const syncEvent = ev.data;
          // Ignorar eventos generados por esta misma pestaña o de otra sala
          if (
            !syncEvent ||
            syncEvent.sourceTabId === TAB_ID ||
            syncEvent.roomId !== roomId
          ) {
            return;
          }
          handleIncomingEvent(syncEvent.type, syncEvent.data, true);
        };
      } catch (err) {
        console.warn("BroadcastChannel no soportado o bloqueado:", err);
      }
    }

    // Conectar EventSource al hub de SSE del hogar
    const apiBase = (
      import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1"
    ).replace(/\/+$/, "");
    const streamUrl = `${apiBase}/rooms/${encodeURIComponent(
      roomId
    )}/events?token=${encodeURIComponent(token)}`;

    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      // Control del evento Ping de conexión inicial
      eventSource.addEventListener("ping", () => {
        setIsConnected(true);
      });

      // Manejadores específicos para eventos SSE de dominio
      const supportedEvents: RoomEventType[] = [
        "TASK_CREATED",
        "TASK_UPDATED",
        "TASK_DELETED",
        "SUBTASK_TOGGLED",
        "COMMENT_ADDED",
        "COMMENT_DELETED",
        "POINTS_AWARDED",
        "STREAK_UPDATED",
        "REWARD_REDEEMED",
      ];

      const eventListeners: Record<string, (e: MessageEvent) => void> = {};

      supportedEvents.forEach((type) => {
        const listener = (e: MessageEvent) => {
          try {
            const data = e.data ? JSON.parse(e.data) : null;
            handleIncomingEvent(type, data, false);
          } catch {
            handleIncomingEvent(type, e.data, false);
          }
        };
        eventListeners[type] = listener;
        eventSource?.addEventListener(type, listener);
      });

      eventSource.onerror = (e) => {
        setIsConnected(false);
        // EventSource intentará reconectar automáticamente si no se cierra
        if (eventSource?.readyState === EventSource.CLOSED) {
          console.debug("SSE stream desconectado para el hogar:", roomId, e);
        }
      };

      return () => {
        supportedEvents.forEach((type) => {
          if (eventListeners[type]) {
            eventSource?.removeEventListener(type, eventListeners[type]);
          }
        });
        eventSource?.close();
        if (channel) {
          channel.close();
          broadcastChannelRef.current = null;
        }
        setIsConnected(false);
      };
    } catch (err) {
      console.error("Error al instanciar EventSource:", err);
      setIsConnected(false);
      if (channel) {
        channel.close();
        broadcastChannelRef.current = null;
      }
    }
  }, [roomId, handleIncomingEvent]);

  return { isConnected, lastEvent };
};

export default useRoomEvents;
