import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SafeStorageServiceImpl } from "../safeStorage";
import type { PrioritaskDesktopBridge } from "../../types/desktop";

describe("SafeStorageService (Native safeStorage & Web Crypto AES-GCM Fallback)", () => {
  let service: SafeStorageServiceImpl;

  beforeEach(() => {
    localStorage.clear();
    service = new SafeStorageServiceImpl();
    delete window.prioritaskDesktop;
  });

  afterEach(() => {
    delete window.prioritaskDesktop;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("Entorno Navegador (Web Crypto API AES-GCM 256-bit Fallback)", () => {
    it("debe reportar isDesktopRuntime como false en navegador", () => {
      expect(service.isDesktopRuntime()).toBe(false);
    });

    it("debe reportar isAvailable como true si WebCrypto SubtleCrypto está disponible", async () => {
      const available = await service.isAvailable();
      expect(available).toBe(true);
    });

    it("debe cifrar y descifrar texto plano en viaje redondo (roundtrip)", async () => {
      const plaintext = "token_de_acceso_super_secreto_12345!#";
      const encrypted = await service.encryptString(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted.startsWith("enc_v1:")).toBe(true);
      expect(encrypted).not.toContain(plaintext);

      const decrypted = await service.decryptString(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("debe soportar caracteres especiales UTF-8 y cadenas JSON complejas", async () => {
      const complexData = JSON.stringify({
        token: "jwt_token_áéíóú_ñ_🚀",
        usuario: "María José",
        expira: 1799999999,
      });

      const encrypted = await service.encryptString(complexData);
      const decrypted = await service.decryptString(encrypted);
      expect(decrypted).toBe(complexData);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(complexData));
    });

    it("debe generar ciphertexts distintos para el mismo plaintext gracias a IVs aleatorios", async () => {
      const plaintext = "misma_contraseña_repetida";
      const cipher1 = await service.encryptString(plaintext);
      const cipher2 = await service.encryptString(plaintext);

      expect(cipher1).not.toBe(cipher2);
      expect(await service.decryptString(cipher1)).toBe(plaintext);
      expect(await service.decryptString(cipher2)).toBe(plaintext);
    });

    it("debe permitir almacenar y recuperar items seguros con setSecureItem y getSecureItem", async () => {
      await service.setSecureItem("auth_token", "Bearer eyJhbGciOi...");
      const rawStored = localStorage.getItem("auth_token");
      expect(rawStored).not.toBeNull();
      expect(rawStored?.startsWith("enc_v1:")).toBe(true);

      const retrieved = await service.getSecureItem("auth_token");
      expect(retrieved).toBe("Bearer eyJhbGciOi...");
    });

    it("debe eliminar items con removeSecureItem", async () => {
      await service.setSecureItem("temp_key", "12345");
      expect(await service.getSecureItem("temp_key")).toBe("12345");

      await service.removeSecureItem("temp_key");
      expect(await service.getSecureItem("temp_key")).toBeNull();
    });

    it("debe retornar null al solicitar un item inexistente", async () => {
      const result = await service.getSecureItem("non_existent_key");
      expect(result).toBeNull();
    });

    it("debe retornar null de forma tolerante si el item almacenado está corrupto", async () => {
      localStorage.setItem("corrupted_key", "enc_v1:base64_invalido_corrupto_!!!!");
      const retrieved = await service.getSecureItem("corrupted_key");
      expect(retrieved).toBeNull();
    });

    it("debe arrojar error al intentar descifrar ciphertext vacío o corrupto", async () => {
      await expect(service.decryptString("")).rejects.toThrow("Ciphertext inválido o vacío.");
      await expect(service.decryptString("enc_v1:Y29ydG8=")).rejects.toThrow();
    });

    it("debe arrojar TypeError si plaintext no es string", async () => {
      // @ts-expect-error probando entrada inválida en runtime
      await expect(service.encryptString(null)).rejects.toThrow(TypeError);
    });
  });

  describe("Entorno Desktop (Electron Companion SafeStorage)", () => {
    let mockDesktopBridge: PrioritaskDesktopBridge;

    beforeEach(() => {
      mockDesktopBridge = {
        isDesktop: true,
        platform: "win32",
        version: "1.0.0",
        safeStorage: {
          isAvailable: vi.fn().mockResolvedValue(true),
          encryptString: vi.fn().mockImplementation(async (text: string) => {
            return `dpapi_enc:${btoa(text)}`;
          }),
          decryptString: vi.fn().mockImplementation(async (ciphertext: string) => {
            if (!ciphertext.startsWith("dpapi_enc:")) {
              throw new Error("Formato inválido DPAPI");
            }
            return atob(ciphertext.slice("dpapi_enc:".length));
          }),
        },
        ipc: {
          sendRequestSync: vi.fn(),
          onWakeup: vi.fn().mockReturnValue(() => {}),
          onAddTask: vi.fn().mockReturnValue(() => {}),
          quickAddAddTask: vi.fn(),
          setMainLogicWindow: vi.fn(),
        },
      };

      window.prioritaskDesktop = mockDesktopBridge;
    });

    it("debe detectar isDesktopRuntime como true", () => {
      expect(service.isDesktopRuntime()).toBe(true);
    });

    it("debe consultar safeStorage.isAvailable en desktop", async () => {
      const available = await service.isAvailable();
      expect(available).toBe(true);
      expect(mockDesktopBridge.safeStorage.isAvailable).toHaveBeenCalled();
    });

    it("debe delegar encryptString y decryptString al puente nativo safeStorage", async () => {
      const plaintext = "token_electron_desktop_nativo";
      const encrypted = await service.encryptString(plaintext);

      expect(mockDesktopBridge.safeStorage.encryptString).toHaveBeenCalledWith(plaintext);
      expect(encrypted.startsWith("dpapi_enc:")).toBe(true);

      const decrypted = await service.decryptString(encrypted);
      expect(mockDesktopBridge.safeStorage.decryptString).toHaveBeenCalledWith(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("debe propagar errores si el puente desktop safeStorage falla", async () => {
      vi.mocked(mockDesktopBridge.safeStorage.encryptString).mockRejectedValueOnce(
        new Error("Fallo en DPAPI del SO")
      );

      await expect(service.encryptString("test")).rejects.toThrow("Fallo en DPAPI del SO");
    });
  });

  describe("Degradación a Fallback Ofuscado cuando SubtleCrypto no está disponible", () => {
    it("debe cifrar y descifrar con fallback ofuscado si SubtleCrypto está deshabilitado", async () => {
      // Mock getSubtleCrypto devolviendo null
      const originalSubtle = window.crypto?.subtle;
      if (window.crypto) {
        Object.defineProperty(window.crypto, "subtle", {
          value: null,
          configurable: true,
          writable: true,
        });
      }

      const fbService = new SafeStorageServiceImpl();
      const plaintext = "token_modo_fallback_sin_subtle";
      const encrypted = await fbService.encryptString(plaintext);

      expect(encrypted.startsWith("enc_v1_fb:")).toBe(true);
      const decrypted = await fbService.decryptString(encrypted);
      expect(decrypted).toBe(plaintext);

      // Restaurar subtle
      if (window.crypto && originalSubtle) {
        Object.defineProperty(window.crypto, "subtle", {
          value: originalSubtle,
          configurable: true,
          writable: true,
        });
      }
    });
  });
});
