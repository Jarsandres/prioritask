import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import RetroWindow from "../components/common/RetroWindow";

const CreateRoom = () => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setRoomId } = useRoom();

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
    <div className="container-fluid py-2" style={{ maxWidth: "680px" }}>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>🏠</span> CONFIGURACIÓN DE HOGAR / CREATE_ROOM.EXE
          </h2>
          <p className="retro-page-subtitle">
            Crea tu espacio colaborativo para sincronizar las tareas del grupo
          </p>
        </div>
        <Link
          to="/dashboard"
          className="btn-retro btn-retro-outline"
          style={{ minHeight: "40px" }}
        >
          <span>⬅</span> <span>Volver</span>
        </Link>
      </div>

      <RetroWindow
        title="CREATE_ROOM.EXE - ASISTENTE DE CREACIÓN"
        icon="🏠"
      >
        {error && <div className="alert alert-danger mb-4">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="room-name" className="form-label fw-bold small text-muted">
              NOMBRE DEL HOGAR O ESPACIO OPERATIVO *
            </label>
            <input
              id="room-name"
              type="text"
              className="form-control retro-input"
              placeholder="Ej. Casa Principal, Oficina Compartida, Loft..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
            />
            <small className="text-muted mt-1 d-block">
              Este nombre identificará el espacio para ti y los miembros colaboradores.
            </small>
          </div>

          <button
            type="submit"
            className="btn-retro btn-retro-primary w-100"
            style={{ minHeight: "48px" }}
            disabled={!name.trim() || isSubmitting}
          >
            <span>{isSubmitting ? "⏳" : "💾"}</span>
            <span>{isSubmitting ? "Inicializando Hogar..." : "Crear Hogar"}</span>
          </button>
        </form>
      </RetroWindow>
    </div>
  );
};

export default CreateRoom;
