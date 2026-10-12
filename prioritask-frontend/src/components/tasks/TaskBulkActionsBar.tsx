import { useState, useRef, useEffect } from "react";
import {
  PRIORITY_LEVEL_METADATA,
  type TaskPriorityLevel,
  type SnoozePresetKey,
} from "../../hooks/useTasksState";
import "./tasks.css";

export interface TaskBulkActionsBarProps {
  selectedCount: number;
  totalVisibleCount: number;
  allSelectedCompleted?: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkComplete: () => void | Promise<void>;
  onBulkPriority: (peso: number, level: TaskPriorityLevel) => void | Promise<void>;
  onBulkSnooze: (preset: SnoozePresetKey, customDate?: string) => void | Promise<void>;
  onBulkCategory: (categoria: string) => void | Promise<void>;
  onBulkDelete: () => void | Promise<void>;
}

type OpenPopover = "priority" | "snooze" | "category" | null;

const SNOOZE_PRESET_ITEMS: Array<{
  key: Exclude<SnoozePresetKey, "custom">;
  label: string;
  hint: string;
}> = [
  { key: "30m", label: "+30 minutos", hint: "En 30m" },
  { key: "3h", label: "+3 horas", hint: "En 3h" },
  { key: "tomorrow_9am", label: "Mañana 09:00", hint: "09:00 AM" },
  { key: "today", label: "Hoy", hint: "Hoy" },
  { key: "tomorrow", label: "Mañana", hint: "+1 día" },
  { key: "next_week", label: "Próxima semana", hint: "+7 días" },
  { key: "clear", label: "Sin fecha", hint: "Quitar" },
];

const CATEGORY_ITEMS: Array<{ value: string; label: string }> = [
  { value: "LIMPIEZA", label: "Limpieza" },
  { value: "COMPRA", label: "Compra" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "OTRO", label: "Otro" },
];

export const TaskBulkActionsBar = ({
  selectedCount,
  totalVisibleCount,
  allSelectedCompleted = false,
  onSelectAll,
  onClearSelection,
  onBulkComplete,
  onBulkPriority,
  onBulkSnooze,
  onBulkCategory,
  onBulkDelete,
}: TaskBulkActionsBarProps) => {
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const [customDate, setCustomDate] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openPopover) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openPopover]);

  if (selectedCount <= 0) {
    return null;
  }

  const allVisibleSelected =
    totalVisibleCount > 0 && selectedCount >= totalVisibleCount;

  const togglePopover = (target: Exclude<OpenPopover, null>) => {
    setOpenPopover((prev) => (prev === target ? null : target));
  };

  return (
    <div
      ref={barRef}
      className="task-bulk-actions-bar"
      role="toolbar"
      aria-label="Acciones en lote para tareas seleccionadas"
      data-testid="task-bulk-actions-bar"
    >
      <div className="task-bulk-actions-summary">
        <span className="task-bulk-count-badge" data-testid="bulk-selected-count">
          {selectedCount}
        </span>
        <span className="task-bulk-summary-label">
          {selectedCount === 1 ? "tarea seleccionada" : "tareas seleccionadas"}
        </span>
        <button
          type="button"
          className="task-bulk-link-btn"
          onClick={onSelectAll}
          data-testid="bulk-select-all-btn"
        >
          {allVisibleSelected ? "Deseleccionar todas" : "Seleccionar todas"}
        </button>
      </div>

      <div className="task-bulk-actions-controls">
        {/* Completar / Reabrir */}
        <button
          type="button"
          className="task-bulk-btn task-bulk-btn-primary"
          onClick={() => {
            setOpenPopover(null);
            void onBulkComplete();
          }}
          data-testid="bulk-complete-btn"
          title={
            allSelectedCompleted
              ? "Reabrir tareas seleccionadas"
              : "Completar tareas seleccionadas"
          }
        >
          {allSelectedCompleted ? "↩ Reabrir" : "✓ Completar"}
        </button>

        {/* Prioridad P1..P4 */}
        <div className="task-bulk-popover-wrapper">
          <button
            type="button"
            className={`task-bulk-btn ${openPopover === "priority" ? "is-active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openPopover === "priority"}
            onClick={() => togglePopover("priority")}
            data-testid="bulk-priority-trigger"
          >
            ⚑ Prioridad
          </button>
          {openPopover === "priority" && (
            <div
              className="task-bulk-popover"
              role="menu"
              aria-label="Seleccionar prioridad en lote"
              data-testid="bulk-priority-menu"
            >
              {(["p1", "p2", "p3", "p4"] as const).map((lvl) => {
                const meta = PRIORITY_LEVEL_METADATA[lvl];
                return (
                  <button
                    key={lvl}
                    type="button"
                    role="menuitem"
                    className={`task-bulk-popover-item priority-text-${lvl}`}
                    onClick={() => {
                      setOpenPopover(null);
                      void onBulkPriority(meta.peso, lvl);
                    }}
                    data-testid={`bulk-priority-${lvl}`}
                  >
                    <span className="font-bold">{meta.shortLabel}</span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Posponer / Reprogramar (Snooze) */}
        <div className="task-bulk-popover-wrapper">
          <button
            type="button"
            className={`task-bulk-btn ${openPopover === "snooze" ? "is-active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openPopover === "snooze"}
            onClick={() => togglePopover("snooze")}
            data-testid="bulk-snooze-trigger"
          >
            ⏰ Posponer
          </button>
          {openPopover === "snooze" && (
            <div
              className="task-bulk-popover task-bulk-popover-snooze"
              role="menu"
              aria-label="Posponer o reprogramar tareas en lote"
              data-testid="bulk-snooze-menu"
            >
              {SNOOZE_PRESET_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="task-bulk-popover-item"
                  onClick={() => {
                    setOpenPopover(null);
                    void onBulkSnooze(item.key);
                  }}
                  data-testid={`bulk-snooze-${item.key}`}
                >
                  <span>{item.label}</span>
                  <span className="task-bulk-popover-hint">{item.hint}</span>
                </button>
              ))}
              <div className="task-bulk-custom-date-row">
                <input
                  type="date"
                  className="task-bulk-date-input"
                  aria-label="Fecha personalizada para posponer"
                  value={customDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomDate(val);
                    if (val) {
                      setOpenPopover(null);
                      void onBulkSnooze("custom", val);
                    }
                  }}
                  data-testid="bulk-snooze-custom-date"
                />
              </div>
            </div>
          )}
        </div>

        {/* Categoría */}
        <div className="task-bulk-popover-wrapper">
          <button
            type="button"
            className={`task-bulk-btn ${openPopover === "category" ? "is-active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openPopover === "category"}
            onClick={() => togglePopover("category")}
            data-testid="bulk-category-trigger"
          >
            🏷 Categoría
          </button>
          {openPopover === "category" && (
            <div
              className="task-bulk-popover"
              role="menu"
              aria-label="Cambiar categoría en lote"
              data-testid="bulk-category-menu"
            >
              {CATEGORY_ITEMS.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  role="menuitem"
                  className="task-bulk-popover-item"
                  onClick={() => {
                    setOpenPopover(null);
                    void onBulkCategory(cat.value);
                  }}
                  data-testid={`bulk-category-${cat.value}`}
                >
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Eliminar en lote */}
        <button
          type="button"
          className="task-bulk-btn task-bulk-btn-danger"
          onClick={() => {
            setOpenPopover(null);
            void onBulkDelete();
          }}
          data-testid="bulk-delete-btn"
          title="Eliminar tareas seleccionadas"
        >
          🗑 Eliminar
        </button>

        {/* Limpiar selección */}
        <button
          type="button"
          className="task-bulk-btn task-bulk-btn-ghost"
          onClick={() => {
            setOpenPopover(null);
            onClearSelection();
          }}
          data-testid="bulk-clear-selection-btn"
          aria-label="Limpiar selección"
          title="Limpiar selección (Esc)"
        >
          ✕ Limpiar
        </button>
      </div>
    </div>
  );
};

export default TaskBulkActionsBar;
