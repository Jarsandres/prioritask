import { useEffect, useState, useCallback } from "react";
import { LuTags, LuPlus, LuPencil, LuTrash2, LuCheck, LuX, LuRotateCw } from "react-icons/lu";
import api from "../api";
import ConfirmModal from "../components/ConfirmModal";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/common/EmptyState";
import { useToast } from "../context/ToastContext";
import type { Tag } from "../types/task";

const Tags = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const toast = useToast();

  const fetchTags = useCallback(async () => {
    try {
      const res = await api.get<Tag[]>("/tags");
      setTags(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar las etiquetas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanNombre = nombre.trim();
    if (!cleanNombre) return;

    if (tags.some((t) => t.nombre.toLowerCase() === cleanNombre.toLowerCase())) {
      setError("Ya existe una etiqueta con este nombre.");
      return;
    }

    setIsCreating(true);
    try {
      const res = await api.post<Tag>("/tags", { nombre: cleanNombre });
      setNombre("");
      setTags((prev) => [...prev, res.data]);
      toast.success(`Etiqueta "${cleanNombre}" creada con éxito.`);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al crear la etiqueta.");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const promptDeleteTag = (tag: Tag) => {
    setError("");
    setTagToDelete(tag);
  };

  const handleConfirmDelete = async () => {
    if (!tagToDelete) return;
    const id = tagToDelete.id;
    setDeletingId(id);
    try {
      await api.delete(`/tags/${id}`);
      setTags((prev) => prev.filter((t) => t.id !== id));
      toast.info(`Etiqueta "${tagToDelete.nombre}" eliminada.`);
      setTagToDelete(null);
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar la etiqueta.");
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditingNombre(tag.nombre);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingNombre("");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const cleanNombre = editingNombre.trim();
    if (!cleanNombre) return;

    setError("");
    setIsUpdating(true);
    try {
      await api.patch(`/tags/${editingId}`, { nombre: cleanNombre });
      setTags((prev) =>
        prev.map((t) => (t.id === editingId ? { ...t, nombre: cleanNombre } : t))
      );
      toast.success("Etiqueta actualizada correctamente.");
      setEditingId(null);
      setEditingNombre("");
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al actualizar la etiqueta.");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="container-fluid py-3 px-2 px-md-4">
      {/* Cabecera Moderna */}
      <div className="d-flex justify-content-between align-items-start align-items-md-center mb-4 flex-column flex-md-row gap-3">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="d-flex align-items-center justify-content-center rounded-3 p-2"
              style={{
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
              }}
            >
              <LuTags size={22} />
            </div>
            <h1 className="h3 mb-0 fw-bold" style={{ letterSpacing: "-0.02em" }}>
              Administrador de Etiquetas
            </h1>
          </div>
          <p className="text-muted mb-0 small">
            Crea y organiza etiquetas temáticas para clasificar tus tareas y proyectos compartidos
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          leftIcon={<LuRotateCw className={loading ? "spin" : ""} size={15} />}
          onClick={fetchTags}
          disabled={loading}
        >
          Actualizar
        </Button>
      </div>

      {/* Formulario de Creación */}
      <Card className="p-3 mb-4 shadow-xs">
        <form onSubmit={handleCreate}>
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-9">
              <Input
                label="Nueva Etiqueta"
                placeholder="Ej. Compras, Urgente, Limpieza, Finanzas..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={isCreating}
                error={error}
              />
            </div>
            <div className="col-12 col-md-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-100"
                leftIcon={<LuPlus size={16} />}
                isLoading={isCreating}
                disabled={!nombre.trim()}
              >
                Crear Etiqueta
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Lista de Etiquetas */}
      <Card
        title="Etiquetas Registradas"
        headerActions={
          <span className="badge rounded-pill fw-normal text-muted" style={{ backgroundColor: "var(--bg-subtle, #f1f5f9)" }}>
            {tags.length} etiqueta{tags.length !== 1 ? "s" : ""}
          </span>
        }
      >
        <div className="p-3">
          {loading ? (
            <div className="row g-3">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="col-12 col-sm-6 col-md-4">
                  <Skeleton variant="rounded" width="100%" height={56} />
                </div>
              ))}
            </div>
          ) : tags.length === 0 ? (
            <EmptyState
              icon={<LuTags size={28} />}
              title="No hay etiquetas registradas"
              description="Crea tu primera etiqueta utilizando el formulario superior para empezar a categorizar tus tareas."
            />
          ) : (
            <div className="row g-3">
              {tags.map((tag) => {
                const isEditing = editingId === tag.id;

                return (
                  <div key={tag.id} className="col-12 col-sm-6 col-md-4">
                    <div
                      className="p-3 rounded-3 d-flex align-items-center justify-content-between h-100"
                      style={{
                        backgroundColor: "var(--bg-subtle, #f8fafc)",
                        border: "1px solid var(--border-default, #e2e8f0)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={handleUpdate}
                          className="d-flex align-items-center gap-1.5 w-100"
                        >
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={editingNombre}
                            onChange={(e) => setEditingNombre(e.target.value)}
                            disabled={isUpdating}
                            autoFocus
                            style={{
                              borderRadius: "var(--radius-sm, 6px)",
                              borderColor: "var(--primary-500, #3b82f6)",
                            }}
                          />
                          <button
                            type="submit"
                            className="btn btn-sm btn-primary p-1.5 rounded-2 d-flex align-items-center justify-content-center"
                            disabled={isUpdating || !editingNombre.trim()}
                            title="Guardar cambios"
                          >
                            <LuCheck size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary p-1.5 rounded-2 d-flex align-items-center justify-content-center"
                            onClick={cancelEdit}
                            disabled={isUpdating}
                            title="Cancelar"
                          >
                            <LuX size={15} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="d-flex align-items-center gap-2 text-truncate pe-2">
                            <span
                              className="fw-bold"
                              style={{ color: "var(--primary-500, #3b82f6)" }}
                            >
                              #
                            </span>
                            <span
                              className="fw-semibold text-truncate"
                              style={{ color: "var(--text-heading, #0f172a)", fontSize: "0.93rem" }}
                            >
                              {tag.nombre}
                            </span>
                          </div>

                          <div className="d-flex align-items-center gap-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost p-1.5 text-muted rounded-2 d-flex align-items-center justify-content-center"
                              onClick={() => startEdit(tag)}
                              title="Editar etiqueta"
                              aria-label={`Editar ${tag.nombre}`}
                            >
                              <LuPencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost p-1.5 text-danger rounded-2 d-flex align-items-center justify-content-center"
                              onClick={() => promptDeleteTag(tag)}
                              title="Eliminar etiqueta"
                              aria-label={`Eliminar ${tag.nombre}`}
                            >
                              <LuTrash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Modal de confirmación para eliminar */}
      <ConfirmModal
        isOpen={Boolean(tagToDelete)}
        title="Eliminar Etiqueta"
        message={`¿Estás seguro de que deseas eliminar la etiqueta "${tagToDelete?.nombre}"? Las tareas asociadas perderán esta clasificación.`}
        confirmText="Eliminar Etiqueta"
        variant="danger"
        isLoading={Boolean(deletingId)}
        onConfirm={handleConfirmDelete}
        onCancel={() => setTagToDelete(null)}
      />
    </div>
  );
};

export default Tags;
