import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "./Sidebar.css";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const token = localStorage.getItem("token");

  // Ocultar Sidebar si no hay token o si está en login o register
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";
  if (!token || isAuthPage) {
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
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

      <aside className={`sidebar ${isOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header-row">
          <h3 className="logo">Prioritask</h3>
          <button className="close-drawer-btn" onClick={onClose} aria-label="Cerrar menú">
            ✕
          </button>
        </div>

        <ul className="nav">
          <li>
            <NavLink to="/dashboard" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="Dashboard">📊</span> Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/tasks" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="Tasks">📝</span> Tareas
            </NavLink>
          </li>
          <li>
            <NavLink to="/tasks/grouped" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="Grouped">🧠</span> Agrupadas
            </NavLink>
          </li>
          <li>
            <NavLink to="/history" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="History">📜</span> Historial
            </NavLink>
          </li>
          <li>
            <NavLink to="/tasks/assign" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="Assign">🤝</span> Asignar
            </NavLink>
          </li>
          <li>
            <NavLink to="/tags" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="Tags">🏷️</span> Etiquetas
            </NavLink>
          </li>

          <li className="nav-bottom">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle-sidebar-btn"
              aria-label="Alternar tema"
              title="Alternar entre modo claro y oscuro"
            >
              <span>{theme === "dark" ? "☀️" : "🌙"}</span>
              <span>{theme === "dark" ? "Modo Claro" : "Modo Oscuro"}</span>
            </button>
            <NavLink to="/profile" onClick={handleNavClick} className={({ isActive }) => isActive ? "active" : ""}>
              <span role="img" aria-label="Profile">👤</span> Perfil
            </NavLink>
            <button onClick={handleLogout} className="logout-btn">
              🔓 Cerrar sesión
            </button>
          </li>
        </ul>
      </aside>
    </>
  );
};

export default Sidebar;
