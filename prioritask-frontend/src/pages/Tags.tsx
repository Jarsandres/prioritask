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

  return (
    <div className="container mt-4">
      <h2>Etiquetas</h2>
      <form onSubmit={handleCreate} className="mb-3 d-flex gap-2">
        <input
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
          <li key={tag.id} className="list-group-item d-flex justify-content-between align-items-center">
            {tag.nombre}
            <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(tag.id)}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Tags;
