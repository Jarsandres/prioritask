import { useEffect, useState } from "react";
import api from "../api";
import ConfirmModal from "../components/ConfirmModal";
import RetroWindow from "../components/common/RetroWindow";
import EmptyState from "../components/common/EmptyState";
import type { Tag } from "../types/task";

// FE-010: Tag importado del módulo de tipos compartidos

const Tags = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  // Loading states por acción
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // FE-017: Modal de confirmación para eliminar etiquetas
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);

  const fetchTags = async () => {
    try {
      const res = await api.get<Tag[]>("/tags");
      setTags(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (tags.some((t) => t.nombre.toLowerCase() === nombre.toLowerCase())) {
      setError("Etiqueta duplicada");
      return;
    }
    setIsCreating(true);
    try {
      await api.post("/tags", { nombre });
      setNombre("");
      await fetchTags();
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
        setError("Error al crear etiqueta");
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
      setTagToDelete(null);
    } catch (err) {
      console.error(err);
      setError("Error al eliminar la etiqueta");
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditingNombre(tag.nombre);
    setError("");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setError("");
    setIsUpdating(true);
    try {
      await api.patch(`/tags/${editingId}`, { nombre: editingNombre });
      setEditingId(null);
      setEditingNombre("");
      await fetchTags();
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
        setError("Error al actualizar etiqueta");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="container-fluid py-2">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>🏷️</span> ADMINISTRADOR DE ETIQUETAS
          </h2>
          <p className="retro-page-subtitle">
            Crea y administra etiquetas para clasificar y organizar tareas
          </p>
        </div>
      </div>

      <RetroWindow
        title="ETIQUETAS"
        icon="🏷️"
      >
        {error && <div className="alert alert-danger mb-3">{error}</div>}

        {/* Formulario retro para crear etiqueta */}
        <form onSubmit={handleCreate} className="mb-4">
          <div className="row g-2">
            <div className="col-12 col-sm-8 col-md-9">
              <input
                id="create-tag-name"
                name="createTagName"
                className="form-control retro-input w-100"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nueva etiqueta (ej. Urgente, Compras, Hogar...)"
                disabled={isCreating}
              />
            </div>
            <div className="col-12 col-sm-4 col-md-3">
              <button
                className="btn-retro btn-retro-primary w-100"
                style={{ minHeight: "44px" }}
                type="submit"
                disabled={isCreating || !nombre.trim()}
              >
                <span>➕</span>
                <span>{isCreating ? "Creando..." : "Crear Etiqueta"}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Lista de etiquetas retro */}
        {tags.length === 0 ? (
          <EmptyState
            icon="🏷️"
            title="No hay etiquetas creadas"
            description="Añade etiquetas arriba para clasificar tus tareas."
          />
        ) : (
          <div className="d-flex flex-column gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="retro-tag-row d-flex justify-content-between align-items-center p-3"
              >
                {editingId === tag.id ? (
                  <form onSubmit={handleUpdate} className="d-flex gap-2 flex-grow-1 flex-wrap">
                    <input
                      id="update-tag-name"
                      name="updateTagName"
                      className="form-control retro-input flex-grow-1"
                      style={{ minWidth: "200px" }}
                      value={editingNombre}
                      onChange={(e) => setEditingNombre(e.target.value)}
                      autoFocus
                      disabled={isUpdating}
                    />
                    <button
                      className="btn-retro btn-retro-success"
                      style={{ minHeight: "40px" }}
                      type="submit"
                      disabled={isUpdating || !editingNombre.trim()}
                    >
                      <span>💾</span>
                      <span>{isUpdating ? "Guardando..." : "Guardar"}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-retro btn-retro-outline"
                      style={{ minHeight: "40px" }}
                      onClick={() => setEditingId(null)}
                      disabled={isUpdating}
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="d-flex align-items-center gap-2">
                      <span className="retro-tag">#{tag.nombre}</span>
                      <span className="text-muted small font-monospace d-none d-sm-inline">
                        ID: {tag.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn-retro btn-retro-outline"
                        style={{ minHeight: "38px", padding: "0.35rem 0.8rem", fontSize: "0.85rem" }}
                        onClick={() => startEdit(tag)}
                        disabled={deletingId === tag.id}
                      >
                        <span>✏️</span> <span>Editar</span>
                      </button>
                      <button
                        className="btn-retro btn-retro-danger"
                        style={{ minHeight: "38px", padding: "0.35rem 0.8rem", fontSize: "0.85rem" }}
                        onClick={() => promptDeleteTag(tag)}
                        disabled={deletingId === tag.id}
                      >
                        <span>🗑️</span> <span>{deletingId === tag.id ? "Eliminando..." : "Eliminar"}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </RetroWindow>

      {/* FE-017: Modal de confirmación para eliminar etiquetas */}
      <ConfirmModal
        isOpen={!!tagToDelete}
        title="Eliminar etiqueta"
        message={`¿Estás seguro de que deseas eliminar la etiqueta "${tagToDelete?.nombre}"?`}
        confirmText="Eliminar"
        variant="danger"
        isLoading={!!deletingId}
        onConfirm={handleConfirmDelete}
        onCancel={() => setTagToDelete(null)}
      />
    </div>
  );
};

export default Tags;
