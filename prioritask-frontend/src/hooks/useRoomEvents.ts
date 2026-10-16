import { useEffect, useRef, useState, useCallback } from "react";
import { useToast } from "../context/ToastContext";
import { announce } from "../components/common/ScreenReaderAnnouncer";
import { cacheManager } from "../services/cacheManager";
import { TabLeaderCoordinator } from "../sync/tabCoordinator";
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
  leaderTabId?: string | null;
}

export interface UseRoomEventsReturn {
  isConnected: boolean;
  lastEvent: RoomSyncEvent | null;
  isLeader?: boolean;
}

const getUserIdFromToken = (): string | null => {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(window.atob(base64)) as {
      sub?: string;
      user_id?: string;
    };
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
  const [isLeader, setIsLeader] = useState<boolean>(false);

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
  const coordinatorRef = useRef<TabLeaderCoordinator | null>(null);

  const handleIncomingEvent = useCallback(
    (
      eventType: RoomEventType,
      data: unknown,
      isFromBroadcast = false,
      incomingSourceTabId?: string,
      incomingLeaderTabId?: string | null
    ) => {
      const currentRoomId = roomId || "";
      const activeTabId = coordinatorRef.current?.tabId;
      const activeLeaderId =
        incomingLeaderTabId ?? coordinatorRef.current?.getLeaderTabId() ?? null;

      if (eventType === "ping") {
        setIsConnected(true);
        if (!isFromBroadcast && broadcastChannelRef.current && activeTabId) {
          try {
            const pingPayload: RoomSyncEvent = {
              type: "ping",
              data: null,
              roomId: currentRoomId,
              timestamp: Date.now(),
              sourceTabId: activeTabId,
              leaderTabId: activeLeaderId,
            };
            broadcastChannelRef.current.postMessage(pingPayload);
          } catch {
            // Ignorar fallo de transmisión en BroadcastChannel
          }
        }
        return;
      }

      const eventPayload: RoomSyncEvent = {
        type: eventType,
        data,
        roomId: currentRoomId,
        timestamp: Date.now(),
        sourceTabId: incomingSourceTabId ?? activeTabId,
        leaderTabId: activeLeaderId,
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

      // Si el evento provino del SSE de esta pestaña líder, propagar a las pestañas seguidoras
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
      setIsLeader(false);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setIsConnected(false);
      setIsLeader(false);
      return;
    }

    const coordinator = new TabLeaderCoordinator({
      lockName: `prioritask_sse_leader_${roomId}`,
      channelName: `prioritask_coordinator_${roomId}`,
    });
    coordinatorRef.current = coordinator;

    // Inicializar canal BroadcastChannel para sincronización inter-pestañas
    let channel: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel("prioritask_sync");
        broadcastChannelRef.current = channel;

        channel.onmessage = (ev: MessageEvent<RoomSyncEvent>) => {
          const syncEvent = ev.data;
          if (
            !syncEvent ||
            syncEvent.sourceTabId === coordinator.tabId ||
            syncEvent.roomId !== roomId
          ) {
            return;
          }

          // Verificar que el emisor sea el líder autorizado si está identificado
          if (
            syncEvent.sourceTabId &&
            coordinator.getLeaderTabId() &&
            !coordinator.isAuthorizedSender({
              senderTabId: syncEvent.sourceTabId,
            })
          ) {
            return;
          }

          setIsConnected(true);
          handleIncomingEvent(
            syncEvent.type,
            syncEvent.data,
            true,
            syncEvent.sourceTabId,
            syncEvent.leaderTabId
          );
        };
      } catch (err) {
        console.warn("BroadcastChannel no soportado o bloqueado:", err);
      }
    }

    // H1: fallback local solo en desarrollo; el build de producción no hornea
    // `localhost` y exige VITE_API_URL (rama DEV eliminada en build).
    const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
    const rawApiBase =
      configuredApiUrl ??
      (import.meta.env.DEV ? "http://localhost:8000/api/v1" : "");
    if (!rawApiBase) {
      throw new Error(
        "VITE_API_URL no está definida para el build de producción"
      );
    }
    const apiBase = rawApiBase.replace(/\/+$/, "");
    const streamUrl = `${apiBase}/rooms/${encodeURIComponent(
      roomId
    )}/events?token=${encodeURIComponent(token)}`;

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

    let eventSource: EventSource | null = null;
    let eventListeners: Record<string, (e: MessageEvent) => void> = {};

    const closeEventSource = () => {
      if (!eventSource) return;
      supportedEvents.forEach((type) => {
        if (eventListeners[type]) {
          eventSource?.removeEventListener(type, eventListeners[type]);
        }
      });
      eventListeners = {};
      eventSource.close();
      eventSource = null;
    };

    const openEventSourceIfLeader = () => {
      if (!coordinator.isMainLogicWindow()) {
        closeEventSource();
        return;
      }
      if (eventSource) {
        return;
      }

      try {
        eventSource = new EventSource(streamUrl);

        eventSource.onopen = () => {
          setIsConnected(true);
          handleIncomingEvent("ping", null, false);
        };

        eventSource.addEventListener("ping", () => {
          setIsConnected(true);
          handleIncomingEvent("ping", null, false);
        });

        supportedEvents.forEach((type) => {
          const listener = (e: MessageEvent) => {
            try {
              const data: unknown = e.data ? JSON.parse(String(e.data)) : null;
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
      } catch (err) {
        console.error("Error al instanciar EventSource:", err);
        setIsConnected(false);
      }
    };

    const unsubscribeLeadership = coordinator.onLeadershipChange(
      (leaderStatus) => {
        setIsLeader(leaderStatus);
        if (leaderStatus) {
          openEventSourceIfLeader();
        } else {
          closeEventSource();
        }
      }
    );

    void coordinator.start().then(() => {
      const currentLeaderStatus = coordinator.isMainLogicWindow();
      setIsLeader(currentLeaderStatus);
      if (currentLeaderStatus) {
        openEventSourceIfLeader();
      }
    });

    return () => {
      unsubscribeLeadership();
      closeEventSource();
      coordinator.stop();
      coordinatorRef.current = null;
      if (channel) {
        channel.close();
        broadcastChannelRef.current = null;
      }
      setIsConnected(false);
      setIsLeader(false);
    };
  }, [roomId, handleIncomingEvent]);

  return { isConnected, lastEvent, isLeader };
};

export default useRoomEvents;

