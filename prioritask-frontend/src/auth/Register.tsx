import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  LuUser,
  LuMail,
  LuLock,
  LuEye,
  LuEyeOff,
  LuCircleAlert,
  LuSun,
  LuMoon,
} from "react-icons/lu";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useTheme } from "../context/ThemeContext";
import { Card, Input, Button } from "../components/ui";
import type { TokenResponse } from "../types/auth";
import type { Room } from "../types/task";
import "./Auth.css";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Creando cuenta...");

  const navigate = useNavigate();
  const { setRoomId, refreshRooms } = useRoom();
  const { theme, toggleTheme } = useTheme();

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
    setLoadingMessage("Creando tu cuenta...");
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
        setRoomId(null);
        navigate("/rooms/create");
      } else {
        const id = rooms[0].id;
        setRoomId(id);
        await refreshRooms();
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
        setError("Error al registrar la cuenta. Revisa los datos ingresados.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {/* Selector de tema flotante */}
      <button
        type="button"
        className="auth-theme-toggle"
        onClick={toggleTheme}
        aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
        title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
      >
        {theme === "dark" ? <LuSun size={18} /> : <LuMoon size={18} />}
      </button>

      <Card className="auth-card" noBodyWrap={true}>
        <div className="auth-header">
          <div className="auth-logo-badge">
            <img src="/logo.png" alt="Prioritask logo" className="auth-logo-img" />
          </div>
          <h1 className="auth-title">Crear cuenta</h1>
          <p className="auth-subtitle">Únete a Prioritask para organizar las tareas del hogar</p>
        </div>

        <form onSubmit={handleRegister} className="auth-form" noValidate>
          {error && (
            <div className="auth-error-banner" role="alert">
              <LuCircleAlert size={18} className="auth-error-icon" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <Input
            label="Nombre completo o alias"
            type="text"
            placeholder="Ej. Alex Gómez"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            leftIcon={<LuUser size={16} />}
            required
            autoComplete="name"
          />

          <Input
            label="Correo electrónico"
            type="email"
            placeholder="nombre@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            leftIcon={<LuMail size={16} />}
            required
            autoComplete="email"
          />

          <Input
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            leftIcon={<LuLock size={16} />}
            rightIcon={
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                tabIndex={-1}
              >
                {showPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
              </button>
            }
            required
            autoComplete="new-password"
          />

          <Input
            label="Confirmar contraseña"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Repite la contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            leftIcon={<LuLock size={16} />}
            rightIcon={
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Ocultar contraseña" : "Ver contraseña"}
                tabIndex={-1}
              >
                {showConfirmPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
              </button>
            }
            required
            autoComplete="new-password"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            className="auth-submit-btn"
          >
            {isLoading ? loadingMessage : "Crear cuenta"}
          </Button>
        </form>

        <div className="auth-footer">
          <p>
            ¿Ya tienes una cuenta?{" "}
            <Link to="/login" className="auth-link">
              Inicia sesión aquí
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
