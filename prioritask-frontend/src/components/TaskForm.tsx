import { useState, useEffect } from "react";
import api from "../api";
import { useNavigate, useParams, Link } from "react-router-dom";
import Select from "react-select";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { getCurrentRoomId } from "../utils/room";
import { getModernSelectStyles } from "../utils/selectStyles";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import TaskChecklist from "./tasks/TaskChecklist";
import TaskCommentsSection from "./tasks/TaskCommentsSection";
import TaskAttachmentsSection from "./tasks/TaskAttachmentsSection";
import type { Tag } from "../types/task";
import {
  LuSparkles,
  LuArrowLeft,
  LuCheck,
  LuRepeat,
  LuTag,
  LuLayers,
  LuListChecks,
  LuPlus,
  LuTrash2,
  LuCalendar,
} from "react-icons/lu";

interface AISuggestion {
  prioridad: string;
  motivo: string;
}

const PRIORITY_LEVELS = [
  { level: 1, label: "Baja", color: "#10b981", activeBg: "#10b981", textColor: "#ffffff" },
  { level: 2, label: "Media Baja", color: "#06b6d4", activeBg: "#06b6d4", textColor: "#ffffff" },
  { level: 3, label: "Media", color: "#f59e0b", activeBg: "#f59e0b", textColor: "#1e293b" },
  { level: 4, label: "Alta", color: "#f97316", activeBg: "#f97316", textColor: "#ffffff" },
  { level: 5, label: "Urgente", color: "#ef4444", activeBg: "#ef4444", textColor: "#ffffff" },
];

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const { taskId } = useParams();
  const navigate = useNavigate();
  const { notifyUpdate } = useTaskUpdate();
  const { theme } = useTheme();
  const { toast } = useToast();

  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [draftSubtaskInput, setDraftSubtaskInput] = useState("");

  const handleAddDraftSubtask = () => {
    const val = draftSubtaskInput.trim();
    if (!val) return;
    setDraftSubtasks((prev) => [...prev, val]);
    setDraftSubtaskInput("");
  };

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

  const handleSetQuickDate = (daysToAdd: number) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysToAdd);
    const dateStr = targetDate.toISOString().split("T")[0];
    setDateError("");
    setDueDate(dateStr);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanTitulo = titulo.trim();
    if (!cleanTitulo) {
      setError("El título de la tarea es obligatorio y no puede contener solo espacios.");
      return;
    }

    if (dateError) {
      setError("Corrige la fecha de vencimiento antes de guardar.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        titulo: cleanTitulo,
        descripcion: descripcion.trim() || undefined,
        categoria,
        peso,
        due_date: dueDate ? formatearFecha(dueDate) : null,
        estado,
        tag_ids: selectedTags.map((t) => t.value),
        is_recurring: isRecurring,
      };

      if (!taskId) {
        const activeRoomId = getCurrentRoomId();
        if (activeRoomId) {
          payload.room_id = activeRoomId;
        }
      }

      let createdTaskId = taskId;
      if (taskId) {
        await api.put(`/tasks/${taskId}`, payload);
      } else {
        const res = await api.post<{ id: string }>("/tasks", payload);
        createdTaskId = res.data.id;
      }

      if (!taskId && createdTaskId && draftSubtasks.length > 0) {
        for (let i = 0; i < draftSubtasks.length; i++) {
          try {
            await api.post(`/tasks/${createdTaskId}/subtasks`, {
              titulo: draftSubtasks[i],
              orden: i,
            });
          } catch (stErr) {
            console.error("Error al asociar subtarea inicial:", stErr);
          }
        }
      }

      notifyUpdate();
      toast.success(
        taskId ? "Tarea actualizada correctamente" : "Tarea creada correctamente"
      );
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
        setError("Error al guardar la tarea. Revisa los campos requeridos.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectStyles = getModernSelectStyles<{ value: string; label: string }, true>(theme);

  return (
    <div className="container-fluid py-2" style={{ maxWidth: "780px" }}>
      {/* Cabecera */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link
              to="/tasks"
              className="text-muted d-flex align-items-center gap-1 text-decoration-none small"
              title="Volver a la lista de tareas"
            >
              <LuArrowLeft size={16} />
              <span>Tareas</span>
            </Link>
          </div>
          <h2 className="fw-bold mb-1" style={{ fontSize: "24px" }}>
            {taskId ? "Editar Tarea" : "Nueva Tarea"}
          </h2>
          <p className="text-muted mb-0" style={{ fontSize: "14px" }}>
            {taskId
              ? "Actualiza los detalles, asignación y estado de la tarea."
              : "Crea y prioriza una nueva actividad para organizar tu hogar."}
          </p>
        </div>

        <Link to="/tasks">
          <Button variant="outline" size="sm" leftIcon={<LuArrowLeft size={14} />}>
            Volver
          </Button>
        </Link>
      </div>

      <Card
        title={taskId ? "Detalles de la Tarea" : "Formulario de Creación"}
        subtitle="Los campos marcados con asterisco (*) son obligatorios"
        icon={<LuLayers size={18} className="text-primary" />}
        className="mb-4"
      >
        {error && (
          <div className="alert alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Título */}
          <div className="mb-3">
            <label htmlFor="titulo" className="form-label fw-semibold" style={{ fontSize: "13px" }}>
              Título de la tarea *
            </label>
            <input
              id="titulo"
              type="text"
              className="form-control"
              style={{
                borderRadius: "10px",
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-main)",
                minHeight: "42px",
                fontSize: "14px",
              }}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Limpiar la cocina a fondo"
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Descripción */}
          <div className="mb-3">
            <label htmlFor="descripcion" className="form-label fw-semibold" style={{ fontSize: "13px" }}>
              Descripción
            </label>
            <textarea
              id="descripcion"
              className="form-control"
              style={{
                borderRadius: "10px",
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-main)",
                minHeight: "88px",
                fontSize: "14px",
              }}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles sobre lo que se necesita hacer..."
              disabled={isSubmitting}
            />
          </div>

          {/* Categoría */}
          <div className="mb-3">
            <label htmlFor="categoria" className="form-label fw-semibold" style={{ fontSize: "13px" }}>
              Categoría
            </label>
            <select
              id="categoria"
              className="form-select"
              style={{
                borderRadius: "10px",
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-main)",
                minHeight: "42px",
                fontSize: "14px",
              }}
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

          {/* Control Segmentado Táctil de Prioridad (44px alto para ergonomía móvil) */}
          <div className="mb-3">
            <label className="form-label fw-semibold d-block mb-2" style={{ fontSize: "13px" }}>
              Nivel de Prioridad / Peso (1 = Baja, 5 = Urgente) *
            </label>
            <div
              className="d-grid gap-2"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
              }}
              role="radiogroup"
              aria-label="Selección de nivel de prioridad"
            >
              {PRIORITY_LEVELS.map((item) => {
                const isSelected = peso === item.level;
                return (
                  <button
                    key={item.level}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className="btn d-flex flex-column align-items-center justify-content-center px-2 py-1"
                    style={{
                      minHeight: "44px",
                      borderRadius: "10px",
                      border: `2px solid ${isSelected ? item.activeBg : "var(--border-default)"}`,
                      backgroundColor: isSelected ? item.activeBg : "var(--bg-subtle)",
                      color: isSelected ? item.textColor : "var(--text-main)",
                      fontWeight: isSelected ? 700 : 500,
                      transition: "all 0.15s ease",
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                    }}
                    onClick={() => !isSubmitting && setPeso(item.level)}
                    disabled={isSubmitting}
                    data-testid={`priority-btn-${item.level}`}
                  >
                    <span style={{ fontSize: "14px", lineHeight: "1.1" }}>
                      {item.level}
                    </span>
                    <span style={{ fontSize: "11px", opacity: 0.9 }}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Input oculto para sincronización con pruebas basadas en formulario estándar */}
            <input
              type="hidden"
              id="peso"
              name="peso"
              value={peso}
            />
          </div>

          {/* Botón de Asistente IA */}
          <div className="mb-3">
            <Button
              type="button"
              variant="ai"
              size="md"
              leftIcon={<LuSparkles size={16} />}
              onClick={handleSuggest}
              isLoading={isSuggesting}
              disabled={isSuggesting || isSubmitting}
              className="w-100"
            >
              {isSuggesting ? "Analizando con IA..." : "Sugerir prioridad con IA"}
            </Button>
          </div>

          {/* Banner de sugerencia IA */}
          {sugerencia && (
            <div
              className="p-3 mb-3 border rounded-3"
              style={{
                backgroundColor: "var(--ai-50)",
                borderColor: "rgba(139, 92, 246, 0.3)",
              }}
              role="alert"
            >
              <div className="fw-bold mb-1 d-flex align-items-center gap-2" style={{ color: "var(--ai-600)" }}>
                <LuSparkles size={16} />
                <span>Sugerencia IA: Prioridad {sugerencia.prioridad.toUpperCase()}</span>
              </div>
              <p className="mb-0 small text-muted">{sugerencia.motivo}</p>
            </div>
          )}

          {/* Fecha y Estado con Chips Táctiles de Acceso Rápido */}
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label htmlFor="dueDate" className="form-label fw-semibold mb-0" style={{ fontSize: "13px" }}>
                  Fecha de vencimiento
                </label>
              </div>

              {/* Chips táctiles de acceso rápido: [ Hoy ], [ Mañana ], [ Próx. Semana ] */}
              <div className="d-flex gap-1 mb-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    minHeight: "36px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-main)",
                  }}
                  onClick={() => handleSetQuickDate(0)}
                  disabled={isSubmitting}
                  title="Establecer para hoy"
                >
                  <LuCalendar size={12} className="me-1" />
                  Hoy
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    minHeight: "36px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-main)",
                  }}
                  onClick={() => handleSetQuickDate(1)}
                  disabled={isSubmitting}
                  title="Establecer para mañana"
                >
                  Mañana
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    minHeight: "36px",
                    fontSize: "12px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-main)",
                  }}
                  onClick={() => handleSetQuickDate(7)}
                  disabled={isSubmitting}
                  title="Establecer para dentro de una semana"
                >
                  Próx. Semana
                </button>
              </div>

              <div className="input-group">
                <input
                  id="dueDate"
                  type="date"
                  className={`form-control ${dateError ? "is-invalid" : ""}`}
                  style={{
                    borderRadius: "10px",
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-subtle)",
                    color: "var(--text-main)",
                    minHeight: "42px",
                    fontSize: "14px",
                  }}
                  value={dueDate}
                  min={today}
                  onChange={handleDueDateChange}
                  disabled={isSubmitting}
                />
              </div>
              {dateError && <div className="invalid-feedback d-block">{dateError}</div>}
            </div>

            <div className="col-12 col-md-6">
              <label htmlFor="estado-task" className="form-label fw-semibold" style={{ fontSize: "13px" }}>
                Estado
              </label>
              <select
                id="estado-task"
                className="form-select"
                style={{
                  borderRadius: "10px",
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  minHeight: "42px",
                  fontSize: "14px",
                }}
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

          {/* Etiquetas */}
          <div className="mb-3">
            <label className="form-label fw-semibold d-flex align-items-center gap-1" style={{ fontSize: "13px" }}>
              <LuTag size={14} className="text-muted" />
              <span>Etiquetas</span>
            </label>
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
              placeholder="Seleccionar o buscar etiquetas..."
            />
          </div>

          {/* Subtareas / Checklist */}
          {taskId ? (
            <div className="mb-4">
              <label
                className="form-label fw-semibold d-flex align-items-center gap-1 mb-2"
                style={{ fontSize: "13px" }}
              >
                <LuListChecks size={15} className="text-primary" />
                <span>Subtareas y Checklist</span>
              </label>
              <TaskChecklist taskId={taskId} />

              <div className="mt-4 pt-3 border-top">
                <TaskCommentsSection taskId={taskId} />
              </div>

              <div className="mt-4 pt-3 border-top">
                <TaskAttachmentsSection taskId={taskId} />
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <label
                className="form-label fw-semibold d-flex align-items-center gap-1 mb-1"
                style={{ fontSize: "13px" }}
              >
                <LuListChecks size={15} className="text-primary" />
                <span>Subtareas iniciales (opcional)</span>
              </label>
              <p className="text-muted small mb-2">
                Añade pasos o ítems para este trabajo antes de crearlo.
              </p>
              <div className="d-flex gap-2 mb-2">
                <input
                  type="text"
                  className="form-control"
                  style={{
                    borderRadius: "10px",
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-subtle)",
                    color: "var(--text-main)",
                    minHeight: "40px",
                    fontSize: "13px",
                  }}
                  value={draftSubtaskInput}
                  onChange={(e) => setDraftSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddDraftSubtask();
                    }
                  }}
                  placeholder="Escribe una subtarea y presiona Enter..."
                  disabled={isSubmitting}
                  maxLength={100}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleAddDraftSubtask}
                  disabled={!draftSubtaskInput.trim() || isSubmitting}
                >
                  <LuPlus size={15} />
                  <span>Añadir</span>
                </Button>
              </div>

              {draftSubtasks.length > 0 && (
                <div
                  className="d-flex flex-column gap-1 p-2 rounded"
                  style={{
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {draftSubtasks.map((st, idx) => (
                    <div
                      key={idx}
                      className="d-flex align-items-center justify-content-between px-3 py-2 rounded"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-default)",
                        fontSize: "13px",
                      }}
                    >
                      <span className="text-truncate">
                        <span className="text-muted me-2">#{idx + 1}</span>
                        {st}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0"
                        onClick={() =>
                          setDraftSubtasks((prev) => prev.filter((_, i) => i !== idx))
                        }
                        disabled={isSubmitting}
                        title="Eliminar subtarea"
                      >
                        <LuTrash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Switch de Tarea Recurrente */}
          <div className="form-check form-switch mb-4 d-flex align-items-center gap-2 ps-0">
            <input
              id="task-recurring"
              type="checkbox"
              className="form-check-input ms-0 me-2"
              role="switch"
              style={{ width: "38px", height: "20px", cursor: "pointer" }}
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              disabled={isSubmitting}
            />
            <label htmlFor="task-recurring" className="form-check-label fw-semibold" style={{ cursor: "pointer", fontSize: "14px" }}>
              <span className="d-flex align-items-center gap-1">
                <LuRepeat size={14} className="text-primary" />
                <span>Tarea recurrente (se reiniciará automáticamente tras completarse)</span>
              </span>
            </label>
          </div>

          {/* Botones de acción */}
          <div className="d-flex justify-content-end gap-2 pt-3 border-top">
            <Link to="/tasks">
              <Button variant="ghost" size="md" disabled={isSubmitting}>
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={<LuCheck size={16} />}
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {taskId ? "Actualizar Tarea" : "Crear Tarea"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default TaskForm;
