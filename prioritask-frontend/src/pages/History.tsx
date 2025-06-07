import { useEffect, useState } from "react";
import api from "../api";

interface HistoryEntry {
  id: string;
  action: string;
  timestamp: string;
  task: {
    id: string;
    titulo: string;
    estado: string;
    room_id?: string;
  };
  user_id: string;
}

const History = () => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [period, setPeriod] = useState("7");
  const [roomId, setRoomId] = useState("");
  const [memberId, setMemberId] = useState("");

  const fetchAuxData = async () => {
    try {
      const [roomsRes, usersRes] = await Promise.all([
        api.get("/rooms"),
        api.get("/users"),
      ]);
      setRooms(roomsRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    try {
      const since = new Date();
      const num = parseInt(period);
      if (num <= 30) {
        since.setDate(since.getDate() - num);
      } else {
        since.setMonth(since.getMonth() - num / 30);
      }
      const params: any = { since: since.toISOString() };
      if (roomId) params.room_id = roomId;
      if (memberId) params.user_id = memberId;
      const res = await api.get("/history", { params });
      setEntries(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAuxData();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [period, roomId, memberId]);

  const toggleTaskStatus = async (taskId: string, done: boolean) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, {
        estado: done ? "TODO" : "DONE",
      });
      fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container mt-4">
      <h2>Historial</h2>
      <div className="row g-3 mb-3">
        <div className="col-md-3">
          <label className="form-label">Periodo</label>
          <select
            className="form-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">Últimos 7 días</option>
            <option value="14">Últimos 14 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="180">Últimos 6 meses</option>
            <option value="360">Últimos 12 meses</option>
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Hogar</label>
          <select
            className="form-select"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">Todos</option>
            {rooms.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-3">
          <label className="form-label">Miembro</label>
          <select
            className="form-select"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">Todos</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>
                {u.email || u.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      {entries.length === 0 ? (
        <p>No hay historial.</p>
      ) : (
        <ul className="list-group">
          {entries.map((h) => (
            <li key={h.id} className="list-group-item d-flex justify-content-between align-items-start">
              <div>
                <strong>{h.task.titulo}</strong> – {h.action}
                <br />
                <small className="text-muted">{new Date(h.timestamp).toLocaleString()}</small>
              </div>
              <div>
                {h.task.estado === "DONE" ? (
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => toggleTaskStatus(h.task.id, true)}
                  >
                    Deshacer
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => toggleTaskStatus(h.task.id, false)}
                  >
                    Marcar hecho
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default History;
