import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import RetroWindow from "../components/common/RetroWindow";
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
  // FE-011: Estado de error renderizado en UI en lugar de alert()
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // FE-011: AbortController para cancelar la petición si el componente se desmonta
    const controller = new AbortController();

    const fetchGroups = async () => {
      setError(null);
      try {
        const res = await api.post<{ grupos: Group }>(
          "/tasks/ai/group",
          {},
          { signal: controller.signal }
        );
        setGroups(res.data.grupos);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") {
          return;
        }
        console.error(err);
        // FE-011: Error en UI, no alert() bloqueante
        setError("Error al agrupar tareas con IA. Inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();

    // FE-011: Cleanup que cancela la petición al desmontar
    return () => {
      controller.abort();
    };
  }, []);

  const groupEntries = Object.entries(groups);

  return (
    <div className="container-fluid py-2">
      {/* Encabezado Retro */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>🧠</span> CLÚSTERES DE IA / AI_CLUSTERING.SYS
          </h2>
          <p className="retro-page-subtitle">
            Agrupación semántica e inteligente de tus tareas pendientes
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/tasks" className="btn-retro btn-retro-outline" style={{ minHeight: "40px" }}>
            <span>📝</span> <span>Ver Tareas</span>
          </Link>
          <Link to="/tasks/rewrite" className="btn-retro btn-retro-magenta" style={{ minHeight: "40px" }}>
            <span>✨</span> <span>Mejorar Títulos</span>
          </Link>
        </div>
      </div>

      {/* FE-011: Error renderizado en lugar de alert() */}
      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <RetroWindow
          title="PROCESANDO CLÚSTERES DE IA..."
          icon="🧠"
          variant="magenta"
        >
          <EmptyState
            icon="⏳"
            title="Analizando patrones semánticos..."
            description="El motor neuronal está agrupando tus tareas según afinidad operativa."
          />
        </RetroWindow>
      ) : groupEntries.length === 0 ? (
        <RetroWindow
          title="AI_CLUSTERING.SYS / RESULTADO"
          icon="🧠"
          variant="magenta"
        >
          <EmptyState
            icon="📁"
            title="No se encontraron clústeres"
            description="No hay suficientes tareas o ya están perfectamente ordenadas."
            actionLabel="➕ Crear Tarea"
            actionTo="/tasks/create"
          />
        </RetroWindow>
      ) : (
        <div className="d-flex flex-column gap-3">
          {groupEntries.map(([name, tasks]) => (
            <RetroWindow
              key={name}
              title={`Cluster: ${name}`}
              icon="🧠"
              variant="magenta"
              badge={
                <span className="retro-badge retro-badge-high">
                  {tasks.length} tareas
                </span>
              }
            >
              <div className="d-flex flex-column gap-2">
                {tasks.map((t) => (
                  <div key={t.id} className="retro-cluster-item">
                    <span className="retro-cluster-bullet">💾</span>
                    <span className="retro-cluster-task-title">{t.titulo}</span>
                    <span className="retro-badge retro-badge-todo">
                      #{t.id.slice(0, 6)}
                    </span>
                  </div>
                ))}
              </div>
            </RetroWindow>
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupedTasks;
