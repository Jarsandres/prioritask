import api from "../api";
import type {
  CompressionWorkerRequest,
  CompressionWorkerResponse,
} from "../workers/imageCompressor.worker";

/**
 * Formatea un tamaño en bytes a representación legible (B, KB, MB, GB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Determina si el tipo MIME corresponde a una imagen visualizable.
 */
export function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/**
 * Compresión en hilo principal usando canvas HTML5 como mecanismo de fallback.
 */
function compressImageMainThread(
  file: File,
  maxDimension = 1280,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve) => {
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(file);
      return;
    }

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        cleanup();

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const webpFilename = `${baseName}.webp`;

            const compressedFile = new File([blob], webpFilename, {
              type: "image/webp",
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          "image/webp",
          quality
        );
      } catch (err) {
        cleanup();
        console.warn("Fallo en compresión canvas hilo principal:", err);
        resolve(file);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Compresión en segundo plano usando Web Worker y OffscreenCanvas.
 */
function compressImageWorker(
  file: File,
  maxDimension = 1280,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(
        new URL("../workers/imageCompressor.worker.ts", import.meta.url),
        { type: "module" }
      );

      const reqId = `compress_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const timeoutId = setTimeout(() => {
        worker.terminate();
        reject(new Error("Worker de compresión agotó el tiempo de espera"));
      }, 15000);

      worker.onmessage = (e: MessageEvent<CompressionWorkerResponse>) => {
        if (e.data.id === reqId) {
          clearTimeout(timeoutId);
          worker.terminate();

          if (e.data.success && e.data.blob) {
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const webpFilename = `${baseName}.webp`;
            const compressedFile = new File([e.data.blob], webpFilename, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            reject(new Error(e.data.error || "Error desconocido en worker"));
          }
        }
      };

      worker.onerror = (err) => {
        clearTimeout(timeoutId);
        worker.terminate();
        reject(err);
      };

      const requestPayload: CompressionWorkerRequest = {
        id: reqId,
        blob: file,
        maxDimension,
        quality,
      };

      worker.postMessage(requestPayload);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Redimensiona y comprime una imagen a formato WebP fuera del hilo principal (Web Worker)
 * con fallback transparente a canvas en hilo principal si no hay soporte de OffscreenCanvas.
 * - Dimensión máxima por defecto: 1280px
 * - Calidad WebP: 85%
 * Si el archivo no es imagen o ocurre algún fallo, devuelve el archivo original.
 */
export async function compressImageToWebP(
  file: File,
  maxDimension = 1280,
  quality = 0.85
): Promise<File> {
  // Si no es imagen o es SVG / GIF animado, no recomprimir
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return file;
  }

  const isWorkerSupported =
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined";

  if (isWorkerSupported) {
    try {
      return await compressImageWorker(file, maxDimension, quality);
    } catch (workerErr) {
      console.warn(
        "Fallo en compresión por Web Worker, aplicando fallback a hilo principal:",
        workerErr
      );
      return await compressImageMainThread(file, maxDimension, quality);
    }
  }

  // Fallback para entornos donde OffscreenCanvas o Worker no están disponibles
  return await compressImageMainThread(file, maxDimension, quality);
}

/**
 * Descarga de forma segura un archivo binario usando el cliente centralizado Axios
 * con cabeceras Bearer token y disparando el diálogo de descarga en el navegador.
 */
export async function downloadAttachmentBlob(
  downloadUrl: string,
  filename: string
): Promise<void> {
  const response = await api.get(downloadUrl, {
    responseType: "blob",
  });

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
