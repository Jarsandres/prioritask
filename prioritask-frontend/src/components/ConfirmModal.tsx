import React, { useRef } from "react";
import { LuTriangleAlert, LuCircleAlert, LuInfo, LuX } from "react-icons/lu";
import Button from "./ui/Button";
import useA11yModal from "../hooks/useA11yModal";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "primary" | "warning";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useA11yModal({
    isOpen,
    onClose: () => {
      if (!isLoading) onCancel();
    },
    modalRef,
    initialFocusRef: cancelBtnRef,
  });

  if (!isOpen) return null;

  const iconComponent =
    variant === "danger" ? (
      <div
        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
        style={{
          width: "44px",
          height: "44px",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          color: "#ef4444",
        }}
      >
        <LuTriangleAlert size={22} />
      </div>
    ) : variant === "warning" ? (
      <div
        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
        style={{
          width: "44px",
          height: "44px",
          backgroundColor: "rgba(245, 158, 11, 0.12)",
          color: "#f59e0b",
        }}
      >
        <LuCircleAlert size={22} />
      </div>
    ) : (
      <div
        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
        style={{
          width: "44px",
          height: "44px",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          color: "#2563eb",
        }}
      >
        <LuInfo size={22} />
      </div>
    );

  const mappedButtonVariant = variant === "danger" ? "danger" : "primary";

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1060,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "480px" }}>
        <div
          ref={modalRef}
          className="modal-content rounded-4 border shadow-xl p-4 retro-bottom-sheet"
          style={{
            backgroundColor: "var(--bg-surface, #ffffff)",
            borderColor: "var(--border-default, #e2e8f0)",
          }}
        >
          {/* Header con icono y botón de cerrar */}
          <div className="d-flex justify-content-between align-items-start mb-3">
            <div className="d-flex align-items-center gap-3">
              {iconComponent}
              <h2
                id="confirm-modal-title"
                className="h5 mb-0 fw-bold"
                style={{
                  color: "var(--text-heading, #0f172a)",
                  letterSpacing: "-0.01em",
                }}
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost p-1 rounded-circle text-muted d-flex align-items-center justify-content-center"
              style={{
                width: "32px",
                height: "32px",
                backgroundColor: "transparent",
                border: "none",
              }}
              onClick={onCancel}
              disabled={isLoading}
              aria-label="Cerrar modal"
            >
              <LuX size={18} />
            </button>
          </div>

          {/* Mensaje descriptivo */}
          <p
            className="mb-4"
            style={{
              color: "var(--text-body, #475569)",
              fontSize: "0.94rem",
              lineHeight: "1.55",
            }}
          >
            {message}
          </p>

          {/* Acciones */}
          <div className="d-flex justify-content-end gap-2">
            <Button
              ref={cancelBtnRef}
              variant="outline"
              size="md"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelText}
            </Button>
            <Button
              variant={mappedButtonVariant}
              size="md"
              onClick={onConfirm}
              isLoading={isLoading}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
