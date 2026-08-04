import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { RoomContext } from "../context/RoomContext";

const CreateRoom = () => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setRoomId } = useContext(RoomContext);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const res = await api.post<{ id: string }>("/rooms", { nombre: name });
      const { id } = res.data;
      localStorage.setItem("roomId", id);
      setRoomId(id);
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error(err);
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al crear el hogar");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mt-4">
      <h2>Crea tu hogar para comenzar</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="room-name" className="form-label">Nombre del hogar</label>
          <input
            id="room-name"
            type="text"
            className="form-control"
            placeholder="Mi Casa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!name || isSubmitting}
        >
          {isSubmitting ? "Creando..." : "Crear"}
        </button>
      </form>
    </div>
  );
};

export default CreateRoom;
