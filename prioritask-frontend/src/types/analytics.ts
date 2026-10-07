export interface MemberWorkload {
  user_id: string;
  nombre: string;
  tareas_asignadas: number;
  tareas_completadas: number;
  peso_total_completado: number;
}

export interface RoomAnalyticsResponse {
  room_id: string;
  total_tareas_activas: number;
  total_tareas_completadas: number;
  tasa_completitud: number; // 0.0 - 100.0
  distribucion_por_categoria: Record<string, number>;
  distribucion_por_miembro: MemberWorkload[];
  tareas_vencidas: number;
}
