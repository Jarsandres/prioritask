import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useRoom } from "../context/RoomContext";
import EmptyState from "../components/common/EmptyState";
import AIHealthBadge from "../components/common/AIHealthBadge";
import RoomMembersModal from "../components/RoomMembersModal";
import { Skeleton } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { cacheManager } from "../services/cacheManager";
import type { Task, Room } from "../types/task";
import {
  LuPlus,
  LuListTodo,
  LuCircleCheck,
  LuClock,
  LuHouse,
  LuUsers,
  LuHistory,
  LuArrowRight,
} from "react-icons/lu";
import "../components/tasks/tasks.css";

const Dashboard = () => {
  const cachedAllTasks = useMemo(() => cacheManager.getAllCachedTasks(), []);

  const [tareas, setTareas] = useState<Task[]>(() => cachedAllTasks);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(() => cachedAllTasks.length === 0);
  const [selectedMemberModalRoom, setSelectedMemberModalRoom] = useState<Room | null>(null);
  const { version, notifyUpdate } = useTaskUpdate();
  const { roomId, setRoomId } = useRoom();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const loadData = async () => {
      // Si ya tenemos tareas cacheadas, evitamos skeletons destructivos (0ms UI wait)
      if (cacheManager.getAllCachedTasks().length === 0 && tareas.length === 0) {
        if (isMounted) setLoading(true);
      }

      try {
        // Ejecución en paralelo eliminando anti-patrón N+1 de peticiones iterativas
        const [tasksRes, roomsRes] = await Promise.all([
          api.get<Task[]>("/tasks", { signal: controller.signal }),
          api.get<Room[]>("/rooms", { signal: controller.signal }),
        ]);

        if (!isMounted) return;

        const allTasks = tasksRes.data;
        const allRooms = roomsRes.data;

        setTareas(allTasks);

        if (allRooms.length === 0) {
          navigate("/rooms/create");
          return;
        }

        // Agrupación en memoria O(N) para asignar conteos de tareas por sala sin peticiones HTTP adicionales
        const taskCountByRoom = new Map<string, number>();
        const tasksByRoom = new Map<string, Task[]>();

        allTasks.forEach((t) => {
          if (t.room_id) {
            taskCountByRoom.set(
              t.room_id,
              (taskCountByRoom.get(t.room_id) || 0) + 1
            );
            const list = tasksByRoom.get(t.room_id) || [];
            list.push(t);
            tasksByRoom.set(t.room_id, list);
          }
        });

        // Alimentar la caché L1 para cada sala
        tasksByRoom.forEach((rTasks, rId) => {
          const existing = cacheManager.getRoomTasks(rId);
          if (!existing) {
            cacheManager.setRoomTasks(rId, rTasks);
          }
        });

        const enhancedRooms: Room[] = allRooms.map((room) => {
          const cached = cacheManager.getRoomTasks(room.id);
          const count = cached
            ? cached.tasks.length
            : taskCountByRoom.get(room.id) || 0;
          return {
            ...room,
            count,
          };
        });

        setRooms(enhancedRooms);

        if (!roomId && enhancedRooms.length > 0) {
          setRoomId(enhancedRooms[0].id);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error("Error al cargar datos en Dashboard:", err);
      } finally {
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
  const porcentajeCompletado =
    totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0;

  return (
    <div className="container-fluid py-2">
      {/* Cabecera Principal del Dashboard */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold" style={{ fontSize: "26px" }}>
            <span>Panel de Control</span>
          </h2>
          <p className="text-muted mb-0" style={{ fontSize: "14px" }}>
            Métricas de productividad y gestión centralizada de tus hogares
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <AIHealthBadge />
          <Link to="/tasks/create">
            <Button variant="primary" size="md" leftIcon={<LuPlus size={16} />}>
              Nueva Tarea
            </Button>
          </Link>
        </div>
      </div>

      {/* Tarjetas KPI de Productividad */}
      {loading ? (
        <div className="kpi-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="kpi-card">
              <div className="d-flex justify-content-between mb-3">
                <Skeleton width="100px" height="16px" />
                <Skeleton variant="circular" width="40px" height="40px" />
              </div>
              <Skeleton width="60px" height="32px" className="mb-2" />
              <Skeleton variant="rounded" width="100%" height="6px" className="rounded-pill" />
            </div>
          ))}
        </div>
      ) : (
        <div className="kpi-grid">
          {/* 1. Total de Tareas */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Total de Tareas</span>
              <div className="kpi-icon-badge kpi-icon-blue">
                <LuListTodo size={20} aria-hidden="true" />
              </div>
            </div>
            <div className="kpi-value-row">
              <span className="kpi-value kpi-value-blue">{totalTareas}</span>
              <span className="text-muted small">registradas</span>
            </div>
            <div className="kpi-progress-bar-bg" title={`${porcentajeCompletado}% completado`}>
              <div
                className="kpi-progress-bar-fill kpi-progress-fill-blue"
                style={{ width: `${porcentajeCompletado}%` }}
              />
            </div>
          </div>

          {/* 2. Tareas Completadas */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Completadas</span>
              <div className="kpi-icon-badge kpi-icon-green">
                <LuCircleCheck size={20} aria-hidden="true" />
              </div>
            </div>
            <div className="kpi-value-row">
              <span className="kpi-value kpi-value-green">{tareasCompletadas}</span>
              <span className="text-success small fw-semibold">
                ({porcentajeCompletado}%)
              </span>
            </div>
            <div className="kpi-progress-bar-bg">
              <div
                className="kpi-progress-bar-fill kpi-progress-fill-green"
                style={{ width: `${porcentajeCompletado}%` }}
              />
            </div>
          </div>

          {/* 3. Tareas Pendientes */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">Pendientes</span>
              <div className="kpi-icon-badge kpi-icon-amber">
                <LuClock size={20} aria-hidden="true" />
              </div>
            </div>
            <div className="kpi-value-row">
              <span className="kpi-value kpi-value-amber">{tareasPendientes}</span>
              <span className="text-muted small">por resolver</span>
            </div>
            <div className="kpi-progress-bar-bg">
              <div
                className="kpi-progress-bar-fill kpi-progress-fill-amber"
                style={{
                  width: `${
                    totalTareas > 0
                      ? Math.round((tareasPendientes / totalTareas) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Explorador de Hogares */}
      <Card
        title="Explorador de Hogares"
        subtitle="Selecciona un hogar para ver y administrar sus tareas asignadas"
        icon={<LuHouse size={20} className="text-primary" />}
        headerActions={
          <div className="d-flex gap-2">
            <Link to="/rooms/create">
              <Button variant="outline" size="sm" leftIcon={<LuPlus size={14} />}>
                Nuevo Hogar
              </Button>
            </Link>
            <Link to="/history">
              <Button variant="ghost" size="sm" leftIcon={<LuHistory size={14} />}>
                Historial
              </Button>
            </Link>
          </div>
        }
        className="mb-4"
      >
        {loading ? (
          <div className="room-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="ui-room-card p-3">
                <div className="d-flex gap-3 mb-3">
                  <Skeleton variant="rounded" width="44px" height="44px" className="rounded-3" />
                  <div className="flex-grow-1">
                    <Skeleton width="70%" height="18px" className="mb-2" />
                    <Skeleton width="40%" height="14px" />
                  </div>
                </div>
                <div className="d-flex justify-content-between pt-2 border-top">
                  <Skeleton width="60px" height="14px" />
                  <Skeleton width="80px" height="14px" />
                </div>
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={<LuHouse size={28} />}
            title="No hay hogares registrados"
            description="Crea tu primer hogar para comenzar a colaborar con tu familia o convivientes."
            actionLabel="+ Crear Hogar"
            actionTo="/rooms/create"
          />
        ) : (
          <div className="room-grid">
            {rooms.map((room) => {
              const isSelected = room.id === roomId;
              const memberCount = room.members?.length || 1;

              return (
                <div
                  key={room.id}
                  className={`ui-room-card ${isSelected ? "is-active-room" : ""}`}
                >
                  <div>
                    <div className="ui-room-header">
                      <div className="ui-room-avatar">
                        <LuHouse size={22} />
                      </div>
                      <div className="ui-room-info">
                        <h4 className="ui-room-title" title={room.nombre}>
                          {room.nombre}
                        </h4>
                        <span className="text-muted small">
                          {room.count ?? 0} tarea(s) registradas
                        </span>
                      </div>
                    </div>

                    <div className="ui-room-badges">
                      {isSelected && (
                        <span className="ui-room-badge ui-room-badge-active">
                          Activo
                        </span>
                      )}
                      {room.is_owner ? (
                        <span className="ui-room-badge ui-room-badge-owner">
                          Propietario
                        </span>
                      ) : (
                        <span className="ui-room-badge ui-room-badge-member">
                          {room.my_role === "ADMIN" ? "Admin" : "Conviviente"}
                        </span>
                      )}
                      <span className="ui-room-badge ui-room-badge-member">
                        <LuUsers size={11} className="me-1" />
                        {memberCount} miembro(s)
                      </span>
                    </div>
                  </div>

                  <div className="ui-room-footer">
                    <Link
                      to={`/rooms/${room.id}/tasks`}
                      onClick={() => setRoomId(room.id)}
                      className="text-primary fw-semibold d-inline-flex align-items-center gap-1 text-decoration-none small"
                    >
                      <span>Ver tareas</span>
                      <LuArrowRight size={14} />
                    </Link>

                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<LuUsers size={14} />}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedMemberModalRoom(room);
                      }}
                      title="Administrar convivientes"
                    >
                      Miembros
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal de Convivientes */}
      {selectedMemberModalRoom && (
        <RoomMembersModal
          roomId={selectedMemberModalRoom.id}
          roomName={selectedMemberModalRoom.nombre}
          isOwner={Boolean(selectedMemberModalRoom.is_owner)}
          myRole={selectedMemberModalRoom.my_role ?? null}
          isOpen={Boolean(selectedMemberModalRoom)}
          onClose={() => setSelectedMemberModalRoom(null)}
          onMembersChanged={() => {
            notifyUpdate();
          }}
          ownerId={selectedMemberModalRoom.owner_id}
          ownerEmail={selectedMemberModalRoom.owner}
        />
      )}
    </div>
  );
};

export default Dashboard;
