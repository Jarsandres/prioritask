import { LuSearch, LuX } from "react-icons/lu";
import type { Task } from "../../types/task";
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
  onClearFilters,
  totalTasks = [],
  className = "",
}: FilterBarProps) => {
  const hasActiveFilters = Boolean(
    busqueda || estado || categoria || fechaLimite
  );

  const countTotal = totalTasks.length;
  const countTodo = totalTasks.filter((t) => t.estado === "TODO").length;
  const countInProgress = totalTasks.filter(
    (t) => t.estado === "IN_PROGRESS"
  ).length;
  const countDone = totalTasks.filter((t) => t.estado === "DONE").length;

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

        {/* Selector de Fecha Límite */}
        <input
          type="date"
          className="filter-select"
          value={fechaLimite}
          onChange={(e) => onFechaLimiteChange(e.target.value)}
          aria-label="Filtrar por fecha límite máxima"
          title="Fecha límite máxima"
        />

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
