import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const Sidebar = () => {
  return (
    <div className="sidebar">
      <h3 className="logo">Prioritask</h3>
      <ul className="nav">
        {/* Secciones principales */}
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

        {/* Separador visual */}
        <li style={{ marginTop: "auto" }}>
          <NavLink to="/profile" className={({ isActive }) => isActive ? "active" : ""}>
            <span role="img" aria-label="Profile">👤</span> Perfil
          </NavLink>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
