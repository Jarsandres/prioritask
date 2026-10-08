import React, { useState, useEffect, useRef, useCallback } from "react";
import api from "../../api";
import type { TaskAttachment } from "../../types/attachment";
import {
  compressImageToWebP,
  formatFileSize,
  isImageContentType,
  downloadAttachmentBlob,
} from "../../utils/attachmentUtils";
import { useToast } from "../../context/ToastContext";
import ConfirmModal from "../ConfirmModal";
import AttachmentLightboxModal from "./AttachmentLightboxModal";
import {
  LuPaperclip,
  LuCamera,
  LuUpload,
  LuTrash2,
  LuDownload,
  LuFileText,
  LuLoaderCircle,
  LuEye,
  LuInfo,
} from "react-icons/lu";
import "./tasks.css";

export interface TaskAttachmentsSectionProps {
  taskId: string;
  className?: string;
  readOnly?: boolean;
  onAttachmentsCountChange?: (count: number) => void;
}

/**
 * Componente individual para renderizar una miniatura de archivo
 * manejando la obtención autenticada de imagen para evitar problemas con cabeceras Bearer.
 */
interface ThumbnailItemProps {
  attachment: TaskAttachment;
  onOpenLightbox: (att: TaskAttachment) => void;
  onDeletePrompt: (att: TaskAttachment) => void;
  readOnly?: boolean;
}

const AttachmentThumbnailItem: React.FC<ThumbnailItemProps> = ({
  attachment,
  onOpenLightbox,
  onDeletePrompt,
  readOnly,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(false);
  const isImage = isImageContentType(attachment.content_type);

  useEffect(() => {
    if (!isImage) return;

    const controller = new AbortController();
    setLoadingImg(true);

    api
      .get(attachment.download_url, {
        responseType: "blob",
        signal: controller.signal,
      })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: attachment.content_type }));
        setImgUrl(url);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "CanceledError") return;
        // En caso de fallo silencioso de previsualización, no bloqueamos la UI
      })
      .finally(() => {
        setLoadingImg(false);
      });

    return () => {
      controller.abort();
    };
  }, [attachment.download_url, attachment.content_type, isImage]);

  useEffect(() => {
    return () => {
      if (imgUrl) {
        window.URL.revokeObjectURL(imgUrl);
      }
    };
  }, [imgUrl]);

  return (
    <div className="retro-attachment-item">
      {/* Zona de previsualización */}
      <div
        className="retro-attachment-thumb"
        onClick={() => onOpenLightbox(attachment)}
        title={isImage ? "Clic para ampliar en visor" : "Clic para ver detalles"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onOpenLightbox(attachment);
          }
        }}
      >
        {isImage ? (
          loadingImg ? (
            <div className="retro-thumb-placeholder">
              <LuLoaderCircle size={16} className="spin text-primary" />
            </div>
          ) : imgUrl ? (
            <img
              src={imgUrl}
              alt={attachment.caption || attachment.filename}
              className="retro-thumb-img"
              loading="lazy"
            />
          ) : (
            <div className="retro-thumb-placeholder">
              <LuEye size={20} className="text-muted" />
            </div>
          )
        ) : (
          <div className="retro-thumb-pdf">
            <LuFileText size={24} className="text-danger" />
            <span className="retro-thumb-ext">PDF</span>
          </div>
        )}

        <div className="retro-thumb-hover-overlay">
          <LuEye size={18} />
        </div>
      </div>

      {/* Información del archivo */}
      <div className="retro-attachment-info">
        <span className="retro-attachment-name" title={attachment.filename}>
          {attachment.filename}
        </span>
        <span className="retro-attachment-meta">
          {formatFileSize(attachment.file_size_bytes)}
        </span>
        {attachment.caption && (
          <span className="retro-attachment-caption" title={attachment.caption}>
            {attachment.caption}
          </span>
        )}
      </div>

      {/* Acciones del archivo */}
      <div className="retro-attachment-actions">
        <button
          type="button"
          className="btn-retro-icon"
          onClick={() => downloadAttachmentBlob(attachment.download_url, attachment.filename)}
          title="Descargar archivo"
          aria-label={`Descargar ${attachment.filename}`}
        >
          <LuDownload size={14} />
        </button>

        {!readOnly && (
          <button
            type="button"
            className="btn-retro-icon danger"
            onClick={() => onDeletePrompt(attachment)}
            title="Eliminar adjunto"
            aria-label={`Eliminar ${attachment.filename}`}
          >
            <LuTrash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export const TaskAttachmentsSection: React.FC<TaskAttachmentsSectionProps> = ({
  taskId,
  className = "",
  readOnly = false,
  onAttachmentsCountChange,
}) => {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");

  // Manejo de archivo seleccionado pendiente de subida con caption opcional
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedCaption, setStagedCaption] = useState("");

  // Modales
  const [lightboxAttachment, setLightboxAttachment] = useState<TaskAttachment | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<TaskAttachment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  // Cargar lista de adjuntos
  const fetchAttachments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await api.get<TaskAttachment[]>(`/tasks/${taskId}/attachments`, {
          signal,
        });
        setAttachments(res.data);
        onAttachmentsCountChange?.(res.data.length);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error("Error al cargar adjuntos:", err);
      } finally {
        setLoading(false);
      }
    },
    [taskId, onAttachmentsCountChange]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchAttachments(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchAttachments]);

  // Manejador del Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!readOnly && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (readOnly || isUploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      prepareFileForUpload(files[0]);
    }
  };

  // Preparar archivo (validar MIME y pre-cargar)
  const prepareFileForUpload = (file: File) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowed.includes(file.type) && !file.type.startsWith("image/")) {
      toast.error("Formato no compatible. Solo se admiten fotos (JPEG, PNG, WebP) o PDFs.");
      return;
    }

    setStagedFile(file);
    setStagedCaption("");
  };

  // Subir archivo al backend con compresión previa en cliente
  const executeUpload = async () => {
    if (!stagedFile || isUploading) return;

    setIsUploading(true);
    setUploadStatusText("Optimizando archivo...");

    try {
      let fileToSend = stagedFile;

      // Compresión en cliente a WebP para imágenes
      if (stagedFile.type.startsWith("image/")) {
        setUploadStatusText("Comprimiendo imagen a WebP (85%)...");
        fileToSend = await compressImageToWebP(stagedFile, 1280, 0.85);
      }

      setUploadStatusText("Subiendo evidencia...");
      const formData = new FormData();
      formData.append("file", fileToSend);
      if (stagedCaption.trim()) {
        formData.append("caption", stagedCaption.trim());
      }

      const res = await api.post<TaskAttachment>(
        `/tasks/${taskId}/attachments`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      const updated = [...attachments, res.data];
      setAttachments(updated);
      onAttachmentsCountChange?.(updated.length);

      setStagedFile(null);
      setStagedCaption("");
      toast.success("Evidencia adjuntada exitosamente 📎");
    } catch (err: unknown) {
      console.error("Error al subir archivo:", err);
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      const errorMessage =
        axiosErr.response?.data?.detail ||
        axiosErr.message ||
        "No se pudo subir el archivo. Comprueba la cuota o formato.";
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadStatusText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  // Confirmar y eliminar adjunto
  const handleConfirmDelete = async () => {
    if (!attachmentToDelete) return;

    setIsDeleting(true);
    try {
      await api.delete(`/tasks/${taskId}/attachments/${attachmentToDelete.id}`);
      const updated = attachments.filter((att) => att.id !== attachmentToDelete.id);
      setAttachments(updated);
      onAttachmentsCountChange?.(updated.length);
      toast.success("Adjunto eliminado correctamente.");
      setAttachmentToDelete(null);
    } catch (err) {
      console.error("Error al eliminar adjunto:", err);
      toast.error("No se pudo eliminar el adjunto.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`retro-attachments-section ${className}`.trim()}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="d-flex align-items-center gap-2 mb-0 fw-bold" style={{ fontSize: "14px" }}>
          <LuPaperclip size={16} className="text-primary" />
          <span>Evidencias y Adjuntos</span>
          <span className="badge bg-secondary-subtle text-secondary rounded-pill px-2">
            {attachments.length}
          </span>
        </h6>
      </div>

      {/* Inputs ocultos para subida y captura de cámara */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="d-none"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            prepareFileForUpload(e.target.files[0]);
          }
        }}
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="d-none"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            prepareFileForUpload(e.target.files[0]);
          }
        }}
      />

      {/* Zona de Dropzone y acciones de carga */}
      {!readOnly && (
        <div
          ref={dropzoneRef}
          className={`retro-dropzone ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {stagedFile ? (
            <div className="retro-staged-box">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                <span className="fw-semibold text-truncate small" style={{ maxWidth: "260px" }}>
                  📎 {stagedFile.name} ({formatFileSize(stagedFile.size)})
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger p-0 text-decoration-none"
                  onClick={() => setStagedFile(null)}
                  disabled={isUploading}
                >
                  Cancelar
                </button>
              </div>

              <div className="input-group input-group-sm mb-2">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Descripción o pie de foto (opcional)..."
                  value={stagedCaption}
                  onChange={(e) => setStagedCaption(e.target.value)}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  className="btn btn-primary d-inline-flex align-items-center gap-1"
                  onClick={executeUpload}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <LuLoaderCircle size={14} className="spin" />
                      <span>{uploadStatusText || "Subiendo..."}</span>
                    </>
                  ) : (
                    <>
                      <LuUpload size={14} />
                      <span>Subir Evidencia</span>
                    </>
                  )}
                </button>
              </div>

              <p className="retro-compress-hint mb-0">
                <LuInfo size={12} className="me-1" />
                Las imágenes grandes se optimizan automáticamente a formato WebP (1280px máx.)
              </p>
            </div>
          ) : (
            <div className="retro-dropzone-content">
              <div className="retro-dropzone-prompt">
                <LuUpload size={24} className="text-muted mb-1" />
                <span className="small text-muted d-block">
                  Arrastra y suelta fotos o documentos PDF aquí, o elige una opción:
                </span>
              </div>

              <div className="d-flex align-items-center justify-content-center gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  className="btn-retro btn-retro-outline btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <LuPaperclip size={14} className="me-1" />
                  <span>Adjuntar Archivo</span>
                </button>

                <button
                  type="button"
                  className="btn-retro btn-retro-outline btn-sm"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isUploading}
                  title="Tomar foto con la cámara del dispositivo"
                >
                  <LuCamera size={14} className="me-1" />
                  <span>Cámara Móvil</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Galería de adjuntos */}
      {loading ? (
        <div className="d-flex align-items-center justify-content-center py-3 text-muted small gap-2">
          <LuLoaderCircle size={16} className="spin" />
          <span>Cargando adjuntos...</span>
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-2 text-muted" style={{ fontSize: "12px" }}>
          <span>Sin evidencias fotográficas o adjuntos registrados.</span>
        </div>
      ) : (
        <div className="retro-attachments-grid mt-2">
          {attachments.map((att) => (
            <AttachmentThumbnailItem
              key={att.id}
              attachment={att}
              onOpenLightbox={(selected) => setLightboxAttachment(selected)}
              onDeletePrompt={(target) => setAttachmentToDelete(target)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Modal Lightbox a Pantalla Completa */}
      {lightboxAttachment && (
        <AttachmentLightboxModal
          isOpen={Boolean(lightboxAttachment)}
          attachment={lightboxAttachment}
          allAttachments={attachments}
          onClose={() => setLightboxAttachment(null)}
          onSelectAttachment={(att) => setLightboxAttachment(att)}
        />
      )}

      {/* Modal de confirmación para eliminar adjunto */}
      <ConfirmModal
        isOpen={Boolean(attachmentToDelete)}
        title="Eliminar archivo adjunto"
        message={`¿Estás seguro de que deseas eliminar "${attachmentToDelete?.filename}"?`}
        confirmText="Eliminar adjunto"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setAttachmentToDelete(null)}
      />
    </div>
  );
};

export default TaskAttachmentsSection;
