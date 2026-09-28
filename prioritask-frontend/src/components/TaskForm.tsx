import { useState, useEffect } from "react";
import api from "../api";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useTheme } from "../context/ThemeContext";
import { getCurrentRoomId } from "../utils/room";
import RetroWindow from "./common/RetroWindow";
import { getRetroSelectStyles } from "../utils/selectStyles";
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
  const [isRecurring, setIsRecurring] = useState(false);
  const [error, setError] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<{ value: string; label: string }[]>([]);
  const [sugerencia, setSugerencia] = useState<AISuggestion | null>(null);
  // FE-005: Estados de carga para submit y sugerencia AI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const { taskId } = useParams();
  const navigate = useNavigate();
  const { notifyUpdate } = useTaskUpdate();
  const { theme } = useTheme();

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
          setIsRecurring(Boolean(response.data.is_recurring));

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

  // FE-005 + FE-006: handleSubmit con isSubmitting y validación client-side
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanTitle = titulo.trim();
    if (!cleanTitle) {
      setError("El título de la tarea es obligatorio y no puede contener solo espacios.");
      return;
    }

    if (peso < 1 || peso > 5) {
      setError("El peso de la tarea debe estar comprendido entre 1 y 5.");
      return;
    }

    // FE-005: Bloquear doble envío
    setIsSubmitting(true);

    const taskData = {
      titulo: cleanTitle,
      descripcion: descripcion.trim() || undefined,
      categoria,
      peso,
      due_date: dueDate ? formatearFecha(dueDate) : undefined,
      estado,
      room_id: getCurrentRoomId() || undefined,
      is_recurring: isRecurring,
    };

    try {
      let id = taskId;
      if (taskId) {
        await api.put(`/tasks/${taskId}`, taskData);
      } else {
        const res = await api.post<{ id: string }>("/tasks", taskData);
        id = res.data.id;
      }

      // FE-006: Llamar SIEMPRE al endpoint de tags si tenemos un id válido
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

  const selectStyles = getRetroSelectStyles<{ value: string; label: string }, true>(theme);

  return (
    <div className="container mt-4 mb-5" style={{ maxWidth: "760px" }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button
          type="button"
          className="btn-retro btn-retro-outline"
          style={{ minHeight: "40px" }}
          onClick={() => navigate("/tasks")}
          disabled={isSubmitting}
        >
          ⬅ Volver a Tareas
        </button>
      </div>

      <RetroWindow
        title={taskId ? "EDITAR TAREA" : "CREAR NUEVA TAREA"}
        icon={taskId ? "✏️" : "📝"}
      >
        {error && (
          <div className="alert alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label htmlFor="titulo" className="form-label fw-bold">
              Título *
            </label>
            <input
              id="titulo"
              type="text"
              className="form-control retro-input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Limpiar la cocina a fondo"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="descripcion" className="form-label fw-bold">
              Descripción
            </label>
            <textarea
              id="descripcion"
              className="form-control"
              style={{
                minHeight: "88px",
                fontSize: "16px",
                border: "2px solid #1e293b",
                borderRadius: "8px",
              }}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles sobre lo que se necesita hacer..."
              disabled={isSubmitting}
            />
          </div>

          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6">
              <label htmlFor="categoria" className="form-label fw-bold">
                Categoría
              </label>
              <select
                id="categoria"
                className="form-select retro-select"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="LIMPIEZA">Limpieza 🧹</option>
                <option value="COMPRA">Compra 🛒</option>
                <option value="MANTENIMIENTO">Mantenimiento 🔧</option>
                <option value="OTRO">Otro 📁</option>
              </select>
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="peso" className="form-label fw-bold">
                Peso (1 a 5)
              </label>
              <input
                id="peso"
                type="number"
                className="form-control retro-input"
                value={peso}
                onChange={(e) => setPeso(Number(e.target.value))}
                min="1"
                max="5"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* FE-005: Botón AI destacado en magenta retro táctil */}
          <div className="mb-3">
            <button
              type="button"
              className="btn-retro btn-retro-magenta w-100 py-2 d-flex align-items-center justify-content-center gap-2"
              style={{ minHeight: "44px" }}
              onClick={handleSuggest}
              disabled={isSuggesting || isSubmitting}
            >
              <span>🧠</span>
              <span>{isSuggesting ? "Analizando con IA..." : "Sugerir prioridad con IA"}</span>
            </button>
          </div>

          {sugerencia && (
            <div className="retro-ai-alert p-3 mb-3" role="alert">
              <div className="fw-bold mb-1 d-flex align-items-center gap-2">
                <span>💡</span> Sugerencia de Prioridad: {sugerencia.prioridad.toUpperCase()}
              </div>
              <p className="mb-0 small">{sugerencia.motivo}</p>
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6">
              <label htmlFor="dueDate" className="form-label fw-bold">
                Fecha de vencimiento
              </label>
              <input
                id="dueDate"
                type="date"
                className={`form-control retro-input ${dateError ? "is-invalid" : ""}`}
                value={dueDate}
                min={today}
                onChange={handleDueDateChange}
                disabled={isSubmitting}
              />
              {dateError && <div className="invalid-feedback">{dateError}</div>}
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="estado-task" className="form-label fw-bold">
                Estado
              </label>
              <select
                id="estado-task"
                className="form-select retro-select"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                disabled={isSubmitting}
              >
                <option value="TODO">Pendiente</option>
                <option value="IN_PROGRESS">En progreso</option>
                <option value="DONE">Completada</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="form-label fw-bold">Etiquetas</label>
            <Select
              isMulti
              options={tags.map((t) => ({ value: t.id, label: t.nombre }))}
              value={selectedTags}
              onChange={(opts) =>
                setSelectedTags(opts as { value: string; label: string }[])
              }
              classNamePrefix="select"
              isDisabled={isSubmitting}
              styles={selectStyles}
            />
          </div>

          {/* S4-T2: Control retro para tarea recurrente */}
          <div className="form-check retro-checkbox-container mb-3 d-flex align-items-center gap-2">
            <input
              id="task-recurring"
              type="checkbox"
              className="form-check-input retro-checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              disabled={isSubmitting}
            />
            <label htmlFor="task-recurring" className="form-check-label fw-bold small text-muted cursor-pointer mb-0">
              🔄 TAREA RECURRENTE (RUTINA PERIÓDICA AUTOMÁTICA)
            </label>
          </div>

          {/* FE-005: Botón submit táctil con altura min 48px */}
          <button
            type="submit"
            className="btn-retro btn-retro-primary w-100 py-2 d-flex align-items-center justify-content-center gap-2"
            style={{ minHeight: "48px" }}
            disabled={isSubmitting}
          >
            <span>{isSubmitting ? "⏳" : taskId ? "💾" : "➕"}</span>
            <span>
              {isSubmitting
                ? taskId
                  ? "Actualizando..."
                  : "Creando..."
                : taskId
                ? "Actualizar Tarea"
                : "Guardar Tarea"}
            </span>
          </button>
        </form>
      </RetroWindow>
    </div>
  );
};

export default TaskForm;
