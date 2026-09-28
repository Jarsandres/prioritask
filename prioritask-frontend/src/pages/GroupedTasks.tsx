import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  LuBrain,
  LuSparkles,
  LuListTodo,
  LuLayers,
  LuRotateCw,
  LuCircleCheck,
  LuFolder,
} from "react-icons/lu";
import api from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/common/EmptyState";

interface GroupedTask {
  id: string;
  titulo: string;
}

interface Group {
  [groupName: string]: GroupedTask[];
}

const GroupedTasks = () => {
  const [groups, setGroups] = useState<Group>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ grupos: Group }>(
        "/tasks/ai/group",
        {},
        { signal }
      );
      setGroups(res.data.grupos || {});
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "CanceledError") {
        return;
      }
      console.error(err);
      setError("Error al agrupar tareas con IA. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchGroups(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchGroups]);

  const groupEntries = Object.entries(groups);
  const totalTasksInGroups = groupEntries.reduce(
    (acc, [, tasks]) => acc + tasks.length,
    0
  );

  return (
    <div className="container-fluid py-3 px-2 px-md-4">
      {/* Cabecera Moderna */}
      <div className="d-flex justify-content-between align-items-start align-items-md-center mb-4 flex-column flex-md-row gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="d-flex align-items-center justify-content-center rounded-3 p-2"
              style={{
                backgroundColor: "rgba(139, 92, 246, 0.12)",
                color: "#8b5cf6",
              }}
            >
              <LuBrain size={22} />
            </div>
            <h1 className="h3 mb-0 fw-bold" style={{ letterSpacing: "-0.02em" }}>
              Clústeres Inteligentes de Tareas
            </h1>
          </div>
          <p className="text-muted mb-0 small">
            Agrupación semántica e inteligente de tus tareas pendientes según afinidad operativa
          </p>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LuRotateCw className={loading ? "spin" : ""} size={15} />}
            onClick={() => fetchGroups()}
            disabled={loading}
          >
            Actualizar Clústeres
          </Button>
          <Link to="/tasks" style={{ textDecoration: "none" }}>
            <Button variant="outline" size="sm" leftIcon={<LuListTodo size={15} />}>
              Ver Tareas
            </Button>
          </Link>
          <Link to="/tasks/rewrite" style={{ textDecoration: "none" }}>
            <Button
              variant="ai"
              size="sm"
              leftIcon={<LuSparkles size={15} />}
            >
              Optimizar Títulos
            </Button>
          </Link>
        </div>
      </div>

      {/* Banner de Error si ocurre */}
      {error && (
        <div
          className="alert alert-danger d-flex align-items-center justify-content-between mb-4 rounded-3 border-0 shadow-xs"
          role="alert"
        >
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchGroups()}
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Vista de Carga con Skeletons */}
      {loading ? (
        <div className="d-flex flex-column gap-3">
          {[1, 2, 3].map((idx) => (
            <Card key={idx} className="p-3">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="d-flex align-items-center gap-2">
                  <Skeleton variant="circular" width={24} height={24} />
                  <Skeleton variant="text" width={180} height={20} />
                </div>
                <Skeleton variant="rounded" width={70} height={24} />
              </div>
              <div className="d-flex flex-column gap-2">
                <Skeleton variant="rounded" width="100%" height={40} />
                <Skeleton variant="rounded" width="100%" height={40} />
              </div>
            </Card>
          ))}
        </div>
      ) : groupEntries.length === 0 ? (
        <Card className="p-4">
          <EmptyState
            icon={<LuLayers size={28} />}
            title="No se encontraron clústeres"
            description="No hay suficientes tareas pendientes o ya están perfectamente ordenadas."
            actionLabel="Crear Tarea"
            actionTo="/tasks/create"
          />
        </Card>
      ) : (
        <div>
          <div className="d-flex align-items-center justify-content-between mb-3 text-muted small">
            <span>
              {groupEntries.length} clúster{groupEntries.length !== 1 ? "es" : ""} detectado
              {groupEntries.length !== 1 ? "s" : ""} · {totalTasksInGroups} tarea
              {totalTasksInGroups !== 1 ? "s" : ""} organizadas
            </span>
          </div>

          <div className="d-flex flex-column gap-3">
            {groupEntries.map(([name, tasks]) => (
              <Card
                key={name}
                title={name}
                icon={<LuFolder size={18} style={{ color: "#8b5cf6" }} />}
                headerActions={
                  <Badge variant="default">
                    {tasks.length} {tasks.length === 1 ? "tarea" : "tareas"}
                  </Badge>
                }
              >
                <div className="d-flex flex-column gap-2 p-3">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="d-flex align-items-center justify-content-between p-2.5 rounded-3 transition-colors"
                      style={{
                        backgroundColor: "var(--bg-subtle, #f8fafc)",
                        border: "1px solid var(--border-default, #e2e8f0)",
                      }}
                    >
                      <div className="d-flex align-items-center gap-2.5 text-truncate pe-2">
                        <LuCircleCheck
                          size={16}
                          style={{ color: "var(--primary-500, #3b82f6)", flexShrink: 0 }}
                        />
                        <span
                          className="fw-medium text-truncate"
                          style={{
                            color: "var(--text-heading, #0f172a)",
                            fontSize: "0.93rem",
                          }}
                        >
                          {t.titulo}
                        </span>
                      </div>
                      <span
                        className="badge rounded-pill fw-normal text-muted"
                        style={{
                          backgroundColor: "var(--bg-canvas, #ffffff)",
                          border: "1px solid var(--border-subtle, #e2e8f0)",
                          fontSize: "0.72rem",
                          letterSpacing: "0.02em",
                        }}
                      >
                        #{t.id.slice(0, 6)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupedTasks;
