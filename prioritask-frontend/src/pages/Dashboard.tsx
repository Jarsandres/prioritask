import { useEffect, useState, useContext } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { FaTasks, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import styles from "./Dashboard.module.css";
import { TaskUpdateContext } from "../context/TaskUpdateContext";
import { RoomContext } from "../context/RoomContext";

const Dashboard = () => {
  const [tareas, setTareas] = useState([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const { version } = useContext(TaskUpdateContext);
  const { setRoomId } = useContext(RoomContext);

  useEffect(() => {
    const fetchTareas = async () => {
      const res = await api.get("/tasks");
      setTareas(res.data);
    };

    const fetchRooms = async () => {
      try {
        const r = await api.get("/rooms");
        const list = await Promise.all(
          r.data.map(async (room: any) => {
            const tasksRes = await api.get(`/rooms/${room.id}/tasks`, { params: { limit: 100 } });
            return { ...room, count: tasksRes.data.length };
          })
        );
        setRooms(list);
      } catch (err) {
        console.error(err);
      }
    };

    fetchTareas();
    fetchRooms();
  }, [version]);

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm px-4">
        <span className="navbar-brand fw-bold text-primary">Prioritask</span>
        <div className="ms-auto">
          <span className="text-muted">Bienvenido</span>
        </div>
      </nav>

      <div className={`container-fluid py-4 px-5 ${styles.fullHeight}`}>
        <h2 className="mb-4 text-primary">📊 Panel de Tareas</h2>

        <div className="row g-4">
          <div className="col-md-4">
            <div className={`card shadow-sm border-start border-primary border-4 bg-light ${styles.card}`}>
              <div className={`card-body ${styles.cardBody}`}>
                <FaTasks className={`text-primary ${styles.icon}`} />
                <h5 className={`card-title ${styles.cardTitle}`}>Total de tareas</h5>
                <p className={styles.display6}>{tareas.length}</p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className={`card shadow-sm border-start border-success border-4 bg-light ${styles.card}`}>
              <div className={`card-body ${styles.cardBody}`}>
                <FaCheckCircle className={`text-success ${styles.icon}`} />
                <h5 className={`card-title ${styles.cardTitle}`}>Completadas</h5>
                <p className={styles.display6}>
                  {tareas.filter((t: any) => t.estado === "DONE").length}
                </p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className={`card shadow-sm border-start border-warning border-4 bg-light ${styles.card}`}>
              <div className={`card-body ${styles.cardBody}`}>
                <FaExclamationTriangle className={`text-warning ${styles.icon}`} />
                <h5 className={`card-title ${styles.cardTitle}`}>Pendientes</h5>
                <p className={styles.display6}>
                  {tareas.filter((t: any) => t.estado !== "DONE").length}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <h4>Hogares</h4>
          <ul>
            {rooms.map((room: any) => (
              <li key={room.id}>
                <Link
                  to={`/rooms/${room.id}/tasks`}
                  onClick={() => setRoomId(room.id)}
                >
                  {room.nombre} ({room.count})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
