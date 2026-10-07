import React from "react";
import { Skeleton } from "./Skeleton";

export const ModalSkeleton: React.FC = () => {
  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.55)", zIndex: 1050 }}
      role="dialog"
      aria-modal="true"
      aria-label="Cargando contenido..."
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
        <div
          className="modal-content border-2 p-4 shadow-lg"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
            borderRadius: "14px",
          }}
        >
          <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-3">
            <div className="d-flex align-items-center gap-2">
              <Skeleton variant="circular" width="28px" height="28px" />
              <Skeleton width="200px" height="24px" />
            </div>
            <Skeleton variant="circular" width="24px" height="24px" />
          </div>
          <div className="d-flex flex-column gap-3 py-2">
            <Skeleton width="100%" height="56px" />
            <Skeleton width="100%" height="110px" />
            <Skeleton width="75%" height="20px" />
          </div>
          <div className="d-flex justify-content-end gap-2 pt-3 border-top mt-2">
            <Skeleton width="90px" height="34px" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalSkeleton;
