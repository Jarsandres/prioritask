import { useState } from "react";
import { LuSearch, LuX, LuPlus } from "react-icons/lu";
import type { Task } from "../../types/task";
import type {
  TaskGroupByMode,
  TaskSortByMode,
} from "../../utils/taskGroupingAndSorting";
import "./tasks.css";

export interface FilterBarProps {
  busqueda: string;
  onBusquedaChange: (val: string) => void;
  estado: string;
  onEstadoChange: (val: string) => void;
  categoria: string;
  onCategoriaChange: (val: string) => void;
  fechaLimite: string;
  onFechaLimiteChange: (val: string) => void;
  priorityFilter?: string;
  onPriorityFilterChange?: (val: string) => void;
  groupBy?: TaskGroupByMode;
  onGroupByChange?: (mode: TaskGroupByMode) => void;
  sortBy?: TaskSortByMode;
  onSortByChange?: (mode: TaskSortByMode) => void;
  onAddCustomSection?: (sectionName: string) => void;
  onClearFilters: () => void;
  totalTasks?: Task[];
  className?: string;
}

export const FilterBar = ({
  busqueda,
  onBusquedaChange,
  estado,
  onEstadoChange,
  categoria,
  onCategoriaChange,
  fechaLimite,
  onFechaLimiteChange,
  priorityFilter = "",
  onPriorityFilterChange,
  groupBy = "none",
  onGroupByChange,
  sortBy = "manual",
  onSortByChange,
  onAddCustomSection,
  onClearFilters,
  totalTasks = [],
  className = "",
}: FilterBarProps) => {
  const [newSectionName, setNewSectionName] = useState("");

  const hasActiveFilters = Boolean(
    busqueda || estado || categoria || fechaLimite || priorityFilter
  );

  const todayIso = new Date().toISOString().split("T")[0];
  const nextWeekDate = new Date();
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekIso = nextWeekDate.toISOString().split("T")[0];

  const countTotal = totalTasks.length;
  const countTodo = totalTasks.filter((t) => t.estado === "TODO").length;
  const countInProgress = totalTasks.filter(
    (t) => t.estado === "IN_PROGRESS"
  ).length;
  const countDone = totalTasks.filter((t) => t.estado === "DONE").length;

  const handleCreateCustomSection = () => {
    const trimmed = newSectionName.trim();
    if (!trimmed || !onAddCustomSection) return;
    onAddCustomSection(trimmed);
    setNewSectionName("");
  };

  return (
    <div className={`compact-filter-bar ${className}`.trim()}>
      <div className="filter-bar-left">
        {/* Buscador en vivo */}
        <div className="filter-search-box">
          <LuSearch size={15} className="filter-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="filter-search-input"
            value={busqueda}
            onChange={(e) => onBusquedaChange(e.target.value)}
            placeholder="Buscar por título o descripción..."
            aria-label="Buscar tareas"
          />
        </div>

        {/* Chips de Estado */}
        <div
          className="filter-status-chips"
          role="group"
          aria-label="Filtro rápido de estado"
        >
          <button
            type="button"
            className={`filter-chip ${estado === "" ? "active" : ""}`}
            onClick={() => onEstadoChange("")}
          >
            Todas ({countTotal})
          </button>
          <button
            type="button"
            className={`filter-chip ${estado === "TODO" ? "active" : ""}`}
            onClick={() => onEstadoChange("TODO")}
          >
            Por hacer ({countTodo})
          </button>
          <button
            type="button"
            className={`filter-chip ${estado === "IN_PROGRESS" ? "active" : ""}`}
            onClick={() => onEstadoChange("IN_PROGRESS")}
          >
            En progreso ({countInProgress})
          </button>
          <button
            type="button"
            className={`filter-chip ${estado === "DONE" ? "active" : ""}`}
            onClick={() => onEstadoChange("DONE")}
          >
            Completadas ({countDone})
          </button>
        </div>

        {/* Vistas Temporales Rápidas Estilo Todoist (Hoy / Próx. 7 días) */}
        <div
          className="filter-status-chips"
          role="group"
          aria-label="Vistas temporales rápidas"
        >
          <button
            type="button"
            className={`filter-chip ${fechaLimite === todayIso ? "active" : ""}`}
            onClick={() =>
              onFechaLimiteChange(fechaLimite === todayIso ? "" : todayIso)
            }
            title="Filtrar tareas que vencen hoy o antes"
          >
            📅 Hoy
          </button>
          <button
            type="button"
            className={`filter-chip ${fechaLimite === nextWeekIso ? "active" : ""}`}
            onClick={() =>
              onFechaLimiteChange(
                fechaLimite === nextWeekIso ? "" : nextWeekIso
              )
            }
            title="Filtrar tareas de los próximos 7 días"
          >
            🗓️ Próx. 7 días
          </button>
        </div>

        {/* Selector de Categoría */}
        <select
          className="filter-select"
          value={categoria}
          onChange={(e) => onCategoriaChange(e.target.value)}
          aria-label="Filtrar por categoría"
        >
          <option value="">Categorías: Todas</option>
          <option value="LIMPIEZA">Limpieza</option>
          <option value="COMPRA">Compra</option>
          <option value="MANTENIMIENTO">Mantenimiento</option>
          <option value="OTRO">Otro</option>
        </select>

        {/* Selector de Prioridad (Todoist P1..P4) */}
        {onPriorityFilterChange && (
          <select
            className="filter-select"
            value={priorityFilter || ""}
            onChange={(e) => onPriorityFilterChange(e.target.value)}
            aria-label="Filtrar por prioridad"
          >
            <option value="">Prioridades: Todas</option>
            <option value="p1">P1 — Urgente</option>
            <option value="p2">P2 — Alta</option>
            <option value="p3">P3 — Media</option>
            <option value="p4">P4 — Baja</option>
          </select>
        )}

        {/* Selector de Fecha Límite */}
        <input
          type="date"
          className="filter-select"
          value={fechaLimite}
          onChange={(e) => onFechaLimiteChange(e.target.value)}
          aria-label="Filtrar por fecha límite máxima"
          title="Fecha límite máxima"
        />

        {/* Selector de Agrupación Dinámica (Group By) */}
        {onGroupByChange && (
          <select
            className="filter-select"
            aria-label="Agrupar tareas por"
            data-testid="filter-groupby-select"
            value={groupBy || "none"}
            onChange={(e) => onGroupByChange(e.target.value as TaskGroupByMode)}
          >
            <option value="none">Agrupar: Ninguno</option>
            <option value="custom_section">Agrupar: Secciones del Hogar</option>
            <option value="due_date">Agrupar: Fecha límite</option>
            <option value="priority">Agrupar: Prioridad (P1-P4)</option>
            <option value="category">Agrupar: Categoría</option>
            <option value="status">Agrupar: Estado</option>
            <option value="assignee">Agrupar: Asignado</option>
          </select>
        )}

        {/* Selector de Ordenación Multi-Criterio (Sort By) */}
        {onSortByChange && (
          <select
            className="filter-select"
            aria-label="Ordenar tareas por"
            data-testid="filter-sortby-select"
            value={sortBy || "manual"}
            onChange={(e) => onSortByChange(e.target.value as TaskSortByMode)}
          >
            <option value="manual">Ordenar: Manual (Drag &amp; Drop)</option>
            <option value="priority">Ordenar: Prioridad (P1 → P4)</option>
            <option value="due_date">Ordenar: Fecha de vencimiento</option>
            <option value="title">Ordenar: Alfabético (A → Z)</option>
            <option value="created_at">Ordenar: Más recientes</option>
          </select>
        )}

        {/* Creación rápida de Sección Personalizada del Hogar */}
        {onAddCustomSection && groupBy === "custom_section" && (
          <div className="d-inline-flex align-items-center gap-1">
            <input
              type="text"
              className="filter-select"
              style={{ width: "165px", cursor: "text" }}
              placeholder="Nueva sección (ej. Cocina)"
              aria-label="Nombre de nueva sección del hogar"
              data-testid="add-custom-section-input"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateCustomSection();
                }
              }}
            />
            <button
              type="button"
              className="filter-chip active d-inline-flex align-items-center gap-1"
              style={{ height: "36px", padding: "0 10px" }}
              onClick={handleCreateCustomSection}
              data-testid="add-custom-section-btn"
              title="Añadir sección personalizada al hogar"
            >
              <LuPlus size={14} aria-hidden="true" />
              <span>+ Sección</span>
            </button>
          </div>
        )}

        {/* Botón de limpiar filtros si hay alguno activo */}
        {hasActiveFilters && (
          <button
            type="button"
            className="filter-clear-btn"
            onClick={onClearFilters}
            title="Limpiar todos los filtros"
          >
            <LuX size={14} aria-hidden="true" />
            <span>Limpiar</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default FilterBar;
