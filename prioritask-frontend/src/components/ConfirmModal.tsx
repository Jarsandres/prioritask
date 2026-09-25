import React from "react";

interface ConfirmModalProps {
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

const ConfirmModal: React.FC<ConfirmModalProps> = ({
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
  if (!isOpen) return null;

  const btnVariantClass =
    variant === "danger"
      ? "btn-retro-danger"
      : variant === "warning"
      ? "btn-retro-warning"
      : "btn-retro-primary";

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(2px)",
        zIndex: 1050,
      }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="retro-window w-100" style={{ border: "2.5px solid var(--window-border)" }}>
          <div
            className="retro-window-header"
            style={{
              background:
                variant === "danger"
                  ? "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"
                  : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <span>⚠️</span>
              <span>{title.toUpperCase()}</span>
            </div>
            <button
              type="button"
              className="retro-window-btn"
              onClick={onCancel}
              disabled={isLoading}
              style={{ cursor: "pointer", background: "rgba(255,255,255,0.2)" }}
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
          <div className="retro-window-body">
            <p className="mb-4 fs-6">{message}</p>
            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn-retro btn-retro-outline"
                style={{ minHeight: "40px" }}
                onClick={onCancel}
                disabled={isLoading}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className={`btn-retro ${btnVariantClass}`}
                style={{ minHeight: "40px" }}
                onClick={onConfirm}
                disabled={isLoading}
              >
                {isLoading ? "Procesando..." : confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
