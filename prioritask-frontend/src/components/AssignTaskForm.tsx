import { useState } from "react";
import api from "../api";

interface Assignment {
  id: number;
  task_id: string;
  user_id: string;
  asignado_por: string;
  fecha: string;
}

const AssignTaskForm = () => {
  const [userId, setUserId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");

  const fetchAssignments = async () => {
    if (!userId) return;
    try {
      const res = await api.get(`/tasks/assigned/${userId}`);
      setAssignments(res.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al obtener asignaciones");
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/tasks/assign", {
        task_id: taskId,
        user_id: userId,
      });
      setTaskId("");
      fetchAssignments();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al asignar tarea");
    }
  };

  const removeAssignment = async (task: string) => {
    try {
      await api.delete(`/tasks/${task}/assignees/${userId}`);
      fetchAssignments();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al eliminar asignación");
    }
  };

  return (
    <div className="container mt-4">
      <h2>Asignar tareas</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleAssign} className="mb-4">
        <div className="mb-3">
          <label className="form-label">ID de usuario</label>
          <input
            type="text"
            className="form-control"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onBlur={fetchAssignments}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">ID de tarea</label>
          <input
            type="text"
            className="form-control"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Asignar
        </button>
      </form>

      {assignments.length > 0 && (
        <div>
          <h5>Tareas asignadas al usuario</h5>
          <ul className="list-group">
            {assignments.map((a) => (
              <li key={a.id} className="list-group-item d-flex justify-content-between align-items-center">
                <span>{a.task_id}</span>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => removeAssignment(a.task_id)}
                >
                  Quitar
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

