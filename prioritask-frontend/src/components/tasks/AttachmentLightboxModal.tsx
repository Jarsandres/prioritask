import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "../../api";
import type { TaskAttachment } from "../../types/attachment";
import { formatFileSize, isImageContentType, downloadAttachmentBlob } from "../../utils/attachmentUtils";
import {
  LuX,
  LuZoomIn,
  LuZoomOut,
  LuRotateCcw,
  LuRotateCw,
  LuDownload,
  LuChevronLeft,
  LuChevronRight,
  LuMaximize2,
  LuLoaderCircle,
  LuFileText,
} from "react-icons/lu";

export interface AttachmentLightboxModalProps {
  attachment: TaskAttachment | null;
  allAttachments: TaskAttachment[];
  isOpen: boolean;
  onClose: () => void;
  onSelectAttachment: (attachment: TaskAttachment) => void;
}

export const AttachmentLightboxModal: React.FC<AttachmentLightboxModalProps> = ({
  attachment,
  allAttachments,
  isOpen,
  onClose,
  onSelectAttachment,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtrar solo adjuntos que sean imágenes para navegación
  const imageAttachments = useMemo(() => {
    return allAttachments.filter((att) => isImageContentType(att.content_type));
  }, [allAttachments]);

  const currentIndex = useMemo(() => {
    if (!attachment) return -1;
    return imageAttachments.findIndex((att) => att.id === attachment.id);
  }, [attachment, imageAttachments]);

  // Cargar imagen con autenticación Bearer via Axios
  useEffect(() => {
    if (!isOpen || !attachment) {
      setBlobUrl(null);
      return;
    }

    // Resetear zoom y rotación al cambiar de archivo
    setZoom(1);
    setRotation(0);
    setError(null);

    // Si no es imagen (ej. PDF)
    if (!isImageContentType(attachment.content_type)) {
      setBlobUrl(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    api
      .get(attachment.download_url, {
        responseType: "blob",
        signal: controller.signal,
      })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: attachment.content_type }));
        setBlobUrl(url);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error("Error al cargar imagen en lightbox:", err);
        setError("No se pudo cargar la imagen.");
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, attachment]);

  // Liberar el blobUrl cuando cambie o se desmonte
  useEffect(() => {
    return () => {
      if (blobUrl) {
        window.URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Navegación anterior / siguiente
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onSelectAttachment(imageAttachments[currentIndex - 1]);
    }
  }, [currentIndex, imageAttachments, onSelectAttachment]);

  const handleNext = useCallback(() => {
    if (currentIndex < imageAttachments.length - 1) {
      onSelectAttachment(imageAttachments[currentIndex + 1]);
    }
  }, [currentIndex, imageAttachments, onSelectAttachment]);

  // Controles de zoom y rotación
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotateLeft = () => setRotation((prev) => (prev - 90) % 360);
  const handleRotateRight = () => setRotation((prev) => (prev + 90) % 360);

  // Manejo de atajos de teclado
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleReset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !attachment) return null;

  const isImage = isImageContentType(attachment.content_type);

  return (
    <div
      className="retro-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de evidencia fotográfica"
    >
      {/* Contenedor principal sin cerrar por clic interno */}
      <div
        className="retro-lightbox-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de herramientas superior */}
        <div className="retro-lightbox-header">
          <div className="retro-lightbox-meta">
            <span className="retro-lightbox-title" title={attachment.filename}>
              {attachment.filename}
            </span>
            <span className="retro-lightbox-size">
              {formatFileSize(attachment.file_size_bytes)}
            </span>
            {currentIndex >= 0 && imageAttachments.length > 1 && (
              <span className="retro-lightbox-counter">
                ({currentIndex + 1} / {imageAttachments.length})
              </span>
            )}
          </div>

          <div className="retro-lightbox-actions">
            {isImage && (
              <>
                <button
                  type="button"
                  className="retro-lightbox-btn"
                  onClick={handleZoomOut}
                  title="Alejar (-)"
                  aria-label="Alejar"
                >
                  <LuZoomOut size={16} />
                </button>
                <button
                  type="button"
                  className="retro-lightbox-btn"
                  onClick={handleReset}
                  title="Restablecer (100%)"
                  aria-label="Restablecer escala"
                >
                  <LuMaximize2 size={16} />
                </button>
                <button
                  type="button"
                  className="retro-lightbox-btn"
                  onClick={handleZoomIn}
                  title="Acercar (+)"
                  aria-label="Acercar"
                >
                  <LuZoomIn size={16} />
                </button>
                <div className="retro-lightbox-divider" />
                <button
                  type="button"
                  className="retro-lightbox-btn"
                  onClick={handleRotateLeft}
                  title="Rotar antihorario 90°"
                  aria-label="Rotar izquierda"
                >
                  <LuRotateCcw size={16} />
                </button>
                <button
                  type="button"
                  className="retro-lightbox-btn"
                  onClick={handleRotateRight}
                  title="Rotar horario 90°"
                  aria-label="Rotar derecha"
                >
                  <LuRotateCw size={16} />
                </button>
                <div className="retro-lightbox-divider" />
              </>
            )}

            <button
              type="button"
              className="retro-lightbox-btn"
              onClick={() => downloadAttachmentBlob(attachment.download_url, attachment.filename)}
              title="Descargar archivo físico"
              aria-label="Descargar archivo"
            >
              <LuDownload size={16} />
            </button>

            <button
              type="button"
              className="retro-lightbox-btn close"
              onClick={onClose}
              title="Cerrar (Esc)"
              aria-label="Cerrar visor"
            >
              <LuX size={18} />
            </button>
          </div>
        </div>

        {/* Zona del contenido central */}
        <div className="retro-lightbox-body">
          {currentIndex > 0 && (
            <button
              type="button"
              className="retro-lightbox-nav prev"
              onClick={handlePrev}
              title="Imagen anterior (←)"
              aria-label="Imagen anterior"
            >
              <LuChevronLeft size={24} />
            </button>
          )}

          <div className="retro-lightbox-viewport">
            {isLoading ? (
              <div className="retro-lightbox-loading">
                <LuLoaderCircle size={32} className="spin text-primary" />
                <span>Cargando evidencia fotográfica...</span>
              </div>
            ) : error ? (
              <div className="retro-lightbox-error">
                <p>{error}</p>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => downloadAttachmentBlob(attachment.download_url, attachment.filename)}
                >
                  Descargar archivo directamente
                </button>
              </div>
            ) : isImage && blobUrl ? (
              <img
                src={blobUrl}
                alt={attachment.caption || attachment.filename}
                className="retro-lightbox-image"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: "transform 0.15s ease-out",
                }}
              />
            ) : (
              <div className="retro-lightbox-pdf-view">
                <LuFileText size={48} className="text-danger mb-2" />
                <h5 className="fw-bold mb-1">{attachment.filename}</h5>
                <p className="text-muted small mb-3">
                  Documento PDF ({formatFileSize(attachment.file_size_bytes)})
                </p>
                <button
                  type="button"
                  className="btn btn-retro btn-sm"
                  onClick={() => downloadAttachmentBlob(attachment.download_url, attachment.filename)}
                >
                  <LuDownload size={14} className="me-1" />
                  <span>Descargar / Abrir PDF</span>
                </button>
              </div>
            )}
          </div>

          {currentIndex < imageAttachments.length - 1 && currentIndex >= 0 && (
            <button
              type="button"
              className="retro-lightbox-nav next"
              onClick={handleNext}
              title="Siguiente imagen (→)"
              aria-label="Siguiente imagen"
            >
              <LuChevronRight size={24} />
            </button>
          )}
        </div>

        {/* Pie de foto / caption si existe */}
        {attachment.caption && (
          <div className="retro-lightbox-footer">
            <p className="retro-lightbox-caption mb-0">
              <span className="fw-semibold">Descripción: </span>
              {attachment.caption}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttachmentLightboxModal;
