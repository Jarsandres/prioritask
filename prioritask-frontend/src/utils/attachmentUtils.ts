import api from "../api";

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
 * Redimensiona y comprime una imagen a formato WebP en el cliente antes de subirla.
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

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          // Redimensionar proporcionalmente si supera maxDimension
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
            resolve(file);
            return;
          }

          // Dibujar en el canvas redimensionado
          ctx.drawImage(img, 0, 0, width, height);

          // Convertir a WebP
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(file);
                return;
              }

              // Generar nombre con extensión .webp
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
          console.warn("Fallo en compresión WebP, usando archivo original:", err);
          resolve(file);
        }
      };

      img.onerror = () => {
        resolve(file);
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      resolve(file);
    };

    reader.readAsDataURL(file);
  });
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
