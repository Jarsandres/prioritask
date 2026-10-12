/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useRoom } from "../context/RoomContext";
import { useToast } from "../context/ToastContext";
import { SignInPage, type Testimonial } from "../components/ui";
import type { TokenResponse } from "../types/auth";
import type { Room } from "../types/task";
import "./Auth.css";

export const REMEMBER_EMAIL_STORAGE_KEY = "prioritask-remember-email";

export const PRIORITASK_HERO_IMAGE =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80";

export const PRIORITASK_TESTIMONIALS: Testimonial[] = [
  {
    avatarSrc:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&q=80",
    name: "Elena Martínez",
    handle: "@elenam_piso",
    badge: "🔥 Racha 14d · P1",
    text: "Se acabaron las discusiones en nuestro piso compartido. Las prioridades P1–P4 y las rachas hicieron que todos colaboremos sin recordatorios.",
  },
  {
    avatarSrc:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&q=80",
    name: "Carlos & Sofía",
    handle: "@carlosysofia",
    badge: "⚖️ Reparto 50/50",
    text: "Por fin vemos el reparto real de la carga doméstica cada semana. Planificar las compras y la cocina nos lleva menos de cinco minutos.",
  },
  {
    avatarSrc:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&q=80",
    name: "Familia Vega",
    handle: "@familiavega_hogar",
    badge: "👏 +120 pts Kiosco",
    text: "El Modo Kiosco en la tablet de la cocina y los aplausos en el historial han conseguido que hasta los niños quieran completar sus tareas.",
  },
];

export default function Login() {
  const [email, setEmail] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(REMEMBER_EMAIL_STORAGE_KEY) ?? "";
    }
    return "";
  });
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(REMEMBER_EMAIL_STORAGE_KEY);
      return saved !== null ? true : true;
    }
    return true;
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { setRoomId, refreshRooms } = useRoom();
  const toast = useToast();

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    if (!checked && typeof window !== "undefined") {
      localStorage.removeItem(REMEMBER_EMAIL_STORAGE_KEY);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
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

      if (rememberMe) {
        localStorage.setItem("refreshToken", refresh_token);
        localStorage.setItem(REMEMBER_EMAIL_STORAGE_KEY, email.trim());
      } else {
        localStorage.removeItem("refreshToken");
        localStorage.removeItem(REMEMBER_EMAIL_STORAGE_KEY);
      }

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
        setError(
          "Credenciales inválidas. Por favor, verifica tu correo y contraseña."
        );
      } else {
        setError("Error al iniciar sesión. Revisa tus credenciales.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    toast.info(
      "El inicio de sesión con Google OAuth estará disponible próximamente. Accede con tu correo y contraseña.",
      { title: "Google OAuth" }
    );
  };

  const handleResetPassword = () => {
    toast.info(
      "Para restablecer tu contraseña, contacta con el administrador de tu hogar o crea una cuenta nueva.",
      { title: "Recuperación de contraseña" }
    );
  };

  return (
    <SignInPage
      title={<span className="auth-title-gradient">Iniciar sesión</span>}
      description="Gestiona las prioridades y el equilibrio de tu hogar de forma simple"
      heroImageSrc={PRIORITASK_HERO_IMAGE}
      testimonials={PRIORITASK_TESTIMONIALS}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      rememberMe={rememberMe}
      onRememberMeChange={handleRememberMeChange}
      error={error}
      isLoading={isLoading}
      submitLabel="Iniciar sesión"
      loadingLabel="Iniciando sesión..."
      onSignIn={handleLogin}
      onGoogleSignIn={handleGoogleSignIn}
      onResetPassword={handleResetPassword}
      onCreateAccount={() => navigate("/register")}
    />
  );
}
