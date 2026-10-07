import React, { useState, useMemo } from "react";
import type { Task, TaskStatus } from "../../types/task";
import {
  PriorityBadge,
  CategoryIcon,
  RecurringBadge,
} from "../common/Badges";
import TaskCommentsSection from "./TaskCommentsSection";
import TaskChecklist from "./TaskChecklist";
import {
  LuChevronLeft,
  LuChevronRight,
  LuCalendar,
  LuRepeat,
  LuCheck,
  LuCircleCheck,
  LuPencil,
  LuTrash2,
  LuX,
  LuListChecks,
  LuClock,
} from "react-icons/lu";
import "./tasks.css";

export interface TaskCalendarViewProps {
  tasks: Task[];
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onComplete?: (taskId: string) => void | Promise<void>;
  completingId?: string | null;
  deletingId?: string | null;
  className?: string;
}

type CalendarMode = "month" | "week";

const DAYS_OF_WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const formatDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({
  tasks,
  onEdit,
  onDelete,
  onComplete,
  completingId,
  deletingId,
  className = "",
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("month");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState<boolean>(false);

  const todayStr = useMemo(() => formatDateKey(new Date()), []);

  // Agrupar tareas por clave de fecha YYYY-MM-DD
  const { tasksByDate, unscheduledTasks } = useMemo(() => {
    const map: Record<string, Task[]> = {};
    const unscheduled: Task[] = [];

    tasks.forEach((task) => {
      if (!task.due_date) {
        unscheduled.push(task);
        return;
      }
      const dateKey = task.due_date.split("T")[0];
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(task);
    });

    return { tasksByDate: map, unscheduledTasks: unscheduled };
  }, [tasks]);

  // Navegación temporal
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const copy = new Date(prev);
      if (calendarMode === "month") {
        copy.setMonth(copy.getMonth() - 1);
      } else {
        copy.setDate(copy.getDate() - 7);
      }
      return copy;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const copy = new Date(prev);
      if (calendarMode === "month") {
        copy.setMonth(copy.getMonth() + 1);
      } else {
        copy.setDate(copy.getDate() + 7);
      }
      return copy;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Cálculo de celdas para el mes actual
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Ajustar al lunes previo (0 = domingo, 1 = lunes -> restar)
    const dayOfWeek = firstDayOfMonth.getDay();
    const leadingOffset = (dayOfWeek + 6) % 7; // Lunes = 0, Domingo = 6

    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - leadingOffset);

    // Determinar cantidad de semanas (5 o 6)
    const totalDays = leadingOffset + lastDayOfMonth.getDate();
    const totalCells = Math.ceil(totalDays / 7) * 7;

    const days: Array<{
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = formatDateKey(d);
      days.push({
        date: d,
        dateKey: key,
        isCurrentMonth: d.getMonth() === month,
        isToday: key === todayStr,
      });
    }

    return days;
  }, [currentDate, todayStr]);

  // Cálculo de días para la vista semanal
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = d.getDay();
    const leadingOffset = (dayOfWeek + 6) % 7;

    const startOfWeek = new Date(d);
    startOfWeek.setDate(startOfWeek.getDate() - leadingOffset);

    const days: Array<{
      date: Date;
      dateKey: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const cellDate = new Date(startOfWeek);
      cellDate.setDate(cellDate.getDate() + i);
      const key = formatDateKey(cellDate);
      days.push({
        date: cellDate,
        dateKey: key,
        isCurrentMonth: cellDate.getMonth() === currentDate.getMonth(),
        isToday: key === todayStr,
      });
    }

    return days;
  }, [currentDate, todayStr]);

  const currentMonthLabel = useMemo(() => {
    const m = MONTH_NAMES[currentDate.getMonth()];
    const y = currentDate.getFullYear();
    return `${m} ${y}`;
  }, [currentDate]);

  return (
    <div className={`task-calendar-view ${className}`.trim()}>
      {/* Header del Calendario: Navegación y Switcher Mes/Semana */}
      <div className="task-calendar-header d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3 p-3 bg-surface border rounded">
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group" role="group" aria-label="Navegación de fecha">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handlePrev}
              title="Anterior"
              aria-label="Período anterior"
            >
              <LuChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm fw-semibold"
              onClick={handleToday}
              title="Ir a hoy"
            >
              Hoy
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handleNext}
              title="Siguiente"
              aria-label="Período siguiente"
            >
              <LuChevronRight size={16} />
            </button>
          </div>

          <h3 className="mb-0 fw-bold d-flex align-items-center gap-2" style={{ fontSize: "19px" }}>
            <LuCalendar className="text-primary" size={20} />
            <span>{currentMonthLabel}</span>
          </h3>
        </div>

        <div className="d-flex align-items-center gap-2">
          {unscheduledTasks.length > 0 && (
            <button
              type="button"
              className={`btn btn-sm ${
                showUnscheduled ? "btn-warning" : "btn-outline-warning"
              } d-flex align-items-center gap-1`}
              onClick={() => setShowUnscheduled((prev) => !prev)}
            >
              <LuClock size={14} />
              <span>Sin programar ({unscheduledTasks.length})</span>
            </button>
          )}

          <div className="task-view-switcher" role="group" aria-label="Modo de calendario">
            <button
              type="button"
              className={`view-switcher-btn ${calendarMode === "month" ? "active" : ""}`}
              onClick={() => setCalendarMode("month")}
            >
              Mes
            </button>
            <button
              type="button"
              className={`view-switcher-btn ${calendarMode === "week" ? "active" : ""}`}
              onClick={() => setCalendarMode("week")}
            >
              Semana
            </button>
          </div>
        </div>
      </div>

      {/* Cajón de tareas sin fecha límite */}
      {showUnscheduled && unscheduledTasks.length > 0 && (
        <div className="task-calendar-unscheduled p-3 mb-3 border rounded bg-warning-subtle">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h6 className="mb-0 fw-semibold text-warning-emphasis d-flex align-items-center gap-1">
              <LuClock size={16} />
              <span>Tareas pendientes de agendar en calendario</span>
            </h6>
            <button
              type="button"
              className="btn btn-sm btn-link text-muted p-0"
              onClick={() => setShowUnscheduled(false)}
            >
              <LuX size={16} />
            </button>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {unscheduledTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                className="task-calendar-chip btn btn-sm bg-white border text-start d-flex align-items-center gap-2 shadow-xs"
                onClick={() => setSelectedTask(t)}
                title="Haz clic para ver o asignar fecha"
              >
                <CategoryIcon category={t.categoria} size={14} />
                <span className="fw-medium text-truncate" style={{ maxWidth: "200px" }}>
                  {t.titulo}
                </span>
                <PriorityBadge peso={t.peso} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid del Calendario */}
      <div className="task-calendar-grid-container border rounded bg-surface overflow-hidden">
        {/* Encabezados de días de la semana */}
        <div className="task-calendar-weekdays-row">
          {DAYS_OF_WEEK.map((dayName) => (
            <div key={dayName} className="task-calendar-weekday-header">
              {dayName}
            </div>
          ))}
        </div>

        {/* Celdas de días */}
        <div className={`task-calendar-cells-grid mode-${calendarMode}`}>
          {(calendarMode === "month" ? monthDays : weekDays).map((dayObj) => {
            const dayTasks = tasksByDate[dayObj.dateKey] || [];
            return (
              <div
                key={dayObj.dateKey}
                className={`task-calendar-cell ${
                  !dayObj.isCurrentMonth ? "other-month" : ""
                } ${dayObj.isToday ? "is-today" : ""}`}
              >
                <div className="task-calendar-cell-header">
                  <span className="task-calendar-day-number">
                    {dayObj.date.getDate()}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="task-calendar-count-badge">
                      {dayTasks.length}
                    </span>
                  )}
                </div>

                <div className="task-calendar-items-list">
                  {dayTasks.map((task) => {
                    const isDone = task.estado === "DONE";
                    return (
                      <button
                        key={task.id}
                        type="button"
                        className={`task-calendar-card ${isDone ? "is-done" : ""}`}
                        onClick={() => setSelectedTask(task)}
                        title={`${task.titulo} (${task.categoria})`}
                      >
                        <div className="d-flex align-items-center gap-1 w-100 overflow-hidden">
                          <span
                            className="task-calendar-dot"
                            style={{
                              backgroundColor:
                                task.peso >= 3
                                  ? "#ef4444"
                                  : task.peso === 2
                                  ? "#f59e0b"
                                  : "#10b981",
                            }}
                          />
                          <span className="task-calendar-card-title text-truncate">
                            {task.titulo}
                          </span>
                        </div>

                        <div className="task-calendar-card-meta">
                          {task.is_recurring && (
                            <LuRepeat
                              size={11}
                              className="text-primary flex-shrink-0"
                              title="Tarea recurrente"
                            />
                          )}
                          {(task.subtasks_count ?? 0) > 0 && (
                            <LuListChecks
                              size={11}
                              className="text-muted flex-shrink-0"
                              title="Contiene subtareas"
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal interactivo de Detalle de Tarea seleccionada */}
      {selectedTask && (
        <div
          className="task-detail-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="task-detail-modal-content border rounded shadow-lg bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="task-detail-modal-header d-flex align-items-center justify-content-between p-3 border-bottom">
              <div className="d-flex align-items-center gap-2">
                <CategoryIcon category={selectedTask.categoria} size={18} />
                <h5 className="mb-0 fw-bold">{selectedTask.titulo}</h5>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setSelectedTask(null)}
                aria-label="Cerrar modal"
              />
            </div>

            <div className="task-detail-modal-body p-3">
              <div className="d-flex flex-wrap gap-2 mb-3">
                <PriorityBadge peso={selectedTask.peso} />
                <span className="badge bg-secondary-subtle text-secondary">
                  {selectedTask.categoria}
                </span>
                {selectedTask.is_recurring && <RecurringBadge />}
                <span
                  className={`badge ${
                    selectedTask.estado === "DONE"
                      ? "bg-success"
                      : selectedTask.estado === "IN_PROGRESS"
                      ? "bg-primary"
                      : "bg-secondary"
                  }`}
                >
                  {selectedTask.estado === "DONE"
                    ? "Completada"
                    : selectedTask.estado === "IN_PROGRESS"
                    ? "En progreso"
                    : "Pendiente"}
                </span>
              </div>

              {selectedTask.due_date && (
                <div className="d-flex align-items-center gap-2 mb-3 text-muted small">
                  <LuCalendar size={14} />
                  <span>Fecha de vencimiento: <strong>{selectedTask.due_date}</strong></span>
                </div>
              )}

              {selectedTask.descripcion && (
                <div className="task-detail-desc mb-3 p-2 rounded bg-light border text-break small">
                  {selectedTask.descripcion}
                </div>
              )}

              {/* Checklist de la tarea */}
              <div className="mb-4">
                <TaskChecklist taskId={selectedTask.id} initialSubtasks={selectedTask.subtasks} />
              </div>

              {/* Sección de notas y comentarios */}
              <div className="mb-3">
                <TaskCommentsSection taskId={selectedTask.id} />
              </div>
            </div>

            <div className="task-detail-modal-footer d-flex justify-content-between p-3 border-top bg-light">
              <div className="d-flex gap-2">
                {onComplete && (
                  <button
                    type="button"
                    className={`btn btn-sm ${
                      selectedTask.estado === "DONE"
                        ? "btn-outline-warning"
                        : "btn-success"
                    } d-flex align-items-center gap-1`}
                    onClick={async () => {
                      await onComplete(selectedTask.id);
                      setSelectedTask((prev) =>
                        prev
                          ? {
                              ...prev,
                              estado:
                                prev.estado === "DONE"
                                  ? ("TODO" as TaskStatus)
                                  : ("DONE" as TaskStatus),
                            }
                          : null
                      );
                    }}
                    disabled={completingId === selectedTask.id}
                  >
                    {selectedTask.estado === "DONE" ? (
                      <>
                        <LuCheck size={14} />
                        <span>Reabrir tarea</span>
                      </>
                    ) : (
                      <>
                        <LuCircleCheck size={14} />
                        <span>Marcar completada</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="d-flex gap-2">
                {onEdit && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                    onClick={() => {
                      const t = selectedTask;
                      setSelectedTask(null);
                      onEdit(t);
                    }}
                  >
                    <LuPencil size={14} />
                    <span>Editar</span>
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
                    onClick={() => {
                      const t = selectedTask;
                      setSelectedTask(null);
                      onDelete(t);
                    }}
                    disabled={deletingId === selectedTask.id}
                  >
                    <LuTrash2 size={14} />
                    <span>Eliminar</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskCalendarView;
