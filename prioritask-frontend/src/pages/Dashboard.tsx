import { useEffect, useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { FaTasks, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import styles from "./Dashboard.module.css";
import { TaskUpdateContext } from "../context/TaskUpdateContext";
import { RoomContext } from "../context/RoomContext";

const Dashboard = () => {
  const [tareas, setTareas] = useState([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { version } = useContext(TaskUpdateContext);
  const { roomId, setRoomId } = useContext(RoomContext);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController(); // Definir el AbortController

    const fetchTareas = async () => {
      try {
        const res = await api.get("/tasks", { signal: controller.signal }); // Pasar la señal
        setTareas(res.data);
      } catch (err: any) {
        if (err.name === "CanceledError") {
          console.log("Request canceled: fetchTareas");
        } else {
          console.error(err);
        }
      }
    };

    const fetchRooms = async () => {
      try {
        const r = await api.get("/rooms", { signal: controller.signal }); // Pasar la señal
        if (r.data.length === 0) {
          navigate("/rooms/create");
          return;
        }

        const list = await Promise.all(
          r.data.map(async (room: any) => {
            try {
              const tasksRes = await api.get(`/rooms/${room.id}/tasks`, {
                params: { limit: 100 },
                signal: controller.signal, // Pasar la señal
              });
              return { ...room, count: tasksRes.data.length };
            } catch (err: any) {
              if (err.name === "CanceledError") {
                console.log("Request canceled: fetchRooms tasks");
              } else {
                console.error(err);
              }
              return room;
            }
          })
        );
        setRooms(list);

        if (!roomId) {
          setRoomId(list[0].id);
        }
      } catch (err: any) {
        if (err.name === "CanceledError") {
          console.log("Request canceled: fetchRooms");
        } else {
          console.error(err);
        }
      }
    };

    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchTareas(), fetchRooms()]);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      controller.abort(); // Usar el AbortController para cancelar solicitudes
    };
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
        { !loading && (
          <div className="mt-3">
            <Link to="/history" className="btn btn-secondary">
              Historial
            </Link>
          </div>
        ) }
        </div>
      </div>
    </>
  );
};

export default Dashboard;
