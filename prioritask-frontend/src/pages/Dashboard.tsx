import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { FaTasks, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useRoom } from "../context/RoomContext";
import RetroWindow from "../components/common/RetroWindow";
import EmptyState from "../components/common/EmptyState";
import type { Task, Room } from "../types/task";

// FE-010: Tipado estricto con interfaces del módulo compartido

const Dashboard = () => {
  const [tareas, setTareas] = useState<Task[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const { version } = useTaskUpdate();
  const { roomId, setRoomId } = useRoom();
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

        // FE-004: Guardia tras la Promise.all
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
        // FE-004: Guardia en el finally
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalTareas = tareas.length;
  const tareasCompletadas = tareas.filter((t) => t.estado === "DONE").length;
  const tareasPendientes = tareas.filter((t) => t.estado !== "DONE").length;

  return (
    <div className="container-fluid py-2">
      {/* Encabezado Retro */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>📊</span> PANEL DE CONTROL / DASHBOARD.SYS
          </h2>
          <p className="retro-page-subtitle">
            Métricas de productividad y explorador de hogares
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link
            to="/tasks/create"
            className="btn-retro btn-retro-primary"
            style={{ minHeight: "44px" }}
          >
            <span>➕</span>
            <span>Nueva Tarea</span>
          </Link>
        </div>
      </div>

      {/* 3 Métricas en Gadgets Retro */}
      <div className="row g-3 mb-4">
        {/* Total de tareas */}
        <div className="col-12 col-md-4">
          <RetroWindow
            title="TOTAL DE TAREAS"
            icon="📋"
            className="h-100"
            bodyClassName="d-flex flex-column align-items-center justify-content-center py-4 text-center"
          >
            <FaTasks className="text-primary mb-1" style={{ fontSize: "2.2rem" }} />
            <span className="retro-gadget-label">TOTAL DE TAREAS</span>
            <div className="retro-gadget-display text-primary">{totalTareas}</div>
          </RetroWindow>
        </div>

        {/* Completadas */}
        <div className="col-12 col-md-4">
          <RetroWindow
            title="COMPLETADAS"
            icon="✅"
            variant="green"
            className="h-100"
            bodyClassName="d-flex flex-column align-items-center justify-content-center py-4 text-center"
          >
            <FaCheckCircle className="text-success mb-1" style={{ fontSize: "2.2rem" }} />
            <span className="retro-gadget-label">COMPLETADAS</span>
            <div className="retro-gadget-display text-success">{tareasCompletadas}</div>
          </RetroWindow>
        </div>

        {/* Pendientes */}
        <div className="col-12 col-md-4">
          <RetroWindow
            title="PENDIENTES"
            icon="⚠️"
            variant="amber"
            className="h-100"
            bodyClassName="d-flex flex-column align-items-center justify-content-center py-4 text-center"
          >
            <FaExclamationTriangle className="text-warning mb-1" style={{ fontSize: "2.2rem" }} />
            <span className="retro-gadget-label">PENDIENTES</span>
            <div className="retro-gadget-display text-warning">{tareasPendientes}</div>
          </RetroWindow>
        </div>
      </div>

      {/* Ventana de Explorador de Hogares */}
      <RetroWindow
        title="EXPLORADOR DE HOGARES"
        icon="📁"
      >
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <p className="mb-0 text-muted fw-semibold">
            Selecciona un hogar para ver y administrar sus tareas asignadas:
          </p>
          <div className="d-flex gap-2 flex-wrap">
            <Link
              to="/rooms/create"
              className="btn-retro btn-retro-primary"
              style={{ minHeight: "40px" }}
            >
              <span>➕</span>
              <span>Nuevo Hogar</span>
            </Link>
            <Link
              to="/history"
              className="btn-retro btn-retro-outline"
              style={{ minHeight: "40px" }}
            >
              <span>📜</span>
              <span>Historial</span>
            </Link>
          </div>
        </div>

        {loading ? (
          <EmptyState
            icon="⏳"
            title="Cargando registros del sistema..."
          />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon="📂"
            title="No hay hogares registrados"
            description="Crea tu primer hogar para comenzar a colaborar."
            actionLabel="➕ Crear Hogar"
            actionTo="/rooms/create"
          />
        ) : (
          <div className="row g-3">
            {rooms.map((room) => {
              const isSelected = room.id === roomId;
              return (
                <div key={room.id} className="col-12 col-sm-6 col-lg-4">
                  <Link
                    to={`/rooms/${room.id}/tasks`}
                    onClick={() => setRoomId(room.id)}
                    className={`retro-folder-card ${isSelected ? "selected" : ""}`}
                  >
                    <div className="retro-folder-icon">📁</div>
                    <div className="retro-folder-info flex-grow-1">
                      <span className="retro-folder-name">{room.nombre}</span>
                      <div className="d-flex align-items-center gap-2 mt-1">
                        <span className="retro-badge retro-badge-medium">
                          {room.count ?? 0} tareas
                        </span>
                        {isSelected && (
                          <span className="retro-badge retro-badge-high">
                            ACTIVO
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-muted fs-5">➔</span>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </RetroWindow>
    </div>
  );
};

export default Dashboard;
