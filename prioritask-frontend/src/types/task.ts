// ─────────────────────────────────────────────
// Tipos compartidos del dominio Prioritask
// ─────────────────────────────────────────────

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export interface Tag {
  id: string;
  nombre: string;
}

export interface Task {
  id: string;
  titulo: string;
  descripcion?: string;
  estado: TaskStatus;
  categoria: string;
  peso: number;
  due_date?: string;
  deleted_at?: string | null;
  room_id?: string | null;
  tags?: Tag[];
}

export interface Room {
  id: string;
  nombre: string;
  count?: number;
}

export interface HistoryEntry {
  id: string;
  action: string;
  timestamp: string;
  changes?: string;
  user_id: string;
  task_title: string;
}

export interface Assignment {
  id: number;
  task_id: string;
  user_id: string;
  asignado_por: string;
  fecha: string;
}

/** Opción genérica para react-select */
export interface SelectOption {
  value: string;
  label: string;
}
