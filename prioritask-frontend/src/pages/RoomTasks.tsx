import { useEffect, useState, useContext } from "react";
import { useParams } from "react-router-dom";
import api from "../api";
import { RoomContext } from "../context/RoomContext";

const RoomTasks = () => {
  const { roomId } = useParams();
  const { setRoomId } = useContext(RoomContext);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setRoomId(roomId || null);
  }, [roomId]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get(`/rooms/${roomId}/tasks`, { params: { limit: 100 } });
        setTasks(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [roomId]);

  if (loading) return <p>Cargando tareas...</p>;

  return (
    <div className="container mt-4">
      <h2>Tareas del hogar</h2>
      {tasks.length === 0 ? (
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
