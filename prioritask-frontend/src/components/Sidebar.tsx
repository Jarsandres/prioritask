import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "./Sidebar.css";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Ocultar Sidebar si no hay token o si está en login o register
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";
  if (!token || isAuthPage) {
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="sidebar">
      <h3 className="logo">Prioritask</h3>
      <ul className="nav">
        <li>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? "active" : ""}>
            <span role="img" aria-label="Dashboard">📊</span> Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to="/tasks" className={({ isActive }) => isActive ? "active" : ""}>
            <span role="img" aria-label="Tasks">📝</span> Tareas
          </NavLink>
        </li>
        <li>
          <NavLink to="/tags" className={({ isActive }) => isActive ? "active" : ""}>
            <span role="img" aria-label="Tags">🏷️</span> Etiquetas
          </NavLink>
        </li>

        <li className="nav-bottom">
          <NavLink to="/profile" className={({ isActive }) => isActive ? "active" : ""}>
            <span role="img" aria-label="Profile">👤</span> Perfil
          </NavLink>
          <button onClick={handleLogout} className="logout-btn">
            🔓 Cerrar sesión
          </button>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
