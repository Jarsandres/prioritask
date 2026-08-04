import { useState, useEffect, useCallback } from "react";
import api from "../api";
import Select from "react-select";
import { getCurrentRoomId } from "../utils/room";
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

  return (
    <div className="container mt-4">
      <h2>Asignar tareas</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleAssign} className="mb-4">
        <div className="mb-3">
          <label className="form-label">Usuario</label>
          {/* FE-007: Eliminado onBlur={fetchAssignments}; ahora lo gestiona el useEffect */}
          <Select
            options={users}
            value={users.find((u) => u.value === userId) || null}
            onChange={(opt) => {
              setUserId(opt ? (opt as SelectOption).value : "");
              setAssignments([]);
            }}
            placeholder="Seleccione un usuario"
            isDisabled={isSubmitting}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Tarea</label>
          <Select
            options={tasks}
            value={tasks.find((t) => t.value === taskId) || null}
            onChange={(opt) => setTaskId(opt ? (opt as SelectOption).value : "")}
            placeholder="Seleccione una tarea"
            isDisabled={isSubmitting}
          />
        </div>
        {/* FE-005: Botón deshabilitado durante submit */}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Asignando..." : "Asignar"}
        </button>
      </form>

      {assignments.length > 0 && (
        <div>
          <h5>Tareas asignadas al usuario</h5>
          <ul className="list-group">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <span>
                  {tasks.find((t) => t.value === a.task_id)?.label || a.task_id}
                </span>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => removeAssignment(a.task_id)}
                  disabled={removingTaskId === a.task_id}
                >
                  {removingTaskId === a.task_id ? "Quitando..." : "Quitar"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AssignTaskForm;
