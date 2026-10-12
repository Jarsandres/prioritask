import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LuLayoutDashboard,
  LuSquareCheck,
  LuBrain,
  LuHistory,
  LuUsers,
  LuTags,
  LuUser,
  LuSun,
  LuMoon,
  LuLogOut,
  LuX,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPlus,
  LuChevronDown,
  LuChevronRight,
  LuHash,
  LuChartBar,
  LuStar,
  LuCalendarCheck,
  LuCalendarRange,
} from "react-icons/lu";
import api from "../api";
import { useTheme } from "../context/ThemeContext";
import { useRoom } from "../context/RoomContext";
import { useSettings } from "../context/SettingsContext";
import { clearClientSessionData } from "../services/sessionCleanup";
import "./Sidebar.css";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenQuickAdd?: () => void;
}

const PROJECT_COLORS = [
  "#dc2626", // Coral Todoist
  "#2563eb", // Royal Blue
  "#10b981", // Emerald
  "#8b5cf6", // Violet AI
  "#d97706", // Amber
  "#06b6d4", // Cyan
];

const Sidebar = ({
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
  onOpenQuickAdd,
}: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme, getRoomBranding } = useTheme();
  const { rooms, activeRoom, selectRoom, setRoomId } = useRoom();
  const { settings } = useSettings();
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const token = localStorage.getItem("token");

  const {
    visibleModules,
    showTaskCounts,
    showFavoritesSection,
    favoriteRoomIds,
  } = settings.navigation;

  const favoriteRooms = rooms.filter((r) => favoriteRoomIds.includes(r.id));

  // Ocultar Sidebar si no hay token o si está en login o register
  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/register";
  if (!token || isAuthPage) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Continuar limpieza local aunque falle la red
    }
    await clearClientSessionData();
    setRoomId(null);
    if (onClose) onClose();
    navigate("/login");
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const handleSelectRoomProject = (selectedId: string) => {
    selectRoom(selectedId);
    if (onClose) onClose();
    navigate(`/rooms/${selectedId}/tasks`);
  };

  const searchParams = new URLSearchParams(location.search);
  const activeViewParam =
    location.pathname === "/tasks" ? searchParams.get("view") : null;

  return (
    <>
      {/* Backdrop para cerrar el Drawer en móvil al hacer clic fuera */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside
        className={`sidebar ${isOpen ? "mobile-open" : ""} ${
          isCollapsed ? "collapsed" : ""
        }`}
      >
        <div className="sidebar-header-row">
          <div className="sidebar-brand">
            <span className="sidebar-brand-mark" aria-hidden="true">
              P
            </span>
            <h3 className="logo">Prioritask</h3>
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              className="collapse-toggle-btn"
              onClick={onToggleCollapse}
              aria-label={
                isCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"
              }
              title={
                isCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"
              }
            >
              {isCollapsed ? (
                <LuPanelLeftOpen size={18} aria-hidden="true" />
              ) : (
                <LuPanelLeftClose size={18} aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            className="close-drawer-btn"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <LuX size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Acción Rápida Principal Estilo Todoist (+ Añadir tarea) */}
        <div className="sidebar-quick-add-wrapper">
          <button
            type="button"
            className="sidebar-quick-add-btn"
            onClick={() => {
              if (onClose) onClose();
              if (onOpenQuickAdd) {
                onOpenQuickAdd();
              } else {
                navigate("/tasks/create");
              }
            }}
            title="Añadir tarea rápida (Atajo: C)"
            aria-label="Añadir tarea"
          >
            <span className="sidebar-quick-add-icon" aria-hidden="true">
              <LuPlus size={16} />
            </span>
            <span className="nav-label">Añadir tarea</span>
            <kbd className="sidebar-quick-add-kbd nav-label">C</kbd>
          </button>
        </div>

        <ul className="nav">
          <li>
            <NavLink
              to="/dashboard"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Dashboard"
            >
              <LuLayoutDashboard
                size={18}
                className="nav-icon-blue"
                aria-hidden="true"
              />
              <span className="nav-label">Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tasks"
              onClick={handleNavClick}
              end
              className={({ isActive }) =>
                isActive && !activeViewParam ? "active" : ""
              }
              title="Tareas"
            >
              <LuSquareCheck
                size={18}
                className="nav-icon-emerald"
                aria-hidden="true"
              />
              <span className="nav-label">Tareas</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tasks?view=today"
              onClick={handleNavClick}
              data-testid="sidebar-nav-today"
              className={() =>
                location.pathname === "/tasks" && activeViewParam === "today"
                  ? "active"
                  : ""
              }
              title="Hoy"
            >
              <LuCalendarCheck
                size={18}
                className="nav-icon-amber"
                aria-hidden="true"
              />
              <span className="nav-label">Hoy</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tasks?view=upcoming"
              onClick={handleNavClick}
              data-testid="sidebar-nav-upcoming"
              className={() =>
                location.pathname === "/tasks" && activeViewParam === "upcoming"
                  ? "active"
                  : ""
              }
              title="Próximo"
            >
              <LuCalendarRange
                size={18}
                className="nav-icon-violet"
                aria-hidden="true"
              />
              <span className="nav-label">Próximo</span>
            </NavLink>
          </li>
          {visibleModules.groupedAi && (
            <li>
              <NavLink
                to="/tasks/grouped"
                onClick={handleNavClick}
                className={({ isActive }) => (isActive ? "active" : "")}
                title="Agrupadas"
              >
                <LuBrain
                  size={18}
                  className="nav-icon-violet"
                  aria-hidden="true"
                />
                <span className="nav-label">Agrupadas</span>
              </NavLink>
            </li>
          )}
          {visibleModules.assign && (
            <li>
              <NavLink
                to="/tasks/assign"
                onClick={handleNavClick}
                className={({ isActive }) => (isActive ? "active" : "")}
                title="Asignar"
              >
                <LuUsers
                  size={18}
                  className="nav-icon-amber"
                  aria-hidden="true"
                />
                <span className="nav-label">Asignar</span>
              </NavLink>
            </li>
          )}
          {visibleModules.analytics && (
            <li>
              <NavLink
                to="/analytics"
                onClick={handleNavClick}
                className={({ isActive }) => (isActive ? "active" : "")}
                title="Analíticas"
              >
                <LuChartBar
                  size={18}
                  className="nav-icon-blue"
                  aria-hidden="true"
                />
                <span className="nav-label">Analíticas</span>
              </NavLink>
            </li>
          )}
          {visibleModules.tags && (
            <li>
              <NavLink
                to="/tags"
                onClick={handleNavClick}
                className={({ isActive }) => (isActive ? "active" : "")}
                title="Etiquetas"
              >
                <LuTags
                  size={18}
                  className="nav-icon-cyan"
                  aria-hidden="true"
                />
                <span className="nav-label">Etiquetas</span>
              </NavLink>
            </li>
          )}
          {visibleModules.history && (
            <li>
              <NavLink
                to="/history"
                onClick={handleNavClick}
                className={({ isActive }) => (isActive ? "active" : "")}
                title="Historial"
              >
                <LuHistory
                  size={18}
                  className="nav-icon-slate"
                  aria-hidden="true"
                />
                <span className="nav-label">Historial</span>
              </NavLink>
            </li>
          )}

          {/* Sección de Salas Favoritas Estilo Todoist */}
          {showFavoritesSection && favoriteRooms.length > 0 && (
            <li
              className="sidebar-projects-section"
              data-testid="sidebar-favorites-section"
            >
              <div className="sidebar-projects-header">
                <span className="sidebar-projects-toggle">
                  <LuStar
                    size={13}
                    style={{ color: "#f59e0b" }}
                    aria-hidden="true"
                  />
                  <span className="nav-label">⭐ Favoritos</span>
                </span>
              </div>
              <div
                className="sidebar-projects-list"
                role="group"
                aria-label="Favoritos"
              >
                {favoriteRooms.map((room, idx) => {
                  const branding = getRoomBranding
                    ? getRoomBranding(room.id, idx)
                    : {
                        icon: "🏠",
                        color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
                      };
                  const color = branding.color;
                  const isRoomActive =
                    activeRoom?.id === room.id &&
                    location.pathname.includes(`/rooms/${room.id}`);
                  return (
                    <button
                      key={`fav-${room.id}`}
                      type="button"
                      className={`sidebar-project-item ${
                        isRoomActive ? "active" : ""
                      } ${
                        activeRoom?.id === room.id ? "selected-context" : ""
                      }`}
                      onClick={() => handleSelectRoomProject(room.id)}
                      title={room.nombre}
                    >
                      <LuStar
                        size={14}
                        style={{ color, flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      <span className="sidebar-project-name nav-label">
                        {room.nombre}
                      </span>
                      {showTaskCounts && room.count !== undefined && (
                        <span className="sidebar-project-count nav-label">
                          {room.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </li>
          )}

          {/* Árbol de Hogares / Proyectos Estilo Todoist */}
          {visibleModules.rooms && (
            <li className="sidebar-projects-section">
              <div className="sidebar-projects-header">
                <button
                  type="button"
                  className="sidebar-projects-toggle"
                  onClick={() => setProjectsExpanded((prev) => !prev)}
                  aria-expanded={projectsExpanded}
                  title="Mostrar u ocultar Mis Hogares"
                >
                  {projectsExpanded ? (
                    <LuChevronDown size={14} aria-hidden="true" />
                  ) : (
                    <LuChevronRight size={14} aria-hidden="true" />
                  )}
                  <span className="nav-label">Mis Hogares</span>
                </button>
                <button
                  type="button"
                  className="sidebar-projects-add-btn nav-label"
                  onClick={() => {
                    if (onClose) onClose();
                    navigate("/rooms/create");
                  }}
                  title="Crear nuevo hogar"
                  aria-label="Crear nuevo hogar"
                >
                  <LuPlus size={14} aria-hidden="true" />
                </button>
              </div>

              {projectsExpanded && (
                <div
                  className="sidebar-projects-list"
                  role="group"
                  aria-label="Mis Hogares"
                >
                  {rooms.map((room, idx) => {
                    const branding = getRoomBranding
                      ? getRoomBranding(room.id, idx)
                      : {
                          icon: "🏠",
                          color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
                        };
                    const color = branding.color;
                    const isRoomActive =
                      activeRoom?.id === room.id &&
                      location.pathname.includes(`/rooms/${room.id}`);
                    return (
                      <button
                        key={room.id}
                        type="button"
                        className={`sidebar-project-item ${
                          isRoomActive ? "active" : ""
                        } ${
                          activeRoom?.id === room.id ? "selected-context" : ""
                        }`}
                        onClick={() => handleSelectRoomProject(room.id)}
                        title={room.nombre}
                      >
                        {branding.icon && branding.icon !== "🏠" ? (
                          <span
                            style={{
                              fontSize: "12px",
                              lineHeight: 1,
                              flexShrink: 0,
                              width: "20px",
                              height: "20px",
                              borderRadius: "6px",
                              backgroundColor: `${color}18`,
                              border: `1px solid ${color}40`,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            aria-hidden="true"
                          >
                            {branding.icon}
                          </span>
                        ) : (
                          <LuHash
                            size={15}
                            style={{ color, flexShrink: 0 }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="sidebar-project-name nav-label">
                          {room.nombre}
                        </span>
                        {showTaskCounts && room.count !== undefined && (
                          <span className="sidebar-project-count nav-label">
                            {room.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          )}

          <li className="nav-bottom">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle-sidebar-btn"
              aria-label="Alternar tema"
              title={theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
            >
              {theme === "dark" ? (
                <LuSun size={18} aria-hidden="true" />
              ) : (
                <LuMoon size={18} aria-hidden="true" />
              )}
              <span className="nav-label">
                {theme === "dark" ? "Modo Claro" : "Modo Oscuro"}
              </span>
            </button>
            <NavLink
              to="/profile"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Perfil"
            >
              <LuUser size={18} aria-hidden="true" />
              <span className="nav-label">Perfil</span>
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="logout-btn"
              title="Cerrar sesión"
            >
              <LuLogOut size={18} aria-hidden="true" />
              <span className="nav-label">Cerrar sesión</span>
            </button>
          </li>
        </ul>
      </aside>
    </>
  );
};

export default Sidebar;
