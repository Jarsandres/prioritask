import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatFileSize,
  isImageContentType,
  compressImageToWebP,
  downloadAttachmentBlob,
} from "../attachmentUtils";
import api from "../../api";

describe("attachmentUtils", () => {
  describe("formatFileSize", () => {
    it("debe retornar '0 B' para valores menores o iguales a 0", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(-100)).toBe("0 B");
    });

    it("debe formatear bytes correctamente", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("debe formatear kilobytes (KB) correctamente con 1 decimal", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1536)).toBe("1.5 KB");
      expect(formatFileSize(1024 * 50)).toBe("50.0 KB");
    });

    it("debe formatear megabytes (MB) correctamente", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(1024 * 1024 * 5.5)).toBe("5.5 MB");
    });

    it("debe formatear gigabytes (GB) correctamente", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
      expect(formatFileSize(1024 * 1024 * 1024 * 2)).toBe("2.0 GB");
    });
  });

  describe("isImageContentType", () => {
    it("debe retornar true para tipos de contenido MIME correspondientes a imágenes", () => {
      expect(isImageContentType("image/jpeg")).toBe(true);
      expect(isImageContentType("image/png")).toBe(true);
      expect(isImageContentType("image/webp")).toBe(true);
      expect(isImageContentType("image/gif")).toBe(true);
      expect(isImageContentType("image/svg+xml")).toBe(true);
    });

    it("debe retornar false para documentos PDF, texto y tipos no visualizables", () => {
      expect(isImageContentType("application/pdf")).toBe(false);
      expect(isImageContentType("text/plain")).toBe(false);
      expect(isImageContentType("application/json")).toBe(false);
      expect(isImageContentType("")).toBe(false);
    });
  });

  describe("compressImageToWebP", () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it("debe retornar el archivo original intacto si no es de tipo imagen", async () => {
      const pdfFile = new File(["dummy pdf content"], "factura.pdf", {
        type: "application/pdf",
      });
      const result = await compressImageToWebP(pdfFile);
      expect(result).toBe(pdfFile);
    });

    it("debe retornar el archivo original sin recomprimir si es SVG", async () => {
      const svgFile = new File(["<svg></svg>"], "vector.svg", {
        type: "image/svg+xml",
      });
      const result = await compressImageToWebP(svgFile);
      expect(result).toBe(svgFile);
    });

    it("debe retornar el archivo original sin recomprimir si es GIF animado", async () => {
      const gifFile = new File(["dummy gif"], "animacion.gif", {
        type: "image/gif",
      });
      const result = await compressImageToWebP(gifFile);
      expect(result).toBe(gifFile);
    });

    it("debe comprimir a WebP y revocar inmediatamente el ObjectURL tras el render en canvas", async () => {
      const revokeMock = vi.fn();
      URL.createObjectURL = vi.fn(() => "blob:mock-img-object-url");
      URL.revokeObjectURL = revokeMock;

      const mockBlob = new Blob(["mock-webp-data"], { type: "image/webp" });

      const mockDrawImage = vi.fn();
      const mockGetContext = vi.fn(() => ({
        drawImage: mockDrawImage,
      }));
      const mockToBlob = vi.fn((callback: (b: Blob | null) => void) => {
        callback(mockBlob);
      });

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === "canvas") {
          return {
            width: 0,
            height: 0,
            getContext: mockGetContext,
            toBlob: mockToBlob,
          } as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      const originalImage = window.Image;
      class MockImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 2560;
        height = 1440;
        private _src = "";
        set src(value: string) {
          this._src = value;
          setTimeout(() => {
            if (this.onload) this.onload();
          }, 0);
        }
        get src() {
          return this._src;
        }
      }
      window.Image = MockImage as unknown as typeof Image;

      const sourceFile = new File(["raw-pixels"], "evidencia.png", {
        type: "image/png",
      });
      const compressed = await compressImageToWebP(sourceFile, 1280, 0.85);

      expect(compressed.name).toBe("evidencia.webp");
      expect(compressed.type).toBe("image/webp");
      expect(mockDrawImage).toHaveBeenCalled();
      expect(revokeMock).toHaveBeenCalledWith("blob:mock-img-object-url");

      window.Image = originalImage;
    });

    it("debe aplicar fallback seguro devolviendo el archivo original si Image.onerror se dispara", async () => {
      const revokeMock = vi.fn();
      URL.createObjectURL = vi.fn(() => "blob:mock-corrupt-url");
      URL.revokeObjectURL = revokeMock;

      const originalImage = window.Image;
      class FailingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          setTimeout(() => {
            if (this.onerror) this.onerror();
          }, 0);
        }
      }
      window.Image = FailingImage as unknown as typeof Image;

      const corruptFile = new File(["invalid-binary"], "corrupta.jpg", {
        type: "image/jpeg",
      });
      const result = await compressImageToWebP(corruptFile);

      expect(result).toBe(corruptFile);
      expect(revokeMock).toHaveBeenCalledWith("blob:mock-corrupt-url");

      window.Image = originalImage;
    });

    it("debe aplicar fallback seguro si URL.createObjectURL falla o no está soportado", async () => {
      URL.createObjectURL = vi.fn(() => {
        throw new Error("URL.createObjectURL no soportado");
      });

      const normalFile = new File(["test-bytes"], "foto.jpg", {
        type: "image/jpeg",
      });
      const result = await compressImageToWebP(normalFile);
      expect(result).toBe(normalFile);
    });
  });

  describe("downloadAttachmentBlob", () => {
    it("debe solicitar el blob con api.get y disparar la descarga simulada en el DOM", async () => {
      const revokeMock = vi.fn();
      URL.createObjectURL = vi.fn(() => "blob:download-test-url");
      URL.revokeObjectURL = revokeMock;

      const mockBlob = new Blob(["contenido descargado"]);
      vi.spyOn(api, "get").mockResolvedValueOnce({
        data: mockBlob,
      });

      const appendChildSpy = vi.spyOn(document.body, "appendChild");
      const removeChildSpy = vi.spyOn(HTMLElement.prototype, "remove");
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      await downloadAttachmentBlob("/tasks/99/attachments/recibo.pdf", "recibo.pdf");

      expect(api.get).toHaveBeenCalledWith("/tasks/99/attachments/recibo.pdf", {
        responseType: "blob",
      });
      expect(appendChildSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(revokeMock).toHaveBeenCalledWith("blob:download-test-url");
    });
  });
});
