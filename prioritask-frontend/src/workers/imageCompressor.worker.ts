/**
 * Web Worker para compresión y redimensionado de imágenes en segundo plano
 * utilizando OffscreenCanvas y createImageBitmap sin bloquear el hilo de renderizado de la UI.
 */

export interface CompressionWorkerRequest {
  id: string;
  blob?: Blob;
  maxDimension: number;
  quality: number;
}

export interface CompressionWorkerResponse {
  id: string;
  success: boolean;
  blob?: Blob;
  error?: string;
}

self.onmessage = async (e: MessageEvent<CompressionWorkerRequest>) => {
  const { id, blob, maxDimension = 1280, quality = 0.85 } = e.data;

  try {
    if (!blob) {
      throw new Error("No se proporcionó un Blob o archivo de imagen.");
    }

    // Decodificar imagen de forma asíncrona fuera del hilo principal
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;

    // Calcular dimensiones proporcionales
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    // Dibujar en OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("No se pudo obtener el contexto 2D de OffscreenCanvas.");
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Convertir a WebP
    const webpBlob = await canvas.convertToBlob({
      type: "image/webp",
      quality,
    });

    const response: CompressionWorkerResponse = {
      id,
      success: true,
      blob: webpBlob,
    };
    self.postMessage(response);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const response: CompressionWorkerResponse = {
      id,
      success: false,
      error: errorMsg,
    };
    self.postMessage(response);
  }
};
