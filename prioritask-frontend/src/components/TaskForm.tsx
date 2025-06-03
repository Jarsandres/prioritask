import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const TaskForm = () => {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const token = localStorage.getItem("token");

    try {
      await axios.post(
        "http://localhost:8000/api/v1/tasks",
        {
          titulo,
          descripcion,
          categoria,
          peso,
          due_date: dueDate,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      navigate("/tasks");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al crear la tarea");
    }
  };

  return (
    <div className="container mt-4">
      <h2>Crear nueva tarea</h2>
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
          <label>Peso (1-100)</label>
          <input
            type="number"
            className="form-control"
            min={1}
            max={100}
            value={peso}
            onChange={(e) => setPeso(parseInt(e.target.value))}
            required
          />
        </div>

        <div className="mb-3">
          <label>Fecha límite</label>
          <input
            type="date"
            className="form-control"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <button className="btn btn-primary">Crear tarea</button>
      </form>
    </div>
  );
};

export default TaskForm;
