import React, { useState } from "react";
import api from "../../api";
import type { Task } from "../../types/task";
import { useToast } from "../../context/ToastContext";
import {
  LuDownload,
  LuFileSpreadsheet,
  LuFileJson,
  LuPrinter,
  LuX,
  LuShieldCheck,
  LuLoaderCircle,
  LuRefrigerator,
} from "react-icons/lu";

export interface RoomExportModalProps {
  roomId: string;
  roomName: string;
  tasks: Task[];
  isOpen: boolean;
  onClose: () => void;
}

export const RoomExportModal: React.FC<RoomExportModalProps> = ({
  roomId,
  roomName,
  tasks,
  isOpen,
  onClose,
}) => {
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const { toast } = useToast();

  if (!isOpen) return null;

  // Descarga directa por streaming de JSON o CSV
  const handleExportData = async (format: "json" | "csv") => {
    const isJson = format === "json";
    if (isJson) setDownloadingJson(true);
    else setDownloadingCsv(true);

    try {
      const response = await api.get(`/rooms/${roomId}/export`, {
        params: { format },
        responseType: "blob",
      });

      const today = new Date().toISOString().split("T")[0];
      const safeRoomName = roomName.toLowerCase().replace(/[^a-z0-9]/g, "_") || "hogar";
      const filename = `prioritask_${safeRoomName}_${today}.${format}`;

      const blob = new Blob([response.data], {
        type: isJson ? "application/json" : "text/csv;charset=utf-8;",
      });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);

      toast.success(
        isJson
          ? "Copia completa JSON descargada con éxito 📦"
          : "Hoja de cálculo CSV generada y descargada 📊"
      );
    } catch (err: unknown) {
      console.error(`Error al exportar datos en formato ${format}:`, err);
      toast.error(`No se pudieron exportar los datos en formato ${format.toUpperCase()}.`);
    } finally {
      if (isJson) setDownloadingJson(false);
      else setDownloadingCsv(false);
    }
  };

  // Disparar diálogo nativo de impresión para la vista de la nevera
  const handlePrintFridgeList = () => {
    // window.print() activará las reglas @media print
    window.print();
  };

  const activeTasks = tasks.filter((t) => t.estado !== "DONE");
  const todayFormatted = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      {/* ── Modal Interactivo en Pantalla ── */}
      <div
        className="modal show d-block no-print"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1050 }}
        onClick={onClose}
      >
        <div
          className="modal-dialog modal-dialog-centered modal-lg"
          role="document"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="modal-content shadow-lg border-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-main)",
              borderColor: "var(--border-default)",
              borderRadius: "14px",
            }}
          >
            {/* Cabecera del Modal */}
            <div className="modal-header border-bottom px-4 py-3 align-items-center">
              <div className="d-flex align-items-center gap-2">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center p-2"
                  style={{ backgroundColor: "var(--primary-50)", color: "var(--primary-600)" }}
                >
                  <LuDownload size={20} />
                </div>
                <div>
                  <h5 className="modal-title fw-bold mb-0" id="export-modal-title" style={{ fontSize: "17px" }}>
                    Exportar Datos y Lista de Tareas
                  </h5>
                  <p className="text-muted small mb-0">Hogar: {roomName}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                aria-label="Cerrar modal"
                onClick={onClose}
              />
            </div>

            {/* Contenido del Modal */}
            <div className="modal-body p-4">
              <div className="row g-3">
                {/* Opción 1: Lista para la Nevera */}
                <div className="col-12">
                  <div
                    className="p-3 rounded border d-flex align-items-center justify-content-between flex-wrap gap-3"
                    style={{
                      backgroundColor: "var(--bg-subtle)",
                      borderColor: "var(--border-default)",
                    }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="rounded p-2 d-flex align-items-center justify-content-center text-primary"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
                      >
                        <LuRefrigerator size={28} />
                      </div>
                      <div>
                        <h6 className="fw-bold mb-1" style={{ fontSize: "15px" }}>
                          Imprimir Lista para la Nevera (A4)
                        </h6>
                        <p className="text-muted small mb-0">
                          Formato analógico en blanco y negro de alto contraste con casillas [ ] para marcar a mano con bolígrafo las tareas semanales.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary d-inline-flex align-items-center gap-2 px-3 py-2"
                      onClick={handlePrintFridgeList}
                    >
                      <LuPrinter size={16} />
                      <span>Imprimir Ahora</span>
                    </button>
                  </div>
                </div>

                {/* Opción 2: Backup JSON Completo (GDPR) */}
                <div className="col-12 col-md-6">
                  <div
                    className="h-100 p-3 rounded border d-flex flex-column justify-content-between gap-3"
                    style={{
                      backgroundColor: "var(--bg-subtle)",
                      borderColor: "var(--border-default)",
                    }}
                  >
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-2 text-primary">
                        <LuFileJson size={22} />
                        <h6 className="fw-bold mb-0">Respaldo Total (JSON)</h6>
                      </div>
                      <p className="text-muted small mb-0">
                        Volcado estructurado completo de todo el hogar (miembros, tareas, subtareas, notas y metadatos de evidencias) para portabilidad GDPR.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-retro btn-retro-outline w-100 d-inline-flex align-items-center justify-content-center gap-2"
                      onClick={() => handleExportData("json")}
                      disabled={downloadingJson || downloadingCsv}
                    >
                      {downloadingJson ? (
                        <>
                          <LuLoaderCircle size={15} className="spin" />
                          <span>Descargando...</span>
                        </>
                      ) : (
                        <>
                          <LuDownload size={15} />
                          <span>Descargar JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Opción 3: Exportación Tabular CSV */}
                <div className="col-12 col-md-6">
                  <div
                    className="h-100 p-3 rounded border d-flex flex-column justify-content-between gap-3"
                    style={{
                      backgroundColor: "var(--bg-subtle)",
                      borderColor: "var(--border-default)",
                    }}
                  >
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-2 text-success">
                        <LuFileSpreadsheet size={22} />
                        <h6 className="fw-bold mb-0">Hojas de Cálculo (CSV)</h6>
                      </div>
                      <p className="text-muted small mb-0">
                        Exportación tabular compatible con Microsoft Excel, Google Sheets o LibreOffice con estados, categorías, responsables y fechas límite.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-retro btn-retro-outline w-100 d-inline-flex align-items-center justify-content-center gap-2"
                      onClick={() => handleExportData("csv")}
                      disabled={downloadingJson || downloadingCsv}
                    >
                      {downloadingCsv ? (
                        <>
                          <LuLoaderCircle size={15} className="spin" />
                          <span>Generando...</span>
                        </>
                      ) : (
                        <>
                          <LuDownload size={15} />
                          <span>Descargar CSV</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Nota de privacidad GDPR */}
              <div className="mt-3 p-2 rounded d-flex align-items-center gap-2 text-muted" style={{ fontSize: "11px" }}>
                <LuShieldCheck size={16} className="text-success flex-shrink-0" />
                <span>
                  Cumplimiento GDPR: Tienes derecho a la portabilidad de tus datos en cualquier momento. La exportación no altera ni elimina ningún registro existente.
                </span>
              </div>
            </div>

            {/* Pie del modal */}
            <div className="modal-footer border-top px-4 py-2">
              <button
                type="button"
                className="btn btn-retro btn-sm d-inline-flex align-items-center gap-1"
                onClick={onClose}
              >
                <LuX size={14} />
                <span>Cerrar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Vista Imprimible para la Nevera (Solo activa en @media print) ── */}
      <div id="fridge-print-container" className="fridge-print-only" aria-hidden="true">
        <div className="fridge-print-header">
          <div className="fridge-print-title-box">
            <h1 className="fridge-print-title">PRIORITASK // PLAN SEMANAL DEL HOGAR</h1>
            <p className="fridge-print-subtitle">
              Espacio: <strong>{roomName}</strong> &bull; Generado el {todayFormatted}
            </p>
          </div>
          <div className="fridge-print-badge-box">
            <span>[ COLGAR EN LA NEVERA ]</span>
          </div>
        </div>

        <div className="fridge-print-table-wrapper">
          <table className="fridge-print-table">
            <thead>
              <tr>
                <th style={{ width: "45px", textAlign: "center" }}>HECHO</th>
                <th>TAREA DEL HOGAR</th>
                <th style={{ width: "130px" }}>CATEGORÍA</th>
                <th style={{ width: "120px" }}>FECHA LÍMITE</th>
                <th style={{ width: "140px" }}>RESPONSABLE</th>
              </tr>
            </thead>
            <tbody>
              {activeTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "20px" }}>
                    ¡No hay tareas pendientes en este hogar! ¡Disfruten de su tiempo libre! 🎉
                  </td>
                </tr>
              ) : (
                activeTasks.map((t, idx) => (
                  <tr key={t.id || idx}>
                    <td style={{ textAlign: "center" }}>
                      <span className="fridge-checkbox">[ &nbsp; ]</span>
                    </td>
                    <td>
                      <div className="fridge-task-title">{t.titulo}</div>
                      {t.descripcion && (
                        <div className="fridge-task-desc">{t.descripcion}</div>
                      )}
                      {t.subtasks && t.subtasks.length > 0 && (
                        <div className="fridge-subtasks-list">
                          {t.subtasks.map((st) => (
                            <span key={st.id} className="fridge-subtask-item">
                              &bull; [ ] {st.titulo}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="fridge-category-tag">{t.categoria || "OTRO"}</span>
                    </td>
                    <td>{t.due_date ? t.due_date.split("T")[0] : "—"}</td>
                    <td>
                      <span className="fridge-assignee-line">________________</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sección de notas familiares al pie */}
        <div className="fridge-print-notes-section">
          <h3 className="fridge-notes-title">NOTAS Y MENSAJES DE LA SEMANA:</h3>
          <div className="fridge-notes-box">
            <div className="fridge-note-line" />
            <div className="fridge-note-line" />
            <div className="fridge-note-line" />
          </div>
        </div>

        <div className="fridge-print-footer">
          <span>Prioritask Web App &bull; Priorización inteligente de tareas compartidas</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </>
  );
};

export default RoomExportModal;
