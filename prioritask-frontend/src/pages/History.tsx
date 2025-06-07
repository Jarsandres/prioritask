import { useEffect, useState } from "react";
import api from "../api";
import Select from "react-select";
import { getCurrentRoomId } from "../utils/room";

interface Task {
  id: string;
  titulo: string;
  estado: "TODO" | "IN_PROGRESS" | "DONE";
}

interface HistoryRow {
  id: string;
  task: Task;
  user_id: string;
  action: string;
  timestamp: string;
  changes?: string;
}

interface Option {
  value: string;
  label: string;
}

const History = () => {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [timeFilter, setTimeFilter] = useState("7d");
  const [rooms, setRooms] = useState<Option[]>([]);
  const [roomId, setRoomId] = useState<string | null>(getCurrentRoomId());
  const [members, setMembers] = useState<Option[]>([]);
  const [memberId, setMemberId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const roomsRes = await api.get("/rooms");
        setRooms(roomsRes.data.map((r: any) => ({ value: r.id, label: r.nombre })));
        const usersRes = await api.get("/users");
        setMembers(
          usersRes.data.map((u: any) => ({ value: u.id, label: u.nombre || u.email }))
        );
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    fetchHistory();
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
      let tasksRes;
      if (roomId) {
        tasksRes = await api.get(`/rooms/${roomId}/tasks`, { params: { limit: 100 } });
      } else {
        tasksRes = await api.get("/tasks", { params: { limit: 100 } });
      }
      const tasks: Task[] = tasksRes.data;
      const entries: HistoryRow[] = [];
      const since = sinceDate();

      const historyPromises = tasks.map(async (t) => {
        try {
          const res = await api.get(`/tasks/${t.id}/history`);
          return res.data
            .filter((h: any) => {
              const ts = new Date(h.timestamp);
              return ts >= since && (!memberId || h.user_id === memberId);
            })
            .map((h: any) => ({
              id: h.id,
              task: t,
              user_id: h.user_id,
              action: h.action,
              timestamp: h.timestamp,
              changes: h.changes,
            }));
        } catch (err) {
          console.error(err);
          return []; // Return an empty array if the API call fails
        }
      });
      const results = await Promise.all(historyPromises);
      const entries = results.flat();

      entries.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setHistory(entries);
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
      <h2>Historial de tareas</h2>
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
          {history.map((h) => (
            <li
              key={h.id}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <div>
                <strong>{h.task.titulo}</strong> - {new Date(h.timestamp).toLocaleString()} - {h.action}
              </div>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => toggleStatus(h.task)}
              >
                {h.task.estado === "DONE" ? "Deshacer" : "Marcar done"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default History;
