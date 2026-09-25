import { useState, useEffect, useCallback } from "react";
import api from "../api";
import Select from "react-select";
import { getCurrentRoomId } from "../utils/room";
import { useTheme } from "../context/ThemeContext";
import RetroWindow from "./common/RetroWindow";
import EmptyState from "./common/EmptyState";
import { getRetroSelectStyles } from "../utils/selectStyles";
import type { Assignment, SelectOption, Task } from "../types/task";

// FE-010: Tipos importados del módulo compartido

const AssignTaskForm = () => {
  const [userId, setUserId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<SelectOption[]>([]);
  const [tasks, setTasks] = useState<SelectOption[]>([]);
  // FE-005: Estado de carga para el botón "Asignar"
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Estado de carga para el botón "Quitar" (por fila)
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);

  const { theme } = useTheme();

  // Carga inicial de usuarios y tareas
  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, tasksRes] = await Promise.all([
          api.get<{ id: string; nombre?: string; email: string }[]>("/users"),
          api.get<Task[]>("/tasks", {
            params: { room_id: getCurrentRoomId() || undefined },
          }),
        ]);

        setUsers(
          usersRes.data.map((u) => ({
            value: u.id,
            label: u.nombre || u.email,
          }))
        );

        setTasks(
          tasksRes.data.map((t) => ({ value: t.id, label: t.titulo }))
        );
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  // FE-007: fetchAssignments con useCallback para poder usar en useEffect
  const fetchAssignments = useCallback(async () => {
    if (!userId) return;
    setError("");
    try {
      const res = await api.get<Assignment[]>(`/tasks/assigned/${userId}`);
      setAssignments(res.data);
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al obtener asignaciones");
      }
    }
  }, [userId]);

  // FE-007: Reemplazar onBlur por useEffect reactivo a userId
  useEffect(() => {
    if (userId) {
      fetchAssignments();
    } else {
      setAssignments([]);
    }
  }, [userId, fetchAssignments]);

  // FE-005 + FE-007: handleAssign con validación previa y estado isSubmitting
  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // FE-007: Validar que ambos campos estén seleccionados antes de llamar a la API
    if (!userId || !taskId) {
      setError("Debes seleccionar un usuario y una tarea.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/tasks/assign", {
        task_id: taskId,
        user_id: userId,
      });
      setTaskId("");
      await fetchAssignments();
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al asignar tarea");
      }
    } finally {
      // FE-005: Restaurar siempre en el finally
      setIsSubmitting(false);
    }
  };

  const removeAssignment = async (task: string) => {
    setRemovingTaskId(task);
    setError("");
    try {
      await api.delete(`/tasks/${task}/assignees/${userId}`);
      await fetchAssignments();
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al eliminar asignación");
      }
    } finally {
      setRemovingTaskId(null);
    }
  };

  const selectStyles = getRetroSelectStyles<SelectOption>(theme);

  return (
    <div className="container-fluid py-2">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>🤝</span> ASIGNACIÓN DE TAREAS / TASK_ASSIGN.EXE
          </h2>
          <p className="retro-page-subtitle">
            Vincula miembros del equipo a tareas activas y supervisa la carga de trabajo
          </p>
        </div>
      </div>

      <RetroWindow
        title="TASK_ASSIGN.EXE - VINCULACIÓN OPERATIVA"
        icon="🤝"
      >
        {error && <div className="alert alert-danger mb-4">{error}</div>}

        <form onSubmit={handleAssign} className="mb-4">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label fw-bold small text-muted">
                USUARIO RESPONSABLE *
              </label>
              <Select
                options={users}
                value={users.find((u) => u.value === userId) || null}
                onChange={(opt) => {
                  setUserId(opt ? (opt as SelectOption).value : "");
                  setAssignments([]);
                }}
                placeholder="Selecciona un usuario..."
                isDisabled={isSubmitting}
                styles={selectStyles}
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label fw-bold small text-muted">
                TAREA A ASIGNAR *
              </label>
              <Select
                options={tasks}
                value={tasks.find((t) => t.value === taskId) || null}
                onChange={(opt) => setTaskId(opt ? (opt as SelectOption).value : "")}
                placeholder="Selecciona una tarea..."
                isDisabled={isSubmitting}
                styles={selectStyles}
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              type="submit"
              className="btn-retro btn-retro-primary w-100"
              style={{ minHeight: "48px" }}
              disabled={isSubmitting || !userId || !taskId}
            >
              <span>{isSubmitting ? "⏳" : "🤝"}</span>
              <span>{isSubmitting ? "Asignando tarea..." : "Asignar Tarea"}</span>
            </button>
          </div>
        </form>

        {/* Listado de tareas asignadas al usuario seleccionado */}
        {userId && (
          <div className="pt-4 border-top border-2">
            <h5 className="fw-bold mb-3 d-flex align-items-center gap-2">
              <span>📋</span>
              <span>Tareas asignadas ({assignments.length})</span>
            </h5>

            {assignments.length === 0 ? (
              <EmptyState
                icon="📂"
                title="Sin tareas asignadas"
                description="No hay tareas asignadas actualmente a este usuario."
                className="py-3"
              />
            ) : (
              <div className="d-flex flex-column gap-2">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="retro-log-entry p-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
                  >
                    <div className="d-flex align-items-center gap-2">
                      <span className="fs-5">📌</span>
                      <span className="fw-bold retro-task-title">
                        {tasks.find((t) => t.value === a.task_id)?.label || a.task_id}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-retro btn-retro-danger"
                      style={{ minHeight: "40px", padding: "0.35rem 0.9rem" }}
                      onClick={() => removeAssignment(a.task_id)}
                      disabled={removingTaskId === a.task_id}
                    >
                      <span>🗑️</span>
                      <span>{removingTaskId === a.task_id ? "Quitando..." : "Quitar Asignación"}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </RetroWindow>
    </div>
  );
};

export default AssignTaskForm;
