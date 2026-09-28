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
} from "react-icons/lu";
import { useTheme } from "../context/ThemeContext";
import { useRoom } from "../context/RoomContext";
import "./Sidebar.css";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar = ({
  isOpen = false,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { setRoomId } = useRoom();
  const token = localStorage.getItem("token");

  // Ocultar Sidebar si no hay token o si está en login o register
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";
  if (!token || isAuthPage) {
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("roomId");
    setRoomId(null);
    if (onClose) onClose();
    navigate("/login");
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

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
            <h3 className="logo">Prioritask</h3>
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              className="collapse-toggle-btn"
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
              title={isCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
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

        <ul className="nav">
          <li>
            <NavLink
              to="/dashboard"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Dashboard"
            >
              <LuLayoutDashboard size={18} aria-hidden="true" />
              <span className="nav-label">Dashboard</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tasks"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Tareas"
            >
              <LuSquareCheck size={18} aria-hidden="true" />
              <span className="nav-label">Tareas</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tasks/grouped"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Agrupadas"
            >
              <LuBrain size={18} aria-hidden="true" />
              <span className="nav-label">Agrupadas</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/history"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Historial"
            >
              <LuHistory size={18} aria-hidden="true" />
              <span className="nav-label">Historial</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tasks/assign"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Asignar"
            >
              <LuUsers size={18} aria-hidden="true" />
              <span className="nav-label">Asignar</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tags"
              onClick={handleNavClick}
              className={({ isActive }) => (isActive ? "active" : "")}
              title="Etiquetas"
            >
              <LuTags size={18} aria-hidden="true" />
              <span className="nav-label">Etiquetas</span>
            </NavLink>
          </li>

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
