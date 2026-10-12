import {
  generateSyncUuid,
  type DesktopBridgeEnvelope,
  type OfflineSyncEngine,
} from "./offlineQueue";

/**
 * Coordinador Multi-Pestaña con Elección de Líder Único (`TabLeaderCoordinator`)
 *
 * Inspirado en la arquitectura `We.mainLogicWindow`, `Gn(e)` y `zi(e)` de Todoist
 * (`webpack/electron/electron.js` y `webpack/todoist-main-preload/preload.js`):
 * - Garantiza que una única pestaña actúe como `mainLogicWindow` (líder) para
 *   drenar la cola de sincronización, mantener el stream SSE y disparar alarmas.
 * - Utiliza Web Locks API (`navigator.locks.request`) cuando está disponible y
 *   `BroadcastChannel` + cola determinista FIFO como mecanismo de coordinación
 *   y failover instantáneo cuando la pestaña líder se cierra (`stop()`).
 * - Valida el remitente de los mensajes inter-pestaña mediante `isAuthorizedSender`
 *   (equivalente a la guardia `zi(e)` de Todoist).
 */

export type CoordinatedBridgeEnvelope<TPayload = unknown> =
  DesktopBridgeEnvelope<TPayload> & {
    senderTabId?: string;
    leaderTabId?: string | null;
    roomId?: string;
  };

interface InternalCoordinationMessage {
  kind:
    | "LEADER_CLAIM"
    | "LEADER_HEARTBEAT"
    | "LEADER_STEPDOWN"
    | "WHO_IS_LEADER"
    | "BRIDGE_ENVELOPE";
  senderTabId: string;
  leaderTabId: string | null;
  timestamp: number;
  envelope?: CoordinatedBridgeEnvelope;
}

export interface TabLeaderCoordinatorOptions {
  tabId?: string;
  lockName?: string;
  channelName?: string;
  engine?: OfflineSyncEngine;
  useWebLocks?: boolean;
}

export type LeadershipChangeListener = (isLeader: boolean) => void;
export type EnvelopeMessageListener = (
  envelope: CoordinatedBridgeEnvelope
) => void;

interface LockWaiter {
  tabId: string;
  coordinator: TabLeaderCoordinator;
}

interface SharedLockRegistryEntry {
  holderTabId: string | null;
  waiters: LockWaiter[];
}

const inMemoryLockRegistry = new Map<string, SharedLockRegistryEntry>();

function getOrCreateLockEntry(lockName: string): SharedLockRegistryEntry {
  let entry = inMemoryLockRegistry.get(lockName);
  if (!entry) {
    entry = { holderTabId: null, waiters: [] };
    inMemoryLockRegistry.set(lockName, entry);
  }
  return entry;
}

export class TabLeaderCoordinator {
  public readonly tabId: string;
  private readonly lockName: string;
  private readonly channelName: string;
  private readonly engine?: OfflineSyncEngine;
  private readonly useWebLocks: boolean;

  private isLeader = false;
  private leaderTabId: string | null = null;
  private started = false;

  private channel: BroadcastChannel | null = null;
  private lockAbortController: AbortController | null = null;
  private releaseWebLockResolver: (() => void) | null = null;

  private readonly leadershipListeners = new Set<LeadershipChangeListener>();
  private readonly envelopeListeners = new Set<EnvelopeMessageListener>();

  constructor(options: TabLeaderCoordinatorOptions = {}) {
    this.tabId =
      options.tabId ??
      `tab_${Date.now()}_${generateSyncUuid().slice(0, 8)}`;
    this.lockName = options.lockName ?? "prioritask_main_logic_lock";
    this.channelName = options.channelName ?? "prioritask_tab_coordinator";
    this.engine = options.engine;
    this.useWebLocks = options.useWebLocks ?? true;
  }

  /**
   * Equivalente a `isMainLogicWindow` de Todoist (`electron.js`).
   */
  isMainLogicWindow(): boolean {
    return this.isLeader;
  }

  /**
   * Devuelve el identificador de la pestaña líder actual (si se conoce).
   */
  getLeaderTabId(): string | null {
    return this.leaderTabId;
  }

  /**
   * Guardia de autorización de remitente (equivalente a `zi(e)` en Todoist):
   * Verifica que el mensaje provenga exclusivamente de la ventana/pestaña líder actual.
   */
  isAuthorizedSender(envelope: {
    senderTabId?: string;
    sourceTabId?: string;
  }): boolean {
    if (!envelope || typeof envelope !== "object") {
      return false;
    }
    const candidateId = envelope.senderTabId ?? envelope.sourceTabId;
    if (!candidateId || typeof candidateId !== "string") {
      return false;
    }
    if (this.leaderTabId) {
      return candidateId === this.leaderTabId;
    }
    if (this.isLeader) {
      return candidateId === this.tabId;
    }
    return false;
  }

  /**
   * Registra un listener invocado cada vez que esta pestaña gana o pierde el liderazgo.
   */
  onLeadershipChange(listener: LeadershipChangeListener): () => void {
    this.leadershipListeners.add(listener);
    return () => {
      this.leadershipListeners.delete(listener);
    };
  }

  /**
   * Registra un listener para sobres IPC difundidos por el líder autorizado.
   */
  onEnvelope(listener: EnvelopeMessageListener): () => void {
    this.envelopeListeners.add(listener);
    return () => {
      this.envelopeListeners.delete(listener);
    };
  }

  /**
   * Inicia la participación de la pestaña en la elección de líder y abre el canal de coordinación.
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    this.openBroadcastChannel();

    const entry = getOrCreateLockEntry(this.lockName);
    const alreadyQueued = entry.waiters.some((w) => w.tabId === this.tabId);
    if (!alreadyQueued) {
      entry.waiters.push({ tabId: this.tabId, coordinator: this });
    }

    if (entry.holderTabId === null) {
      entry.holderTabId = this.tabId;
      this.promoteToLeader();
    } else {
      this.leaderTabId = entry.holderTabId;
      this.demoteToFollower(entry.holderTabId);
      this.postCoordinationMessage({
        kind: "WHO_IS_LEADER",
        senderTabId: this.tabId,
        leaderTabId: this.leaderTabId,
        timestamp: Date.now(),
      });
    }

    // Si el navegador soporta Web Locks API, adquirir también el lock nativo inter-proceso
    if (
      this.useWebLocks &&
      typeof navigator !== "undefined" &&
      "locks" in navigator &&
      navigator.locks &&
      typeof navigator.locks.request === "function"
    ) {
      this.acquireNativeWebLock();
    }
  }

  /**
   * Detiene la coordinación de esta pestaña y cede inmediatamente el liderazgo
   * a la siguiente pestaña activa en espera.
   */
  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;

    const wasLeader = this.isLeader;
    const entry = getOrCreateLockEntry(this.lockName);
    entry.waiters = entry.waiters.filter((w) => w.tabId !== this.tabId);

    if (this.releaseWebLockResolver) {
      const release = this.releaseWebLockResolver;
      this.releaseWebLockResolver = null;
      release();
    }

    if (this.lockAbortController) {
      this.lockAbortController.abort();
      this.lockAbortController = null;
    }

    if (wasLeader) {
      this.isLeader = false;
      this.engine?.setMainLogicWindow(false);

      const nextWaiter = entry.waiters[0];
      const nextLeaderId = nextWaiter ? nextWaiter.tabId : null;
      entry.holderTabId = nextLeaderId;
      this.leaderTabId = nextLeaderId;

      this.postCoordinationMessage({
        kind: "LEADER_STEPDOWN",
        senderTabId: this.tabId,
        leaderTabId: nextLeaderId,
        timestamp: Date.now(),
      });

      this.notifyLeadershipListeners(false);

      // Promover determinísticamente a la siguiente pestaña activa
      if (nextWaiter) {
        for (const waiter of entry.waiters) {
          if (waiter.tabId === nextWaiter.tabId) {
            waiter.coordinator.promoteToLeader();
          } else {
            waiter.coordinator.updateKnownLeader(nextWaiter.tabId);
          }
        }
      }
    } else {
      this.isLeader = false;
      this.engine?.setMainLogicWindow(false);
    }

    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // Ignorar errores al cerrar BroadcastChannel
      }
      this.channel = null;
    }
  }

  /**
   * Difunde un sobre `DesktopBridgeEnvelope` al resto de pestañas sellando `senderTabId`.
   * Solo el líder autorizado puede difundir sobres de sincronización.
   */
  broadcastEnvelope(
    envelope: DesktopBridgeEnvelope & { senderTabId?: string; roomId?: string }
  ): void {
    const stampedEnvelope: CoordinatedBridgeEnvelope = {
      ...envelope,
      senderTabId: envelope.senderTabId ?? this.tabId,
      leaderTabId: this.leaderTabId ?? (this.isLeader ? this.tabId : null),
    };

    if (!this.isAuthorizedSender(stampedEnvelope)) {
      return;
    }

    this.postCoordinationMessage({
      kind: "BRIDGE_ENVELOPE",
      senderTabId: stampedEnvelope.senderTabId!,
      leaderTabId: this.leaderTabId,
      timestamp: Date.now(),
      envelope: stampedEnvelope,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Métodos Internos de Elección, Web Locks y BroadcastChannel
  // ───────────────────────────────────────────────────────────────────────────

  private promoteToLeader(): void {
    const changed = !this.isLeader || this.leaderTabId !== this.tabId;
    this.isLeader = true;
    this.leaderTabId = this.tabId;

    const entry = getOrCreateLockEntry(this.lockName);
    entry.holderTabId = this.tabId;
    for (const waiter of entry.waiters) {
      if (waiter.tabId !== this.tabId) {
        waiter.coordinator.updateKnownLeader(this.tabId);
      }
    }

    if (this.engine) {
      this.engine.setMainLogicWindow(true);
      void this.engine.handleBridgeEnvelope({
        type: "com.todoist.ipc.push",
        id: generateSyncUuid(),
        method: "setMainLogicWindow",
      });
    }

    this.postCoordinationMessage({
      kind: "LEADER_CLAIM",
      senderTabId: this.tabId,
      leaderTabId: this.tabId,
      timestamp: Date.now(),
    });

    if (changed) {
      this.notifyLeadershipListeners(true);
    }
  }

  private demoteToFollower(currentLeaderId: string | null): void {
    const wasLeader = this.isLeader;
    this.isLeader = false;
    this.leaderTabId = currentLeaderId;
    this.engine?.setMainLogicWindow(false);

    if (wasLeader) {
      this.notifyLeadershipListeners(false);
    }
  }

  private updateKnownLeader(newLeaderId: string | null): void {
    if (this.tabId === newLeaderId) {
      this.promoteToLeader();
      return;
    }
    this.demoteToFollower(newLeaderId);
  }

  private acquireNativeWebLock(): void {
    try {
      this.lockAbortController = new AbortController();
      const { signal } = this.lockAbortController;

      void navigator.locks
        .request(
          this.lockName,
          { mode: "exclusive", signal },
          async () => {
            if (!this.started) return;
            const entry = getOrCreateLockEntry(this.lockName);
            if (entry.holderTabId === null || entry.holderTabId === this.tabId) {
              this.promoteToLeader();
            }
            await new Promise<void>((resolve) => {
              this.releaseWebLockResolver = resolve;
            });
          }
        )
        .catch(() => {
          // AbortError esperado cuando se invoca stop() antes de adquirir el lock
        });
    } catch {
      // Fallback silencioso si Web Locks lanza una excepción en entornos restringidos
    }
  }

  private openBroadcastChannel(): void {
    if (typeof window === "undefined" && typeof BroadcastChannel === "undefined") {
      return;
    }
    if (typeof BroadcastChannel === "undefined") {
      return;
    }

    try {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (
        event: MessageEvent<InternalCoordinationMessage>
      ) => {
        this.handleCoordinationMessage(event.data);
      };
    } catch {
      this.channel = null;
    }
  }

  private postCoordinationMessage(message: InternalCoordinationMessage): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(message);
    } catch {
      // Ignorar si el canal fue cerrado concurrentemente
    }
  }

  private handleCoordinationMessage(
    message: InternalCoordinationMessage | null | undefined
  ): void {
    if (!this.started || !message || message.senderTabId === this.tabId) {
      return;
    }

    switch (message.kind) {
      case "LEADER_CLAIM":
      case "LEADER_HEARTBEAT": {
        if (message.leaderTabId && message.leaderTabId !== this.tabId) {
          if (this.releaseWebLockResolver !== null) {
            this.isLeader = true;
            this.leaderTabId = this.tabId;
            this.postCoordinationMessage({
              kind: "LEADER_HEARTBEAT",
              senderTabId: this.tabId,
              leaderTabId: this.tabId,
              timestamp: Date.now(),
            });
          } else {
            this.updateKnownLeader(message.leaderTabId);
          }
        }
        break;
      }
      case "WHO_IS_LEADER": {
        if (this.isLeader) {
          this.postCoordinationMessage({
            kind: "LEADER_HEARTBEAT",
            senderTabId: this.tabId,
            leaderTabId: this.tabId,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case "LEADER_STEPDOWN": {
        if (
          message.leaderTabId === this.tabId ||
          this.releaseWebLockResolver !== null
        ) {
          this.promoteToLeader();
        } else if (message.leaderTabId) {
          this.updateKnownLeader(message.leaderTabId);
        } else {
          // Si no había siguiente líder explícito, reclamar si somos primeros en cola
          const entry = getOrCreateLockEntry(this.lockName);
          if (
            entry.waiters.length > 0 &&
            entry.waiters[0].tabId === this.tabId
          ) {
            this.promoteToLeader();
          }
        }
        break;
      }
      case "BRIDGE_ENVELOPE": {
        if (message.envelope && this.isAuthorizedSender(message.envelope)) {
          for (const listener of this.envelopeListeners) {
            listener(message.envelope);
          }
        }
        break;
      }
    }
  }

  private notifyLeadershipListeners(isLeader: boolean): void {
    for (const listener of this.leadershipListeners) {
      listener(isLeader);
    }
  }
}
