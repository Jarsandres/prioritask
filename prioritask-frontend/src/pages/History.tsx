import { useEffect, useState, useCallback } from "react";
import api from "../api";
import Select from "react-select";
import { useTheme } from "../context/ThemeContext";
import RetroWindow from "../components/common/RetroWindow";
import EmptyState from "../components/common/EmptyState";
import { getRetroSelectStyles } from "../utils/selectStyles";
import type { HistoryEntry, SelectOption } from "../types/task";

// FE-010: Tipos importados del módulo compartido

const getActionBadgeClass = (action: string) => {
  switch (action.toUpperCase()) {
    case "CREATED":
      return "retro-badge-low";
    case "UPDATED":
      return "retro-badge-medium";
    case "DELETED":
      return "retro-badge-danger";
    default:
      return "retro-badge-todo";
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

  // useCallback para estabilizar la referencia y evitar closure stale
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const since = sinceDate(timeFilter).toISOString();
      const params: Record<string, string> = { since };
      if (roomId) params.room_id = roomId;
      if (memberId) params.user_id = memberId;

      const res = await api.get<HistoryEntry[]>("/tasks/history", { params });
      setHistory(res.data);
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

  return (
    <div className="container-fluid py-2">
      {/* Cabecera Retro */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>📜</span> REGISTRO DEL SISTEMA / TASK_AUDIT.LOG
          </h2>
          <p className="retro-page-subtitle">
            Auditoría de eventos, creaciones, modificaciones y finalizaciones
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="alert alert-danger mb-4" role="alert">
          {fetchError}
        </div>
      )}

      {/* Ventana de Filtros y Registro */}
      <RetroWindow
        title="AUDIT_LOG_FILTER.PANEL"
        icon="🎛️"
        className="mb-4"
      >
        <div className="row g-3 align-items-end">
          <div className="col-12 col-sm-6 col-md-3">
            <label className="form-label fw-bold small text-uppercase">Periodo</label>
            <select
              className="form-select retro-select w-100"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
            >
              <option value="7d">Últimos 7 días</option>
              <option value="14d">Últimos 14 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="12m">Últimos 12 meses</option>
            </select>
          </div>

          <div className="col-12 col-sm-6 col-md-3">
            <label className="form-label fw-bold small text-uppercase">Hogar</label>
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
            <label className="form-label fw-bold small text-uppercase">Miembro</label>
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
            <button
              className="btn-retro btn-retro-primary w-100"
              style={{ minHeight: "44px" }}
              onClick={fetchHistory}
              disabled={loading}
            >
              <span>🔍</span>
              <span>{loading ? "Filtrando..." : "Aplicar Filtros"}</span>
            </button>
          </div>
        </div>
      </RetroWindow>

      {/* Ventana de Eventos */}
      <RetroWindow
        title={`TASK_AUDIT.LOG - ENTRADAS REGISTRADAS (${history.length})`}
        icon="📜"
      >
        {loading ? (
          <EmptyState
            icon="⏳"
            title="Leyendo registros de auditoría..."
          />
        ) : history.length === 0 ? (
          <EmptyState
            icon="📂"
            title="Sin registros para el periodo seleccionado"
            description="Ajusta los filtros o realiza acciones para ver nuevos eventos."
          />
        ) : (
          <div className="d-flex flex-column gap-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="retro-log-entry p-3 d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2"
              >
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className={`retro-badge ${getActionBadgeClass(h.action)}`}>
                    {h.action}
                  </span>
                  <strong className="retro-log-title">
                    {h.task_title || "Tarea no especificada"}
                  </strong>
                </div>

                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <span className="retro-log-timestamp font-monospace">
                    ⏱️ {new Date(h.timestamp).toLocaleString()}
                  </span>
                  <span className="retro-log-author retro-badge retro-badge-todo">
                    👤 {members.find((m) => m.value === h.user_id)?.label || h.user_id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </RetroWindow>
    </div>
  );
};

export default History;
