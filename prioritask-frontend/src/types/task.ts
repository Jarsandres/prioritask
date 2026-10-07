// ─────────────────────────────────────────────
// Tipos compartidos del dominio Prioritask
// ─────────────────────────────────────────────

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export interface Tag {
  id: string;
  nombre: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  titulo: string;
  completada: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface SubtaskCreate {
  titulo: string;
  orden?: number;
}

export interface SubtaskUpdate {
  titulo?: string;
  completada?: boolean;
  orden?: number;
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
  is_recurring?: boolean;
  subtasks?: Subtask[];
  subtasks_count?: number;
  subtasks_completed_count?: number;
  comments_count?: number;
  attachments_count?: number;
}

export type { TaskAttachment } from "./attachment";

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  author_name: string | null;
  contenido: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface TaskCommentCreate {
  contenido: string;
}

export interface TaskCommentUpdate {
  contenido: string;
}

export type RoomRole = "ADMIN" | "MEMBER";

export interface RoomMember {
  user_id: string;
  room_id: string;
  role: RoomRole;
  joined_at: string;
  user_email?: string | null;
  user_nombre?: string | null;
}

export interface Room {
  id: string;
  nombre: string;
  codigo_invitacion?: string | null;
  rol_usuario?: string | null;
  owner_id?: string;
  owner?: string;
  parent_id?: string | null;
  is_owner?: boolean;
  my_role?: RoomRole | null;
  members?: RoomMember[];
  count?: number;
}

export interface AIHealthStatus {
  status: "healthy" | "degraded";
  circuit_state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failure_count: number;
  success_count: number;
  model: string;
  cache_stats?: { hits: number; misses: number; size: number };
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
