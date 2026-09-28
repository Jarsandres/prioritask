import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuUser,
  LuMail,
  LuFingerprint,
  LuSun,
  LuMoon,
  LuLogOut,
  LuShieldCheck,
} from "react-icons/lu";
import api from "../api";
import { useTheme } from "../context/ThemeContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/common/EmptyState";
import { useToast } from "../context/ToastContext";

interface User {
  id: string;
  nombre: string;
  email: string;
}

const Profile = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const controller = new AbortController();

    const fetchUser = async () => {
      try {
        const res = await api.get("/auth/me", { signal: controller.signal });
        setUser(res.data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(err);
        setError("Error al cargar la información del usuario.");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();

    return () => {
      controller.abort();
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    toast.info("Has cerrado sesión.");
    navigate("/login");
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  };

  return (
    <div className="container-fluid py-3 px-2 px-md-4" style={{ maxWidth: "800px" }}>
      {/* Cabecera Moderna */}
      <div className="mb-4">
        <div className="d-flex align-items-center gap-2 mb-1">
          <div
            className="d-flex align-items-center justify-content-center rounded-3 p-2"
            style={{
              backgroundColor: "rgba(37, 99, 235, 0.1)",
              color: "#2563eb",
            }}
          >
            <LuUser size={22} />
          </div>
          <h1 className="h3 mb-0 fw-bold" style={{ letterSpacing: "-0.02em" }}>
            Perfil de Usuario
          </h1>
        </div>
        <p className="text-muted mb-0 small">
          Información de tu cuenta, credenciales de acceso y preferencias de apariencia
        </p>
      </div>

      {error && (
        <div className="alert alert-danger mb-4 rounded-3 border-0 shadow-xs" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <Card className="p-4">
          <div className="d-flex align-items-center gap-3 mb-4">
            <Skeleton variant="circular" width={64} height={64} />
            <div>
              <Skeleton variant="text" width={160} height={24} className="mb-2" />
              <Skeleton variant="text" width={220} height={16} />
            </div>
          </div>
          <div className="row g-3 mb-4">
            <div className="col-12 col-md-6">
              <Skeleton variant="rounded" width="100%" height={60} />
            </div>
            <div className="col-12 col-md-6">
              <Skeleton variant="rounded" width="100%" height={60} />
            </div>
          </div>
          <Skeleton variant="rounded" width="100%" height={80} />
        </Card>
      ) : !user ? (
        <Card className="p-4">
          <EmptyState
            icon={<LuUser size={28} />}
            title="Sesión no disponible"
            description="Por favor, inicia sesión nuevamente para acceder a tu perfil."
            actionLabel="Iniciar Sesión"
            onAction={handleLogout}
          />
        </Card>
      ) : (
        <div className="d-flex flex-column gap-4">
          {/* Tarjeta de Identidad */}
          <Card className="p-4 shadow-xs">
            <div className="d-flex align-items-center gap-3 flex-wrap mb-4">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white shadow-sm flex-shrink-0"
                style={{
                  width: "64px",
                  height: "64px",
                  background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                  fontSize: "1.4rem",
                  letterSpacing: "0.03em",
                }}
              >
                {getInitials(user.nombre)}
              </div>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <h2
                    className="h4 mb-0 fw-bold"
                    style={{ color: "var(--text-heading, #0f172a)" }}
                  >
                    {user.nombre}
                  </h2>
                  <Badge variant="success">● Activo</Badge>
                  <Badge variant="primary">
                    <LuShieldCheck size={12} className="me-1" />
                    Autenticado
                  </Badge>
                </div>
                <div className="text-muted small d-flex align-items-center gap-1.5 font-monospace">
                  <LuFingerprint size={14} />
                  <span>ID: {user.id}</span>
                </div>
              </div>
            </div>

            {/* Datos Personales */}
            <div className="row g-3 mb-4">
              <div className="col-12 col-md-6">
                <div
                  className="p-3 rounded-3"
                  style={{
                    backgroundColor: "var(--bg-subtle, #f8fafc)",
                    border: "1px solid var(--border-default, #e2e8f0)",
                  }}
                >
                  <div className="d-flex align-items-center gap-1.5 text-muted small mb-1 fw-semibold">
                    <LuUser size={14} />
                    <span>NOMBRE COMPLETO</span>
                  </div>
                  <div
                    className="fw-semibold"
                    style={{ color: "var(--text-heading, #0f172a)", fontSize: "0.95rem" }}
                  >
                    {user.nombre}
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-6">
                <div
                  className="p-3 rounded-3"
                  style={{
                    backgroundColor: "var(--bg-subtle, #f8fafc)",
                    border: "1px solid var(--border-default, #e2e8f0)",
                  }}
                >
                  <div className="d-flex align-items-center gap-1.5 text-muted small mb-1 fw-semibold">
                    <LuMail size={14} />
                    <span>CORREO ELECTRÓNICO</span>
                  </div>
                  <div
                    className="fw-semibold text-truncate"
                    style={{ color: "var(--text-heading, #0f172a)", fontSize: "0.95rem" }}
                  >
                    {user.email}
                  </div>
                </div>
              </div>
            </div>

            {/* Preferencias de Apariencia */}
            <div
              className="pt-3 border-top mb-4"
              style={{ borderColor: "var(--border-default, #e2e8f0)" }}
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3"
                style={{ letterSpacing: "0.04em" }}
              >
                Preferencia de Tema
              </h6>
              <div className="d-flex gap-2">
                <Button
                  type="button"
                  variant={theme === "light" ? "primary" : "outline"}
                  size="md"
                  leftIcon={<LuSun size={16} />}
                  onClick={() => setTheme("light")}
                >
                  Modo Claro
                </Button>
                <Button
                  type="button"
                  variant={theme === "dark" ? "primary" : "outline"}
                  size="md"
                  leftIcon={<LuMoon size={16} />}
                  onClick={() => setTheme("dark")}
                >
                  Modo Oscuro
                </Button>
              </div>
            </div>

            {/* Control de Sesión */}
            <div
              className="pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2"
              style={{ borderColor: "var(--border-default, #e2e8f0)" }}
            >
              <span className="text-muted small">
                Sesión segura activa en este navegador
              </span>
              <Button
                variant="danger"
                size="md"
                leftIcon={<LuLogOut size={16} />}
                onClick={handleLogout}
              >
                Cerrar Sesión
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Profile;
