import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LuEye, LuEyeOff } from "react-icons/lu";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../context/ToastContext";
import { SignInPage, GlassInputWrapper } from "../components/ui";
import { PRIORITASK_HERO_IMAGE, PRIORITASK_TESTIMONIALS } from "./Login";
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
  const toast = useToast();

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
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
        (err as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail
      ) {
        setError(
          (err as { response: { data: { detail: string } } }).response.data
            .detail
        );
      } else {
        setError("Error al registrar la cuenta. Revisa los datos ingresados.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = () => {
    toast.info(
      "El registro rápido con Google OAuth estará disponible próximamente. Completa el formulario para crear tu cuenta.",
      { title: "Google OAuth" }
    );
  };

  return (
    <SignInPage
      title={<span className="auth-title-gradient">Crear cuenta</span>}
      description="Únete a Prioritask para organizar las tareas del hogar en equipo"
      heroImageSrc={PRIORITASK_HERO_IMAGE}
      testimonials={PRIORITASK_TESTIMONIALS}
      error={error}
      isLoading={isLoading}
      onSignIn={handleRegister}
      onGoogleSignIn={handleGoogleRegister}
      footerContent={
        <p style={{ margin: 0 }}>
          ¿Ya tienes una cuenta?{" "}
          <Link to="/login" className="auth-create-account-link">
            Inicia sesión aquí
          </Link>
        </p>
      }
    >
      <div className="animate-element animate-delay-300 auth-field-group">
        <label htmlFor="register-username-input" className="auth-field-label">
          Nombre completo o alias
        </label>
        <GlassInputWrapper>
          <input
            id="register-username-input"
            name="username"
            type="text"
            placeholder="Ej. Alex Gómez"
            className="auth-glass-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="name"
          />
        </GlassInputWrapper>
      </div>

      <div className="animate-element animate-delay-400 auth-field-group">
        <label htmlFor="register-email-input" className="auth-field-label">
          Correo electrónico
        </label>
        <GlassInputWrapper>
          <input
            id="register-email-input"
            name="email"
            type="email"
            placeholder="nombre@ejemplo.com"
            className="auth-glass-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="email"
          />
        </GlassInputWrapper>
      </div>

      <div className="animate-element animate-delay-500 auth-field-group">
        <label htmlFor="register-password-input" className="auth-field-label">
          Contraseña
        </label>
        <GlassInputWrapper>
          <div className="auth-password-field-inner">
            <input
              id="register-password-input"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Mínimo 6 caracteres"
              className="auth-glass-input auth-glass-input-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="auth-eye-toggle-btn"
              aria-label={
                showPassword ? "Ocultar contraseña" : "Ver contraseña"
              }
            >
              {showPassword ? (
                <LuEyeOff className="auth-eye-icon" size={20} />
              ) : (
                <LuEye className="auth-eye-icon" size={20} />
              )}
            </button>
          </div>
        </GlassInputWrapper>
      </div>

      <div className="animate-element animate-delay-600 auth-field-group">
        <label
          htmlFor="register-confirm-password-input"
          className="auth-field-label"
        >
          Confirmar contraseña
        </label>
        <GlassInputWrapper>
          <div className="auth-password-field-inner">
            <input
              id="register-confirm-password-input"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Repite la contraseña"
              className="auth-glass-input auth-glass-input-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="auth-eye-toggle-btn"
              aria-label={
                showConfirmPassword ? "Ocultar contraseña" : "Ver contraseña"
              }
            >
              {showConfirmPassword ? (
                <LuEyeOff className="auth-eye-icon" size={20} />
              ) : (
                <LuEye className="auth-eye-icon" size={20} />
              )}
            </button>
          </div>
        </GlassInputWrapper>
      </div>

      <button
        type="submit"
        className="animate-element animate-delay-700 auth-primary-submit-btn"
        disabled={isLoading}
      >
        {isLoading ? loadingMessage : "Crear cuenta"}
      </button>
    </SignInPage>
  );
}
