import { useState, useEffect } from "react";
import api from "../api";
import { useNavigate, useParams } from "react-router-dom";

const TaskForm = () => {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [estado, setEstado] = useState("TODO");
  const [error, setError] = useState("");

  const { taskId } = useParams();
  const navigate = useNavigate();

  const formatearFecha = (fecha: string) => {
    const partes = fecha.split("/");
    if (partes.length === 3) {
      const [dd, mm, yyyy] = partes;
      return `${yyyy}-${mm}-${dd}`;
    }
    return fecha;
  };

  useEffect(() => {
    if (taskId) {
      const fetchTask = async () => {
        try {
          const response = await api.get(`/tasks/${taskId}`);
          const { titulo, descripcion, categoria, peso, due_date, estado } = response.data;
          setTitulo(titulo);
          setDescripcion(descripcion);
          setCategoria(categoria);
          setPeso(peso);
          setDueDate(due_date);
          setEstado(estado);
        } catch (err) {
          console.error(err);
          setError("Error al cargar la tarea");
        }
      };
      fetchTask();
    }
  }, [taskId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const taskData = {
      titulo,
      descripcion,
      categoria,
      peso,
      due_date: formatearFecha(dueDate),
      estado,
    };

    try {
      if (taskId) {
        await api.put(`/tasks/${taskId}`, taskData);
      } else {
        await api.post("/tasks", taskData);
      }

      navigate("/tasks");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al guardar la tarea");
    }
  };

  return (
    <div className="container mt-4">
      <h2>{taskId ? "Editar tarea" : "Crear nueva tarea"}</h2>
      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label>Título</label>
          <input
            type="text"
            className="form-control"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
          />
        </div>

        <div className="mb-3">
          <label>Descripción</label>
          <textarea
            className="form-control"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label>Categoría</label>
          <select
            className="form-select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option value="LIMPIEZA">Limpieza</option>
            <option value="COMPRA">Compra</option>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="mb-3">
          <label>Peso</label>
          <input
            type="number"
            className="form-control"
            value={peso}
            onChange={(e) => setPeso(Number(e.target.value))}
            min="1"
            max="5"
          />
        </div>

        <div className="mb-3">
          <label>Fecha de vencimiento</label>
          <input
            type="date"
            className="form-control"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label htmlFor="estado" className="form-label">Estado</label>
          <select
            id="estado"
            className="form-select"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          >
            <option value="TODO">Pendiente</option>
            <option value="IN_PROGRESS">En progreso</option>
            <option value="DONE">Completada</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary">
          {taskId ? "Actualizar" : "Crear"}
        </button>
      </form>
    </div>
  );
};

export default TaskForm;
