import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compressImageToWebP } from "../../utils/attachmentUtils";

describe("Image Compression (Web Worker & Fallback)", () => {
  let originalWorker: typeof Worker;
  let originalOffscreenCanvas: typeof OffscreenCanvas;
  let originalCreateImageBitmap: typeof createImageBitmap;

  beforeEach(() => {
    originalWorker = window.Worker;
    originalOffscreenCanvas = window.OffscreenCanvas;
    originalCreateImageBitmap = window.createImageBitmap;
  });

  afterEach(() => {
    window.Worker = originalWorker;
    window.OffscreenCanvas = originalOffscreenCanvas;
    window.createImageBitmap = originalCreateImageBitmap;
    vi.restoreAllMocks();
  });

  it("debe delegar la compresión al Web Worker cuando OffscreenCanvas y createImageBitmap están soportados", async () => {
    const mockWebpBlob = new Blob(["compressed-webp-bytes"], { type: "image/webp" });

    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;

      postMessage(data: { id: string }) {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                id: data.id,
                success: true,
                blob: mockWebpBlob,
              },
            } as MessageEvent);
          }
        }, 10);
      }

      terminate = vi.fn();
    }

    // @ts-expect-error Mocking worker environment
    window.Worker = MockWorker;
    // @ts-expect-error Mocking OffscreenCanvas
    window.OffscreenCanvas = vi.fn();
    window.createImageBitmap = vi.fn();

    const inputFile = new File(["dummy-pixels"], "recibo_compra.jpg", {
      type: "image/jpeg",
    });

    const compressed = await compressImageToWebP(inputFile, 1280, 0.85);

    expect(compressed.name).toBe("recibo_compra.webp");
    expect(compressed.type).toBe("image/webp");
  });

  it("debe aplicar fallback transparente a canvas en hilo principal si el Web Worker reporta un error", async () => {
    class FailingWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;

      postMessage(data: { id: string }) {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({
              data: {
                id: data.id,
                success: false,
                error: "Fallo de memoria en worker",
              },
            } as MessageEvent);
          }
        }, 10);
      }

      terminate = vi.fn();
    }

    // @ts-expect-error Mocking worker environment
    window.Worker = FailingWorker;
    // @ts-expect-error Mocking OffscreenCanvas
    window.OffscreenCanvas = vi.fn();
    window.createImageBitmap = vi.fn();

    // Mocking fallback canvas
    const mockBlob = new Blob(["fallback-webp"], { type: "image/webp" });
    const mockDrawImage = vi.fn();
    const mockToBlob = vi.fn((cb: (b: Blob | null) => void) => cb(mockBlob));

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: mockDrawImage }),
          toBlob: mockToBlob,
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tagName);
    });

    class MockImage {
      onload: (() => void) | null = null;
      width = 800;
      height = 600;
      private _src = "";
      set src(v: string) {
        this._src = v;
        setTimeout(() => this.onload?.(), 0);
      }
      get src() {
        return this._src;
      }
    }
    // @ts-expect-error Mocking Image
    window.Image = MockImage;
    URL.createObjectURL = vi.fn(() => "blob:mock-fallback-url");
    URL.revokeObjectURL = vi.fn();

    const inputFile = new File(["dummy-pixels"], "recibo_error.png", {
      type: "image/png",
    });

    const compressed = await compressImageToWebP(inputFile, 1280, 0.85);

    expect(compressed.name).toBe("recibo_error.webp");
    expect(compressed.type).toBe("image/webp");
  });
});
