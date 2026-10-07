import { useState, useEffect, useCallback } from "react";
import {
  LuChartBar,
  LuCircleCheck,
  LuClock,
  LuTriangleAlert,
  LuUsers,
  LuLayers,
  LuRefreshCw,
  LuX,
  LuAward,
  LuActivity,
} from "react-icons/lu";
import api from "../../api";
import type { RoomAnalyticsResponse } from "../../types/analytics";
import { Skeleton } from "../ui/Skeleton";
import Button from "../ui/Button";

export interface RoomAnalyticsModalProps {
  roomId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_THEMES: Record<string, { bg: string; text: string; border: string }> = {
  limpieza: { bg: "rgba(59, 130, 246, 0.12)", text: "#2563eb", border: "rgba(59, 130, 246, 0.25)" },
  compras: { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.25)" },
  cocina: { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", border: "rgba(245, 158, 11, 0.25)" },
  mantenimiento: { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed", border: "rgba(139, 92, 246, 0.25)" },
  finanzas: { bg: "rgba(236, 72, 153, 0.12)", text: "#db2777", border: "rgba(236, 72, 153, 0.25)" },
  mascotas: { bg: "rgba(20, 184, 166, 0.12)", text: "#0d9488", border: "rgba(20, 184, 166, 0.25)" },
  general: { bg: "rgba(100, 116, 139, 0.12)", text: "#475569", border: "rgba(100, 116, 139, 0.25)" },
};

const getCategoryTheme = (category: string) => {
  const normalized = category.toLowerCase().trim();
  if (CATEGORY_THEMES[normalized]) {
    return CATEGORY_THEMES[normalized];
  }
  return {
    bg: "rgba(99, 102, 241, 0.12)",
    text: "#4f46e5",
    border: "rgba(99, 102, 241, 0.25)",
  };
};

const getInitials = (name?: string) => {
  if (!name) return "U";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
};

export const RoomAnalyticsModal = ({
  roomId,
  roomName,
  isOpen,
  onClose,
}: RoomAnalyticsModalProps) => {
  const [analytics, setAnalytics] = useState<RoomAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (signal?: AbortSignal) => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<RoomAnalyticsResponse>(`/rooms/${roomId}/analytics`, {
        signal,
      });
      setAnalytics(res.data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "CanceledError") return;
      console.error("Error al cargar analíticas del hogar:", err);
      setError("No se pudieron obtener las métricas del hogar. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    fetchAnalytics(controller.signal);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      controller.abort();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, fetchAnalytics, onClose]);

  if (!isOpen) return null;

  const totalCategoriasTareas = analytics
    ? Object.values(analytics.distribucion_por_categoria).reduce((acc, curr) => acc + curr, 0)
    : 0;

  return (
    <div
      className="modal show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-analytics-modal-title"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1050,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div
          className="modal-content rounded-4 border shadow-xl overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface, #ffffff)",
            borderColor: "var(--border-default, #e2e8f0)",
            color: "var(--text-main, #1e293b)",
          }}
        >
          {/* Header */}
          <div
            className="d-flex align-items-center justify-content-between p-3 px-md-4 border-bottom"
            style={{ borderColor: "var(--border-default, #e2e8f0)" }}
          >
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center rounded-3 p-2"
                style={{
                  backgroundColor: "rgba(37, 99, 235, 0.12)",
                  color: "var(--primary-600, #1d4ed8)",
                }}
              >
                <LuChartBar size={24} aria-hidden="true" />
              </div>
              <div>
                <h5
                  id="room-analytics-modal-title"
                  className="modal-title fw-bold mb-0"
                  style={{ color: "var(--text-heading, #0f172a)", fontSize: "1.15rem" }}
                >
                  Analíticas y Productividad
                </h5>
                <p
                  className="mb-0 small"
                  style={{ color: "var(--text-muted, #64748b)" }}
                >
                  {roomName ? `Hogar "${roomName}"` : "Métricas del Hogar"}
                </p>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 rounded-pill px-3"
                onClick={() => fetchAnalytics()}
                disabled={loading}
                title="Actualizar analíticas"
              >
                <LuRefreshCw size={14} className={loading ? "spin-icon" : ""} />
                <span className="d-none d-sm-inline">Actualizar</span>
              </button>
              <button
                type="button"
                className="btn btn-sm text-muted p-1 rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: "32px", height: "32px" }}
                aria-label="Cerrar modal"
                onClick={onClose}
              >
                <LuX size={20} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="modal-body p-3 p-md-4">
            {loading ? (
              <div className="d-flex flex-column gap-3">
                <div className="row g-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="col-6 col-md-3">
                      <div
                        className="p-3 rounded-3 border"
                        style={{ borderColor: "var(--border-default, #e2e8f0)" }}
                      >
                        <Skeleton width="50%" height="16px" className="mb-2" />
                        <Skeleton width="80%" height="28px" />
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  className="p-3 rounded-3 border mt-2"
                  style={{ borderColor: "var(--border-default, #e2e8f0)" }}
                >
                  <Skeleton width="40%" height="20px" className="mb-3" />
                  <Skeleton width="100%" height="12px" className="mb-2" />
                  <Skeleton width="100%" height="50px" />
                </div>
                <div
                  className="p-3 rounded-3 border mt-2"
                  style={{ borderColor: "var(--border-default, #e2e8f0)" }}
                >
                  <Skeleton width="35%" height="20px" className="mb-3" />
                  <div className="d-flex gap-2">
                    <Skeleton width="90px" height="30px" className="rounded-pill" />
                    <Skeleton width="110px" height="30px" className="rounded-pill" />
                    <Skeleton width="80px" height="30px" className="rounded-pill" />
                  </div>
                </div>
              </div>
            ) : error ? (
              <div
                className="p-4 rounded-3 border text-center"
                style={{
                  backgroundColor: "var(--danger-50, #fef2f2)",
                  borderColor: "var(--danger-500, #ef4444)",
                  color: "var(--danger-600, #dc2626)",
                }}
              >
                <LuTriangleAlert size={36} className="mb-2" />
                <h6 className="fw-bold mb-1">Ocurrió un error</h6>
                <p className="small mb-3">{error}</p>
                <Button variant="secondary" size="sm" onClick={() => fetchAnalytics()}>
                  Reintentar
                </Button>
              </div>
            ) : analytics ? (
              <div className="d-flex flex-column gap-4">
                {/* 1. Alerta si hay tareas vencidas */}
                {analytics.tareas_vencidas > 0 && (
                  <div
                    className="p-3 rounded-3 border d-flex align-items-center gap-3 animate-pulse-subtle"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.08)",
                      borderColor: "rgba(239, 68, 68, 0.35)",
                      color: "#dc2626",
                    }}
                    role="alert"
                  >
                    <div className="p-2 rounded-circle bg-danger text-white d-flex align-items-center justify-content-center">
                      <LuTriangleAlert size={20} />
                    </div>
                    <div>
                      <div className="fw-bold" style={{ fontSize: "0.95rem" }}>
                        Atención: Hay {analytics.tareas_vencidas}{" "}
                        {analytics.tareas_vencidas === 1 ? "tarea vencida" : "tareas vencidas"}
                      </div>
                      <div className="small opacity-85">
                        Existen tareas activas cuya fecha límite ya ha expirado y requieren resolución prioritaria.
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Grid de Métricas Clave */}
                <div className="row g-3">
                  {/* Tasa de completitud */}
                  <div className="col-12 col-sm-6 col-lg-3">
                    <div
                      className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between"
                      style={{
                        backgroundColor: "var(--bg-subtle, #f8fafc)",
                        borderColor: "var(--border-default, #e2e8f0)",
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span
                          className="small fw-semibold"
                          style={{ color: "var(--text-muted, #64748b)" }}
                        >
                          Completitud
                        </span>
                        <LuActivity size={18} className="text-primary" />
                      </div>
                      <div className="mb-2">
                        <span
                          className="display-6 fw-bold"
                          style={{
                            fontSize: "1.75rem",
                            color: "var(--text-heading, #0f172a)",
                          }}
                        >
                          {analytics.tasa_completitud.toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className="progress"
                        style={{ height: "7px", backgroundColor: "var(--border-default, #e2e8f0)" }}
                      >
                        <div
                          className="progress-bar"
                          role="progressbar"
                          style={{
                            width: `${Math.min(analytics.tasa_completitud, 100)}%`,
                            backgroundColor:
                              analytics.tasa_completitud >= 80
                                ? "var(--success-500, #10b981)"
                                : analytics.tasa_completitud >= 40
                                ? "var(--primary-500, #2563eb)"
                                : "var(--warning-500, #f59e0b)",
                            borderRadius: "4px",
                          }}
                          aria-valuenow={analytics.tasa_completitud}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tareas activas */}
                  <div className="col-12 col-sm-6 col-lg-3">
                    <div
                      className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between"
                      style={{
                        backgroundColor: "var(--bg-subtle, #f8fafc)",
                        borderColor: "var(--border-default, #e2e8f0)",
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span
                          className="small fw-semibold"
                          style={{ color: "var(--text-muted, #64748b)" }}
                        >
                          Tareas Activas
                        </span>
                        <LuClock size={18} style={{ color: "var(--primary-500, #2563eb)" }} />
                      </div>
                      <div>
                        <span
                          className="display-6 fw-bold"
                          style={{
                            fontSize: "1.75rem",
                            color: "var(--text-heading, #0f172a)",
                          }}
                        >
                          {analytics.total_tareas_activas}
                        </span>
                        <p
                          className="mb-0 small"
                          style={{ color: "var(--text-muted, #64748b)", fontSize: "0.8rem" }}
                        >
                          En curso o por hacer
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tareas completadas */}
                  <div className="col-12 col-sm-6 col-lg-3">
                    <div
                      className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between"
                      style={{
                        backgroundColor: "var(--bg-subtle, #f8fafc)",
                        borderColor: "var(--border-default, #e2e8f0)",
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span
                          className="small fw-semibold"
                          style={{ color: "var(--text-muted, #64748b)" }}
                        >
                          Completadas
                        </span>
                        <LuCircleCheck size={18} style={{ color: "var(--success-500, #10b981)" }} />
                      </div>
                      <div>
                        <span
                          className="display-6 fw-bold"
                          style={{
                            fontSize: "1.75rem",
                            color: "var(--success-600, #059669)",
                          }}
                        >
                          {analytics.total_tareas_completadas}
                        </span>
                        <p
                          className="mb-0 small"
                          style={{ color: "var(--text-muted, #64748b)", fontSize: "0.8rem" }}
                        >
                          Objetivos logrados
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tareas vencidas */}
                  <div className="col-12 col-sm-6 col-lg-3">
                    <div
                      className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between"
                      style={{
                        backgroundColor:
                          analytics.tareas_vencidas > 0
                            ? "rgba(239, 68, 68, 0.05)"
                            : "var(--bg-subtle, #f8fafc)",
                        borderColor:
                          analytics.tareas_vencidas > 0
                            ? "var(--danger-500, #ef4444)"
                            : "var(--border-default, #e2e8f0)",
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span
                          className="small fw-semibold"
                          style={{
                            color:
                              analytics.tareas_vencidas > 0
                                ? "var(--danger-600, #dc2626)"
                                : "var(--text-muted, #64748b)",
                          }}
                        >
                          Tareas Vencidas
                        </span>
                        <LuTriangleAlert
                          size={18}
                          style={{
                            color:
                              analytics.tareas_vencidas > 0
                                ? "var(--danger-500, #ef4444)"
                                : "var(--text-muted, #64748b)",
                          }}
                        />
                      </div>
                      <div>
                        <span
                          className="display-6 fw-bold"
                          style={{
                            fontSize: "1.75rem",
                            color:
                              analytics.tareas_vencidas > 0
                                ? "var(--danger-600, #dc2626)"
                                : "var(--text-heading, #0f172a)",
                          }}
                        >
                          {analytics.tareas_vencidas}
                        </span>
                        <p
                          className="mb-0 small"
                          style={{
                            color:
                              analytics.tareas_vencidas > 0
                                ? "var(--danger-600, #dc2626)"
                                : "var(--text-muted, #64748b)",
                            fontSize: "0.8rem",
                          }}
                        >
                          {analytics.tareas_vencidas > 0 ? "¡Requieren atención!" : "Al día"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Distribución de Carga por Miembro */}
                <div
                  className="p-3 p-md-4 rounded-3 border"
                  style={{
                    backgroundColor: "var(--bg-subtle, #f8fafc)",
                    borderColor: "var(--border-default, #e2e8f0)",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                    <div className="d-flex align-items-center gap-2">
                      <LuUsers size={20} className="text-primary" />
                      <h6
                        className="fw-bold mb-0"
                        style={{ color: "var(--text-heading, #0f172a)" }}
                      >
                        Carga y Esfuerzo por Conviviente
                      </h6>
                    </div>
                    <span
                      className="badge rounded-pill bg-light text-secondary border px-3 py-1"
                      style={{ fontSize: "0.75rem" }}
                    >
                      {analytics.distribucion_por_miembro.length}{" "}
                      {analytics.distribucion_por_miembro.length === 1 ? "miembro" : "miembros"}
                    </span>
                  </div>

                  {analytics.distribucion_por_miembro.length === 0 ? (
                    <div className="text-center py-4 text-muted small">
                      No hay miembros registrados o con tareas asignadas en este hogar.
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {analytics.distribucion_por_miembro.map((member) => {
                        const completitudMember =
                          member.tareas_asignadas > 0
                            ? Math.round(
                                (member.tareas_completadas / member.tareas_asignadas) * 100
                              )
                            : 0;

                        return (
                          <div
                            key={member.user_id}
                            className="p-3 rounded-3 border"
                            style={{
                              backgroundColor: "var(--bg-surface, #ffffff)",
                              borderColor: "var(--border-default, #e2e8f0)",
                            }}
                          >
                            <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                              {/* Miembro info */}
                              <div className="d-flex align-items-center gap-2">
                                <div
                                  className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-primary"
                                  style={{
                                    width: "34px",
                                    height: "34px",
                                    backgroundColor: "rgba(37, 99, 235, 0.12)",
                                    fontSize: "0.85rem",
                                  }}
                                >
                                  {getInitials(member.nombre)}
                                </div>
                                <div>
                                  <span
                                    className="fw-semibold"
                                    style={{
                                      color: "var(--text-heading, #0f172a)",
                                      fontSize: "0.95rem",
                                    }}
                                  >
                                    {member.nombre}
                                  </span>
                                  <div
                                    className="small text-muted"
                                    style={{ fontSize: "0.8rem" }}
                                  >
                                    {member.tareas_completadas} de {member.tareas_asignadas}{" "}
                                    tareas completadas
                                  </div>
                                </div>
                              </div>

                              {/* Badges de rendimiento y peso */}
                              <div className="d-flex align-items-center gap-2">
                                <span
                                  className="badge rounded-pill border d-inline-flex align-items-center gap-1 py-1 px-2"
                                  style={{
                                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                                    color: "var(--success-600, #059669)",
                                    borderColor: "rgba(16, 185, 129, 0.2)",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                  title="Peso acumulado en tareas completadas"
                                >
                                  <LuAward size={13} />
                                  <span>{member.peso_total_completado} pts de esfuerzo</span>
                                </span>

                                <span
                                  className="badge rounded-pill border px-2 py-1"
                                  style={{
                                    backgroundColor: "rgba(37, 99, 235, 0.08)",
                                    color: "var(--primary-600, #1d4ed8)",
                                    borderColor: "rgba(37, 99, 235, 0.2)",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  {completitudMember}% avance
                                </span>
                              </div>
                            </div>

                            {/* Barra de progreso de miembro */}
                            <div
                              className="progress"
                              style={{
                                height: "6px",
                                backgroundColor: "var(--bg-subtle, #f1f5f9)",
                              }}
                            >
                              <div
                                className="progress-bar"
                                role="progressbar"
                                style={{
                                  width: `${completitudMember}%`,
                                  backgroundColor:
                                    completitudMember === 100
                                      ? "var(--success-500, #10b981)"
                                      : "var(--primary-500, #2563eb)",
                                  borderRadius: "3px",
                                }}
                                aria-valuenow={completitudMember}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 4. Desglose por Categorías */}
                <div
                  className="p-3 p-md-4 rounded-3 border"
                  style={{
                    backgroundColor: "var(--bg-subtle, #f8fafc)",
                    borderColor: "var(--border-default, #e2e8f0)",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <LuLayers size={20} className="text-primary" />
                      <h6
                        className="fw-bold mb-0"
                        style={{ color: "var(--text-heading, #0f172a)" }}
                      >
                        Distribución por Categorías
                      </h6>
                    </div>
                    <span
                      className="text-muted small"
                      style={{ fontSize: "0.8rem" }}
                    >
                      {totalCategoriasTareas} tareas categorizadas
                    </span>
                  </div>

                  {Object.keys(analytics.distribucion_por_categoria).length === 0 ? (
                    <div className="text-center py-3 text-muted small">
                      No hay categorías asignadas a las tareas de este hogar.
                    </div>
                  ) : (
                    <div className="d-flex flex-wrap gap-2">
                      {Object.entries(analytics.distribucion_por_categoria).map(
                        ([categoria, count]) => {
                          const theme = getCategoryTheme(categoria);
                          const percentage =
                            totalCategoriasTareas > 0
                              ? Math.round((count / totalCategoriasTareas) * 100)
                              : 0;

                          return (
                            <div
                              key={categoria}
                              className="d-flex align-items-center gap-2 px-3 py-2 rounded-pill border"
                              style={{
                                backgroundColor: theme.bg,
                                borderColor: theme.border,
                                color: theme.text,
                              }}
                            >
                              <span
                                className="fw-semibold text-capitalize"
                                style={{ fontSize: "0.85rem" }}
                              >
                                {categoria}
                              </span>
                              <span
                                className="badge rounded-pill"
                                style={{
                                  backgroundColor: theme.text,
                                  color: "#ffffff",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                }}
                              >
                                {count} ({percentage}%)
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            className="modal-footer p-3 px-md-4 border-top d-flex justify-content-end"
            style={{
              backgroundColor: "var(--bg-subtle, #f8fafc)",
              borderColor: "var(--border-default, #e2e8f0)",
            }}
          >
            <Button variant="secondary" size="md" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomAnalyticsModal;
