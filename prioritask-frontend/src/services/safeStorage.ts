import type { PrioritaskDesktopBridge } from "../types/desktop";

/**
 * Contrato de servicio para el almacenamiento seguro de credenciales y secretos locales.
 * Inspirado en safeStorage de Electron y con fallback transparente a Web Crypto API (AES-GCM 256-bit).
 */
export interface SafeStorageService {
  isAvailable(): Promise<boolean>;
  encryptString(plaintext: string): Promise<string>;
  decryptString(ciphertext: string): Promise<string>;
  setSecureItem(key: string, value: string): Promise<void>;
  getSecureItem(key: string): Promise<string | null>;
  removeSecureItem(key: string): Promise<void>;
  isDesktopRuntime(): boolean;
}

const ENC_PREFIX = "enc_v1:";
const FALLBACK_PREFIX = "enc_v1_fb:";
const SALT_STORAGE_KEY = "prioritask_sec_salt";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class SafeStorageServiceImpl implements SafeStorageService {
  private cryptoKeyCache: CryptoKey | null = null;
  private inMemoryStore: Map<string, string> = new Map();
  private inMemorySalt: string | null = null;

  /**
   * Determina si la aplicación corre dentro del wrapper Electron Companion.
   */
  isDesktopRuntime(): boolean {
    if (typeof window === "undefined") {
      return false;
    }
    const desktop = window.prioritaskDesktop as PrioritaskDesktopBridge | undefined;
    return Boolean(desktop?.isDesktop && desktop?.safeStorage);
  }

  /**
   * Comprueba la disponibilidad de cifrado nativo o WebCrypto.
   */
  async isAvailable(): Promise<boolean> {
    if (this.isDesktopRuntime()) {
      try {
        const desktop = window.prioritaskDesktop;
        if (desktop?.safeStorage?.isAvailable) {
          return await desktop.safeStorage.isAvailable();
        }
      } catch {
        return false;
      }
    }

    if (typeof window !== "undefined" && window.crypto?.subtle) {
      return true;
    }

    if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
      return true;
    }

    if (typeof crypto !== "undefined" && crypto.subtle) {
      return true;
    }

    return false;
  }

  /**
   * Obtiene o deriva la clave AES-GCM (256 bits) usando PBKDF2 y un salt persistido.
   */
  private async getOrCreateKey(): Promise<CryptoKey> {
    if (this.cryptoKeyCache) {
      return this.cryptoKeyCache;
    }

    const subtle = this.getSubtleCrypto();
    if (!subtle) {
      throw new Error("SubtleCrypto no disponible");
    }

    const salt = this.getOrCreateSalt();
    const saltBytes = base64ToUint8Array(salt);

    const origin = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "prioritask.app.local";
    const appSecretSeed = `prioritask_sec_key_derivation_${origin}`;
    const encoder = new TextEncoder();
    const baseKeyMaterial = await subtle.importKey(
      "raw",
      encoder.encode(appSecretSeed),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const derivedKey = await subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: 100_000,
        hash: "SHA-256",
      },
      baseKeyMaterial,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["encrypt", "decrypt"]
    );

    this.cryptoKeyCache = derivedKey;
    return derivedKey;
  }

  private getSubtleCrypto(): SubtleCrypto | null {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
      return window.crypto.subtle;
    }
    if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
      return globalThis.crypto.subtle;
    }
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return crypto.subtle;
    }
    return null;
  }

  private getRandomValues(array: Uint8Array): Uint8Array {
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      return window.crypto.getRandomValues(array);
    }
    if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(array);
    }
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return crypto.getRandomValues(array);
    }
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }

  private getOrCreateSalt(): string {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(SALT_STORAGE_KEY);
        if (stored) return stored;
      }
    } catch {
      // localStorage deshabilitado o restringido
    }

    if (this.inMemorySalt) {
      return this.inMemorySalt;
    }

    const randomBytes = new Uint8Array(16);
    this.getRandomValues(randomBytes);

    const newSalt = uint8ArrayToBase64(randomBytes);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(SALT_STORAGE_KEY, newSalt);
      }
    } catch {
      // Ignorar fallo de localStorage
    }
    this.inMemorySalt = newSalt;
    return newSalt;
  }

  /**
   * Cifra una cadena de texto plano.
   */
  async encryptString(plaintext: string): Promise<string> {
    if (typeof plaintext !== "string") {
      throw new TypeError("Plaintext debe ser una cadena de texto.");
    }

    // 1. Delegar a Electron safeStorage si está disponible en Desktop
    if (this.isDesktopRuntime()) {
      const desktop = window.prioritaskDesktop;
      if (desktop?.safeStorage) {
        const available = await desktop.safeStorage.isAvailable();
        if (available) {
          return await desktop.safeStorage.encryptString(plaintext);
        }
      }
    }

    // 2. Fallback Web Crypto API (AES-GCM 256-bit)
    const subtle = this.getSubtleCrypto();
    if (subtle) {
      const key = await this.getOrCreateKey();
      const iv = new Uint8Array(12);
      this.getRandomValues(iv);

      const encodedData = new TextEncoder().encode(plaintext);
      const ciphertextBuffer = await subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        encodedData
      );

      const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertextBuffer), iv.length);

      return `${ENC_PREFIX}${uint8ArrayToBase64(combined)}`;
    }

    // 3. Fallback seguro en memoria / Base64 ofuscado para entornos sin WebCrypto
    console.warn(
      "[SafeStorage] SubtleCrypto no está disponible en este entorno. Aplicando fallback en memoria/ofuscado."
    );
    const salt = this.getOrCreateSalt();
    const encoder = new TextEncoder();
    const plainBytes = encoder.encode(plaintext);
    const saltBytes = encoder.encode(salt);
    const xorBytes = new Uint8Array(plainBytes.length);
    for (let i = 0; i < plainBytes.length; i++) {
      xorBytes[i] = plainBytes[i] ^ saltBytes[i % saltBytes.length];
    }
    return `${FALLBACK_PREFIX}${uint8ArrayToBase64(xorBytes)}`;
  }

  /**
   * Descifra una cadena previamente cifrada.
   */
  async decryptString(ciphertext: string): Promise<string> {
    if (typeof ciphertext !== "string" || ciphertext.length === 0) {
      throw new Error("Ciphertext inválido o vacío.");
    }

    // Si comienza con prefijo Web Crypto AES-GCM
    if (ciphertext.startsWith(ENC_PREFIX)) {
      const rawBase64 = ciphertext.slice(ENC_PREFIX.length);
      const combined = base64ToUint8Array(rawBase64);
      if (combined.length < 12) {
        throw new Error("Ciphertext corrupto o truncado.");
      }

      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const key = await this.getOrCreateKey();
      const subtle = this.getSubtleCrypto();
      if (!subtle) {
        throw new Error("SubtleCrypto no disponible para descifrar.");
      }

      const decryptedBuffer = await subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        data
      );

      return new TextDecoder().decode(decryptedBuffer);
    }

    // Si comienza con prefijo de fallback ofuscado
    if (ciphertext.startsWith(FALLBACK_PREFIX)) {
      const rawBase64 = ciphertext.slice(FALLBACK_PREFIX.length);
      const xorBytes = base64ToUint8Array(rawBase64);
      const salt = this.getOrCreateSalt();
      const saltBytes = new TextEncoder().encode(salt);
      const plainBytes = new Uint8Array(xorBytes.length);
      for (let i = 0; i < xorBytes.length; i++) {
        plainBytes[i] = xorBytes[i] ^ saltBytes[i % saltBytes.length];
      }
      return new TextDecoder().decode(plainBytes);
    }

    // Si está en Desktop Runtime y no tiene prefijo web, delegar a safeStorage
    if (this.isDesktopRuntime()) {
      const desktop = window.prioritaskDesktop;
      if (desktop?.safeStorage) {
        return await desktop.safeStorage.decryptString(ciphertext);
      }
    }

    // Intento final si es ciphertext legado o formato nativo
    throw new Error("Formato de ciphertext no reconocido o clave incompatible.");
  }

  /**
   * Almacena de forma segura un valor cifrado en el almacenamiento local.
   */
  async setSecureItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encryptString(value);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, encrypted);
        return;
      }
    } catch {
      // Fallback a almacenamiento en memoria
    }
    this.inMemoryStore.set(key, encrypted);
  }

  /**
   * Recupera y descifra un valor seguro previamente almacenado.
   */
  async getSecureItem(key: string): Promise<string | null> {
    let encrypted: string | null = null;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        encrypted = window.localStorage.getItem(key);
      }
    } catch {
      // Ignorar fallo de localStorage
    }

    if (!encrypted) {
      encrypted = this.inMemoryStore.get(key) ?? null;
    }

    if (!encrypted) {
      return null;
    }

    try {
      return await this.decryptString(encrypted);
    } catch (err) {
      console.warn(`[SafeStorage] Fallo al descifrar el elemento seguro "${key}":`, err);
      return null;
    }
  }

  /**
   * Elimina un valor seguro del almacenamiento.
   */
  async removeSecureItem(key: string): Promise<void> {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignorar fallo
    }
    this.inMemoryStore.delete(key);
  }
}

export const safeStorage: SafeStorageService = new SafeStorageServiceImpl();
export default safeStorage;
