/**
 * Definiciones de tipos para el puente Electron Desktop Companion (window.prioritaskDesktop).
 * Diseñado bajo las premisas de Zero Any y Strict TypeScript.
 */

export interface PrioritaskSafeStorageBridge {
  isAvailable(): Promise<boolean>;
  encryptString(plaintext: string): Promise<string>;
  decryptString(ciphertext: string): Promise<string>;
}

export interface PrioritaskIpcBridge {
  sendRequestSync(): void;
  onWakeup(callback: () => void): () => void;
  onAddTask(callback: (task: unknown) => void): () => void;
  quickAddAddTask(taskData: unknown): void;
  setMainLogicWindow(isMain: boolean): void;
}

export interface PrioritaskDesktopBridge {
  readonly isDesktop: boolean;
  readonly platform: string;
  readonly version: string;
  readonly safeStorage: PrioritaskSafeStorageBridge;
  readonly ipc: PrioritaskIpcBridge;
}

declare global {
  interface Window {
    prioritaskDesktop?: PrioritaskDesktopBridge;
  }
}
