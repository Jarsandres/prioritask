// ─────────────────────────────────────────────
// Tipos de Adjuntos y Evidencias Fotográficas (Sprint 10)
// ─────────────────────────────────────────────

export interface TaskAttachment {
  id: string;
  task_id: string;
  user_id: string;
  filename: string;
  content_type: string;
  file_size_bytes: number;
  caption?: string | null;
  download_url: string;
  created_at: string;
}

export interface AttachmentUploadOptions {
  file: File;
  caption?: string;
  onProgress?: (progress: number) => void;
}
