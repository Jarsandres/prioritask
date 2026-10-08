import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AttachmentLightboxModal from "../AttachmentLightboxModal";
import type { TaskAttachment } from "../../../types/attachment";
import api from "../../../api";

const mockImageAttachment: TaskAttachment = {
  id: "att-101",
  tarea_id: "task-200",
  filename: "habitacion-ordenada.png",
  file_size_bytes: 2097152, // 2.0 MB
  content_type: "image/png",
  storage_path: "attachments/habitacion-ordenada.png",
  download_url: "/tasks/task-200/attachments/att-101/download",
  uploaded_by_id: "user-42",
  caption: "Habitación completamente recogida",
  created_at: "2026-10-01T15:00:00Z",
};

const mockPdfAttachment: TaskAttachment = {
  id: "att-102",
  tarea_id: "task-200",
  filename: "instrucciones.pdf",
  file_size_bytes: 1048576, // 1.0 MB
  content_type: "application/pdf",
  storage_path: "attachments/instrucciones.pdf",
  download_url: "/tasks/task-200/attachments/att-102/download",
  uploaded_by_id: "user-42",
  caption: "Guía de montaje",
  created_at: "2026-10-01T15:05:00Z",
};

describe("AttachmentLightboxModal", () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn(() => "blob:mock-lightbox-preview");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("no renderiza nada si isOpen es false o no hay attachment", () => {
    const { container } = render(
      <AttachmentLightboxModal
        attachment={null}
        allAttachments={[]}
        isOpen={false}
        onClose={vi.fn()}
        onSelectAttachment={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("abre el modal, carga el blob autenticado y renderiza la imagen con su pie de foto", async () => {
    const mockBlob = new Blob(["fake-img-bytes"], { type: "image/png" });
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: mockBlob });

    render(
      <AttachmentLightboxModal
        attachment={mockImageAttachment}
        allAttachments={[mockImageAttachment]}
        isOpen={true}
        onClose={vi.fn()}
        onSelectAttachment={vi.fn()}
      />
    );

    // Dialog aria accesible
    expect(
      screen.getByRole("dialog", { name: "Visor de evidencia fotográfica" })
    ).toBeInTheDocument();

    // Metadatos
    expect(screen.getByText("habitacion-ordenada.png")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
    expect(
      screen.getByText("Habitación completamente recogida")
    ).toBeInTheDocument();

    // Imagen renderizada
    const img = await screen.findByRole("img", {
      name: "Habitación completamente recogida",
    });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "blob:mock-lightbox-preview");
  });

  it("responde a los controles interactivos de zoom y rotación actualizando el transform", async () => {
    const mockBlob = new Blob(["fake-img-bytes"], { type: "image/png" });
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: mockBlob });

    render(
      <AttachmentLightboxModal
        attachment={mockImageAttachment}
        allAttachments={[mockImageAttachment]}
        isOpen={true}
        onClose={vi.fn()}
        onSelectAttachment={vi.fn()}
      />
    );

    const img = await screen.findByRole("img", {
      name: "Habitación completamente recogida",
    });
    expect(img).toHaveStyle({ transform: "scale(1) rotate(0deg)" });

    // Acercar (Zoom In: +0.25 -> 1.25)
    const btnZoomIn = screen.getByRole("button", { name: "Acercar" });
    fireEvent.click(btnZoomIn);
    expect(img).toHaveStyle({ transform: "scale(1.25) rotate(0deg)" });

    // Rotar horario 90° (0 -> 90)
    const btnRotateRight = screen.getByRole("button", {
      name: "Rotar derecha",
    });
    fireEvent.click(btnRotateRight);
    expect(img).toHaveStyle({ transform: "scale(1.25) rotate(90deg)" });

    // Rotar antihorario 90° (90 -> 0)
    const btnRotateLeft = screen.getByRole("button", {
      name: "Rotar izquierda",
    });
    fireEvent.click(btnRotateLeft);
    expect(img).toHaveStyle({ transform: "scale(1.25) rotate(0deg)" });

    // Restablecer escala
    const btnReset = screen.getByRole("button", {
      name: "Restablecer escala",
    });
    fireEvent.click(btnReset);
    expect(img).toHaveStyle({ transform: "scale(1) rotate(0deg)" });

    // Alejar (Zoom Out: 1.0 - 0.25 -> 0.75)
    const btnZoomOut = screen.getByRole("button", { name: "Alejar" });
    fireEvent.click(btnZoomOut);
    expect(img).toHaveStyle({ transform: "scale(0.75) rotate(0deg)" });
  });

  it("cierra el visor al presionar la tecla Escape", async () => {
    const onClose = vi.fn();
    const mockBlob = new Blob(["fake-img-bytes"], { type: "image/png" });
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: mockBlob });

    render(
      <AttachmentLightboxModal
        attachment={mockImageAttachment}
        allAttachments={[mockImageAttachment]}
        isOpen={true}
        onClose={onClose}
        onSelectAttachment={vi.fn()}
      />
    );

    await screen.findByRole("img");

    // Disparar atajo de teclado Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cierra el visor al hacer clic en el botón de cerrar", async () => {
    const onClose = vi.fn();
    const mockBlob = new Blob(["fake-img-bytes"], { type: "image/png" });
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: mockBlob });

    render(
      <AttachmentLightboxModal
        attachment={mockImageAttachment}
        allAttachments={[mockImageAttachment]}
        isOpen={true}
        onClose={onClose}
        onSelectAttachment={vi.fn()}
      />
    );

    const btnClose = screen.getByRole("button", { name: "Cerrar visor" });
    fireEvent.click(btnClose);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renderiza la vista para PDF sin intentar cargarlo como imagen y ofreciendo descarga directa", () => {
    const getSpy = vi.spyOn(api, "get");

    render(
      <AttachmentLightboxModal
        attachment={mockPdfAttachment}
        allAttachments={[mockPdfAttachment]}
        isOpen={true}
        onClose={vi.fn()}
        onSelectAttachment={vi.fn()}
      />
    );

    // No debe llamar api.get para blob de imagen
    expect(getSpy).not.toHaveBeenCalled();

    // Muestra visor de PDF con botón de descarga
    expect(screen.getAllByText("instrucciones.pdf").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Descargar / Abrir PDF")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
