import { useEffect, useState } from "react";
import api from "../api";
import Select from "react-select";

interface Task {
  id: string;
  titulo: string;
  estado: "TODO" | "IN_PROGRESS" | "DONE";
  room_id?: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  timestamp: string;
  changes?: string;
  user_id: string;
  task: Task;
}

interface Option {
  value: string;
  label: string;
}

const History = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState("7d");
  const [rooms, setRooms] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAuxData = async () => {
      try {
        const [roomsRes, usersRes] = await Promise.all([
          api.get("/rooms"),
          api.get("/users"),
        ]);

        setRooms(
          roomsRes.data.map((r: any) => ({
            value: r.id,
            label: r.nombre,
          }))
        );

        setMembers(
          usersRes.data.map((u: any) => ({
            value: u.id,
            label: u.nombre ?? u.email,
          }))
        );
      } catch (err) {
        console.error(err);
      }
    };
    loadAuxData();
  }, []);

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter, roomId, memberId]);

  const sinceDate = () => {
    const d = new Date();
    switch (timeFilter) {
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

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const since = sinceDate().toISOString();
      const params: any = { since };
      if (roomId) params.room_id = roomId;
      if (memberId) params.user_id = memberId;

      const res = await api.get("/tasks/history", { params }); // Actualizar la ruta
      setHistory(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (task: Task) => {
    try {
      const newStatus = task.estado === "DONE" ? "TODO" : "DONE";
      await api.patch(`/tasks/${task.id}/status`, { estado: newStatus });
      fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

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
              onChange={(opt) => setRoomId(opt ? (opt as any).value : null)}
              isClearable
              placeholder="Todos"
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Miembro</label>
            <Select
              options={members}
              value={members.find((m) => m.value === memberId) || null}
              onChange={(opt) => setMemberId(opt ? (opt as any).value : "")}
              isClearable
              placeholder="Todos"
            />
          </div>
          <div className="col-md-3">
            <button className="btn btn-primary w-100" onClick={fetchHistory}>
              Aplicar filtros
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Cargando...</p>
      ) : history.length === 0 ? (
        <p>No hay entradas.</p>
      ) : (
        <ul className="list-group">
          {history.map((h) =>
            h.task ? (
              <li
                key={h.id}
                className="list-group-item d-flex justify-content-between align-items-start"
              >
                <div>
                  <strong>{h.task.titulo}</strong> – {h.action}
                  <br />
                  <small className="text-muted">
                    {new Date(h.timestamp).toLocaleString()}
                  </small>
                </div>
                <div>
                  {h.task.estado === "DONE" ? (
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => toggleStatus(h.task)}
                    >
                      Deshacer
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => toggleStatus(h.task)}
                    >
                      Marcar hecho
                    </button>
                  )}
                </div>
              </li>
            ) : null // Manejar casos donde h.task es undefined
          )}
        </ul>
      )}
    </div>
  );
};

export default History;
