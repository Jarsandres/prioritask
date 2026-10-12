import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api";
import { useRoom } from "../../context/RoomContext";
import { useTaskUpdate } from "../../context/TaskUpdateContext";
import { useToast } from "../../context/ToastContext";
import useA11yModal from "../../hooks/useA11yModal";
import { enqueueMutation } from "../../services/offlineQueue";
import { toggleMemberTaskAssignmentLocal } from "../../utils/kudosStore";
import {
  parseRecurrenceExpression,
  formatRecurrenceRule,
  toISODateString,
  type RecurrenceMode,
} from "../../utils/recurrenceEngine";
import {
  parseNaturalTaskInput,
  getTriggerSuggestions,
  type NlpDetectedToken,
  type NlpSuggestionItem,
  type NlpParseContext,
} from "../../utils/nlpTaskParser";
import type { Task, Tag } from "../../types/task";
import {
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
  LuUser,
  LuHash,
  LuCornerDownLeft,
  LuLayers,
} from "react-icons/lu";
import "./tasks.css";

export interface QuickAddPrefill {
  content?: string;
  description?: string;
  date?: string;
  priority?: number;
  categoria?: string;
  roomId?: string | null;
}

export interface GlobalQuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefill?: QuickAddPrefill | null;
  onTaskCreated?: (task: Task) => void;
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

interface ManualOverrides {
  date?: boolean;
  priority?: boolean;
  category?: boolean;
  recurrence?: boolean;
  room?: boolean;
  assignee?: boolean;
}

export const GlobalQuickAddModal: React.FC<GlobalQuickAddModalProps> = ({
  isOpen,
  onClose,
  prefill,
  onTaskCreated,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { rooms, roomId: contextRoomId, activeRoom } = useRoom();
  const { notifyUpdate } = useTaskUpdate();
  const { toast } = useToast();

  // Deducir roomId contextual de la URL si estamos en /rooms/:roomId/tasks
  const routeRoomId = useMemo(() => {
    const match = /^\/rooms\/([^/]+)\/tasks/.exec(location.pathname);
    return match ? match[1] : null;
  }, [location.pathname]);

  const initialContextualRoomId = useMemo(() => {
    if (prefill?.roomId !== undefined) {
      return prefill.roomId || "";
    }
    return routeRoomId || contextRoomId || "";
  }, [prefill?.roomId, routeRoomId, contextRoomId]);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState("LIMPIEZA");
  const [peso, setPeso] = useState<number>(2);
  const [dueDate, setDueDate] = useState<string>("");
  const [recurrenceExpr, setRecurrenceExpr] = useState<string>("");
  const [targetRoomId, setTargetRoomId] = useState<string>(initialContextualRoomId);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");
  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>({});
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showRecurrenceMenu, setShowRecurrenceMenu] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [dismissedTrigger, setDismissedTrigger] = useState(false);
  const [aiMotivo, setAiMotivo] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const recurrenceMenuRef = useRef<HTMLDivElement>(null);

  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  // Cargar etiquetas disponibles al abrir el modal
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    api
      .get<Tag[]>("/tags", { signal: controller.signal })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setAvailableTags(res.data);
        }
      })
      .catch(() => {
        // Silencioso en caso de desconexión o test sin mock de /tags
      });
    return () => controller.abort();
  }, [isOpen]);

  // Hidratar estado inicial al abrir o recibir prefill
  useEffect(() => {
    if (!isOpen) return;
    setTitulo(prefill?.content || "");
    setDescripcion(prefill?.description || "");
    setDueDate(prefill?.date || "");
    setPeso(prefill?.priority ?? 2);
    setCategoria(prefill?.categoria || "LIMPIEZA");
    setTargetRoomId(initialContextualRoomId);
    setSelectedAssigneeId("");
    setRecurrenceExpr("");
    setManualOverrides({
      date: Boolean(prefill?.date),
      priority: prefill?.priority !== undefined,
      category: Boolean(prefill?.categoria),
      room: prefill?.roomId !== undefined,
    });
    setAiMotivo(null);
    setValidationError(null);
    setShowPriorityMenu(false);
    setShowRecurrenceMenu(false);
    setDismissedTrigger(false);
    setActiveSuggestionIdx(0);
  }, [isOpen, prefill, initialContextualRoomId]);

  const effectiveRoomObj = useMemo(() => {
    return (
      rooms.find((r) => r.id === targetRoomId) ||
      activeRoom ||
      null
    );
  }, [rooms, targetRoomId, activeRoom]);

  const nlpContext = useMemo<NlpParseContext>(() => {
    const memberMap = new Map<
      string,
      {
        user_id: string;
        user_nombre?: string | null;
        user_email?: string | null;
      }
    >();
    const addMembers = (
      list?: Array<{
        user_id: string;
        user_nombre?: string | null;
        user_email?: string | null;
      }>
    ) => {
      if (!list) return;
      for (const m of list) {
        if (m.user_id && !memberMap.has(m.user_id)) {
          memberMap.set(m.user_id, m);
        }
      }
    };
    addMembers(effectiveRoomObj?.members);
    addMembers(activeRoom?.members);
    for (const r of rooms) {
      addMembers(r.members);
    }

    return {
      rooms,
      tags: availableTags,
      members: Array.from(memberMap.values()),
    };
  }, [rooms, availableTags, effectiveRoomObj, activeRoom]);

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
    roomId?: string;
    assigneeId?: string;
  }>({});

  // Sincronizar tokens detectados por NLP con los controles del modal respetando overrides manuales (RN-02)
  useEffect(() => {
    const prev = prevNlpRef.current;

    if (!manualOverrides.date) {
      if (nlpResult.dueDate !== undefined) {
        setDueDate(nlpResult.dueDate);
      } else if (prev.dueDate !== undefined) {
        setDueDate(prefill?.date || "");
      }
    }

    if (!manualOverrides.priority) {
      if (nlpResult.peso !== undefined) {
        setPeso(nlpResult.peso);
      } else if (prev.peso !== undefined) {
        setPeso(prefill?.priority ?? 2);
      }
    }

    if (!manualOverrides.category) {
      if (nlpResult.categoria !== undefined) {
        setCategoria(nlpResult.categoria);
      } else if (prev.categoria !== undefined) {
        setCategoria(prefill?.categoria || "LIMPIEZA");
      }
    }

    if (!manualOverrides.recurrence) {
      if (nlpResult.recurrenceExpr !== undefined) {
        setRecurrenceExpr(nlpResult.recurrenceExpr);
      } else if (prev.recurrenceExpr !== undefined) {
        setRecurrenceExpr("");
      }
    }

    if (!manualOverrides.room) {
      if (nlpResult.roomId !== undefined) {
        setTargetRoomId(nlpResult.roomId);
      } else if (prev.roomId !== undefined) {
        setTargetRoomId(initialContextualRoomId);
      }
    }

    if (!manualOverrides.assignee) {
      if (nlpResult.assigneeId !== undefined) {
        setSelectedAssigneeId(nlpResult.assigneeId);
      } else if (prev.assigneeId !== undefined) {
        setSelectedAssigneeId("");
      }
    }

    prevNlpRef.current = {
      dueDate: nlpResult.dueDate,
      peso: nlpResult.peso,
      categoria: nlpResult.categoria,
      recurrenceExpr: nlpResult.recurrenceExpr,
      roomId: nlpResult.roomId,
      assigneeId: nlpResult.assigneeId,
    };
  }, [
    nlpResult.dueDate,
    nlpResult.peso,
    nlpResult.categoria,
    nlpResult.recurrenceExpr,
    nlpResult.roomId,
    nlpResult.assigneeId,
    manualOverrides,
    prefill,
    initialContextualRoomId,
  ]);

  const handleEscapeOrClose = useCallback(() => {
    if (triggerData && triggerData.suggestions.length > 0) {
      setDismissedTrigger(true);
      return;
    }
    if (showPriorityMenu || showRecurrenceMenu) {
      setShowPriorityMenu(false);
      setShowRecurrenceMenu(false);
      return;
    }
    onClose();
  }, [triggerData, showPriorityMenu, showRecurrenceMenu, onClose]);

  useA11yModal({
    isOpen,
    onClose: handleEscapeOrClose,
    modalRef,
    initialFocusRef: titleInputRef,
  });

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  const parsedRecurrence = recurrenceExpr.trim()
    ? parseRecurrenceExpression(recurrenceExpr.trim())
    : null;

  const currentPriority =
    TODOIST_PRIORITIES.find((p) => p.peso === peso) || TODOIST_PRIORITIES[3];

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

  const handleDismissToken = (tok: NlpDetectedToken) => {
    setTitulo((prev) => {
      const idx = prev.indexOf(tok.raw);
      if (idx === -1) return prev;
      return (prev.slice(0, idx) + " " + prev.slice(idx + tok.raw.length))
        .replace(/\s{2,}/g, " ")
        .trim();
    });

    if (tok.type === "date") {
      setDueDate("");
      setManualOverrides((p) => ({ ...p, date: false }));
    } else if (tok.type === "priority") {
      setPeso(2);
      setManualOverrides((p) => ({ ...p, priority: false }));
    } else if (tok.type === "category") {
      setCategoria("LIMPIEZA");
      setManualOverrides((p) => ({ ...p, category: false }));
    } else if (tok.type === "recurrence") {
      setRecurrenceExpr("");
      setManualOverrides((p) => ({ ...p, recurrence: false }));
    } else if (tok.type === "room") {
      setTargetRoomId(initialContextualRoomId);
      setManualOverrides((p) => ({ ...p, room: false }));
    } else if (tok.type === "assignee") {
      setSelectedAssigneeId("");
      setManualOverrides((p) => ({ ...p, assignee: false }));
    }

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
      setManualOverrides((p) => ({ ...p, priority: true }));
      if (res.data.motivo) {
        setAiMotivo(res.data.motivo);
      }
    } catch {
      toast.error("No se pudo consultar la sugerencia de IA en este momento.");
    } finally {
      setIsSuggesting(false);
    }
  };

  const resetQuickAdd = useCallback(() => {
    prevNlpRef.current = {};
    setTitulo("");
    setDescripcion("");
    setCategoria("LIMPIEZA");
    setPeso(2);
    setDueDate("");
    setRecurrenceExpr("");
    setSelectedAssigneeId("");
    setManualOverrides({});
    setAiMotivo(null);
    setValidationError(null);
    setShowPriorityMenu(false);
    setShowRecurrenceMenu(false);
    setDismissedTrigger(false);
    setActiveSuggestionIdx(0);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 0);
  }, []);

  const normalizeTagKey = (val: string): string =>
    val
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

  const submitQuickAddTask = async (keepOpen: boolean) => {
    const cleanTitle = (nlpResult.cleanTitle || titulo).trim();
    if (!cleanTitle || isSubmitting) return;

    if (cleanTitle.length < 3) {
      setValidationError("El título debe tener al menos 3 caracteres.");
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

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

    const effectiveAssigneeId = selectedAssigneeId || nlpResult.assigneeId;

    const payload: Record<string, unknown> = {
      titulo: cleanTitle,
      descripcion: descripcion.trim() || undefined,
      categoria,
      peso,
      estado: "TODO",
      due_date: dueDate || null,
      room_id: targetRoomId || undefined,
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

    try {
      const res = await api.post<Task>("/tasks", payload);
      const createdTask = res.data;

      if (effectiveAssigneeId && createdTask?.id) {
        const assigneeLabel =
          nlpResult.assigneeName ||
          effectiveRoomObj?.members?.find((m) => m.user_id === effectiveAssigneeId)
            ?.user_nombre ||
          effectiveAssigneeId;
        toggleMemberTaskAssignmentLocal(
          targetRoomId || "default",
          createdTask.id,
          {
            userId: effectiveAssigneeId,
            label: assigneeLabel,
          }
        );
        api
          .post("/tasks/assign", {
            task_id: createdTask.id,
            user_id: effectiveAssigneeId,
          })
          .catch(() => {});
      }

      if (onTaskCreated && createdTask) {
        onTaskCreated(createdTask);
      }
      notifyUpdate();
      toast.success(`Tarea "${cleanTitle}" añadida`);

      if (keepOpen) {
        resetQuickAdd();
      } else {
        resetQuickAdd();
        onClose();
      }
    } catch (err: unknown) {
      const hasHttpResponse = Boolean(
        err && typeof err === "object" && "response" in err && (err as { response?: unknown }).response
      );

      // Soporte Offline (EC-02): encolar si es fallo de red sin respuesta HTTP
      if (!hasHttpResponse) {
        const alreadyQueued = Boolean(
          err &&
            typeof err === "object" &&
            "isOfflineQueued" in err &&
            (err as { isOfflineQueued?: boolean }).isOfflineQueued
        );
        if (!alreadyQueued) {
          await enqueueMutation({
            url: "/tasks",
            method: "POST",
            data: payload,
          });
        }
        notifyUpdate();
        toast.info(
          `Sin conexión: "${cleanTitle}" guardada en la cola offline ⏳`
        );
        if (keepOpen) {
          resetQuickAdd();
        } else {
          resetQuickAdd();
          onClose();
        }
      } else {
        toast.error("No se pudo crear la tarea rápida. Verifica los datos.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenFullForm = () => {
    const cleanTitle = (nlpResult.cleanTitle || titulo).trim();
    const resolvedTagIds = nlpResult.tagIds || [];
    const effectiveAssigneeId =
      selectedAssigneeId || nlpResult.assigneeId || null;
    onClose();
    navigate("/tasks/create", {
      state: {
        prefill: {
          titulo: cleanTitle || titulo,
          descripcion: descripcion.trim(),
          categoria,
          peso,
          dueDate,
          roomId: targetRoomId || null,
          tagIds: resolvedTagIds,
          tags: nlpResult.tags || [],
          assigneeId: effectiveAssigneeId,
          recurrenceExpr,
        },
      },
    });
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (triggerData && triggerData.suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx(
          (prev) => (prev + 1) % triggerData.suggestions.length
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx(
          (prev) =>
            (prev - 1 + triggerData.suggestions.length) %
            triggerData.suggestions.length
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.ctrlKey && !e.metaKey)) {
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

    // Envío en ráfaga con Ctrl+Enter o Cmd+Enter (resetQuickAdd sin cerrar modal)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void submitQuickAddTask(true);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleEscapeOrClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="global-quick-add-backdrop"
      onClick={onClose}
      role="presentation"
      data-testid="global-quick-add-backdrop"
    >
      <div
        ref={modalRef}
        className="global-quick-add-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-quick-add-modal-title"
        data-testid="global-quick-add-modal"
      >
        {/* Cabecera compacta estilo ventana Yi (quick_add) de Todoist Desktop */}
        <div className="global-quick-add-header">
          <div className="d-flex align-items-center gap-2">
            <span className="global-quick-add-badge">
              <LuWand size={13} />
              <span id="global-quick-add-modal-title">Captura Rápida</span>
            </span>
            <span className="global-quick-add-hint d-none d-sm-inline">
              Usa <code>#cat</code> <code>~sala</code> <code>@tag</code>{" "}
              <code>+miembro</code> <code>!alta</code>
            </span>
          </div>
          <button
            type="button"
            className="global-quick-add-close-btn"
            onClick={onClose}
            aria-label="Cerrar captura rápida"
            title="Cerrar (Esc)"
          >
            <LuX size={16} />
          </button>
        </div>

        <form
          className="global-quick-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuickAddTask(false);
          }}
          onKeyDown={handleFormKeyDown}
        >
          <div className="todoist-composer-inputs position-relative">
            <input
              ref={titleInputRef}
              type="text"
              className="todoist-composer-title-input global-quick-add-title-input"
              placeholder="Ej. Comprar bombillas mañana !alta #compras ~cocina @hogar +maria"
              value={titulo}
              onChange={(e) => {
                setTitulo(e.target.value);
                setValidationError(null);
                setDismissedTrigger(false);
                setActiveSuggestionIdx(0);
              }}
              disabled={isSubmitting}
              aria-label="Título de la tarea rápida"
              data-testid="global-quick-add-title-input"
            />

            {/* Popover de sugerencias contextuales (#, !, /, @, ~, +) */}
            {triggerData && triggerData.suggestions.length > 0 && (
              <div
                className="todoist-nlp-suggest-popover"
                role="listbox"
                aria-label="Sugerencias rápidas de lenguaje natural"
                data-testid="global-quick-add-trigger-popover"
              >
                <div className="todoist-popover-header d-flex justify-content-between align-items-center">
                  <span>Comandos rápidos (Tab o Enter)</span>
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
                    <span className="fw-semibold text-primary">
                      {item.label}
                    </span>
                    <span className="text-muted small ms-auto">
                      {item.description}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Barra de Chips NLP Detectados en Vivo con Botón × para Descartar */}
            {nlpResult.tokens.length > 0 && (
              <div
                className="todoist-nlp-tokens-bar"
                data-testid="global-quick-add-nlp-tokens"
                aria-live="polite"
              >
                <span className="todoist-nlp-tokens-label">
                  <LuWand size={12} />
                  <span>Detectado:</span>
                </span>
                {nlpResult.tokens.map((tok, i) => (
                  <span
                    key={`${tok.type}-${tok.raw}-${i}`}
                    className={`todoist-nlp-chip todoist-nlp-chip-${tok.type}`}
                    data-testid={`global-nlp-token-${tok.type}`}
                  >
                    {tok.type === "date" && <LuCalendar size={11} />}
                    {tok.type === "priority" && <LuFlag size={11} />}
                    {tok.type === "category" && <LuTag size={11} />}
                    {tok.type === "recurrence" && <LuRepeat size={11} />}
                    {tok.type === "tag" && <LuHash size={11} />}
                    {tok.type === "room" && <LuHouse size={11} />}
                    {tok.type === "assignee" && <LuUser size={11} />}
                    <span>{tok.label}</span>
                    <button
                      type="button"
                      className="todoist-nlp-chip-dismiss"
                      onClick={() => handleDismissToken(tok)}
                      aria-label={`Descartar ${tok.label}`}
                      data-testid={`dismiss-nlp-token-${tok.type}`}
                    >
                      <LuX size={10} />
                    </button>
                  </span>
                ))}
                {nlpResult.cleanTitle &&
                  nlpResult.cleanTitle !== titulo.trim() && (
                    <span
                      className="todoist-nlp-clean-preview text-muted"
                      data-testid="global-quick-add-clean-title"
                    >
                      → <strong>{nlpResult.cleanTitle}</strong>
                    </span>
                  )}
              </div>
            )}

            <textarea
              className="todoist-composer-desc-input global-quick-add-desc-input"
              placeholder="Descripción o notas adicionales (opcional)"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={isSubmitting}
              aria-label="Descripción o notas de la tarea"
              data-testid="global-quick-add-desc-input"
            />
          </div>

          {validationError && (
            <div
              className="alert alert-danger py-1 px-2 small mb-2"
              role="alert"
              data-testid="global-quick-add-error"
            >
              {validationError}
            </div>
          )}

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

          {/* Barra de Selectores Manuales (con precedencia RN-02) */}
          <div className="todoist-composer-pills-row">
            {/* 1. Fecha Rápida */}
            <div className="todoist-date-pill-group">
              <button
                type="button"
                className={`todoist-attr-pill ${
                  dueDate === todayStr ? "active-today" : ""
                }`}
                onClick={() => {
                  const nextDate = dueDate === todayStr ? "" : todayStr;
                  setDueDate(nextDate);
                  setManualOverrides((p) => ({
                    ...p,
                    date: Boolean(nextDate),
                  }));
                }}
                title="Asignar para Hoy"
                data-testid="global-quick-add-today-btn"
              >
                <LuCalendar size={13} />
                <span>Hoy</span>
              </button>
              <button
                type="button"
                className={`todoist-attr-pill ${
                  dueDate === tomorrowStr ? "active-tomorrow" : ""
                }`}
                onClick={() => {
                  const nextDate = dueDate === tomorrowStr ? "" : tomorrowStr;
                  setDueDate(nextDate);
                  setManualOverrides((p) => ({
                    ...p,
                    date: Boolean(nextDate),
                  }));
                }}
                title="Asignar para Mañana"
                data-testid="global-quick-add-tomorrow-btn"
              >
                <span>Mañana</span>
              </button>
              <label
                className="todoist-attr-pill todoist-date-picker-label"
                title="Elegir fecha límite"
              >
                <LuCalendar size={13} />
                <span>{formatQuickDateLabel(dueDate)}</span>
                <input
                  type="date"
                  min={todayStr}
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setManualOverrides((p) => ({
                      ...p,
                      date: Boolean(e.target.value),
                    }));
                  }}
                  className="todoist-hidden-date-input"
                  aria-label="Selector de fecha rápida"
                />
              </label>
              {dueDate && (
                <button
                  type="button"
                  className="todoist-pill-clear-btn"
                  onClick={() => {
                    setDueDate("");
                    setManualOverrides((p) => ({ ...p, date: false }));
                  }}
                  title="Quitar fecha"
                  aria-label="Quitar fecha"
                >
                  <LuX size={12} />
                </button>
              )}
            </div>

            {/* 2. Selector de Prioridad P1-P5 */}
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
                data-testid="global-quick-add-priority-trigger"
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
                      className={`todoist-popover-item ${
                        peso === opt.peso ? "selected" : ""
                      }`}
                      onClick={() => {
                        setPeso(opt.peso);
                        setManualOverrides((p) => ({ ...p, priority: true }));
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
              onChange={(e) => {
                setCategoria(e.target.value);
                setManualOverrides((p) => ({ ...p, category: true }));
              }}
              aria-label="Categoría de tarea rápida"
              data-testid="global-quick-add-category-select"
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
                className={`todoist-attr-pill ${
                  parsedRecurrence ? "active-recurring" : ""
                }`}
                onClick={() => {
                  setShowPriorityMenu(false);
                  setShowRecurrenceMenu((prev) => !prev);
                }}
                title="Configurar rutina periódica (ej. cada! 7 días)"
                aria-expanded={showRecurrenceMenu}
                data-testid="global-quick-add-recurrence-trigger"
              >
                <LuRepeat size={13} />
                <span>
                  {parsedRecurrence
                    ? formatRecurrenceRule(parsedRecurrence)
                    : "Rutina"}
                </span>
              </button>

              {showRecurrenceMenu && (
                <div
                  className="todoist-popover-menu todoist-recurrence-popover"
                  role="menu"
                >
                  <div className="todoist-popover-header">
                    Repetir tarea (DSL)
                  </div>
                  <input
                    type="text"
                    className="todoist-popover-input"
                    placeholder="Ej. cada! 7 días, cada mes..."
                    value={recurrenceExpr}
                    onChange={(e) => {
                      setRecurrenceExpr(e.target.value);
                      setManualOverrides((p) => ({
                        ...p,
                        recurrence: Boolean(e.target.value.trim()),
                      }));
                    }}
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
                          setManualOverrides((p) => ({
                            ...p,
                            recurrence: true,
                          }));
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
                        setManualOverrides((p) => ({
                          ...p,
                          recurrence: false,
                        }));
                        setShowRecurrenceMenu(false);
                      }}
                    >
                      Sin repetición
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 5. Priorización Inteligente con IA */}
            <button
              type="button"
              className="todoist-attr-pill todoist-ai-pill"
              onClick={handleSuggestPriority}
              disabled={!titulo.trim() || isSuggesting}
              title="Analizar título y sugerir prioridad con IA"
              data-testid="global-quick-add-ai-btn"
            >
              {isSuggesting ? (
                <LuLoaderCircle size={13} className="ui-btn-spinner" />
              ) : (
                <LuSparkles size={13} />
              )}
              <span>IA</span>
            </button>

            {/* 6. Escalado a Formulario Completo (sendOpenPageFromQuickAdd) */}
            <button
              type="button"
              className="todoist-attr-pill ms-auto"
              onClick={handleOpenFullForm}
              title="Abrir formulario avanzado con subtareas y archivos"
              data-testid="global-quick-add-full-form-btn"
            >
              <LuMaximize2 size={12} />
              <span className="d-none d-sm-inline">Formulario completo</span>
            </button>
          </div>

          {/* Pie del Modal: Selector de Hogar/Sala + Acciones Cancelar / Ráfaga / Añadir */}
          <div className="todoist-composer-footer global-quick-add-footer">
            <div className="todoist-composer-project-indicator">
              <LuHouse size={14} className="text-primary flex-shrink-0" />
              <select
                className="global-quick-add-room-select"
                value={targetRoomId}
                onChange={(e) => {
                  setTargetRoomId(e.target.value);
                  setManualOverrides((p) => ({ ...p, room: true }));
                }}
                aria-label="Seleccionar hogar o sala destino"
                data-testid="global-quick-add-room-select"
              >
                <option value="">Bandeja de entrada (Personal)</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="todoist-composer-actions">
              <button
                type="button"
                className="todoist-btn-cancel"
                onClick={onClose}
                disabled={isSubmitting}
                data-testid="global-quick-add-cancel-btn"
              >
                Cancelar
              </button>
              <button
                type="button"
                className="todoist-btn-burst"
                onClick={() => void submitQuickAddTask(true)}
                disabled={!titulo.trim() || isSubmitting}
                title="Crear tarea y mantener abierto para captura en ráfaga (Ctrl+Enter)"
                data-testid="global-quick-add-burst-btn"
              >
                <LuLayers size={13} />
                <span className="d-none d-md-inline">Crear y seguir</span>
              </button>
              <button
                type="submit"
                className="todoist-btn-submit d-inline-flex align-items-center gap-1"
                disabled={!titulo.trim() || isSubmitting}
                data-testid="global-quick-add-submit-btn"
              >
                <span>{isSubmitting ? "Añadiendo..." : "Añadir tarea"}</span>
                <LuCornerDownLeft size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GlobalQuickAddModal;
