import { NavLink, useLocation } from "react-router-dom";
import "./MobileBottomNav.css";

interface MobileBottomNavProps {
  onOpenMenu: () => void;
}

const MobileBottomNav = ({ onOpenMenu }: MobileBottomNavProps) => {
  const location = useLocation();

  // Comprobar si la sección de tareas está activa
  const isTasksActive =
    location.pathname === "/tasks" || location.pathname.startsWith("/tasks/edit");

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegación inferior móvil">
      {/* 1. Dashboard */}
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `mobile-nav-item ${isActive ? "active" : ""}`
        }
      >
        <span className="mobile-nav-icon" role="img" aria-label="Dashboard">
          📊
        </span>
        <span className="mobile-nav-label">Dashboard</span>
      </NavLink>

      {/* 2. Tareas */}
      <NavLink
        to="/tasks"
        className={() => `mobile-nav-item ${isTasksActive ? "active" : ""}`}
      >
        <span className="mobile-nav-icon" role="img" aria-label="Tareas">
          📝
        </span>
        <span className="mobile-nav-label">Tareas</span>
      </NavLink>

      {/* 3. Botón central destacado: Nueva Tarea (Thumb Action principal) */}
      <NavLink
        to="/tasks/create"
        className="mobile-nav-create-wrapper"
        aria-label="Crear nueva tarea"
      >
        <div className="mobile-nav-create-btn">
          <span role="img" aria-label="Nueva">➕</span>
        </div>
        <span className="mobile-nav-label">Crear</span>
      </NavLink>

      {/* 4. IA / Agrupadas */}
      <NavLink
        to="/tasks/grouped"
        className={({ isActive }) =>
          `mobile-nav-item ${isActive ? "active" : ""}`
        }
      >
        <span className="mobile-nav-icon" role="img" aria-label="IA">
          🧠
        </span>
        <span className="mobile-nav-label">IA</span>
      </NavLink>

      {/* 5. Menú lateral con Sidebar existente */}
      <button
        type="button"
        className="mobile-nav-item"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
      >
        <span className="mobile-nav-icon" role="img" aria-label="Menú">
          ☰
        </span>
        <span className="mobile-nav-label">Menú</span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
