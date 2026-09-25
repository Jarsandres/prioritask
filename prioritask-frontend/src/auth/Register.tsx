import { useState, useContext } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import styles from "./Login.module.css";
import { RoomContext } from "../context/RoomContext";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import type { TokenResponse } from "../types/auth";
import type { Room } from "../types/task";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  // FE-005 (bonus): Estado de carga para prevenir doble submit
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Registrando...");
  const navigate = useNavigate();
  const { setRoomId } = useContext(RoomContext);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername) {
      setError("El nombre de usuario es obligatorio.");
      return;
    }

    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Por favor, introduce un correo electrónico válido.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres por seguridad.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsLoading(true);
    setLoadingMessage("Registrando...");
    try {
      await api.post("/auth/register", {
        nombre: cleanUsername,
        email: cleanEmail,
        password,
      });

      // Autologin transparente tras el registro
      setLoadingMessage("Iniciando sesión...");
      const loginRes = await api.post<TokenResponse>("/auth/login", {
        email: cleanEmail,
        password,
      });

      const { access_token, refresh_token } = loginRes.data;
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
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data.detail
        );
      } else {
        setError("Error al registrar. Revisa los datos.");
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src="/logo.png" alt="Prioritask logo" className={styles.logo} />
        <h1 className={styles.title}>Crear cuenta</h1>
        <form onSubmit={handleRegister}>
          <input
            type="text"
            placeholder="Nombre de usuario"
            className={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            required
          />
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
          <div className={styles.passwordContainer}>
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirmar contraseña"
              className={styles.passwordInput}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
            />
            <button
              type="button"
              className={styles.togglePasswordBtn}
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              aria-label={showConfirmPassword ? "Ocultar confirmar contraseña" : "Ver confirmar contraseña"}
              disabled={isLoading}
            >
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
          {/* FE-005: Botón deshabilitado durante el registro */}
          <button
            type="submit"
            className={styles.button}
            disabled={isLoading}
          >
            {isLoading ? loadingMessage : "Registrarse"}
          </button>
        </form>
        <p className={styles.registerText}>
          {/* FE-008: Sustituido <a href> por <Link to> para navegación SPA */}
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className={styles.registerLink}>
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
