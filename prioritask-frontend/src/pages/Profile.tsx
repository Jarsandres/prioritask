import { useEffect, useState, useMemo } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuUser,
  LuMail,
  LuFingerprint,
  LuSun,
  LuMoon,
  LuLogOut,
  LuShieldCheck,
  LuPalette,
  LuSlidersHorizontal,
  LuHouse,
  LuCheck,
  LuSearch,
  LuSettings,
  LuCompass,
  LuFlame,
  LuBell,
  LuCircleHelp,
  LuLock,
  LuStar,
  LuClock,
  LuCloudUpload,
  LuDownload,
  LuRotateCcw,
  LuSparkles,
} from "react-icons/lu";
import api from "../api";
import {
  useTheme,
  DEFAULT_ROOM_COLORS,
  ROOM_ICON_OPTIONS,
  type AccentPalette,
  type UIDensity,
} from "../context/ThemeContext";
import {
  useSettings,
  type GeneralSettings,
  type NavigationSettings,
  type NotificationSettings,
} from "../context/SettingsContext";
import { useRoom } from "../context/RoomContext";
import { clearClientSessionData } from "../services/sessionCleanup";
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
  preferences?: Record<string, unknown>;
}

type SettingsTabId =
  | "all"
  | "account"
  | "general"
  | "appearance"
  | "navigation"
  | "productivity"
  | "notifications"
  | "help";

const SETTINGS_TABS: {
  id: SettingsTabId;
  label: string;
  keywords: string;
}[] = [
  {
    id: "all",
    label: "Vista Completa",
    keywords: "todo completo all",
  },
  {
    id: "account",
    label: "Cuenta y Seguridad",
    keywords:
      "cuenta seguridad perfil nombre email correo contraseña password sesion sesiones dispositivos cerrar logout token id avatar",
  },
  {
    id: "general",
    label: "General",
    keywords:
      "general idioma language español ingles english vista inicio home formato hora 24h 12h semana lunes domingo sonido efectos audio confirmar eliminar animaciones movimiento reducido atajos teclado tecla",
  },
  {
    id: "appearance",
    label: "Tema y Apariencia",
    keywords:
      "tema apariencia theme studio modo claro oscuro light dark paleta acento cobalt crimson emerald violet oled densidad interfaz compacta estandar comoda bento identidad visual hogar room branding icono color",
  },
  {
    id: "navigation",
    label: "Navegación",
    keywords:
      "navegacion barra lateral sidebar menu modulos agrupadas ia asignar analiticas etiquetas tags historial hogares habitaciones contadores favoritos estrella",
  },
  {
    id: "productivity",
    label: "Productividad y Karma",
    keywords:
      "productividad karma meta diaria semanal objetivos dias descanso sabado domingo modo vacaciones vacation racha streak celebracion confeti",
  },
  {
    id: "notifications",
    label: "Notificaciones",
    keywords:
      "notificaciones recordatorios alertas escritorio desktop navegador antelacion posponer snooze 30m 3h mañana eventos asignada completada resumen diario vencimiento",
  },
  {
    id: "help",
    label: "Ayuda y Diagnóstico",
    keywords:
      "ayuda diagnostico recursos sistema estado online offline almacenamiento localstorage version sincronizar nube cloud exportar json restablecer fabrica reset",
  },
];

const ACCENT_PALETTES: {
  id: AccentPalette;
  name: string;
  subtitle: string;
  color: string;
}[] = [
  {
    id: "cobalt",
    name: "Prioritask Cobalt",
    subtitle: "Azul SaaS moderno",
    color: "#2563eb",
  },
  {
    id: "crimson",
    name: "Todoist Crimson",
    subtitle: "Coral cálido de foco",
    color: "#dc2626",
  },
  {
    id: "emerald",
    name: "Home Emerald",
    subtitle: "Verde bosque relajado",
    color: "#059669",
  },
  {
    id: "violet",
    name: "Linear Violet",
    subtitle: "Índigo estética 21st.dev",
    color: "#7c3aed",
  },
  {
    id: "oled",
    name: "Midnight OLED",
    subtitle: "Contraste puro #000000",
    color: "#0f172a",
  },
];

const DENSITY_OPTIONS: {
  id: UIDensity;
  label: string;
  desc: string;
}[] = [
  {
    id: "compact",
    label: "Compacta (36px)",
    desc: "Estilo Todoist Pro / Linear para +50 tareas",
  },
  {
    id: "standard",
    label: "Estándar",
    desc: "Balance ideal entre tarjetas y metadatos",
  },
  {
    id: "cozy",
    label: "Cómoda (Bento)",
    desc: "Mayor aire visual y tarjetas amplias",
  },
];

const NAVIGATION_MODULE_LABELS: {
  key: keyof NavigationSettings["visibleModules"];
  label: string;
  desc: string;
}[] = [
  {
    key: "groupedAi",
    label: "Tareas Agrupadas por IA",
    desc: "Mostrar acceso a clustering semántico (/tasks/grouped)",
  },
  {
    key: "assign",
    label: "Asignador Inteligente",
    desc: "Mostrar herramienta de reparto de tareas (/tasks/assign)",
  },
  {
    key: "analytics",
    label: "Analíticas de Hogar",
    desc: "Mostrar enlace directo a métricas (/analytics)",
  },
  {
    key: "tags",
    label: "Etiquetas",
    desc: "Mostrar gestor de etiquetas (/tags)",
  },
  {
    key: "history",
    label: "Historial de Actividad",
    desc: "Mostrar registro de auditoría (/history)",
  },
  {
    key: "rooms",
    label: "Sección Mis Hogares",
    desc: "Mostrar árbol de proyectos y salas en la barra lateral",
  },
];

const DAYS_OF_WEEK: { index: number; short: string; full: string }[] = [
  { index: 0, short: "Dom", full: "Domingo" },
  { index: 1, short: "Lun", full: "Lunes" },
  { index: 2, short: "Mar", full: "Martes" },
  { index: 3, short: "Mié", full: "Miércoles" },
  { index: 4, short: "Jue", full: "Jueves" },
  { index: 5, short: "Vie", full: "Viernes" },
  { index: 6, short: "Sáb", full: "Sábado" },
];

const NOTIFICATION_EVENT_LABELS: {
  key: keyof NotificationSettings["events"];
  label: string;
  desc: string;
}[] = [
  {
    key: "taskAssigned",
    label: "Tarea asignada a mí",
    desc: "Avisar cuando un miembro del hogar te asigne una tarea",
  },
  {
    key: "taskCompletedByMember",
    label: "Tarea completada por un compañero",
    desc: "Notificar avances en tiempo real para enviar Kudos",
  },
  {
    key: "dailySummaryDigest",
    label: "Resumen matutino de agenda",
    desc: "Recibir boletín diario a las 09:00 con tareas pendientes",
  },
  {
    key: "streakMilestone",
    label: "Hitos de racha y Karma",
    desc: "Alertar cuando subas de rango o alcances tu meta diaria",
  },
  {
    key: "overdueAlert",
    label: "Alerta de tareas vencidas",
    desc: "Recordatorio prioritario cuando una tarea supere su fecha límite",
  },
];

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function estimateLocalStorageKB(): string {
  if (typeof window === "undefined") return "0.0";
  try {
    let totalChars = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const v = localStorage.getItem(k) || "";
        totalChars += k.length + v.length;
      }
    }
    return ((totalChars * 2) / 1024).toFixed(1);
  } catch {
    return "0.0";
  }
}

const Profile = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navegación del Settings Workspace
  const [activeTab, setActiveTab] = useState<SettingsTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Estado de formularios de Cuenta y Seguridad
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const {
    theme,
    setTheme,
    accent,
    setAccent,
    density,
    setDensity,
    getRoomBranding,
    setRoomBranding,
  } = useTheme();

  const {
    settings,
    updateGeneral,
    updateNavigation,
    toggleModuleVisibility,
    toggleFavoriteRoom,
    updateProductivity,
    toggleDayOff,
    updateNotifications,
    updateNotificationEvents,
    resetSettings,
    hydrateFromBackendPreferences,
    syncSettingsToBackend,
    computeSnoozeTarget,
  } = useSettings();

  const { rooms, setRoomId } = useRoom();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const controller = new AbortController();

    const fetchUser = async () => {
      try {
        const res = await api.get<User>("/auth/me", {
          signal: controller.signal,
        });
        const data = res.data;
        setUser(data);
        setEditName(data.nombre || "");
        setEditEmail(data.email || "");
        if (data.preferences) {
          const prefsRecord = data.preferences as Record<string, unknown>;
          const settingsCandidate =
            typeof prefsRecord.settings === "object" &&
            prefsRecord.settings !== null
              ? (prefsRecord.settings as Record<string, unknown>)
              : prefsRecord;
          hydrateFromBackendPreferences(settingsCandidate);
        }
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
  }, [hydrateFromBackendPreferences]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Continuar limpieza local aunque falle la red
    }
    await clearClientSessionData();
    setRoomId(null);
    toast.info("Has cerrado sesión.");
    navigate("/login");
  };

  const handleLogoutAllSessions = async () => {
    try {
      await api.post("/auth/logout-all");
      toast.success("Se han cerrado todas las sesiones activas.");
    } catch {
      toast.info("Sesiones cerradas localmente.");
    }
    await clearClientSessionData();
    setRoomId(null);
    navigate("/login");
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();
    if (!trimmedName || !trimmedEmail) {
      toast.warning("El nombre y el correo electrónico son obligatorios.");
      return;
    }

    setSavingProfile(true);
    try {
      const res = await api.patch<User>("/auth/me", {
        nombre: trimmedName,
        email: trimmedEmail,
      });
      setUser((prev) => ({
        ...(prev || user),
        ...(res.data || {}),
        nombre: res.data?.nombre || trimmedName,
        email: res.data?.email || trimmedEmail,
      }));
      toast.success("Perfil actualizado correctamente.");
    } catch {
      toast.error("No se pudo actualizar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim()) {
      toast.warning("Completa tu contraseña actual y la nueva contraseña.");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await api.post<{
        access_token?: string;
        refresh_token?: string;
        message?: string;
      }>("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (res.data?.access_token) {
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("access_token", res.data.access_token);
      }
      if (res.data?.refresh_token) {
        localStorage.setItem("refreshToken", res.data.refresh_token);
      }
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Contraseña actualizada correctamente.");
    } catch {
      toast.error("Error al cambiar la contraseña. Verifica tu clave actual.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSyncCloud = async () => {
    await syncSettingsToBackend();
    toast.success("Ajustes sincronizados con la nube.");
  };

  const handleExportSettings = () => {
    try {
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prioritask-settings-v1.8.0.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.info("Archivo de configuración exportado.");
    } catch {
      toast.error("No se pudo exportar la configuración.");
    }
  };

  const handleResetFactorySettings = () => {
    resetSettings();
    toast.info("Configuración restablecida a los valores de fábrica.");
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

  // Determinar qué secciones son visibles según pestaña activa y búsqueda instantánea
  const visibleSections = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery.trim());
    const sectionIds: Exclude<SettingsTabId, "all">[] = [
      "account",
      "general",
      "appearance",
      "navigation",
      "productivity",
      "notifications",
      "help",
    ];

    if (normalizedQuery) {
      return new Set(
        sectionIds.filter((secId) => {
          const tabMeta = SETTINGS_TABS.find((t) => t.id === secId);
          if (!tabMeta) return false;
          const haystack = normalizeSearchText(
            `${tabMeta.label} ${tabMeta.keywords}`
          );
          return haystack.includes(normalizedQuery);
        })
      );
    }

    if (activeTab === "all") {
      return new Set(sectionIds);
    }

    return new Set([activeTab]);
  }, [activeTab, searchQuery]);

  // Previsualización en vivo del algoritmo Snooze de Todoist Desktop
  const snoozePreviews = useMemo(() => {
    const refNow = new Date();
    return {
      plus30m: computeSnoozeTarget("30m", refNow),
      plus3h: computeSnoozeTarget("3h", refNow),
      tomorrow9am: computeSnoozeTarget("tomorrow9am", refNow),
    };
  }, [computeSnoozeTarget]);

  const storageUsageKB = estimateLocalStorageKB();
  const isOnline =
    typeof navigator !== "undefined" ? navigator.onLine !== false : true;

  return (
    <div
      className="container-fluid py-3 px-2 px-md-4"
      style={{ maxWidth: "1020px" }}
      data-testid="settings-workspace"
    >
      {/* Cabecera del Settings Workspace */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="d-flex align-items-center justify-content-center rounded-3 p-2"
              style={{
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                color: "#2563eb",
              }}
            >
              <LuSettings size={22} />
            </div>
            <h1 className="h3 mb-0 fw-bold" style={{ letterSpacing: "-0.02em" }}>
              Centro de Configuración y Perfil
            </h1>
            <Badge variant="primary">v1.8.0</Badge>
          </div>
          <p className="text-muted mb-0 small">
            Personaliza tu cuenta, atajos, apariencia, navegación, objetivos Karma y alertas
          </p>
        </div>

        {/* Buscador instantáneo de ajustes */}
        <div
          className="position-relative"
          style={{ minWidth: "260px", flex: "0 1 320px" }}
        >
          <LuSearch
            size={16}
            className="text-muted position-absolute"
            style={{ left: "12px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="search"
            className="form-control form-control-sm ps-5 py-2 rounded-3"
            placeholder="Buscar ajustes (ej. vacaciones, snooze, contraseña...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="settings-search-input"
            aria-label="Buscar ajustes de configuración"
          />
        </div>
      </div>

      {/* Barra de Pestañas de Categorías (Todoist Settings Navigation) */}
      <div
        className="d-flex align-items-center gap-1.5 flex-wrap mb-4 pb-2 border-bottom"
        role="tablist"
        aria-label="Categorías de configuración"
      >
        {SETTINGS_TABS.map((tab) => {
          const isSelected = activeTab === tab.id && !searchQuery.trim();
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`settings-tab-${tab.id}`}
              className={`btn btn-sm rounded-pill px-3 py-1.5 fw-semibold ${
                isSelected ? "btn-primary" : "btn-outline-secondary border-0"
              }`}
              onClick={() => {
                setActiveTab(tab.id);
                if (searchQuery.trim()) {
                  setSearchQuery("");
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="alert alert-danger mb-4 rounded-3 border-0 shadow-xs"
          role="alert"
        >
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
      ) : visibleSections.size === 0 ? (
        <Card className="p-4 text-center">
          <p className="text-muted mb-2">
            No se encontraron opciones de configuración para &ldquo;{searchQuery}&rdquo;.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSearchQuery("")}
          >
            Mostrar todas las secciones
          </Button>
        </Card>
      ) : (
        <div className="d-flex flex-column gap-4">
          {/* 1. SECCIÓN CUENTA Y SEGURIDAD */}
          {visibleSections.has("account") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-account"
            >
              <div className="d-flex align-items-center gap-3 flex-wrap mb-4">
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white shadow-sm flex-shrink-0"
                  style={{
                    width: "64px",
                    height: "64px",
                    background:
                      "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
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

              {/* Resumen de Datos Personales */}
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
                      style={{
                        color: "var(--text-heading, #0f172a)",
                        fontSize: "0.95rem",
                      }}
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
                      style={{
                        color: "var(--text-heading, #0f172a)",
                        fontSize: "0.95rem",
                      }}
                    >
                      {user.email}
                    </div>
                  </div>
                </div>
              </div>

              {/* Formulario de Edición de Perfil */}
              <form
                onSubmit={handleSaveProfile}
                data-testid="account-profile-form"
                className="pt-3 border-top mb-4"
                style={{ borderColor: "var(--border-default, #e2e8f0)" }}
              >
                <h6
                  className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                  style={{ letterSpacing: "0.04em" }}
                >
                  <LuUser size={15} className="text-primary" />
                  <span>Editar Información de Cuenta</span>
                </h6>
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-5">
                    <label
                      htmlFor="account-name-input"
                      className="form-label small fw-semibold mb-1"
                    >
                      Nombre visible
                    </label>
                    <input
                      id="account-name-input"
                      type="text"
                      className="form-control form-control-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      data-testid="account-name-input"
                    />
                  </div>
                  <div className="col-12 col-md-5">
                    <label
                      htmlFor="account-email-input"
                      className="form-label small fw-semibold mb-1"
                    >
                      Correo electrónico
                    </label>
                    <input
                      id="account-email-input"
                      type="email"
                      className="form-control form-control-sm"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      data-testid="account-email-input"
                    />
                  </div>
                  <div className="col-12 col-md-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="w-100"
                      disabled={savingProfile}
                      data-testid="account-save-btn"
                    >
                      {savingProfile ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              </form>

              {/* Formulario de Cambio de Contraseña */}
              <form
                onSubmit={handleChangePassword}
                data-testid="change-password-form"
                className="pt-3 border-top mb-4"
                style={{ borderColor: "var(--border-default, #e2e8f0)" }}
              >
                <h6
                  className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                  style={{ letterSpacing: "0.04em" }}
                >
                  <LuLock size={15} className="text-primary" />
                  <span>Cambiar Contraseña</span>
                </h6>
                <div className="row g-3 align-items-end">
                  <div className="col-12 col-md-5">
                    <label
                      htmlFor="current-password-input"
                      className="form-label small fw-semibold mb-1"
                    >
                      Contraseña actual
                    </label>
                    <input
                      id="current-password-input"
                      type="password"
                      className="form-control form-control-sm"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      data-testid="current-password-input"
                    />
                  </div>
                  <div className="col-12 col-md-5">
                    <label
                      htmlFor="new-password-input"
                      className="form-label small fw-semibold mb-1"
                    >
                      Nueva contraseña
                    </label>
                    <input
                      id="new-password-input"
                      type="password"
                      className="form-control form-control-sm"
                      placeholder="Mínimo 8 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      data-testid="new-password-input"
                    />
                  </div>
                  <div className="col-12 col-md-2">
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="w-100"
                      disabled={changingPassword}
                      data-testid="change-password-btn"
                    >
                      {changingPassword ? "Actualizando..." : "Actualizar"}
                    </Button>
                  </div>
                </div>
              </form>

              {/* Control de Sesiones */}
              <div
                className="pt-3 border-top d-flex justify-content-between align-items-center flex-wrap gap-2"
                style={{ borderColor: "var(--border-default, #e2e8f0)" }}
              >
                <span className="text-muted small">
                  Sesión segura activa en este navegador
                </span>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleLogoutAllSessions}
                    data-testid="logout-all-btn"
                  >
                    Cerrar todas las sesiones activas
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    leftIcon={<LuLogOut size={16} />}
                    onClick={handleLogout}
                  >
                    Cerrar Sesión
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* 2. SECCIÓN GENERAL */}
          {visibleSections.has("general") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-general"
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuSettings size={15} className="text-primary" />
                <span>Ajustes Generales y Comportamiento</span>
              </h6>

              <div className="row g-3 mb-4">
                <div className="col-12 col-md-6">
                  <label
                    htmlFor="language-select"
                    className="form-label small fw-semibold mb-1"
                  >
                    Idioma de la aplicación
                  </label>
                  <select
                    id="language-select"
                    className="form-select form-select-sm"
                    value={settings.general.language}
                    onChange={(e) =>
                      updateGeneral({
                        language: e.target.value as GeneralSettings["language"],
                      })
                    }
                    data-testid="language-select"
                  >
                    <option value="es">Español (ES)</option>
                    <option value="en">English (US)</option>
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label
                    htmlFor="home-view-select"
                    className="form-label small fw-semibold mb-1"
                  >
                    Vista de inicio predeterminada
                  </label>
                  <select
                    id="home-view-select"
                    className="form-select form-select-sm"
                    value={settings.general.homeView}
                    onChange={(e) =>
                      updateGeneral({
                        homeView: e.target.value as GeneralSettings["homeView"],
                      })
                    }
                    data-testid="home-view-select"
                  >
                    <option value="/">Bandeja Principal (/)</option>
                    <option value="/tasks/grouped">
                      Agrupadas por IA (/tasks/grouped)
                    </option>
                    <option value="/tasks/assign">
                      Asignar Tareas (/tasks/assign)
                    </option>
                    <option value="/analytics">Analíticas (/analytics)</option>
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label
                    htmlFor="time-format-select"
                    className="form-label small fw-semibold mb-1"
                  >
                    Formato de hora
                  </label>
                  <select
                    id="time-format-select"
                    className="form-select form-select-sm"
                    value={settings.general.timeFormat}
                    onChange={(e) =>
                      updateGeneral({
                        timeFormat: e.target
                          .value as GeneralSettings["timeFormat"],
                      })
                    }
                    data-testid="time-format-select"
                  >
                    <option value="24h">24 horas (14:30)</option>
                    <option value="12h">12 horas (2:30 PM)</option>
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label
                    htmlFor="start-of-week-select"
                    className="form-label small fw-semibold mb-1"
                  >
                    Primer día de la semana
                  </label>
                  <select
                    id="start-of-week-select"
                    className="form-select form-select-sm"
                    value={settings.general.startOfWeek}
                    onChange={(e) =>
                      updateGeneral({
                        startOfWeek: e.target
                          .value as GeneralSettings["startOfWeek"],
                      })
                    }
                    data-testid="start-of-week-select"
                  >
                    <option value="monday">Lunes</option>
                    <option value="sunday">Domingo</option>
                  </select>
                </div>
              </div>

              <div className="d-flex flex-column gap-2">
                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="toggle-sound-effects"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Efectos de sonido al completar tareas
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Reproducir síntesis de audio retro de 8-bit al marcar tareas
                    </span>
                  </div>
                  <input
                    id="toggle-sound-effects"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.general.soundEffects}
                    aria-checked={settings.general.soundEffects}
                    onChange={(e) =>
                      updateGeneral({ soundEffects: e.target.checked })
                    }
                    data-testid="toggle-sound-effects"
                  />
                </div>

                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="toggle-confirm-delete"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Confirmar antes de eliminar
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Mostrar diálogo de seguridad antes de borrar tareas o salas
                    </span>
                  </div>
                  <input
                    id="toggle-confirm-delete"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.general.confirmBeforeDelete}
                    aria-checked={settings.general.confirmBeforeDelete}
                    onChange={(e) =>
                      updateGeneral({ confirmBeforeDelete: e.target.checked })
                    }
                    data-testid="toggle-confirm-delete"
                  />
                </div>

                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="toggle-animations"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Animaciones e interacciones fluidas
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Desactívalo para activar el modo de movimiento reducido
                    </span>
                  </div>
                  <input
                    id="toggle-animations"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.general.enableAnimations}
                    aria-checked={settings.general.enableAnimations}
                    onChange={(e) =>
                      updateGeneral({ enableAnimations: e.target.checked })
                    }
                    data-testid="toggle-animations"
                  />
                </div>

                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="toggle-single-key-shortcuts"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Atajos rápidos de una sola tecla (c, ?)
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Permite pulsar &lsquo;c&rsquo; para crear tarea o &lsquo;?&rsquo; para ver ayuda
                    </span>
                  </div>
                  <input
                    id="toggle-single-key-shortcuts"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.general.enableSingleKeyShortcuts}
                    aria-checked={settings.general.enableSingleKeyShortcuts}
                    onChange={(e) =>
                      updateGeneral({
                        enableSingleKeyShortcuts: e.target.checked,
                      })
                    }
                    data-testid="toggle-single-key-shortcuts"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* 3. SECCIÓN TEMA Y APARIENCIA (THEME STUDIO) */}
          {visibleSections.has("appearance") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-appearance"
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuPalette size={15} className="text-primary" />
                <span>Theme Studio · Modo y Paleta de Acento</span>
              </h6>
              <div className="d-flex gap-2 mb-4 flex-wrap">
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

              {/* Paletas de Acento Curadas */}
              <div
                className="theme-studio-palettes-grid mb-4"
                data-testid="theme-studio-palettes"
              >
                {ACCENT_PALETTES.map((p) => {
                  const isSelected = accent === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`theme-studio-swatch-card ${
                        isSelected ? "active" : ""
                      }`}
                      onClick={() => setAccent(p.id)}
                      data-testid={`accent-swatch-${p.id}`}
                      aria-pressed={isSelected}
                    >
                      <span
                        className="theme-studio-swatch-dot"
                        style={{ backgroundColor: p.color }}
                      >
                        {isSelected && <LuCheck size={12} color="#ffffff" />}
                      </span>
                      <div className="text-start">
                        <div className="fw-semibold" style={{ fontSize: "13px" }}>
                          {p.name}
                        </div>
                        <div className="text-muted" style={{ fontSize: "11px" }}>
                          {p.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selector de Densidad de Interfaz */}
              <h6
                className="fw-bold small text-muted text-uppercase mb-2 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuSlidersHorizontal size={15} className="text-primary" />
                <span>Densidad de Interfaz (UI Density)</span>
              </h6>
              <div
                className="theme-studio-density-grid mb-4"
                role="radiogroup"
                aria-label="Densidad de interfaz"
                data-testid="theme-studio-density"
              >
                {DENSITY_OPTIONS.map((opt) => {
                  const isSelected = density === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`theme-studio-density-card ${
                        isSelected ? "active" : ""
                      }`}
                      onClick={() => setDensity(opt.id)}
                      data-testid={`density-option-${opt.id}`}
                    >
                      <div className="fw-semibold" style={{ fontSize: "13px" }}>
                        {opt.label}
                      </div>
                      <div className="text-muted" style={{ fontSize: "11px" }}>
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Identidad Visual por Hogar (Room Branding) */}
              {rooms.length > 0 && (
                <div>
                  <h6
                    className="fw-bold small text-muted text-uppercase mb-2 d-flex align-items-center gap-2"
                    style={{ letterSpacing: "0.04em" }}
                  >
                    <LuHouse size={15} className="text-primary" />
                    <span>Identidad Visual por Hogar</span>
                  </h6>
                  <div
                    className="d-flex flex-column gap-2"
                    data-testid="room-branding-list"
                  >
                    {rooms.map((room, idx) => {
                      const branding = getRoomBranding(room.id, idx);
                      return (
                        <div
                          key={room.id}
                          className="room-branding-row"
                          data-testid={`room-branding-${room.id}`}
                        >
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className="room-branding-preview-badge"
                              style={{
                                backgroundColor: `${branding.color}18`,
                                color: branding.color,
                                borderColor: `${branding.color}40`,
                              }}
                            >
                              {branding.icon}
                            </span>
                            <span className="fw-semibold small">
                              {room.nombre}
                            </span>
                          </div>

                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            {/* Selector de Icono */}
                            <div className="d-flex gap-1">
                              {ROOM_ICON_OPTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  className={`room-branding-icon-btn ${
                                    branding.icon === emoji ? "active" : ""
                                  }`}
                                  onClick={() =>
                                    setRoomBranding(room.id, {
                                      icon: emoji,
                                      color: branding.color,
                                    })
                                  }
                                  title={`Icono ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>

                            {/* Selector de Color */}
                            <div className="d-flex gap-1 ms-1">
                              {DEFAULT_ROOM_COLORS.map((hex) => (
                                <button
                                  key={hex}
                                  type="button"
                                  className={`room-branding-color-dot ${
                                    branding.color === hex ? "active" : ""
                                  }`}
                                  style={{ backgroundColor: hex }}
                                  onClick={() =>
                                    setRoomBranding(room.id, {
                                      icon: branding.icon,
                                      color: hex,
                                    })
                                  }
                                  title={`Color ${hex}`}
                                  aria-label={`Color ${hex} para ${room.nombre}`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 4. SECCIÓN NAVEGACIÓN Y BARRA LATERAL */}
          {visibleSections.has("navigation") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-navigation"
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuCompass size={15} className="text-primary" />
                <span>Personalización de Barra Lateral y Favoritos</span>
              </h6>

              <div className="d-flex flex-column gap-2 mb-4">
                {NAVIGATION_MODULE_LABELS.map((mod) => {
                  const isVisible = settings.navigation.visibleModules[mod.key];
                  return (
                    <div
                      key={mod.key}
                      className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1"
                    >
                      <div>
                        <label
                          htmlFor={`nav-toggle-${mod.key}`}
                          className="form-check-label fw-semibold small d-block"
                        >
                          {mod.label}
                        </label>
                        <span
                          className="text-muted"
                          style={{ fontSize: "11.5px" }}
                        >
                          {mod.desc}
                        </span>
                      </div>
                      <input
                        id={`nav-toggle-${mod.key}`}
                        type="checkbox"
                        role="switch"
                        className="form-check-input ms-2"
                        checked={isVisible}
                        aria-checked={isVisible}
                        onChange={() => toggleModuleVisibility(mod.key)}
                        data-testid={`nav-toggle-${mod.key}`}
                      />
                    </div>
                  );
                })}

                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1 border-top pt-2">
                  <div>
                    <label
                      htmlFor="nav-toggle-task-counts"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Mostrar contadores de tareas en hogares
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Exhibe el número de tareas al lado del nombre de cada sala
                    </span>
                  </div>
                  <input
                    id="nav-toggle-task-counts"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.navigation.showTaskCounts}
                    aria-checked={settings.navigation.showTaskCounts}
                    onChange={(e) =>
                      updateNavigation({ showTaskCounts: e.target.checked })
                    }
                    data-testid="nav-toggle-task-counts"
                  />
                </div>

                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="nav-toggle-favorites"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Mostrar sección de Favoritos en Sidebar
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Fija tus hogares prioritarios en la parte superior del menú
                    </span>
                  </div>
                  <input
                    id="nav-toggle-favorites"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.navigation.showFavoritesSection}
                    aria-checked={settings.navigation.showFavoritesSection}
                    onChange={(e) =>
                      updateNavigation({
                        showFavoritesSection: e.target.checked,
                      })
                    }
                    data-testid="nav-toggle-favorites"
                  />
                </div>
              </div>

              {/* Gestor de Salas Favoritas */}
              {rooms.length > 0 && (
                <div className="pt-3 border-top">
                  <h6 className="fw-bold small text-muted text-uppercase mb-2 d-flex align-items-center gap-1.5">
                    <LuStar size={14} className="text-warning" />
                    <span>Salas Favoritas</span>
                  </h6>
                  <div className="d-flex flex-wrap gap-2">
                    {rooms.map((room) => {
                      const isFav =
                        settings.navigation.favoriteRoomIds.includes(room.id);
                      return (
                        <button
                          key={room.id}
                          type="button"
                          className={`btn btn-sm d-inline-flex align-items-center gap-1.5 rounded-pill ${
                            isFav ? "btn-warning" : "btn-outline-secondary"
                          }`}
                          onClick={() => toggleFavoriteRoom(room.id)}
                          aria-pressed={isFav}
                          data-testid={`favorite-room-toggle-${room.id}`}
                        >
                          <LuStar size={13} />
                          <span>{room.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 5. SECCIÓN PRODUCTIVIDAD Y KARMA */}
          {visibleSections.has("productivity") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-productivity"
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuFlame size={15} className="text-danger" />
                <span>Productividad, Metas y Modo Vacaciones (Karma)</span>
              </h6>

              <div className="row g-3 mb-4">
                <div className="col-12 col-md-6">
                  <label
                    htmlFor="productivity-daily-goal"
                    className="form-label small fw-semibold mb-1"
                  >
                    Meta diaria de tareas
                  </label>
                  <input
                    id="productivity-daily-goal"
                    type="number"
                    min={1}
                    max={50}
                    className="form-control form-control-sm"
                    value={settings.productivity.dailyTaskGoal}
                    onChange={(e) =>
                      updateProductivity({
                        dailyTaskGoal: Math.max(
                          1,
                          Number(e.target.value) || 1
                        ),
                      })
                    }
                    data-testid="productivity-daily-goal"
                  />
                </div>

                <div className="col-12 col-md-6">
                  <label
                    htmlFor="productivity-weekly-goal"
                    className="form-label small fw-semibold mb-1"
                  >
                    Meta semanal de tareas
                  </label>
                  <input
                    id="productivity-weekly-goal"
                    type="number"
                    min={1}
                    max={300}
                    className="form-control form-control-sm"
                    value={settings.productivity.weeklyTaskGoal}
                    onChange={(e) =>
                      updateProductivity({
                        weeklyTaskGoal: Math.max(
                          1,
                          Number(e.target.value) || 1
                        ),
                      })
                    }
                    data-testid="productivity-weekly-goal"
                  />
                </div>
              </div>

              {/* Días de descanso */}
              <div className="mb-4">
                <label className="form-label small fw-semibold d-block mb-1">
                  Días de descanso (no penalizan tu racha si no completas tareas)
                </label>
                <div className="d-flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((d) => {
                    const isOff = settings.productivity.daysOff.includes(
                      d.index
                    );
                    return (
                      <button
                        key={d.index}
                        type="button"
                        className={`btn btn-sm rounded-pill px-3 ${
                          isOff ? "btn-primary" : "btn-outline-secondary"
                        }`}
                        aria-pressed={isOff}
                        onClick={() => toggleDayOff(d.index)}
                        data-testid={`day-off-toggle-${d.index}`}
                        title={d.full}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="d-flex flex-column gap-2">
                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="vacation-mode-toggle"
                      className="form-check-label fw-semibold small d-block"
                    >
                      🏖️ Modo Vacaciones (Congelar racha)
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Protege tu racha actual y puntos Karma durante tus días libres o viajes
                    </span>
                  </div>
                  <input
                    id="vacation-mode-toggle"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.productivity.vacationMode}
                    aria-checked={settings.productivity.vacationMode}
                    onChange={(e) =>
                      updateProductivity({ vacationMode: e.target.checked })
                    }
                    data-testid="vacation-mode-toggle"
                  />
                </div>

                <div className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1">
                  <div>
                    <label
                      htmlFor="celebrate-goal-toggle"
                      className="form-check-label fw-semibold small d-block"
                    >
                      Celebrar al alcanzar la meta diaria
                    </label>
                    <span className="text-muted" style={{ fontSize: "11.5px" }}>
                      Muestra confeti y mensaje de felicitación al cumplir tu objetivo
                    </span>
                  </div>
                  <input
                    id="celebrate-goal-toggle"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-2"
                    checked={settings.productivity.celebrateGoalCompletion}
                    aria-checked={settings.productivity.celebrateGoalCompletion}
                    onChange={(e) =>
                      updateProductivity({
                        celebrateGoalCompletion: e.target.checked,
                      })
                    }
                    data-testid="celebrate-goal-toggle"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* 6. SECCIÓN RECORDATORIOS Y NOTIFICACIONES */}
          {visibleSections.has("notifications") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-notifications"
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuBell size={15} className="text-primary" />
                <span>Recordatorios, Snooze y Alertas de Eventos</span>
              </h6>

              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                <div className="form-check form-switch ps-0 mb-0 d-flex align-items-center gap-2">
                  <input
                    id="desktop-notifications-toggle"
                    type="checkbox"
                    role="switch"
                    className="form-check-input ms-0"
                    checked={settings.notifications.desktopNotifications}
                    aria-checked={settings.notifications.desktopNotifications}
                    onChange={(e) =>
                      updateNotifications({
                        desktopNotifications: e.target.checked,
                      })
                    }
                    data-testid="desktop-notifications-toggle"
                  />
                  <label
                    htmlFor="desktop-notifications-toggle"
                    className="form-check-label fw-semibold small"
                  >
                    Habilitar notificaciones de escritorio del navegador
                  </label>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toast.info(
                      "🔔 Alerta de prueba enviada correctamente desde el motor de notificaciones."
                    )
                  }
                  data-testid="test-notification-btn"
                >
                  Probar alerta
                </Button>
              </div>

              <div className="row g-3 mb-4">
                <div className="col-12 col-md-6">
                  <label
                    htmlFor="reminder-offset-select"
                    className="form-label small fw-semibold mb-1"
                  >
                    Antelación predeterminada de recordatorio
                  </label>
                  <select
                    id="reminder-offset-select"
                    className="form-select form-select-sm"
                    value={settings.notifications.defaultReminderOffsetMinutes}
                    onChange={(e) =>
                      updateNotifications({
                        defaultReminderOffsetMinutes: Number(
                          e.target.value
                        ) as NotificationSettings["defaultReminderOffsetMinutes"],
                      })
                    }
                    data-testid="reminder-offset-select"
                  >
                    <option value={0}>Al momento del vencimiento (0 min)</option>
                    <option value={10}>10 minutos antes</option>
                    <option value={30}>30 minutos antes</option>
                    <option value={60}>1 hora antes (60 min)</option>
                  </select>
                </div>

                <div className="col-12 col-md-6">
                  <label
                    htmlFor="snooze-preset-select"
                    className="form-label small fw-semibold mb-1"
                  >
                    Duración predeterminada al posponer (Snooze)
                  </label>
                  <select
                    id="snooze-preset-select"
                    className="form-select form-select-sm"
                    value={settings.notifications.snoozePresetMinutes}
                    onChange={(e) =>
                      updateNotifications({
                        snoozePresetMinutes: Number(
                          e.target.value
                        ) as NotificationSettings["snoozePresetMinutes"],
                      })
                    }
                    data-testid="snooze-preset-select"
                  >
                    <option value={30}>+30 minutos</option>
                    <option value={60}>+1 hora (60 min)</option>
                    <option value={180}>+3 horas (180 min)</option>
                  </select>
                </div>
              </div>

              {/* Previsualizador en vivo del Algoritmo Snooze de Todoist */}
              <div
                className="p-3 rounded-3 mb-4"
                style={{
                  backgroundColor: "var(--bg-subtle, #f8fafc)",
                  border: "1px solid var(--border-default, #e2e8f0)",
                }}
                data-testid="snooze-preview-box"
              >
                <div className="d-flex align-items-center gap-1.5 small fw-semibold mb-2">
                  <LuClock size={14} className="text-primary" />
                  <span>
                    Previsualización en vivo de acciones de posposición (Formato{" "}
                    {settings.general.timeFormat})
                  </span>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <span className="badge bg-surface text-body border px-2.5 py-1.5">
                    ⏱️ {snoozePreviews.plus30m.formattedLabel}
                  </span>
                  <span className="badge bg-surface text-body border px-2.5 py-1.5">
                    ⏳ {snoozePreviews.plus3h.formattedLabel}
                  </span>
                  <span className="badge bg-surface text-body border px-2.5 py-1.5">
                    ☀️ {snoozePreviews.tomorrow9am.formattedLabel}
                  </span>
                </div>
              </div>

              {/* Matriz de switches por evento */}
              <div className="d-flex flex-column gap-2">
                {NOTIFICATION_EVENT_LABELS.map((ev) => {
                  const isChecked = settings.notifications.events[ev.key];
                  return (
                    <div
                      key={ev.key}
                      className="form-check form-switch d-flex align-items-center justify-content-between ps-0 py-1"
                    >
                      <div>
                        <label
                          htmlFor={`notif-event-${ev.key}`}
                          className="form-check-label fw-semibold small d-block"
                        >
                          {ev.label}
                        </label>
                        <span
                          className="text-muted"
                          style={{ fontSize: "11.5px" }}
                        >
                          {ev.desc}
                        </span>
                      </div>
                      <input
                        id={`notif-event-${ev.key}`}
                        type="checkbox"
                        role="switch"
                        className="form-check-input ms-2"
                        checked={isChecked}
                        aria-checked={isChecked}
                        onChange={(e) =>
                          updateNotificationEvents({
                            [ev.key]: e.target.checked,
                          })
                        }
                        data-testid={`notif-event-${ev.key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* 7. SECCIÓN AYUDA, DIAGNÓSTICO Y RECURSOS */}
          {visibleSections.has("help") && (
            <Card
              className="p-4 shadow-xs"
              data-testid="settings-section-help"
            >
              <h6
                className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center gap-2"
                style={{ letterSpacing: "0.04em" }}
              >
                <LuCircleHelp size={15} className="text-primary" />
                <span>Ayuda, Diagnóstico del Sistema y Respaldo</span>
              </h6>

              <div className="row g-3 mb-4">
                <div className="col-12 col-md-4">
                  <div
                    className="p-3 rounded-3"
                    style={{
                      backgroundColor: "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border-default, #e2e8f0)",
                    }}
                  >
                    <div className="text-muted small fw-semibold mb-1">
                      ESTADO DE RED
                    </div>
                    <div className="fw-bold small">
                      {isOnline ? "🟢 Conectado (Online)" : "🟠 Sin conexión (Offline)"}
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-4">
                  <div
                    className="p-3 rounded-3"
                    style={{
                      backgroundColor: "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border-default, #e2e8f0)",
                    }}
                  >
                    <div className="text-muted small fw-semibold mb-1">
                      ALMACENAMIENTO LOCAL
                    </div>
                    <div className="fw-bold small font-monospace">
                      {storageUsageKB} KB utilizados
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-4">
                  <div
                    className="p-3 rounded-3"
                    style={{
                      backgroundColor: "var(--bg-subtle, #f8fafc)",
                      border: "1px solid var(--border-default, #e2e8f0)",
                    }}
                  >
                    <div className="text-muted small fw-semibold mb-1">
                      VERSIÓN DEL CLIENTE
                    </div>
                    <div className="fw-bold small d-flex align-items-center gap-1">
                      <LuSparkles size={13} className="text-primary" />
                      <span>Prioritask v1.8.0</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon={<LuCloudUpload size={15} />}
                  onClick={handleSyncCloud}
                  data-testid="sync-settings-cloud-btn"
                >
                  Sincronizar ajustes con la nube
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<LuDownload size={15} />}
                  onClick={handleExportSettings}
                  data-testid="export-settings-btn"
                >
                  Exportar ajustes (JSON)
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<LuRotateCcw size={15} />}
                  onClick={handleResetFactorySettings}
                  data-testid="reset-settings-btn"
                >
                  Restablecer configuración de fábrica
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default Profile;
