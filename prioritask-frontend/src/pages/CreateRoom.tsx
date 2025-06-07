import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { RoomContext } from "../context/RoomContext";

const CreateRoom = () => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { setRoomId } = useContext(RoomContext);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post("/rooms", { nombre: name });
      const { id } = res.data;
      localStorage.setItem("roomId", id);
      setRoomId(id);
      navigate("/dashboard");
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Error al crear el hogar");
    }
  };

  return (
    <div className="container mt-4">
      <h2>Crear Hogar</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label>Nombre del hogar</label>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary">Crear</button>
      </form>
    </div>
  );
};

export default CreateRoom;
