import { useState, useEffect, useContext } from "react";
import api from "../api";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import { TaskUpdateContext } from "../context/TaskUpdateContext";
import { getCurrentRoomId } from "../utils/room";
import type { Tag } from "../types/task";

// FE-010: Tag importado desde tipos compartidos

interface AISuggestion {
  prioridad: string;
  motivo: string;
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
  const [sugerencia, setSugerencia] = useState<AISuggestion | null>(null);
  // FE-005: Estados de carga para submit y sugerencia AI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const { taskId } = useParams();
  const navigate = useNavigate();
  const { notifyUpdate } = useContext(TaskUpdateContext);

  const today = new Date().toISOString().split("T")[0];
  const [dateError, setDateError] = useState("");

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value && value < today) {
      setDateError("La fecha no puede ser anterior a hoy");
      return;
    }
    setDateError("");
    setDueDate(value);
  };

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await api.get<Tag[]>("/tags");
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
          setDescripcion(descripcion ?? "");
          setCategoria(categoria);
          setPeso(peso);
          setDueDate(due_date ?? "");
          setEstado(estado);

          // FE-010: tipado con Tag en lugar de (t: any)
          const taskTags: string[] =
            response.data.tags?.map((t: Tag) => t.id) ??
            response.data.tag_ids ??
            response.data.etiquetas?.map((t: { etiqueta?: Tag; id: string }) =>
              t.etiqueta?.id ?? t.id
            ) ??
            [];

          setSelectedTags(
            taskTags.map((id) => {
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

  const prioridadAPeso = (p: string): number => {
    if (p === "alta") return 5;
    if (p === "media") return 3;
    return 1;
  };

  // FE-005: handleSuggest con isSuggesting
  const handleSuggest = async () => {
    setIsSuggesting(true);
    try {
      const res = await api.post<AISuggestion>("/tasks/ai/suggest", {
        titulo,
        descripcion,
        due_date: dueDate ? formatearFecha(dueDate) : undefined,
      });
      const { prioridad, motivo } = res.data;
      setPeso(prioridadAPeso(prioridad));
      setSugerencia({ prioridad, motivo });
    } catch (err) {
      console.error(err);
      setError("Error al obtener sugerencia de la IA.");
    } finally {
      setIsSuggesting(false);
    }
  };

  // FE-005 + FE-006: handleSubmit con isSubmitting y corrección de tags
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // FE-005: Bloquear doble envío
    setIsSubmitting(true);

    const taskData = {
      titulo,
      descripcion,
      categoria,
      peso,
      due_date: formatearFecha(dueDate),
      estado,
      room_id: getCurrentRoomId() || undefined,
    };

    try {
      let id = taskId;
      if (taskId) {
        await api.put(`/tasks/${taskId}`, taskData);
      } else {
        const res = await api.post<{ id: string }>("/tasks", taskData);
        id = res.data.id;
      }

      // FE-006: Llamar SIEMPRE al endpoint de tags si tenemos un id válido,
      // incluso con array vacío, para que el backend haga el reemplazo correcto.
      // Antes: `if (selectedTags.length > 0 && id)` → ignoraba eliminación de todas las etiquetas.
      if (id) {
        await api.post(`/tags/tasks/${id}/tags`, {
          tag_ids: selectedTags.map((t) => t.value),
        });
      }

      notifyUpdate();
      navigate("/tasks");
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
        setError("Error al guardar la tarea");
      }
    } finally {
      // FE-005: Restaurar el estado siempre, incluso en error
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="mb-0">{taskId ? "Editar tarea" : "Crear nueva tarea"}</h2>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate("/tasks")}
          disabled={isSubmitting}
        >
          Volver
        </button>
      </div>
      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="titulo" className="form-label">Título</label>
          <input
            id="titulo"
            type="text"
            className="form-control"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="mb-3">
          <label htmlFor="descripcion" className="form-label">Descripción</label>
          <textarea
            id="descripcion"
            className="form-control"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="mb-3">
          <label htmlFor="categoria" className="form-label">Categoría</label>
          <select
            id="categoria"
            className="form-select"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="LIMPIEZA">Limpieza</option>
            <option value="COMPRA">Compra</option>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="mb-3">
          <label htmlFor="peso" className="form-label">Peso</label>
          <input
            id="peso"
            type="number"
            className="form-control"
            value={peso}
            onChange={(e) => setPeso(Number(e.target.value))}
            min="1"
            max="5"
            disabled={isSubmitting}
          />
        </div>

        {/* FE-005: Botón AI deshabilitado mientras sugiere o se hace submit */}
        <button
          type="button"
          className="btn btn-outline-secondary mb-2"
          onClick={handleSuggest}
          disabled={isSuggesting || isSubmitting}
        >
          {isSuggesting ? "Analizando..." : "🧠 Sugerir prioridad"}
        </button>

        {sugerencia && (
          <div className="alert alert-info p-2" role="alert">
            Prioridad sugerida: <strong>{sugerencia.prioridad}</strong> -{" "}
            {sugerencia.motivo}
          </div>
        )}

        <div className="mb-3">
          <label htmlFor="dueDate" className="form-label">Fecha de vencimiento</label>
          <input
            id="dueDate"
            type="date"
            className={`form-control ${dateError ? "is-invalid" : ""}`}
            value={dueDate}
            min={today}
            onChange={handleDueDateChange}
            disabled={isSubmitting}
          />
          {dateError && <div className="invalid-feedback">{dateError}</div>}
        </div>

        <div className="mb-3">
          <label htmlFor="estado-task" className="form-label">Estado</label>
          <select
            id="estado-task"
            className="form-select"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="TODO">Pendiente</option>
            <option value="IN_PROGRESS">En progreso</option>
            <option value="DONE">Completada</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label">Etiquetas</label>
          <Select
            isMulti
            options={tags.map((t) => ({ value: t.id, label: t.nombre }))}
            value={selectedTags}
            onChange={(opts) =>
              setSelectedTags(opts as { value: string; label: string }[])
            }
            classNamePrefix="select"
            isDisabled={isSubmitting}
          />
        </div>

        {/* FE-005: Botón submit deshabilitado durante el envío */}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? taskId
              ? "Actualizando..."
              : "Creando..."
            : taskId
            ? "Actualizar"
            : "Crear"}
        </button>
      </form>
    </div>
  );
};

export default TaskForm;
