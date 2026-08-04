import { useEffect, useState, useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { FaTasks, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import styles from "./Dashboard.module.css";
import { TaskUpdateContext } from "../context/TaskUpdateContext";
import { RoomContext } from "../context/RoomContext";
import type { Task, Room } from "../types/task";

// FE-010: Tipado estricto con interfaces del módulo compartido

const Dashboard = () => {
  const [tareas, setTareas] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const { version } = useContext(TaskUpdateContext);
  const { roomId, setRoomId } = useContext(RoomContext);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    // FE-004: Variable isMounted para proteger setState tras desmontaje
    let isMounted = true;

    const fetchTareas = async () => {
      try {
        const res = await api.get<Task[]>("/tasks", { signal: controller.signal });
        // FE-004: Guardia antes de cada setState
        if (isMounted) setTareas(res.data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") {
          console.log("Request canceled: fetchTareas");
        } else {
          console.error(err);
        }
      }
    };

    const fetchRooms = async () => {
      try {
        const r = await api.get<Room[]>("/rooms", { signal: controller.signal });

        if (!isMounted) return;

        if (r.data.length === 0) {
          navigate("/rooms/create");
          return;
        }

        const list = await Promise.all(
          r.data.map(async (room) => {
            try {
              const tasksRes = await api.get<Task[]>(`/rooms/${room.id}/tasks`, {
                params: { limit: 100 },
                signal: controller.signal,
              });
              return { ...room, count: tasksRes.data.length };
            } catch (err: unknown) {
              if (err instanceof Error && err.name === "CanceledError") {
                console.log("Request canceled: fetchRooms tasks");
              } else {
                console.error(err);
              }
              return room;
            }
          })
        );

        // FE-004: Guardia tras la Promise.all (puede tardar)
        if (!isMounted) return;

        setRooms(list);

        if (!roomId) {
          setRoomId(list[0].id);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") {
          console.log("Request canceled: fetchRooms");
        } else {
          console.error(err);
        }
      }
    };

    const loadData = async () => {
      if (isMounted) setLoading(true);
      try {
        await Promise.all([fetchTareas(), fetchRooms()]);
      } finally {
        // FE-004: Guardia en el finally para no actualizar tras desmontaje
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      // FE-004: Marcar como desmontado ANTES de abortar para que los catches
      // no intenten hacer setState en el componente ya desmontado
      isMounted = false;
      controller.abort();
    };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  // navigate, roomId, setRoomId son estables; no los incluimos para evitar loops

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
                {/* FE-010: eliminado (t: any) gracias al tipo Task */}
                <p className={styles.display6}>
                  {tareas.filter((t) => t.estado === "DONE").length}
                </p>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className={`card shadow-sm border-start border-warning border-4 bg-light ${styles.card}`}>
              <div className={`card-body ${styles.cardBody}`}>
                <FaExclamationTriangle className={`text-warning ${styles.icon}`} />
                <h5 className={`card-title ${styles.cardTitle}`}>Pendientes</h5>
                {/* FE-010: eliminado (t: any) gracias al tipo Task */}
                <p className={styles.display6}>
                  {tareas.filter((t) => t.estado !== "DONE").length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h4>Hogares</h4>
          <ul>
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  to={`/rooms/${room.id}/tasks`}
                  onClick={() => setRoomId(room.id)}
                >
                  {room.nombre} ({room.count ?? 0})
                </Link>
              </li>
            ))}
          </ul>
          {!loading && (
            <div className="mt-3">
              <Link to="/history" className="btn btn-secondary">
                Historial
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;
