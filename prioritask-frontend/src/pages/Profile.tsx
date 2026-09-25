import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useTheme } from "../context/ThemeContext";
import RetroWindow from "../components/common/RetroWindow";
import EmptyState from "../components/common/EmptyState";

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
    navigate("/login");
  };

  return (
    <div className="container-fluid py-2" style={{ maxWidth: "780px" }}>
      {/* Cabecera */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 className="retro-page-title">
            <span>👤</span> ADMINISTRATOR / USER_PROFILE.SYS
          </h2>
          <p className="retro-page-subtitle">
            Información de la cuenta, credenciales y preferencias del sistema
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Ventana Retro Administrator */}
      <RetroWindow
        title="ADMINISTRATOR / USER_PROFILE"
        icon="👤"
        variant="admin"
      >
        {loading ? (
          <EmptyState
            icon="⏳"
            title="Cargando credenciales de usuario..."
          />
        ) : !user ? (
          <EmptyState
            icon="⚠️"
            title="Sesión no disponible"
            description="Por favor, inicia sesión nuevamente."
            actionLabel="Ir a Login"
            onAction={handleLogout}
          />
        ) : (
          <>
            {/* Tarjeta de Identidad Retro */}
            <div className="retro-admin-card">
              <div className="retro-admin-avatar">
                <span>👾</span>
              </div>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                  <h4 className="mb-0 fw-bold">{user.nombre}</h4>
                  <span className="retro-badge retro-badge-low">ACTIVO</span>
                  <span className="retro-badge retro-badge-medium">ADMIN</span>
                </div>
                <p className="text-muted small mb-0 font-monospace">
                  UUID: {user.id}
                </p>
              </div>
            </div>

            {/* Campos de Usuario */}
            <div className="mb-4">
              <h6 className="fw-bold text-uppercase small mb-3 text-muted">
                📋 DATOS DE REGISTRO EN EL SISTEMA
              </h6>

              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label className="form-label fw-bold small text-muted">
                    NOMBRE DE USUARIO
                  </label>
                  <div className="retro-field-display">{user.nombre}</div>
                </div>

                <div className="col-12 col-md-6">
                  <label className="form-label fw-bold small text-muted">
                    CORREO ELECTRÓNICO (LOGIN)
                  </label>
                  <div className="retro-field-display">{user.email}</div>
                </div>
              </div>
            </div>

            {/* Selector de Modo Claro / Modo Oscuro */}
            <div className="mb-4 pt-3 border-top border-2">
              <h6 className="fw-bold text-uppercase small mb-3 text-muted">
                🎨 PREFERENCIA DE APARIENCIA / SYSTEM_THEME
              </h6>
              <div className="theme-switch-group">
                <button
                  type="button"
                  className={`theme-switch-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => setTheme("light")}
                  aria-label="Activar Modo Claro"
                >
                  <span>☀️</span>
                  <span>Modo Claro</span>
                </button>

                <button
                  type="button"
                  className={`theme-switch-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => setTheme("dark")}
                  aria-label="Activar Modo Oscuro"
                >
                  <span>🌙</span>
                  <span>Modo Oscuro</span>
                </button>
              </div>
            </div>

            {/* Control de Sesión y Logout */}
            <div className="pt-3 border-top border-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <span className="text-muted small">Estado de sesión: </span>
                <span className="fw-bold small text-success font-monospace">
                  ● AUTENTICADO
                </span>
              </div>
              <button
                type="button"
                className="btn-retro btn-retro-danger"
                style={{ minHeight: "44px" }}
                onClick={handleLogout}
              >
                <span>🔓</span>
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </>
        )}
      </RetroWindow>
    </div>
  );
};

export default Profile;
