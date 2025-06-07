import { useState, useEffect, useContext } from "react";
import api from "../api";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import { TaskUpdateContext } from "../context/TaskUpdateContext";

interface Tag {
  id: string;
  nombre: string;
}

const TaskForm = () => {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [estado, setEstado] = useState("TODO");
  const [error, setError] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<{ value: string; label: string }[]>([]);
  const [sugerencia, setSugerencia] = useState<{ prioridad: string; motivo: string } | null>(null);

  const { taskId } = useParams();
  const navigate = useNavigate();
  const { notifyUpdate } = useContext(TaskUpdateContext);

  const today = new Date().toISOString().split("T")[0];

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value && value < today) {
      alert("La fecha no puede ser anterior a hoy");
      return;
    }
    setDueDate(value);
  };

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await api.get("/tags");
        setTags(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchTags();
  }, []);

  const formatearFecha = (fecha: string) => {
    const partes = fecha.split("/");
    if (partes.length === 3) {
      const [dd, mm, yyyy] = partes;
      return `${yyyy}-${mm}-${dd}`;
    }
    return fecha;
  };

  useEffect(() => {
    if (taskId && tags.length > 0) {
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

          const taskTags =
            response.data.tags?.map((t: any) => t.id) ??
            response.data.tag_ids ??
            response.data.etiquetas?.map((t: any) => t.etiqueta?.id ?? t.id) ??
            [];
          setSelectedTags(
            taskTags.map((id: string) => {
              const t = tags.find((tg) => tg.id === id);
              return { value: id, label: t ? t.nombre : id };
            })
          );
        } catch (err) {
          console.error(err);
          setError("Error al cargar la tarea");
        }
      };
      fetchTask();
    }
  }, [taskId, tags]);

  const prioridadAPeso = (p: string) => {
    if (p === "alta") return 5;
    if (p === "media") return 3;
    return 1;
  };

  const handleSuggest = async () => {
    try {
      const res = await api.post("/tasks/ai/suggest", {
        titulo,
        descripcion,
        due_date: dueDate ? formatearFecha(dueDate) : undefined,
      });
      const { prioridad, motivo } = res.data;
      setPeso(prioridadAPeso(prioridad));
      setSugerencia({ prioridad, motivo });
    } catch (err) {
      console.error(err);
      alert("Error al obtener sugerencia");
    }
  };

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
      let id = taskId;
      if (taskId) {
        await api.put(`/tasks/${taskId}`, taskData);
      } else {
       const res = await api.post("/tasks", taskData);
        id = res.data.id;
      }

      if (selectedTags.length > 0 && id) {
        await api.post(`/tags/tasks/${id}/tags`, {
          tag_ids: selectedTags.map((t) => t.value),
        });
      }

      notifyUpdate();
      navigate("/tasks");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al guardar la tarea");
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0">{taskId ? "Editar tarea" : "Crear nueva tarea"}</h2>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/tasks")}>Volver</button>
      </div>
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
        <button
          type="button"
          className="btn btn-outline-secondary mb-2"
          onClick={handleSuggest}
        >
          🧠 Sugerir prioridad
        </button>
        {sugerencia && (
          <div className="alert alert-info p-2" role="alert">
            Prioridad sugerida: <strong>{sugerencia.prioridad}</strong> -
            {" "}
            {sugerencia.motivo}
          </div>
        )}

        <div className="mb-3">
          <label>Fecha de vencimiento</label>
          <input
            type="date"
            className="form-control"
            value={dueDate}
            min={today}
            onChange={handleDueDateChange}
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

        <div className="mb-3">
          <label>Etiquetas</label>
          <Select
            isMulti
            options={tags.map((t) => ({ value: t.id, label: t.nombre }))}
            value={selectedTags}
            onChange={(opts) => setSelectedTags(opts as { value: string; label: string }[])}
            classNamePrefix="select"
          />
        </div>

        <button type="submit" className="btn btn-primary">
          {taskId ? "Actualizar" : "Crear"}
        </button>
      </form>
    </div>
  );
};

export default TaskForm;
