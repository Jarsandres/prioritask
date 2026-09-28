import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { LuHouse, LuArrowLeft, LuCheck } from "react-icons/lu";

const CreateRoom = () => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { setRoomId, refreshRooms } = useRoom();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("El nombre del hogar no puede estar vacío.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const res = await api.post<{ id: string }>("/rooms", { nombre: cleanName });
      const { id } = res.data;
      setRoomId(id);
      await refreshRooms();
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
        setError("Error al crear el hogar. Intenta nuevamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container-fluid py-2" style={{ maxWidth: "620px" }}>
      {/* Cabecera */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link
              to="/dashboard"
              className="text-muted d-flex align-items-center gap-1 text-decoration-none small"
              title="Volver al Dashboard"
            >
              <LuArrowLeft size={16} />
              <span>Dashboard</span>
            </Link>
          </div>
          <h2 className="fw-bold mb-1" style={{ fontSize: "24px" }}>
            Crear Nuevo Hogar
          </h2>
          <p className="text-muted mb-0" style={{ fontSize: "14px" }}>
            Configura un espacio colaborativo para sincronizar las tareas del grupo
          </p>
        </div>

        <Link to="/dashboard">
          <Button variant="outline" size="sm" leftIcon={<LuArrowLeft size={14} />}>
            Volver
          </Button>
        </Link>
      </div>

      <Card
        title="Información del Hogar"
        subtitle="Un hogar agrupa todas las tareas, estados y miembros convivientes"
        icon={<LuHouse size={20} className="text-primary" />}
        className="mb-4"
      >
        {error && (
          <div className="alert alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="room-name" className="form-label fw-semibold" style={{ fontSize: "13px" }}>
              Nombre del hogar o espacio *
            </label>
            <input
              id="room-name"
              type="text"
              className="form-control"
              style={{
                borderRadius: "10px",
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-main)",
                minHeight: "44px",
                fontSize: "15px",
              }}
              placeholder="Ej. Casa Principal, Apartamento 4B, Oficina..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
            />
            <small className="text-muted mt-2 d-block" style={{ fontSize: "12px" }}>
              Este nombre identificará el espacio compartido para ti y todos los miembros invitados.
            </small>
          </div>

          <div className="d-flex justify-content-end gap-2 pt-3 border-top">
            <Link to="/dashboard">
              <Button variant="ghost" size="md" disabled={isSubmitting}>
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={<LuCheck size={16} />}
              isLoading={isSubmitting}
              disabled={!name.trim() || isSubmitting}
            >
              Crear Hogar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default CreateRoom;
