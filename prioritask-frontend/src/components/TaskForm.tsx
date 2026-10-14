import { useState, useEffect, useMemo, useRef } from "react";
import api from "../api";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import Select from "react-select";
import { useTaskUpdate } from "../context/TaskUpdateContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useRoom } from "../context/RoomContext";
import { getCurrentRoomId } from "../utils/room";
import { toggleMemberTaskAssignmentLocal } from "../utils/kudosStore";
import { getModernSelectStyles } from "../utils/selectStyles";
import { parseNaturalTaskInput } from "../utils/nlpTaskParser";
import {
  parseRecurrenceExpression,
  formatRecurrenceRule,
  previewUpcomingOccurrences,
  toISODateString,
  type RecurrenceMode,
  type RecurrenceRuleConfig,
} from "../utils/recurrenceEngine";
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

type BackendRecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

const PRIORITY_LEVELS = [
  { level: 1, label: "Baja", color: "#10b981", activeBg: "#10b981", textColor: "#ffffff" },
  { level: 2, label: "Media Baja", color: "#06b6d4", activeBg: "#06b6d4", textColor: "#ffffff" },
  { level: 3, label: "Media", color: "#f59e0b", activeBg: "#f59e0b", textColor: "#1e293b" },
  { level: 4, label: "Alta", color: "#f97316", activeBg: "#f97316", textColor: "#ffffff" },
  { level: 5, label: "Urgente", color: "#ef4444", activeBg: "#ef4444", textColor: "#ffffff" },
];

const RECURRENCE_PRESETS = [
  { label: "Cada semana (fija)", expr: "cada semana" },
  { label: "Cada! 7 días (al completar)", expr: "cada! 7 días" },
  { label: "Cada mes (fija)", expr: "cada mes" },
  { label: "Cada! 2 semanas (al completar)", expr: "cada! 2 semanas" },
];

const TaskForm = () => {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [estado, setEstado] = useState("TODO");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>("FIXED");
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<BackendRecurrenceFrequency>("WEEKLY");
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>("");
  const [resetSubtasksOnAdvance, setResetSubtasksOnAdvance] = useState<boolean>(true);
  const [recurrenceDslInput, setRecurrenceDslInput] = useState<string>("");
  const [recurrenceDslFeedback, setRecurrenceDslFeedback] = useState<string>("");
  const [error, setError] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<{ value: string; label: string }[]>([]);
  const [sugerencia, setSugerencia] = useState<AISuggestion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifyUpdate } = useTaskUpdate();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { rooms } = useRoom();

  const prefillAppliedRef = useRef(false);
  const prefillTagsHydratedRef = useRef(false);
  const [prefillRoomId, setPrefillRoomId] = useState<string | null>(null);
  const [prefillAssigneeId, setPrefillAssigneeId] = useState<string | null>(null);
  const [prefillTagIds, setPrefillTagIds] = useState<string[]>([]);
  const [prefillTagNames, setPrefillTagNames] = useState<string[]>([]);

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

  const applyDslExpression = (expr: string) => {
    setRecurrenceDslInput(expr);
    const trimmed = expr.trim();
    if (!trimmed) {
      setRecurrenceDslFeedback("");
      return;
    }
    const parsed = parseRecurrenceExpression(trimmed);
    if (!parsed) {
      setRecurrenceDslFeedback(
        "Expresión no reconocida. Prueba: 'cada! 7 días', 'every week', 'cada 2 meses'."
      );
      return;
    }
    setRecurrenceMode(parsed.mode);
    if (parsed.frequency === "DAILY" || parsed.frequency === "WORKDAYS") {
      setRecurrenceFrequency("DAILY");
      setRecurrenceInterval(parsed.interval);
    } else if (parsed.frequency === "WEEKLY") {
      setRecurrenceFrequency("WEEKLY");
      setRecurrenceInterval(parsed.interval);
    } else if (parsed.frequency === "MONTHLY") {
      setRecurrenceFrequency("MONTHLY");
      setRecurrenceInterval(parsed.interval);
    } else if (parsed.frequency === "YEARLY") {
      setRecurrenceFrequency("MONTHLY");
      setRecurrenceInterval(Math.min(365, parsed.interval * 12));
    }
    if (parsed.endDate instanceof Date) {
      setRecurrenceEndDate(toISODateString(parsed.endDate));
    }
    setRecurrenceDslFeedback(`Regla detectada: ${formatRecurrenceRule(parsed)}`);
  };

  useEffect(() => {
    if (taskId || prefillAppliedRef.current) return;
    const stateObj = location.state as
      | {
          prefill?: {
            titulo?: string;
            descripcion?: string;
            categoria?: string;
            peso?: number;
            dueDate?: string;
            recurrenceExpr?: string;
            roomId?: string | null;
            tagIds?: string[];
            tags?: string[];
            assigneeId?: string | null;
          };
        }
      | null
      | undefined;

    const prefill = stateObj?.prefill;
    if (!prefill) return;
    prefillAppliedRef.current = true;

    if (prefill.titulo) setTitulo(prefill.titulo);
    if (prefill.descripcion) setDescripcion(prefill.descripcion);
    if (prefill.categoria) setCategoria(prefill.categoria);
    if (typeof prefill.peso === "number") setPeso(prefill.peso);
    if (prefill.dueDate) setDueDate(prefill.dueDate);
    if (prefill.roomId) setPrefillRoomId(prefill.roomId);
    if (prefill.assigneeId) setPrefillAssigneeId(prefill.assigneeId);
    if (Array.isArray(prefill.tagIds) && prefill.tagIds.length > 0) {
      setPrefillTagIds(prefill.tagIds);
    }
    if (Array.isArray(prefill.tags) && prefill.tags.length > 0) {
      setPrefillTagNames(prefill.tags);
    }
    if (prefill.recurrenceExpr) {
      setIsRecurring(true);
      applyDslExpression(prefill.recurrenceExpr);
    }
  }, [taskId, location.state]);

  useEffect(() => {
    if (taskId || prefillTagsHydratedRef.current || tags.length === 0) return;
    if (prefillTagIds.length === 0 && prefillTagNames.length === 0) return;

    prefillTagsHydratedRef.current = true;
    const normalizeTagKey = (val: string): string =>
      val
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    const normNames = prefillTagNames.map((n) => normalizeTagKey(n));
    const matched = tags.filter(
      (t) =>
        prefillTagIds.includes(t.id) ||
        normNames.includes(normalizeTagKey(t.nombre))
    );

    if (matched.length > 0) {
      setSelectedTags((prev) => {
        const existingIds = new Set(prev.map((item) => item.value));
        const merged = [...prev];
        for (const tg of matched) {
          if (!existingIds.has(tg.id)) {
            merged.push({ value: tg.id, label: tg.nombre });
            existingIds.add(tg.id);
          }
        }
        return merged;
      });
    }
  }, [taskId, tags, prefillTagIds, prefillTagNames]);

  const activeRecurrenceRuleConfig = useMemo<RecurrenceRuleConfig>(
    () => ({
      frequency: recurrenceFrequency,
      interval: Math.max(1, Math.min(365, recurrenceInterval || 1)),
      mode: recurrenceMode,
      endDate: recurrenceEndDate || null,
      resetSubtasks: resetSubtasksOnAdvance,
    }),
    [
      recurrenceFrequency,
      recurrenceInterval,
      recurrenceMode,
      recurrenceEndDate,
      resetSubtasksOnAdvance,
    ]
  );

  const upcomingPreviewDates = useMemo(() => {
    if (!isRecurring) return [];
    const baseDate = dueDate && !dateError ? dueDate : today;
    try {
      return previewUpcomingOccurrences(baseDate, activeRecurrenceRuleConfig, 4).map(
        (d) => toISODateString(d)
      );
    } catch {
      return [];
    }
  }, [isRecurring, dueDate, dateError, today, activeRecurrenceRuleConfig]);

  const nlpContext = useMemo(
    () => ({
      rooms: rooms.map((r) => ({ id: r.id, nombre: r.nombre })),
      tags: tags.map((t) => ({ id: t.id, nombre: t.nombre })),
    }),
    [rooms, tags]
  );

  const nlpResult = useMemo(
    () => parseNaturalTaskInput(titulo, new Date(), nlpContext),
    [titulo, nlpContext]
  );

  const handleApplyTokens = () => {
    if (!nlpResult.tokens.length) return;

    if (nlpResult.dueDate) {
      setDueDate(nlpResult.dueDate);
      setDateError("");
    }
    if (typeof nlpResult.peso === "number") {
      setPeso(nlpResult.peso);
    }
    if (nlpResult.categoria) {
      setCategoria(nlpResult.categoria);
    }
    if (nlpResult.roomId) {
      setPrefillRoomId(nlpResult.roomId);
    }
    if (nlpResult.assigneeId) {
      setPrefillAssigneeId(nlpResult.assigneeId);
    }
    if (nlpResult.recurrenceExpr) {
      setIsRecurring(true);
      applyDslExpression(nlpResult.recurrenceExpr);
    }
    if (nlpResult.tagIds && nlpResult.tagIds.length > 0) {
      const matched = tags.filter((t) => nlpResult.tagIds?.includes(t.id));
      if (matched.length > 0) {
        setSelectedTags((prev) => {
          const existingIds = new Set(prev.map((item) => item.value));
          const merged = [...prev];
          for (const tg of matched) {
            if (!existingIds.has(tg.id)) {
              merged.push({ value: tg.id, label: tg.nombre });
              existingIds.add(tg.id);
            }
          }
          return merged;
        });
      }
    }
    if (nlpResult.tags && nlpResult.tags.length > 0) {
      setPrefillTagNames((prev) =>
        Array.from(new Set([...prev, ...(nlpResult.tags || [])]))
      );
    }

    setTitulo(nlpResult.cleanTitle);
    toast.success("Tokens aplicados al formulario");
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && !e.shiftKey && nlpResult.tokens.length > 0) {
      e.preventDefault();
      handleApplyTokens();
    }
  };

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
          setDueDate(due_date ? String(due_date).slice(0, 10) : "");
          setEstado(estado);
          setIsRecurring(Boolean(response.data.is_recurring));

          if (response.data.recurrence_rule) {
            const rule = response.data.recurrence_rule;
            if (rule.mode === "FIXED" || rule.mode === "FLOATING") {
              setRecurrenceMode(rule.mode);
            }
            if (
              rule.frequency === "DAILY" ||
              rule.frequency === "WEEKLY" ||
              rule.frequency === "MONTHLY"
            ) {
              setRecurrenceFrequency(rule.frequency);
            }
            if (typeof rule.interval === "number" && rule.interval >= 1) {
              setRecurrenceInterval(rule.interval);
            }
            if (rule.end_date) {
              setRecurrenceEndDate(String(rule.end_date).slice(0, 10));
            }
            if (typeof rule.reset_subtasks === "boolean") {
              setResetSubtasksOnAdvance(rule.reset_subtasks);
            }
          }

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

      if (isRecurring) {
        payload.recurrence_rule = {
          frequency: recurrenceFrequency,
          interval: Math.max(1, Math.min(365, recurrenceInterval || 1)),
          mode: recurrenceMode,
          end_date: recurrenceEndDate ? `${recurrenceEndDate}T23:59:59Z` : null,
          reset_subtasks: resetSubtasksOnAdvance,
        };
      }

      if (!taskId) {
        const activeRoomId = prefillRoomId || getCurrentRoomId();
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

      if (!taskId && createdTaskId && prefillAssigneeId) {
        const effectiveRoomForAssign =
          prefillRoomId || getCurrentRoomId() || "default";
        toggleMemberTaskAssignmentLocal(effectiveRoomForAssign, createdTaskId, {
          userId: prefillAssigneeId,
          label: prefillAssigneeId,
        });
        api
          .post("/tasks/assign", {
            task_id: createdTaskId,
            user_id: prefillAssigneeId,
          })
          .catch(() => {});
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
              onKeyDown={handleTitleKeyDown}
              placeholder="Ej. Limpiar la cocina a fondo"
              required
              disabled={isSubmitting}
            />

            {/* Barra sutil de asistencia de tokens NLP */}
            {nlpResult.tokens.length > 0 && (
              <div
                className="d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 mt-2 rounded-3 border"
                style={{
                  backgroundColor: "var(--bg-subtle)",
                  borderColor: "var(--border-default)",
                  fontSize: "12px",
                }}
                data-testid="nlp-assistant-bar"
                role="region"
                aria-label="Asistente de tokens detectados"
              >
                <div className="d-flex flex-wrap align-items-center gap-1">
                  <span className="text-muted fw-semibold me-1 d-flex align-items-center gap-1">
                    <LuSparkles size={13} className="text-primary" />
                    <span>Detectado:</span>
                  </span>
                  {nlpResult.tokens.map((tok, idx) => {
                    let badgeText = tok.label;
                    if (tok.type === "priority") {
                      const cleanPrio = tok.label.includes("·")
                        ? tok.label.split("·")[1].trim()
                        : tok.label;
                      badgeText = `Prioridad: ${cleanPrio}`;
                    } else if (tok.type === "date") {
                      badgeText = `Vence: ${tok.label}`;
                    } else if (tok.type === "room") {
                      const cleanRoom = tok.label
                        .replace(/^[~#]/, "")
                        .replace(/^["']|["']$/g, "")
                        .trim();
                      badgeText = `Sala: ${cleanRoom}`;
                    } else if (tok.type === "category") {
                      badgeText = `Categoría: ${tok.label.replace(/^#/, "")}`;
                    } else if (tok.type === "time") {
                      badgeText = `Hora: ${tok.label}`;
                    } else if (tok.type === "tag") {
                      badgeText = `Etiqueta: ${tok.label}`;
                    } else if (tok.type === "assignee") {
                      badgeText = `Asignado: ${tok.label.replace(/^\+/, "").replace(/^["']|["']$/g, "")}`;
                    } else if (tok.type === "recurrence") {
                      badgeText = `Rutina: ${tok.label}`;
                    }

                    return (
                      <span
                        key={`${tok.type}-${tok.raw}-${idx}`}
                        className="badge d-inline-flex align-items-center gap-1 px-2 py-1"
                        style={{
                          backgroundColor: "var(--bg-card, #ffffff)",
                          color: "var(--text-main, #1e293b)",
                          border: "1px solid var(--border-default, #cbd5e1)",
                          fontWeight: 500,
                          fontSize: "11px",
                        }}
                        data-testid={`nlp-token-badge-${tok.type}`}
                      >
                        {badgeText}
                      </span>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 px-2 py-1"
                  style={{
                    borderRadius: "8px",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                  onClick={handleApplyTokens}
                  data-testid="apply-nlp-tokens-btn"
                  aria-label="Aplicar tokens al formulario"
                  title="Aplicar tokens detectados al formulario (o pulsa Tab)"
                >
                  <LuSparkles size={12} />
                  <span>✨ Aplicar tokens al formulario</span>
                </button>
              </div>
            )}
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
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
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
          <div className="form-check form-switch mb-3 d-flex align-items-center gap-2 ps-0">
            <input
              id="task-recurring"
              type="checkbox"
              className="form-check-input ms-0 me-2"
              role="switch"
              aria-expanded={isRecurring}
              aria-controls="recurrence-config-panel"
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

          {/* Panel Interactivo de Configuración de Recurrencia (Fija vs. Flotante + DSL + Previsualización) */}
          {isRecurring && (
            <div
              id="recurrence-config-panel"
              data-testid="recurrence-config-panel"
              className="p-3 mb-4 rounded-3 border"
              style={{
                backgroundColor: "var(--bg-subtle)",
                borderColor: "var(--border-default)",
              }}
            >
              {/* 1. Entrada inteligente en Lenguaje Natural (DSL estilo Todoist ES/EN) */}
              <div className="mb-3">
                <label
                  htmlFor="recurrence-dsl"
                  className="form-label fw-semibold mb-1"
                  style={{ fontSize: "13px" }}
                >
                  Expresión rápida (estilo Todoist: &quot;every&quot; o &quot;every!&quot; / &quot;cada&quot; o &quot;cada!&quot;)
                </label>
                <input
                  id="recurrence-dsl"
                  type="text"
                  className="form-control"
                  style={{
                    borderRadius: "10px",
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--text-main)",
                    minHeight: "42px",
                    fontSize: "13px",
                  }}
                  value={recurrenceDslInput}
                  onChange={(e) => applyDslExpression(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      applyDslExpression(recurrenceDslInput);
                    }
                  }}
                  placeholder="Ej. cada! 7 días, every week, cada 2 meses hasta 2026-12-31..."
                  disabled={isSubmitting}
                />
                {recurrenceDslFeedback && (
                  <div className="small text-muted mt-1" data-testid="recurrence-dsl-feedback">
                    {recurrenceDslFeedback}
                  </div>
                )}
                <div className="d-flex flex-wrap gap-1 mt-2">
                  {RECURRENCE_PRESETS.map((preset) => (
                    <button
                      key={preset.expr}
                      type="button"
                      className="btn btn-sm"
                      style={{
                        fontSize: "11px",
                        borderRadius: "8px",
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-main)",
                      }}
                      onClick={() => applyDslExpression(preset.expr)}
                      disabled={isSubmitting}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Selector de Modo: Fija de Calendario (every) vs. Flotante al Completar (every!) */}
              <div className="mb-3">
                <label className="form-label fw-semibold d-block mb-2" style={{ fontSize: "13px" }}>
                  Modo de cálculo de repetición
                </label>
                <div
                  className="row g-2"
                  role="radiogroup"
                  aria-label="Modo de recurrencia"
                >
                  <div className="col-12 col-md-6">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={recurrenceMode === "FIXED"}
                      data-testid="recurrence-mode-FIXED"
                      className="btn w-100 text-start p-2"
                      style={{
                        minHeight: "56px",
                        borderRadius: "10px",
                        border: `2px solid ${
                          recurrenceMode === "FIXED"
                            ? "var(--primary-500, #3b82f6)"
                            : "var(--border-default)"
                        }`,
                        backgroundColor: "var(--bg-surface)",
                        color: "var(--text-main)",
                      }}
                      onClick={() => setRecurrenceMode("FIXED")}
                      disabled={isSubmitting}
                    >
                      <div className="fw-bold" style={{ fontSize: "13px" }}>
                        📅 Fija de calendario (every)
                      </div>
                      <div className="text-muted" style={{ fontSize: "11px" }}>
                        Mantiene la cadencia fija respecto a la fecha programada.
                      </div>
                    </button>
                  </div>
                  <div className="col-12 col-md-6">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={recurrenceMode === "FLOATING"}
                      data-testid="recurrence-mode-FLOATING"
                      className="btn w-100 text-start p-2"
                      style={{
                        minHeight: "56px",
                        borderRadius: "10px",
                        border: `2px solid ${
                          recurrenceMode === "FLOATING"
                            ? "var(--primary-500, #3b82f6)"
                            : "var(--border-default)"
                        }`,
                        backgroundColor: "var(--bg-surface)",
                        color: "var(--text-main)",
                      }}
                      onClick={() => setRecurrenceMode("FLOATING")}
                      disabled={isSubmitting}
                    >
                      <div className="fw-bold" style={{ fontSize: "13px" }}>
                        ⚡ Flotante al completar (every!)
                      </div>
                      <div className="text-muted" style={{ fontSize: "11px" }}>
                        Calcula el próximo vencimiento a partir del día real de finalización.
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Controles de Frecuencia, Intervalo y Fecha Límite de la Serie */}
              <div className="row g-2 mb-3">
                <div className="col-6 col-md-4">
                  <label
                    htmlFor="recurrence-interval"
                    className="form-label fw-semibold mb-1"
                    style={{ fontSize: "12px" }}
                  >
                    Repetir cada
                  </label>
                  <input
                    id="recurrence-interval"
                    type="number"
                    min={1}
                    max={365}
                    className="form-control"
                    style={{
                      borderRadius: "10px",
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-main)",
                      minHeight: "40px",
                      fontSize: "13px",
                    }}
                    value={recurrenceInterval}
                    onChange={(e) =>
                      setRecurrenceInterval(
                        Math.max(1, Math.min(365, Number(e.target.value) || 1))
                      )
                    }
                    disabled={isSubmitting}
                  />
                </div>

                <div className="col-6 col-md-4">
                  <label
                    htmlFor="recurrence-frequency"
                    className="form-label fw-semibold mb-1"
                    style={{ fontSize: "12px" }}
                  >
                    Unidad
                  </label>
                  <select
                    id="recurrence-frequency"
                    className="form-select"
                    style={{
                      borderRadius: "10px",
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-main)",
                      minHeight: "40px",
                      fontSize: "13px",
                    }}
                    value={recurrenceFrequency}
                    onChange={(e) =>
                      setRecurrenceFrequency(e.target.value as BackendRecurrenceFrequency)
                    }
                    disabled={isSubmitting}
                  >
                    <option value="DAILY">Días</option>
                    <option value="WEEKLY">Semanas</option>
                    <option value="MONTHLY">Meses</option>
                  </select>
                </div>

                <div className="col-12 col-md-4">
                  <label
                    htmlFor="recurrence-end-date"
                    className="form-label fw-semibold mb-1"
                    style={{ fontSize: "12px" }}
                  >
                    Finaliza el (opcional)
                  </label>
                  <input
                    id="recurrence-end-date"
                    type="date"
                    className="form-control"
                    style={{
                      borderRadius: "10px",
                      borderColor: "var(--border-default)",
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-main)",
                      minHeight: "40px",
                      fontSize: "13px",
                    }}
                    value={recurrenceEndDate}
                    min={dueDate || today}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* 4. Opción para auto-reiniciar subtareas en cada ciclo */}
              <div className="form-check mb-3">
                <input
                  id="recurrence-reset-subtasks"
                  type="checkbox"
                  className="form-check-input"
                  checked={resetSubtasksOnAdvance}
                  onChange={(e) => setResetSubtasksOnAdvance(e.target.checked)}
                  disabled={isSubmitting}
                />
                <label
                  htmlFor="recurrence-reset-subtasks"
                  className="form-check-label small"
                  style={{ cursor: "pointer" }}
                >
                  Reiniciar automáticamente el checklist de subtareas al avanzar de ciclo
                </label>
              </div>

              {/* 5. Resumen activo y previsualización de próximas ocurrencias */}
              <div
                className="p-2 rounded border d-flex flex-column gap-1"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-default)",
                  fontSize: "12px",
                }}
              >
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-1">
                  <span className="fw-semibold" data-testid="recurrence-formatted-summary">
                    🔄 {formatRecurrenceRule(activeRecurrenceRuleConfig)}
                  </span>
                  <span className="text-muted">
                    {recurrenceMode === "FLOATING"
                      ? "Se recalculará desde la fecha en que la completes"
                      : "Anclada al calendario original"}
                  </span>
                </div>
                {upcomingPreviewDates.length > 0 && (
                  <div className="d-flex align-items-center flex-wrap gap-1 mt-1">
                    <span className="text-muted me-1">Próximos ciclos:</span>
                    {upcomingPreviewDates.map((dtStr) => (
                      <span
                        key={dtStr}
                        className="badge rounded-pill bg-light text-dark border"
                        data-testid="recurrence-preview-chip"
                      >
                        {dtStr}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

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
