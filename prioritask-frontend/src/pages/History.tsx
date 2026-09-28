import { useEffect, useState, useCallback } from "react";
import Select from "react-select";
import {
  LuHistory,
  LuCirclePlus,
  LuPencil,
  LuTrash2,
  LuCircleCheck,
  LuActivity,
  LuFilter,
  LuClock,
  LuUser,
  LuRotateCw,
} from "react-icons/lu";
import api from "../api";
import { useTheme } from "../context/ThemeContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/common/EmptyState";
import { getRetroSelectStyles } from "../utils/selectStyles";
import type { HistoryEntry, SelectOption } from "../types/task";

const getActionMeta = (action: string) => {
  switch (action.toUpperCase()) {
    case "CREATED":
      return {
        label: "Creada",
        variant: "success" as const,
        icon: <LuCirclePlus size={15} />,
        bg: "rgba(16, 185, 129, 0.1)",
        color: "#059669",
      };
    case "UPDATED":
      return {
        label: "Actualizada",
        variant: "primary" as const,
        icon: <LuPencil size={15} />,
        bg: "rgba(37, 99, 235, 0.1)",
        color: "#2563eb",
      };
    case "COMPLETED":
      return {
        label: "Completada",
        variant: "success" as const,
        icon: <LuCircleCheck size={15} />,
        bg: "rgba(16, 185, 129, 0.1)",
        color: "#059669",
      };
    case "DELETED":
      return {
        label: "Eliminada",
        variant: "danger" as const,
        icon: <LuTrash2 size={15} />,
        bg: "rgba(239, 68, 68, 0.1)",
        color: "#ef4444",
      };
    default:
      return {
        label: action,
        variant: "default" as const,
        icon: <LuActivity size={15} />,
        bg: "var(--bg-subtle, #f1f5f9)",
        color: "var(--text-muted, #64748b)",
      };
  }
};

const History = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState("7d");
  const [rooms, setRooms] = useState<SelectOption[]>([]);
  const [members, setMembers] = useState<SelectOption[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const controller = new AbortController();
    const loadAuxData = async () => {
      try {
        const [roomsRes, usersRes] = await Promise.all([
          api.get<{ id: string; nombre: string }[]>("/rooms", {
            signal: controller.signal,
          }),
          api.get<{ id: string; nombre?: string; email: string }[]>("/users", {
            signal: controller.signal,
          }),
        ]);

        setRooms(
          roomsRes.data.map((r) => ({
            value: r.id,
            label: r.nombre,
          }))
        );

        setMembers(
          usersRes.data.map((u) => ({
            value: u.id,
            label: u.nombre ?? u.email,
          }))
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(err);
      }
    };

    loadAuxData();
    return () => controller.abort();
  }, []);

  const sinceDate = (filter: string): Date => {
    const d = new Date();
    switch (filter) {
      case "7d":
        d.setDate(d.getDate() - 7);
        break;
      case "14d":
        d.setDate(d.getDate() - 14);
        break;
      case "30d":
        d.setDate(d.getDate() - 30);
        break;
      case "6m":
        d.setMonth(d.getMonth() - 6);
        break;
      case "12m":
        d.setMonth(d.getMonth() - 12);
        break;
      default:
        break;
    }
    return d;
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const since = sinceDate(timeFilter).toISOString();
      const params: Record<string, string> = { since };
      if (roomId) params.room_id = roomId;
      if (memberId) params.user_id = memberId;

      const res = await api.get<HistoryEntry[]>("/tasks/history", { params });
      setHistory(res.data || []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "CanceledError") return;
      console.error(err);
      setFetchError("Error al cargar el historial. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [timeFilter, roomId, memberId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const selectStyles = getRetroSelectStyles<SelectOption>(theme);

  const formatTimestamp = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="container-fluid py-3 px-2 px-md-4">
      {/* Cabecera Moderna */}
      <div className="d-flex justify-content-between align-items-start align-items-md-center mb-4 flex-column flex-md-row gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="d-flex align-items-center justify-content-center rounded-3 p-2"
              style={{
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
              }}
            >
              <LuHistory size={22} />
            </div>
            <h1 className="h3 mb-0 fw-bold" style={{ letterSpacing: "-0.02em" }}>
              Historial de Actividad
            </h1>
          </div>
          <p className="text-muted mb-0 small">
            Auditoría cronológica de eventos, creaciones, modificaciones y finalizaciones
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          leftIcon={<LuRotateCw className={loading ? "spin" : ""} size={15} />}
          onClick={fetchHistory}
          disabled={loading}
        >
          Actualizar
        </Button>
      </div>

      {fetchError && (
        <div className="alert alert-danger mb-4 rounded-3 border-0 shadow-xs" role="alert">
          {fetchError}
        </div>
      )}

      {/* Tarjeta de Filtros */}
      <Card className="p-3 mb-4 shadow-xs">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-sm-6 col-md-3">
            <label className="form-label small fw-semibold text-muted mb-1.5">
              Periodo
            </label>
            <select
              className="form-select"
              style={{
                borderRadius: "var(--radius-md, 10px)",
                borderColor: "var(--border-default, #cbd5e1)",
                padding: "8px 12px",
                fontSize: "0.9rem",
              }}
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
            >
              <option value="7d">Últimos 7 días</option>
              <option value="14d">Últimos 14 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="12m">Último año</option>
            </select>
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <label className="form-label small fw-semibold text-muted mb-1.5">
              Hogar
            </label>
            <Select
              options={rooms}
              value={rooms.find((r) => r.value === roomId) || null}
              onChange={(opt) => setRoomId(opt ? (opt as SelectOption).value : null)}
              isClearable
              placeholder="Todos los hogares"
              styles={selectStyles}
            />
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <label className="form-label small fw-semibold text-muted mb-1.5">
              Miembro
            </label>
            <Select
              options={members}
              value={members.find((m) => m.value === memberId) || null}
              onChange={(opt) => setMemberId(opt ? (opt as SelectOption).value : "")}
              isClearable
              placeholder="Todos los miembros"
              styles={selectStyles}
            />
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <Button
              variant="primary"
              size="md"
              className="w-100"
              leftIcon={<LuFilter size={15} />}
              onClick={fetchHistory}
              isLoading={loading}
            >
              Aplicar Filtros
            </Button>
          </div>
        </div>
      </Card>

      {/* Lista de Registros */}
      <Card
        title="Registros de Actividad"
        headerActions={
          <span className="badge rounded-pill fw-normal text-muted" style={{ backgroundColor: "var(--bg-subtle, #f1f5f9)" }}>
            {history.length} evento{history.length !== 1 ? "s" : ""}
          </span>
        }
      >
        <div className="p-3">
          {loading ? (
            <div className="d-flex flex-column gap-2.5">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="p-3 rounded-3 border">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <Skeleton variant="rounded" width={80} height={24} />
                      <Skeleton variant="text" width={220} height={20} />
                    </div>
                    <Skeleton variant="text" width={140} height={18} />
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={<LuHistory size={28} />}
              title="Sin registros para el periodo seleccionado"
              description="Ajusta los filtros o realiza acciones en tus tareas para ver nuevos eventos de auditoría."
            />
          ) : (
            <div className="d-flex flex-column gap-2.5">
              {history.map((h) => {
                const meta = getActionMeta(h.action);
                const userName =
                  members.find((m) => m.value === h.user_id)?.label || h.user_id;

                return (
                  <div
                    key={h.id}
                    className="p-3 rounded-3 d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2.5 transition-colors"
                    style={{
                      backgroundColor: "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border-default, #e2e8f0)",
                    }}
                  >
                    <div className="d-flex align-items-center gap-2.5 flex-wrap">
                      <div
                        className="d-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill small fw-medium"
                        style={{
                          backgroundColor: meta.bg,
                          color: meta.color,
                          fontSize: "0.78rem",
                        }}
                      >
                        {meta.icon}
                        <span>{meta.label}</span>
                      </div>
                      <strong
                        className="fw-semibold"
                        style={{
                          color: "var(--text-heading, #0f172a)",
                          fontSize: "0.93rem",
                        }}
                      >
                        {h.task_title || "Tarea sin título"}
                      </strong>
                    </div>

                    <div className="d-flex align-items-center gap-3 flex-wrap small text-muted">
                      <div className="d-flex align-items-center gap-1">
                        <LuClock size={14} />
                        <span>{formatTimestamp(h.timestamp)}</span>
                      </div>
                      <div className="d-flex align-items-center gap-1">
                        <LuUser size={14} />
                        <span className="badge rounded-pill fw-normal text-muted" style={{ backgroundColor: "var(--bg-canvas, #ffffff)", border: "1px solid var(--border-subtle, #e2e8f0)" }}>
                          {userName}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default History;
