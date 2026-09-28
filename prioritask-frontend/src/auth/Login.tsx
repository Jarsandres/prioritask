import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { setRoomId, refreshRooms } = useRoom();
  const { theme, toggleTheme } = useTheme();

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
          <h1 className="auth-title">Iniciar sesión</h1>
          <p className="auth-subtitle">Gestiona las prioridades de tu hogar de forma simple</p>
        </div>

        <form onSubmit={handleLogin} className="auth-form" noValidate>
          {error && (
            <div className="auth-error-banner" role="alert">
              <LuCircleAlert size={18} className="auth-error-icon" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

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
            placeholder="••••••••"
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
            autoComplete="current-password"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            className="auth-submit-btn"
          >
            {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
          </Button>
        </form>

        <div className="auth-footer">
          <p>
            ¿No tienes cuenta?{" "}
            <Link to="/register" className="auth-link">
              Regístrate gratis
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
