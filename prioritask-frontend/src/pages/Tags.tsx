import { useEffect, useState } from "react";
import api from "../api";
import ConfirmModal from "../components/ConfirmModal";
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
    <div className="container mt-4">
      <h2>Etiquetas</h2>
      <form onSubmit={handleCreate} className="mb-3 d-flex gap-2">
        <input
          id="create-tag-name"
          name="createTagName"
          className="form-control"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nueva etiqueta"
          disabled={isCreating}
        />
        <button
          className="btn btn-primary"
          type="submit"
          disabled={isCreating || !nombre}
        >
          {isCreating ? "Creando..." : "Crear"}
        </button>
      </form>
      {error && <div className="alert alert-danger">{error}</div>}
      <ul className="list-group">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="list-group-item d-flex justify-content-between align-items-center"
          >
            {editingId === tag.id ? (
              <form onSubmit={handleUpdate} className="d-flex gap-2 flex-grow-1">
                <input
                  id="update-tag-name"
                  name="updateTagName"
                  className="form-control"
                  value={editingNombre}
                  onChange={(e) => setEditingNombre(e.target.value)}
                  autoFocus
                  disabled={isUpdating}
                />
                <button
                  className="btn btn-sm btn-primary"
                  type="submit"
                  disabled={isUpdating || !editingNombre}
                >
                  {isUpdating ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setEditingId(null)}
                  disabled={isUpdating}
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <span className="badge bg-secondary me-2">{tag.nombre}</span>
                <div>
                  <button
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={() => startEdit(tag)}
                    disabled={deletingId === tag.id}
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => promptDeleteTag(tag)}
                    disabled={deletingId === tag.id}
                  >
                    {deletingId === tag.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

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
