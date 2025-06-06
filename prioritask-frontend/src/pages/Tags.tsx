import { useEffect, useState } from "react";
import api from "../api";

interface Tag {
  id: string;
  nombre: string;
}

const Tags = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNombre, setEditingNombre] = useState("");
  

  const fetchTags = async () => {
    try {
      const res = await api.get("/tags");
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
    try {
      await api.post("/tags", { nombre });
      setNombre("");
      fetchTags();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al crear etiqueta");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar etiqueta?")) return;
    try {
      await api.delete(`/tags/${id}`);
      setTags(tags.filter((t) => t.id !== id));
    } catch (err) {
      console.error(err);
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
    try {
      await api.patch(`/tags/${editingId}`, { nombre: editingNombre });
      setEditingId(null);
      setEditingNombre("");
      fetchTags();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al actualizar etiqueta");
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
        />
        <button className="btn btn-primary" type="submit">
          Crear
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
                />
                <button className="btn btn-sm btn-primary" type="submit">
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setEditingId(null)}
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
                  >
                    Editar
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => handleDelete(tag.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Tags;
