import { useState, useEffect, useCallback } from "react";
import api from "../api";
import Select from "react-select";
import { getCurrentRoomId } from "../utils/room";
import { useTheme } from "../context/ThemeContext";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import EmptyState from "./common/EmptyState";
import { getModernSelectStyles } from "../utils/selectStyles";
import type { Assignment, SelectOption, Task } from "../types/task";
import {
  LuUsers,
  LuListTodo,
  LuTrash2,
  LuCheck,
  LuUserCheck,
} from "react-icons/lu";

const AssignTaskForm = () => {
  const [userId, setUserId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<SelectOption[]>([]);
  const [tasks, setTasks] = useState<SelectOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);

  const { theme } = useTheme();

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

  useEffect(() => {
    if (userId) {
      fetchAssignments();
    } else {
      setAssignments([]);
    }
  }, [userId, fetchAssignments]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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

  const selectStyles = getModernSelectStyles<SelectOption>(theme);

  return (
    <div className="container-fluid py-2" style={{ maxWidth: "860px" }}>
      {/* Cabecera */}
      <div className="mb-4">
        <h2 className="d-flex align-items-center gap-2 mb-1 fw-bold" style={{ fontSize: "24px" }}>
          <LuUsers className="text-primary" size={26} aria-hidden="true" />
          <span>Asignación de Tareas</span>
        </h2>
        <p className="text-muted mb-0" style={{ fontSize: "14px" }}>
          Vincula miembros del equipo a tareas activas y supervisa la carga de trabajo
        </p>
      </div>

      <Card
        title="Vincular Responsable"
        subtitle="Selecciona un conviviente y una tarea para registrar la asignación"
        icon={<LuUserCheck size={20} className="text-primary" />}
        className="mb-4"
      >
        {error && (
          <div className="alert alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleAssign} className="mb-4">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label fw-semibold" style={{ fontSize: "13px" }}>
                Usuario responsable *
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
              <label className="form-label fw-semibold" style={{ fontSize: "13px" }}>
                Tarea a asignar *
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

          <div className="mt-4 d-flex justify-content-end">
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={<LuCheck size={16} />}
              isLoading={isSubmitting}
              disabled={isSubmitting || !userId || !taskId}
            >
              Asignar Tarea
            </Button>
          </div>
        </form>

        {/* Listado de tareas asignadas al usuario seleccionado */}
        {userId && (
          <div className="pt-4 border-top">
            <h5 className="fw-bold mb-3 d-flex align-items-center gap-2" style={{ fontSize: "16px" }}>
              <LuListTodo size={18} className="text-primary" />
              <span>Tareas asignadas ({assignments.length})</span>
            </h5>

            {assignments.length === 0 ? (
              <EmptyState
                icon={<LuListTodo size={28} />}
                title="Sin tareas asignadas"
                description="No hay tareas asignadas actualmente a este usuario."
                className="py-3"
              />
            ) : (
              <div className="d-flex flex-column gap-2">
                {assignments.map((a) => {
                  const taskLabel =
                    tasks.find((t) => t.value === a.task_id)?.label || a.task_id;
                  const isRemoving = removingTaskId === a.task_id;

                  return (
                    <div
                      key={a.id}
                      className="p-3 d-flex justify-content-between align-items-center flex-wrap gap-2 rounded-3 border"
                      style={{
                        backgroundColor: "var(--bg-subtle)",
                        borderColor: "var(--border-default)",
                      }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <LuListTodo size={16} className="text-muted" />
                        <span className="fw-semibold text-heading" style={{ fontSize: "14px" }}>
                          {taskLabel}
                        </span>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        leftIcon={<LuTrash2 size={14} />}
                        onClick={() => removeAssignment(a.task_id)}
                        isLoading={isRemoving}
                        disabled={isRemoving}
                      >
                        Quitar
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AssignTaskForm;
