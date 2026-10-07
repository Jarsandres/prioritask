import React, { useState, useEffect, useRef, useCallback } from "react";
import api from "../../api";
import type { TaskComment, TaskCommentCreate } from "../../types/task";
import { useToast } from "../../context/ToastContext";
import { useTaskUpdate } from "../../context/TaskUpdateContext";
import ConfirmModal from "../ConfirmModal";
import Skeleton from "../ui/Skeleton";
import {
  LuMessageSquare,
  LuSend,
  LuTrash2,
  LuLoaderCircle,
  LuUser,
  LuClock,
} from "react-icons/lu";
import "./tasks.css";

export interface TaskCommentsSectionProps {
  taskId: string;
  className?: string;
  readOnly?: boolean;
  onCommentsCountChange?: (count: number) => void;
}

const getUserIdFromToken = (): string | null => {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(window.atob(base64));
    return payload.sub || payload.user_id || null;
  } catch {
    return null;
  }
};

export const TaskCommentsSection: React.FC<TaskCommentsSectionProps> = ({
  taskId,
  className = "",
  readOnly = false,
  onCommentsCountChange,
}) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<TaskComment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const { notifyUpdate } = useTaskUpdate();
  const currentUserId = getUserIdFromToken();
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await api.get<TaskComment[]>(`/tasks/${taskId}/comments`, {
          signal,
        });
        setComments(res.data);
        onCommentsCountChange?.(res.data.length);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error("Error al cargar comentarios de la tarea:", err);
      } finally {
        setLoading(false);
      }
    },
    [taskId, onCommentsCountChange]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchComments(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchComments]);

  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || submitting || readOnly) return;

    setSubmitting(true);
    try {
      const payload: TaskCommentCreate = { contenido: trimmed };
      const res = await api.post<TaskComment>(
        `/tasks/${taskId}/comments`,
        payload
      );
      const updated = [...comments, res.data];
      setComments(updated);
      setNewComment("");
      onCommentsCountChange?.(updated.length);
      notifyUpdate();
      toast.success("Comentario publicado");

      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: unknown) {
      console.error("Error al agregar comentario:", err);
      toast.error("No se pudo agregar el comentario. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    }
  };

  const handleConfirmDelete = async () => {
    if (!commentToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/tasks/${taskId}/comments/${commentToDelete.id}`);
      const updated = comments.filter((c) => c.id !== commentToDelete.id);
      setComments(updated);
      onCommentsCountChange?.(updated.length);
      notifyUpdate();
      toast.success("Comentario eliminado");
      setCommentToDelete(null);
    } catch (err: unknown) {
      console.error("Error al eliminar comentario:", err);
      toast.error("No se pudo eliminar el comentario");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCommentTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`task-comments-section ${className}`.trim()}>
      <div className="task-comments-header d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <LuMessageSquare className="text-primary" size={17} aria-hidden="true" />
          <h5 className="mb-0 fw-semibold" style={{ fontSize: "15px" }}>
            Notas y Comentarios
          </h5>
          <span className="badge rounded-pill bg-light text-dark border ms-1" style={{ fontSize: "11px" }}>
            {comments.length}
          </span>
        </div>
      </div>

      {/* Lista de comentarios */}
      <div className="task-comments-list mb-3">
        {loading ? (
          <div className="d-flex flex-column gap-2 p-2">
            <Skeleton height="45px" variant="rounded" />
            <Skeleton height="45px" variant="rounded" />
          </div>
        ) : comments.length === 0 ? (
          <div className="task-comments-empty p-3 text-center text-muted">
            <LuMessageSquare size={24} className="mb-2 opacity-50" />
            <p className="small mb-0">No hay comentarios en esta tarea aún.</p>
            {!readOnly && (
              <p className="x-small text-muted mb-0" style={{ fontSize: "12px" }}>
                Escribe una nota o comentario para colaborar con el equipo.
              </p>
            )}
          </div>
        ) : (
          comments.map((comment) => {
            const isAuthor = currentUserId && comment.user_id === currentUserId;
            return (
              <div
                key={comment.id}
                className={`task-comment-item p-2 mb-2 rounded border ${
                  isAuthor ? "my-comment" : ""
                }`}
              >
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <div className="d-flex align-items-center gap-1">
                    <LuUser size={13} className="text-muted" />
                    <span className="fw-semibold small" style={{ fontSize: "13px" }}>
                      {comment.author_name || "Miembro del equipo"}
                    </span>
                    {isAuthor && (
                      <span className="badge bg-secondary-subtle text-secondary py-0 px-1" style={{ fontSize: "10px" }}>
                        Tú
                      </span>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className="text-muted d-flex align-items-center gap-1" style={{ fontSize: "11px" }}>
                      <LuClock size={11} />
                      {formatCommentTime(comment.created_at)}
                    </span>
                    {!readOnly && isAuthor && (
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0 border-0"
                        title="Eliminar comentario"
                        onClick={() => setCommentToDelete(comment)}
                        aria-label="Eliminar comentario"
                      >
                        <LuTrash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="task-comment-body text-break small"
                  style={{ whiteSpace: "pre-wrap", fontSize: "13px" }}
                >
                  {comment.contenido}
                </div>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Formulario para agregar nuevo comentario */}
      {!readOnly && (
        <form onSubmit={handleAddComment} className="task-comment-form">
          <div className="input-group">
            <textarea
              ref={textareaRef}
              rows={2}
              className="form-control"
              placeholder="Escribe un comentario... (Enter para enviar, Shift+Enter para salto de línea)"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={submitting}
              maxLength={2000}
              style={{
                fontSize: "13px",
                resize: "none",
                borderRadius: "8px 0 0 8px",
              }}
            />
            <button
              type="submit"
              className="btn btn-primary d-flex align-items-center px-3"
              disabled={!newComment.trim() || submitting}
              title="Publicar comentario"
              style={{ borderRadius: "0 8px 8px 0" }}
            >
              {submitting ? (
                <LuLoaderCircle size={16} className="ui-btn-spinner" />
              ) : (
                <LuSend size={15} />
              )}
            </button>
          </div>
          <div className="d-flex justify-content-between mt-1 px-1">
            <span className="text-muted" style={{ fontSize: "11px" }}>
              Presiona Enter para enviar
            </span>
            <span className="text-muted" style={{ fontSize: "11px" }}>
              {newComment.length}/2000
            </span>
          </div>
        </form>
      )}

      {/* Modal de confirmación para eliminar comentario */}
      <ConfirmModal
        isOpen={!!commentToDelete}
        title="Eliminar comentario"
        message="¿Estás seguro de que deseas eliminar este comentario? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setCommentToDelete(null)}
      />
    </div>
  );
};

export default TaskCommentsSection;
