import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isDesktopAvailable,
  onDesktopWakeup,
  onDesktopAddTask,
  notifyQuickAddCreated,
  requestDesktopSync,
  setDesktopMainLogicWindow,
} from "../desktopBridge";
import type { PrioritaskDesktopBridge } from "../../types/desktop";

describe("desktopBridge Adapter", () => {
  beforeEach(() => {
    delete window.prioritaskDesktop;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete window.prioritaskDesktop;
    vi.restoreAllMocks();
  });

  describe("En Entorno Navegador Web (sin Electron)", () => {
    it("debe reportar isDesktopAvailable como false", () => {
      expect(isDesktopAvailable()).toBe(false);
    });

    it("debe retornar no-op cleanup y no arrojar error al suscribir onDesktopWakeup", () => {
      const callback = vi.fn();
      const unsubscribe = onDesktopWakeup(callback);
      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });

    it("debe retornar no-op cleanup y no arrojar error al suscribir onDesktopAddTask", () => {
      const callback = vi.fn();
      const unsubscribe = onDesktopAddTask(callback);
      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });

    it("no debe arrojar error al invocar notifyQuickAddCreated en navegador", () => {
      expect(() => notifyQuickAddCreated({ titulo: "Nueva tarea" })).not.toThrow();
    });

    it("no debe arrojar error al invocar requestDesktopSync en navegador", () => {
      expect(() => requestDesktopSync()).not.toThrow();
    });

    it("no debe arrojar error al invocar setDesktopMainLogicWindow en navegador", () => {
      expect(() => setDesktopMainLogicWindow(true)).not.toThrow();
    });
  });

  describe("En Entorno Desktop (Electron Companion)", () => {
    let mockDesktopBridge: PrioritaskDesktopBridge;
    let mockUnsubscribeWakeup: () => void;
    let mockUnsubscribeAddTask: () => void;

    beforeEach(() => {
      mockUnsubscribeWakeup = vi.fn();
      mockUnsubscribeAddTask = vi.fn();

      mockDesktopBridge = {
        isDesktop: true,
        platform: "win32",
        version: "1.0.0",
        safeStorage: {
          isAvailable: vi.fn().mockResolvedValue(true),
          encryptString: vi.fn().mockResolvedValue("enc"),
          decryptString: vi.fn().mockResolvedValue("plain"),
        },
        ipc: {
          sendRequestSync: vi.fn(),
          onWakeup: vi.fn().mockReturnValue(mockUnsubscribeWakeup),
          onAddTask: vi.fn().mockReturnValue(mockUnsubscribeAddTask),
          quickAddAddTask: vi.fn(),
          setMainLogicWindow: vi.fn(),
        },
      };

      window.prioritaskDesktop = mockDesktopBridge;
    });

    it("debe reportar isDesktopAvailable como true", () => {
      expect(isDesktopAvailable()).toBe(true);
    });

    it("debe suscribirse a onWakeup y devolver la función de desuscripción", () => {
      const callback = vi.fn();
      const unsubscribe = onDesktopWakeup(callback);

      expect(mockDesktopBridge.ipc.onWakeup).toHaveBeenCalledWith(callback);
      unsubscribe();
      expect(mockUnsubscribeWakeup).toHaveBeenCalled();
    });

    it("debe suscribirse a onAddTask y devolver la función de desuscripción", () => {
      const callback = vi.fn();
      const unsubscribe = onDesktopAddTask(callback);

      expect(mockDesktopBridge.ipc.onAddTask).toHaveBeenCalledWith(callback);
      unsubscribe();
      expect(mockUnsubscribeAddTask).toHaveBeenCalled();
    });

    it("debe reenviar la tarea a quickAddAddTask vía IPC", () => {
      const taskData = { titulo: "Comprar pan", categoria: "COMPRAS" };
      notifyQuickAddCreated(taskData);

      expect(mockDesktopBridge.ipc.quickAddAddTask).toHaveBeenCalledWith(taskData);
    });

    it("debe enviar sendRequestSync vía IPC", () => {
      requestDesktopSync();
      expect(mockDesktopBridge.ipc.sendRequestSync).toHaveBeenCalled();
    });

    it("debe enviar setMainLogicWindow vía IPC", () => {
      setDesktopMainLogicWindow(true);
      expect(mockDesktopBridge.ipc.setMainLogicWindow).toHaveBeenCalledWith(true);

      setDesktopMainLogicWindow(false);
      expect(mockDesktopBridge.ipc.setMainLogicWindow).toHaveBeenCalledWith(false);
    });

    it("debe manejar errores de forma segura si la llamada a IPC falla", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(mockDesktopBridge.ipc.quickAddAddTask).mockImplementationOnce(() => {
        throw new Error("Canal IPC destruido");
      });

      expect(() => notifyQuickAddCreated({ test: true })).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
