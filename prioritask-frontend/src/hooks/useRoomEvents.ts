import { useEffect, useRef, useState, useCallback } from "react";
import { useToast } from "../context/ToastContext";
import { announce } from "../components/common/ScreenReaderAnnouncer";
import { cacheManager } from "../services/cacheManager";
import type { Task, Subtask } from "../types/task";

export type RoomEventType =
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "SUBTASK_TOGGLED"
  | "SUBTASK_CREATED"
  | "COMMENT_ADDED"
  | "COMMENT_DELETED"
  | "ATTACHMENT_ADDED"
  | "ATTACHMENT_DELETED"
  | "MEMBER_EVICTED"
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

const getUserIdFromToken = (): string | null => {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(window.atob(base64));
    return payload.sub || payload.user_id || null;
  } catch {
    return null;
  }
};

export const useRoomEvents = (
  roomId?: string | null,
  onEvent?: (event: RoomSyncEvent) => void
): UseRoomEventsReturn => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<RoomSyncEvent | null>(null);

  const { toast } = useToast();

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const handleIncomingEvent = useCallback(
    (eventType: RoomEventType, data: unknown, isFromBroadcast = false) => {
      if (eventType === "ping") return;

      const currentRoomId = roomId || "";

      const eventPayload: RoomSyncEvent = {
        type: eventType,
        data,
        roomId: currentRoomId,
        timestamp: Date.now(),
        sourceTabId: TAB_ID,
      };

      setLastEvent(eventPayload);

      // Actualización directa de la caché L1 en cliente ante eventos SSE
      if (currentRoomId) {
        switch (eventType) {
          case "TASK_CREATED": {
            const newTask = data as Task;
            if (newTask && newTask.id) {
              cacheManager.addTaskToCache(currentRoomId, newTask);
            }
            break;
          }
          case "TASK_UPDATED": {
            const updated = data as Partial<Task> & { id: string };
            if (updated && updated.id) {
              cacheManager.updateTaskInCache(currentRoomId, updated);
            }
            break;
          }
          case "TASK_DELETED": {
            const payload = data as { id?: string; task_id?: string } | string;
            const deletedId =
              typeof payload === "string" ? payload : payload?.id || payload?.task_id;
            if (deletedId) {
              cacheManager.removeTaskFromCache(currentRoomId, deletedId);
            }
            break;
          }
          case "SUBTASK_TOGGLED":
          case "SUBTASK_CREATED": {
            const subtaskPayload = data as {
              task_id?: string;
              subtask?: Subtask;
              subtasks_count?: number;
              subtasks_completed_count?: number;
            };
            if (subtaskPayload?.task_id) {
              cacheManager.updateSubtaskInCache(
                currentRoomId,
                subtaskPayload.task_id,
                subtaskPayload
              );
            }
            break;
          }
          case "COMMENT_ADDED": {
            const commentPayload = data as {
              task_id?: string;
              comments_count?: number;
            };
            if (commentPayload?.task_id) {
              cacheManager.updateCommentsCountInCache(
                currentRoomId,
                commentPayload.task_id,
                commentPayload.comments_count !== undefined
                  ? { comments_count: commentPayload.comments_count }
                  : 1
              );
            }
            break;
          }
          case "COMMENT_DELETED": {
            const commentPayload = data as {
              task_id?: string;
              comments_count?: number;
            };
            if (commentPayload?.task_id) {
              cacheManager.updateCommentsCountInCache(
                currentRoomId,
                commentPayload.task_id,
                commentPayload.comments_count !== undefined
                  ? { comments_count: commentPayload.comments_count }
                  : -1
              );
            }
            break;
          }
          case "ATTACHMENT_ADDED": {
            const attPayload = data as {
              task_id?: string;
              attachments_count?: number;
            };
            if (attPayload?.task_id) {
              cacheManager.updateAttachmentsCountInCache(
                currentRoomId,
                attPayload.task_id,
                attPayload.attachments_count !== undefined
                  ? { attachments_count: attPayload.attachments_count }
                  : 1
              );
            }
            break;
          }
          case "ATTACHMENT_DELETED": {
            const attPayload = data as {
              task_id?: string;
              attachments_count?: number;
            };
            if (attPayload?.task_id) {
              cacheManager.updateAttachmentsCountInCache(
                currentRoomId,
                attPayload.task_id,
                attPayload.attachments_count !== undefined
                  ? { attachments_count: attPayload.attachments_count }
                  : -1
              );
            }
            break;
          }
          case "POINTS_AWARDED":
          case "STREAK_UPDATED":
          case "REWARD_REDEEMED": {
            cacheManager.invalidateRoom(currentRoomId);
            break;
          }
        }
      }

      // Manejo específico del evento MEMBER_EVICTED
      if (eventType === "MEMBER_EVICTED") {
        const currentUserId = getUserIdFromToken();
        const evictedUserId = (data as { user_id?: string })?.user_id;

        if (evictedUserId && currentUserId && evictedUserId === currentUserId) {
          toastRef.current.warning("Has sido removido de este hogar", {
            duration: 5000,
          });
          announce("Has sido removido de este hogar. Redirigiendo a tu panel.");
          if (typeof window !== "undefined") {
            window.location.href = "/dashboard";
          }
          return;
        }
      }

      // Notificar al callback de conciliación granular in-place
      if (onEventRef.current) {
        onEventRef.current(eventPayload);
      }

      // Mensajes amigables para toasts y lectores de pantalla
      const eventMessages: Partial<Record<RoomEventType, string>> = {
        TASK_CREATED: "Nueva tarea agregada en el hogar",
        TASK_UPDATED: "Una tarea fue modificada en el hogar",
        TASK_DELETED: "Una tarea fue eliminada en el hogar",
        SUBTASK_TOGGLED: "Progreso de subtarea actualizado",
        SUBTASK_CREATED: "Nueva subtarea añadida",
        COMMENT_ADDED: "Nuevo comentario añadido en una tarea",
        COMMENT_DELETED: "Comentario eliminado en una tarea",
        ATTACHMENT_ADDED: "Nuevo archivo adjunto subido",
        ATTACHMENT_DELETED: "Archivo adjunto eliminado",
        MEMBER_EVICTED: "Un miembro ha salido del hogar",
        POINTS_AWARDED: "¡Puntos otorgados en el hogar! 🪙",
        STREAK_UPDATED: "¡Racha de tareas actualizada! 🔥",
        REWARD_REDEEMED: "¡Alguien ha canjeado una recompensa! 🎁",
      };

      const message = eventMessages[eventType] || "Cambio detectado en la sala...";

      // Anunciar a lectores de pantalla (NVDA, TalkBack, VoiceOver)
      announce(message);

      // Toast informativo
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
        "SUBTASK_CREATED",
        "COMMENT_ADDED",
        "COMMENT_DELETED",
        "ATTACHMENT_ADDED",
        "ATTACHMENT_DELETED",
        "MEMBER_EVICTED",
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
