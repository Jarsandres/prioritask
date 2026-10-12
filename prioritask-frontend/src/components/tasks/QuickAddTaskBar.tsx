import React, { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../../api";
import { useRoom } from "../../context/RoomContext";
import { useTaskUpdate } from "../../context/TaskUpdateContext";
import { useToast } from "../../context/ToastContext";
import {
  parseRecurrenceExpression,
  formatRecurrenceRule,
  toISODateString,
  type RecurrenceMode,
} from "../../utils/recurrenceEngine";
import {
  parseNaturalTaskInput,
  getTriggerSuggestions,
  type NlpSuggestionItem,
} from "../../utils/nlpTaskParser";
import { toggleMemberTaskAssignmentLocal } from "../../utils/kudosStore";
import type { Task, Tag } from "../../types/task";
import {
  LuPlus,
  LuCalendar,
  LuFlag,
  LuSparkles,
  LuRepeat,
  LuHouse,
  LuX,
  LuMaximize2,
  LuCheck,
  LuLoaderCircle,
  LuTag,
  LuWand,
  LuHash,
  LuUser,
} from "react-icons/lu";
import "./tasks.css";

export interface QuickAddTaskBarProps {
  roomId?: string | null;
  onTaskCreated?: (task: Task) => void;
  defaultOpen?: boolean;
  className?: string;
}

interface PriorityOption {
  peso: number;
  code: string;
  label: string;
  color: string;
}

const TODOIST_PRIORITIES: PriorityOption[] = [
  { peso: 5, code: "P1", label: "Urgente", color: "#dc2626" },
  { peso: 4, code: "P2", label: "Alta", color: "#ea580c" },
  { peso: 3, code: "P3", label: "Media", color: "#d97706" },
  { peso: 2, code: "P4", label: "Media-Baja", color: "#2563eb" },
  { peso: 1, code: "P5", label: "Baja", color: "#64748b" },
];

const CATEGORIES = [
  { value: "LIMPIEZA", label: "Limpieza" },
  { value: "COMPRA", label: "Compra" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "OTRO", label: "Otro" },
];

const QUICK_RECURRENCE_CHIPS = [
  { label: "Cada día", expr: "cada día" },
  { label: "Cada semana", expr: "cada semana" },
  { label: "Cada! 7 días", expr: "cada! 7 días" },
  { label: "Cada mes", expr: "cada mes" },
];

export const QuickAddTaskBar: React.FC<QuickAddTaskBarProps> = ({
  roomId: propRoomId,
  onTaskCreated,
  defaultOpen = false,
  className = "",
}) => {
  const { rooms, roomId: contextRoomId, activeRoom } = useRoom();
  const { notifyUpdate } = useTaskUpdate();
  const { toast } = useToast();

  const effectiveRoomId = propRoomId ?? contextRoomId;

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState<number>(2);
  const [dueDate, setDueDate] = useState<string>("");
  const [recurrenceExpr, setRecurrenceExpr] = useState<string>("");
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showRecurrenceMenu, setShowRecurrenceMenu] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [dismissedTrigger, setDismissedTrigger] = useState(false);
  const [aiMotivo, setAiMotivo] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const recurrenceMenuRef = useRef<HTMLDivElement>(null);

  const todayStr = new Date().toISOString().split("T")[0];

  // Cargar etiquetas disponibles al abrir el compositor
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    Promise.resolve(
      api.get<Tag[]>("/tags", { signal: controller.signal })
    )
      .then((res) => {
        if (res && Array.isArray(res.data)) {
          setAvailableTags(res.data);
        }
      })
      .catch(() => {
        // Silencioso en caso de desconexión o test sin mock de /tags
      });
    return () => controller.abort();
  }, [isOpen]);

  const nlpContext = useMemo(
    () => ({
      rooms,
      tags: availableTags,
      members: activeRoom?.members || [],
    }),
    [rooms, availableTags, activeRoom]
  );

  // Análisis NLP en tiempo real sobre el título escrito
  const nlpResult = useMemo(
    () => parseNaturalTaskInput(titulo, nlpContext),
    [titulo, nlpContext]
  );
  const triggerData = useMemo(
    () => (dismissedTrigger ? null : getTriggerSuggestions(titulo, nlpContext)),
    [titulo, nlpContext, dismissedTrigger]
  );

  const prevNlpRef = useRef<{
    dueDate?: string;
    peso?: number;
    categoria?: string;
    recurrenceExpr?: string;
  }>({});

  // Sincronizar tokens detectados por NLP con los controles del compositor (incluyendo reversión si se borra el token)
  useEffect(() => {
    const prev = prevNlpRef.current;

    if (nlpResult.dueDate !== undefined) {
      setDueDate(nlpResult.dueDate);
    } else if (prev.dueDate !== undefined) {
      setDueDate("");
    }

    if (nlpResult.peso !== undefined) {
      setPeso(nlpResult.peso);
    } else if (prev.peso !== undefined) {
      setPeso(2);
    }

    if (nlpResult.categoria !== undefined) {
      setCategoria(nlpResult.categoria);
    } else if (prev.categoria !== undefined) {
      setCategoria("LIMPIEZA");
    }

    if (nlpResult.recurrenceExpr !== undefined) {
      setRecurrenceExpr(nlpResult.recurrenceExpr);
    } else if (prev.recurrenceExpr !== undefined) {
      setRecurrenceExpr("");
    }

    prevNlpRef.current = {
      dueDate: nlpResult.dueDate,
      peso: nlpResult.peso,
      categoria: nlpResult.categoria,
      recurrenceExpr: nlpResult.recurrenceExpr,
    };
  }, [
    nlpResult.dueDate,
    nlpResult.peso,
    nlpResult.categoria,
    nlpResult.recurrenceExpr,
  ]);

  useEffect(() => {
    if (isOpen) {
      titleInputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(target)) {
        setShowPriorityMenu(false);
      }
      if (recurrenceMenuRef.current && !recurrenceMenuRef.current.contains(target)) {
        setShowRecurrenceMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const parsedRecurrence = recurrenceExpr.trim()
    ? parseRecurrenceExpression(recurrenceExpr.trim())
    : null;

  const currentPriority =
    TODOIST_PRIORITIES.find((p) => p.peso === peso) || TODOIST_PRIORITIES[3];

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  const formatQuickDateLabel = (dateStr: string) => {
    if (!dateStr) return "Fecha";
    if (dateStr === todayStr) return "Hoy";
    if (dateStr === tomorrowStr) return "Mañana";
    return dateStr;
  };

  const applyTriggerSuggestion = (item: NlpSuggestionItem) => {
    if (!triggerData) return;
    const idx = titulo.lastIndexOf(triggerData.triggerWord);
    const prefix = idx >= 0 ? titulo.slice(0, idx) : titulo;
    const nextTitle = `${prefix}${item.token} `;
    setTitulo(nextTitle);
    setActiveSuggestionIdx(0);
    setDismissedTrigger(false);
    titleInputRef.current?.focus();
  };

  const handleSuggestPriority = async () => {
    const effectiveTitle = nlpResult.cleanTitle || titulo.trim();
    if (!effectiveTitle || isSuggesting) return;
    setIsSuggesting(true);
    setAiMotivo(null);
    try {
      const res = await api.post<{ prioridad: string; motivo: string }>(
        "/tasks/ai/suggest",
        {
          titulo: effectiveTitle,
          descripcion: descripcion.trim(),
          categoria,
        }
      );
      const prio = res.data.prioridad?.toLowerCase() || "";
      if (prio.includes("urgente")) {
        setPeso(5);
      } else if (prio.includes("alta")) {
        setPeso(4);
      } else if (prio.includes("media") && prio.includes("baja")) {
        setPeso(2);
      } else if (prio.includes("media")) {
        setPeso(3);
      } else {
        setPeso(1);
      }
      if (res.data.motivo) {
        setAiMotivo(res.data.motivo);
      }
    } catch {
      toast.error("No se pudo consultar la sugerencia de IA en este momento.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const resetForm = () => {
    prevNlpRef.current = {};
    setTitulo("");
    setDescripcion("");
    setCategoria("LIMPIEZA");
    setPeso(2);
    setDueDate("");
    setRecurrenceExpr("");
    setAiMotivo(null);
    setShowPriorityMenu(false);
    setShowRecurrenceMenu(false);
    setDismissedTrigger(false);
    setActiveSuggestionIdx(0);
  };

  const normalizeTagKey = (val: string): string =>
    val
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = (nlpResult.cleanTitle || titulo).trim();
    if (!cleanTitle || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const resolvedTagIds: string[] = [...(nlpResult.tagIds || [])];
      if (nlpResult.tags && nlpResult.tags.length > 0) {
        for (const tagName of nlpResult.tags) {
          const normName = normalizeTagKey(tagName);
          if (normName.length < 2) continue;
          const existing = availableTags.find(
            (t) => normalizeTagKey(t.nombre) === normName
          );
          if (existing) {
            if (!resolvedTagIds.includes(existing.id)) {
              resolvedTagIds.push(existing.id);
            }
          } else {
            try {
              const tagRes = await api.post<Tag>("/tags", { nombre: tagName });
              const createdTag = tagRes?.data;
              if (createdTag && createdTag.id) {
                if (!resolvedTagIds.includes(createdTag.id)) {
                  resolvedTagIds.push(createdTag.id);
                }
                setAvailableTags((prev) =>
                  prev.some((t) => t.id === createdTag.id)
                    ? prev
                    : [...prev, createdTag]
                );
              }
            } catch {
              // Si está offline o falla la creación de etiqueta, continuar sin bloquear la tarea
            }
          }
        }
      }

      const targetRoom = (nlpResult.roomId || effectiveRoomId) || undefined;
      const payload: Record<string, unknown> = {
        titulo: cleanTitle,
        descripcion: descripcion.trim() || undefined,
        categoria,
        peso,
        estado: "TODO",
        due_date: dueDate || null,
        room_id: targetRoom,
        tag_ids: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
        is_recurring: Boolean(parsedRecurrence),
      };

      if (parsedRecurrence) {
        let backendFreq: "DAILY" | "WEEKLY" | "MONTHLY" = "WEEKLY";
        let backendInterval = parsedRecurrence.interval;
        if (
          parsedRecurrence.frequency === "DAILY" ||
          parsedRecurrence.frequency === "WORKDAYS"
        ) {
          backendFreq = "DAILY";
        } else if (parsedRecurrence.frequency === "WEEKLY") {
          backendFreq = "WEEKLY";
        } else if (parsedRecurrence.frequency === "MONTHLY") {
          backendFreq = "MONTHLY";
        } else if (parsedRecurrence.frequency === "YEARLY") {
          backendFreq = "MONTHLY";
          backendInterval = Math.min(365, parsedRecurrence.interval * 12);
        }

        payload.recurrence_rule = {
          frequency: backendFreq,
          interval: backendInterval,
          mode: parsedRecurrence.mode as RecurrenceMode,
          next_due_date: dueDate || todayStr,
          end_date:
            parsedRecurrence.endDate instanceof Date
              ? toISODateString(parsedRecurrence.endDate)
              : null,
          reset_subtasks: true,
        };
      }

      const res = await api.post<Task>("/tasks", payload);
      if (nlpResult.assigneeId && res.data?.id) {
        const assigneeLabel =
          nlpResult.assigneeName ||
          activeRoom?.members?.find((m) => m.user_id === nlpResult.assigneeId)
            ?.user_nombre ||
          nlpResult.assigneeId;
        toggleMemberTaskAssignmentLocal(
          targetRoom || "default",
          res.data.id,
          {
            userId: nlpResult.assigneeId,
            label: assigneeLabel,
          }
        );
        api
          .post("/tasks/assign", {
            task_id: res.data.id,
            user_id: nlpResult.assigneeId,
          })
          .catch(() => {});
      }

      if (onTaskCreated && res.data) {
        onTaskCreated(res.data);
      }
      notifyUpdate();
      toast.success(`Tarea "${cleanTitle}" añadida`);
      resetForm();
      titleInputRef.current?.focus();
    } catch {
      toast.error("No se pudo crear la tarea rápida. Verifica los datos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (triggerData && triggerData.suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx((prev) =>
          (prev + 1) % triggerData.suggestions.length
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx((prev) =>
          (prev - 1 + triggerData.suggestions.length) %
          triggerData.suggestions.length
        );
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const chosen =
          triggerData.suggestions[activeSuggestionIdx] ||
          triggerData.suggestions[0];
        if (chosen) applyTriggerSuggestion(chosen);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissedTrigger(true);
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (showPriorityMenu || showRecurrenceMenu) {
        setShowPriorityMenu(false);
        setShowRecurrenceMenu(false);
        return;
      }
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <div className={`todoist-quick-add-trigger-bar ${className}`.trim()}>
        <button
          type="button"
          className="todoist-quick-add-trigger-btn"
          onClick={() => setIsOpen(true)}
          data-testid="quick-add-task-trigger"
          aria-label="Añadir tarea rápida"
        >
          <span className="todoist-quick-add-plus-circle" aria-hidden="true">
            <LuPlus size={15} />
          </span>
          <span className="todoist-quick-add-trigger-text">Añadir tarea...</span>
          <span className="todoist-quick-add-trigger-hint">
            Entrada rápida estilo Todoist
          </span>
        </button>
      </div>
    );
  }

  return (
    <form
      className={`todoist-quick-add-composer ${className}`.trim()}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      data-testid="quick-add-task-composer"
    >
      <div className="todoist-composer-inputs position-relative">
        <input
          ref={titleInputRef}
          type="text"
          className="todoist-composer-title-input"
          placeholder="Nombre de la tarea (ej. Comprar leche mañana #compras p1 cada! 7 días)"
          value={titulo}
          onChange={(e) => {
            setTitulo(e.target.value);
            setDismissedTrigger(false);
            setActiveSuggestionIdx(0);
          }}
          disabled={isSubmitting}
          aria-label="Nombre de la tarea rápida"
          data-testid="quick-add-title-input"
        />

        {/* Menú Flotante de Sugerencias Slash / Trigger (#, !, /) Estilo 21st.dev */}
        {triggerData && triggerData.suggestions.length > 0 && (
          <div
            className="todoist-nlp-suggest-popover"
            role="listbox"
            aria-label="Sugerencias rápidas de lenguaje natural"
            data-testid="quick-add-trigger-popover"
          >
            <div className="todoist-popover-header d-flex justify-content-between align-items-center">
              <span>Comandos rápidos (Tab para insertar)</span>
              <span className="badge bg-light text-muted border">NLP</span>
            </div>
            {triggerData.suggestions.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === activeSuggestionIdx}
                className={`todoist-popover-item ${
                  idx === activeSuggestionIdx ? "selected" : ""
                }`}
                onClick={() => applyTriggerSuggestion(item)}
              >
                <span className="fw-semibold text-primary">{item.label}</span>
                <span className="text-muted small ms-auto">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Chips de Tokens NLP Detectados en Vivo */}
        {nlpResult.tokens.length > 0 && (
          <div
            className="todoist-nlp-tokens-bar"
            data-testid="quick-add-nlp-tokens"
            aria-live="polite"
          >
            <span className="todoist-nlp-tokens-label">
              <LuWand size={12} />
              <span>Detectado:</span>
            </span>
            {nlpResult.tokens.map((tok, i) => (
              <span
                key={`${tok.type}-${i}`}
                className={`todoist-nlp-chip todoist-nlp-chip-${tok.type}`}
                data-testid={`nlp-token-${tok.type}`}
              >
                {tok.type === "date" && <LuCalendar size={11} />}
                {tok.type === "priority" && <LuFlag size={11} />}
                {tok.type === "category" && <LuTag size={11} />}
                {tok.type === "recurrence" && <LuRepeat size={11} />}
                {tok.type === "tag" && <LuHash size={11} />}
                {tok.type === "room" && <LuHouse size={11} />}
                {tok.type === "assignee" && <LuUser size={11} />}
                <span>{tok.label}</span>
              </span>
            ))}
            {nlpResult.cleanTitle && nlpResult.cleanTitle !== titulo.trim() && (
              <span className="todoist-nlp-clean-preview text-muted">
                → <strong>{nlpResult.cleanTitle}</strong>
              </span>
            )}
          </div>
        )}

        <input
          type="text"
          className="todoist-composer-desc-input"
          placeholder="Descripción o notas adicionales (opcional)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          disabled={isSubmitting}
          aria-label="Descripción de la tarea rápida"
          data-testid="quick-add-desc-input"
        />
      </div>

      {aiMotivo && (
        <div className="todoist-composer-ai-banner">
          <LuSparkles size={13} />
          <span>Sugerencia IA: {aiMotivo}</span>
          <button
            type="button"
            className="todoist-composer-ai-close"
            onClick={() => setAiMotivo(null)}
            aria-label="Cerrar sugerencia IA"
          >
            <LuX size={12} />
          </button>
        </div>
      )}

      {/* Barra de Chips / Atributos Estilo Todoist */}
      <div className="todoist-composer-pills-row">
        {/* 1. Chips de Fecha Rápida */}
        <div className="todoist-date-pill-group">
          <button
            type="button"
            className={`todoist-attr-pill ${dueDate === todayStr ? "active-today" : ""}`}
            onClick={() =>
              setDueDate(dueDate === todayStr ? "" : todayStr)
            }
            title="Asignar para Hoy"
          >
            <LuCalendar size={13} />
            <span>Hoy</span>
          </button>
          <button
            type="button"
            className={`todoist-attr-pill ${dueDate === tomorrowStr ? "active-tomorrow" : ""}`}
            onClick={() =>
              setDueDate(dueDate === tomorrowStr ? "" : tomorrowStr)
            }
            title="Asignar para Mañana"
          >
            <span>Mañana</span>
          </button>
          <label className="todoist-attr-pill todoist-date-picker-label" title="Elegir fecha límite">
            <LuCalendar size={13} />
            <span>{formatQuickDateLabel(dueDate)}</span>
            <input
              type="date"
              min={todayStr}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="todoist-hidden-date-input"
              aria-label="Selector de fecha rápida"
            />
          </label>
          {dueDate && (
            <button
              type="button"
              className="todoist-pill-clear-btn"
              onClick={() => setDueDate("")}
              title="Quitar fecha"
              aria-label="Quitar fecha"
            >
              <LuX size={12} />
            </button>
          )}
        </div>

        {/* 2. Selector de Prioridad P1-P5 con Banderas Todoist */}
        <div className="todoist-dropdown-anchor" ref={priorityMenuRef}>
          <button
            type="button"
            className="todoist-attr-pill"
            onClick={() => {
              setShowRecurrenceMenu(false);
              setShowPriorityMenu((prev) => !prev);
            }}
            style={{
              borderColor: peso >= 3 ? currentPriority.color : undefined,
              color: peso >= 2 ? currentPriority.color : undefined,
            }}
            aria-label={`Prioridad seleccionada: ${currentPriority.code} ${currentPriority.label}`}
            aria-expanded={showPriorityMenu}
            data-testid="quick-add-priority-trigger"
          >
            <LuFlag size={13} style={{ color: currentPriority.color }} />
            <span>
              {currentPriority.code} · {currentPriority.label}
            </span>
          </button>

          {showPriorityMenu && (
            <div className="todoist-popover-menu" role="menu">
              {TODOIST_PRIORITIES.map((opt) => (
                <button
                  key={opt.peso}
                  type="button"
                  className={`todoist-popover-item ${peso === opt.peso ? "selected" : ""}`}
                  onClick={() => {
                    setPeso(opt.peso);
                    setShowPriorityMenu(false);
                  }}
                  role="menuitem"
                >
                  <LuFlag size={14} style={{ color: opt.color }} />
                  <span className="fw-semibold">{opt.code}</span>
                  <span className="text-muted small">{opt.label}</span>
                  {peso === opt.peso && (
                    <LuCheck size={14} className="ms-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Selector de Categoría */}
        <select
          className="todoist-attr-select"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoría de tarea rápida"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        {/* 4. Selector de Recurrencia Natural (DSL) */}
        <div className="todoist-dropdown-anchor" ref={recurrenceMenuRef}>
          <button
            type="button"
            className={`todoist-attr-pill ${parsedRecurrence ? "active-recurring" : ""}`}
            onClick={() => {
              setShowPriorityMenu(false);
              setShowRecurrenceMenu((prev) => !prev);
            }}
            title="Configurar rutina periódica (ej. cada! 7 días)"
            aria-expanded={showRecurrenceMenu}
            data-testid="quick-add-recurrence-trigger"
          >
            <LuRepeat size={13} />
            <span>
              {parsedRecurrence
                ? formatRecurrenceRule(parsedRecurrence)
                : "Rutina"}
            </span>
          </button>

          {showRecurrenceMenu && (
            <div className="todoist-popover-menu todoist-recurrence-popover" role="menu">
              <div className="todoist-popover-header">Repetir tarea (DSL)</div>
              <input
                type="text"
                className="todoist-popover-input"
                placeholder="Ej. cada! 7 días, cada mes..."
                value={recurrenceExpr}
                onChange={(e) => setRecurrenceExpr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowRecurrenceMenu(false);
                  }
                }}
              />
              <div className="todoist-popover-chips">
                {QUICK_RECURRENCE_CHIPS.map((chip) => (
                  <button
                    key={chip.expr}
                    type="button"
                    className={`todoist-mini-chip ${
                      recurrenceExpr === chip.expr ? "active" : ""
                    }`}
                    onClick={() => {
                      setRecurrenceExpr(chip.expr);
                      setShowRecurrenceMenu(false);
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {recurrenceExpr && (
                <button
                  type="button"
                  className="todoist-popover-clear"
                  onClick={() => {
                    setRecurrenceExpr("");
                    setShowRecurrenceMenu(false);
                  }}
                >
                  Sin repetición
                </button>
              )}
            </div>
          )}
        </div>

        {/* 5. Botón de Priorización Inteligente con IA */}
        <button
          type="button"
          className="todoist-attr-pill todoist-ai-pill"
          onClick={handleSuggestPriority}
          disabled={!titulo.trim() || isSuggesting}
          title="Analizar título y sugerir prioridad con IA"
          data-testid="quick-add-ai-btn"
        >
          {isSuggesting ? (
            <LuLoaderCircle size={13} className="ui-btn-spinner" />
          ) : (
            <LuSparkles size={13} />
          )}
          <span>IA</span>
        </button>

        {/* 6. Enlace al Formulario Completo */}
        <Link
          to="/tasks/create"
          state={{
            prefill: {
              titulo: nlpResult.cleanTitle || titulo,
              descripcion: descripcion.trim(),
              categoria,
              peso,
              dueDate,
              roomId: (nlpResult.roomId || effectiveRoomId) || null,
              tagIds: nlpResult.tagIds || [],
              tags: nlpResult.tags || [],
              assigneeId: nlpResult.assigneeId || null,
              recurrenceExpr,
            },
          }}
          className="todoist-attr-pill ms-auto text-decoration-none"
          title="Abrir formulario avanzado con subtareas y etiquetas"
          data-testid="quick-add-full-form-link"
        >
          <LuMaximize2 size={12} />
          <span className="d-none d-sm-inline">Formulario completo</span>
        </Link>
      </div>

      {/* Pie del Composer: Contexto de Hogar + Acciones Cancelar / Añadir */}
      <div className="todoist-composer-footer">
        <div className="todoist-composer-project-indicator">
          <LuHouse size={14} className="text-primary" />
          <span>{activeRoom ? activeRoom.nombre : "Bandeja de entrada"}</span>
        </div>

        <div className="todoist-composer-actions">
          <button
            type="button"
            className="todoist-btn-cancel"
            onClick={() => {
              resetForm();
              setIsOpen(false);
            }}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="todoist-btn-submit"
            disabled={!titulo.trim() || isSubmitting}
            data-testid="quick-add-submit-btn"
          >
            {isSubmitting ? "Añadiendo..." : "Añadir tarea"}
          </button>
        </div>
      </div>
    </form>
  );
};

export default QuickAddTaskBar;
