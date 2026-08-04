import { useEffect, useState, useCallback } from "react";
import api from "../api";
import Select from "react-select";
import type { HistoryEntry, SelectOption } from "../types/task";

// FE-010: Tipos importados del módulo compartido

const History = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState("7d");
  const [rooms, setRooms] = useState<SelectOption[]>([]);
  const [members, setMembers] = useState<SelectOption[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  // Reacciona a cambios de filtros — sin eslint-disable porque fetchHistory es estable
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="container mt-4">
      <h2>Historial</h2>
      <div className="card p-3 mb-3">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label">Periodo</label>
            <select
              className="form-select"
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
          <div className="col-md-3">
            <label className="form-label">Hogar</label>
            <Select
              options={rooms}
              value={rooms.find((r) => r.value === roomId) || null}
              onChange={(opt) => setRoomId(opt ? (opt as SelectOption).value : null)}
              isClearable
              placeholder="Todos"
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Miembro</label>
            <Select
              options={members}
              value={members.find((m) => m.value === memberId) || null}
              onChange={(opt) => setMemberId(opt ? (opt as SelectOption).value : "")}
              isClearable
              placeholder="Todos"
            />
          </div>
          <div className="col-md-3">
            <button
              className="btn btn-primary w-100"
              onClick={fetchHistory}
              disabled={loading}
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="alert alert-danger" role="alert">
          {fetchError}
        </div>
      )}

      {loading ? (
        <p>Cargando...</p>
      ) : history.length === 0 ? (
        <p>No hay entradas.</p>
      ) : (
        <ul className="list-group">
          {history.map((h) => (
            <li
              key={h.id}
              className="list-group-item d-flex justify-content-between align-items-start"
            >
              <div>
                <strong>{h.task_title || "Tarea no especificada"}</strong> – {h.action}
                <br />
                <small className="text-muted">
                  {new Date(h.timestamp).toLocaleString()} por{" "}
                  {members.find((m) => m.value === h.user_id)?.label || h.user_id}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default History;
