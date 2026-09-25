import { useState, useContext } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import styles from "./Login.module.css";
import { RoomContext } from "../context/RoomContext";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import type { TokenResponse } from "../types/auth";
import type { Room } from "../types/task";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  // FE-005 (bonus): Estado de carga para prevenir doble submit
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setRoomId } = useContext(RoomContext);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await api.post<TokenResponse>("/auth/login", {
        email,
        password,
      });
      const { access_token, refresh_token } = response.data;
      localStorage.setItem("token", access_token);
      localStorage.setItem("refreshToken", refresh_token);

      const roomsRes = await api.get<Room[]>("/rooms");
      const rooms = roomsRes.data;
      if (rooms.length === 0) {
        navigate("/rooms/create");
      } else {
        const id = rooms[0].id;
        setRoomId(id);
        navigate("/dashboard");
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status === 401
      ) {
        setError("Credenciales inválidas. Por favor, verifica tu correo y contraseña.");
      } else {
        setError("Error al iniciar sesión. Revisa tus credenciales.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src="/logo.png" alt="Prioritask logo" className={styles.logo} />
        <h1 className={styles.title}>Iniciar sesión</h1>
        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Correo electrónico"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />
          <div className={styles.passwordContainer}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              className={styles.passwordInput}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
            <button
              type="button"
              className={styles.togglePasswordBtn}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
              disabled={isLoading}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          {/* FE-005: Botón deshabilitado durante la petición */}
          <button
            type="submit"
            className={styles.button}
            disabled={isLoading}
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.registerText}>
          {/* FE-008: Sustituido <a href> por <Link to> para navegación SPA */}
          ¿No tienes cuenta? <Link to="/register" className={styles.registerLink}>Regístrate</Link>
        </p>
      </div>
    </div>
  );
}
