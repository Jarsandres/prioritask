import { useEffect, useState, useContext } from "react";
import { useParams } from "react-router-dom";
import api from "../api";
import { RoomContext } from "../context/RoomContext";
import type { Task } from "../types/task";

// FE-010: Tipado con interfaz Task del módulo compartido

const RoomTasks = () => {
  const { roomId } = useParams();
  const { setRoomId } = useContext(RoomContext);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoomId(roomId ?? null);
  }, [roomId, setRoomId]);

  useEffect(() => {
    if (!roomId) return;

    // AbortController para cancelar si el componente se desmonta o roomId cambia
    const controller = new AbortController();

    const fetchTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<Task[]>(`/rooms/${roomId}/tasks`, {
          params: { limit: 100 },
          signal: controller.signal,
        });
        setTasks(res.data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(err);
        setError("No se pudieron cargar las tareas del hogar.");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();

    return () => {
      controller.abort();
    };
  }, [roomId]);

  if (loading) return <p>Cargando tareas...</p>;

  return (
    <div className="container mt-4">
      <h2>Tareas del hogar</h2>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {!error && tasks.length === 0 ? (
        <p>No hay tareas</p>
      ) : (
        <ul className="list-group">
          {tasks.map((t) => (
            <li key={t.id} className="list-group-item">
              {t.titulo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RoomTasks;
