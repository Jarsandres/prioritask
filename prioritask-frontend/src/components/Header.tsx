import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  LuHouse,
  LuChevronDown,
  LuCheck,
  LuPlus,
  LuUsers,
  LuSun,
  LuMoon,
  LuUser,
  LuLogOut,
} from "react-icons/lu";
import { useRoom } from "../context/RoomContext";
import { useTheme } from "../context/ThemeContext";
import api from "../api";
import RoomMembersModal from "./RoomMembersModal";
import type { UserProfile } from "../types/auth";
import "./Header.css";

const Header = () => {
  const { rooms, activeRoom, selectRoom, setRoomId, refreshRooms } = useRoom();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  const roomDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Cargar usuario actual para el avatar/perfil
  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      try {
        const res = await api.get<UserProfile>("/auth/me");
        if (isMounted) setUser(res.data);
      } catch {
        // En caso de fallo silencioso, el interceptor maneja el flujo
      }
    };
    fetchUser();
    return () => {
      isMounted = false;
    };
  }, []);

  // Manejo de clic exterior para cerrar los dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        roomDropdownRef.current &&
        !roomDropdownRef.current.contains(target)
      ) {
        setIsRoomDropdownOpen(false);
      }
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(target)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("roomId");
    setRoomId(null);
    navigate("/login");
  };

  const handleSelectRoom = (selectedId: string) => {
    selectRoom(selectedId);
    setIsRoomDropdownOpen(false);
    // Sincronizar ruta si el usuario se encuentra dentro de la vista de tareas de una sala
    if (location.pathname.startsWith("/rooms/") && location.pathname.endsWith("/tasks")) {
      navigate(`/rooms/${selectedId}/tasks`);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .trim()
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <>
      <header className="desktop-header" role="banner">
        {/* Lado izquierdo: Selector de Hogar / Sala y Botón de Convivientes */}
        <div className="header-left">
          <div className="header-room-dropdown-container" ref={roomDropdownRef}>
            <button
              type="button"
              className="header-room-selector-btn"
              onClick={() => setIsRoomDropdownOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={isRoomDropdownOpen}
              aria-label="Seleccionar hogar activo"
            >
              <div className="header-room-icon-wrapper">
                <LuHouse size={18} aria-hidden="true" />
              </div>
              <div className="header-room-text-block">
                <span className="header-room-label">Hogar activo</span>
                <span className="header-room-name">
                  {activeRoom ? activeRoom.nombre : "Sin hogar"}
                </span>
              </div>
              <LuChevronDown
                size={16}
                className={`header-chevron ${isRoomDropdownOpen ? "open" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isRoomDropdownOpen && (
              <div className="header-dropdown-menu room-dropdown-menu" role="menu">
                <div className="header-dropdown-header">
                  <span className="header-dropdown-title">Mis Hogares</span>
                  <span className="header-dropdown-badge">{rooms.length}</span>
                </div>

                <div className="header-room-list" role="group">
                  {rooms.length === 0 ? (
                    <div className="header-empty-rooms">No perteneces a ningún hogar</div>
                  ) : (
                    rooms.map((room) => {
                      const isActive = activeRoom?.id === room.id;
                      return (
                        <button
                          key={room.id}
                          type="button"
                          className={`header-room-option ${isActive ? "active" : ""}`}
                          onClick={() => handleSelectRoom(room.id)}
                          role="menuitem"
                        >
                          <div className="header-room-option-info">
                            <span className="header-room-option-name">{room.nombre}</span>
                            <span className="header-room-role-badge">
                              {room.is_owner
                                ? "Propietario"
                                : room.my_role === "ADMIN"
                                ? "Administrador"
                                : "Conviviente"}
                            </span>
                          </div>
                          {isActive && (
                            <LuCheck size={16} className="header-check-icon" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="header-dropdown-divider" />

                <button
                  type="button"
                  className="header-action-option"
                  onClick={() => {
                    setIsRoomDropdownOpen(false);
                    navigate("/rooms/create");
                  }}
                  role="menuitem"
                >
                  <LuPlus size={16} aria-hidden="true" />
                  <span>Crear Nuevo Hogar</span>
                </button>
              </div>
            )}
          </div>

          {/* Botón de miembros / convivientes del hogar */}
          {activeRoom && (
            <button
              type="button"
              className="header-members-btn"
              onClick={() => setIsMembersModalOpen(true)}
              title="Ver convivientes del hogar"
              aria-label="Ver convivientes del hogar"
            >
              <LuUsers size={16} aria-hidden="true" />
              <span>Convivientes</span>
              {activeRoom.members && activeRoom.members.length > 0 && (
                <span className="header-members-count">{activeRoom.members.length}</span>
              )}
            </button>
          )}
        </div>

        {/* Lado derecho: Selector de Tema & Menú de Perfil */}
        <div className="header-right">
          <button
            type="button"
            className="header-icon-btn theme-toggle-header"
            onClick={toggleTheme}
            aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
            title={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
          >
            {theme === "dark" ? (
              <LuSun size={18} aria-hidden="true" />
            ) : (
              <LuMoon size={18} aria-hidden="true" />
            )}
          </button>

          {/* Menú de Perfil */}
          <div className="header-profile-container" ref={profileDropdownRef}>
            <button
              type="button"
              className="header-profile-btn"
              onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={isProfileDropdownOpen}
              aria-label="Menú de perfil"
            >
              <div className="header-avatar" aria-hidden="true">
                {getInitials(user?.nombre)}
              </div>
              <span className="header-profile-name">{user?.nombre || "Mi Cuenta"}</span>
              <LuChevronDown
                size={14}
                className={`header-chevron ${isProfileDropdownOpen ? "open" : ""}`}
                aria-hidden="true"
              />
            </button>

            {isProfileDropdownOpen && (
              <div className="header-dropdown-menu profile-dropdown-menu" role="menu">
                <div className="header-profile-info">
                  <span className="header-profile-user-name">{user?.nombre || "Usuario"}</span>
                  <span className="header-profile-user-email">{user?.email}</span>
                </div>

                <div className="header-dropdown-divider" />

                <Link
                  to="/profile"
                  className="header-menu-link"
                  onClick={() => setIsProfileDropdownOpen(false)}
                  role="menuitem"
                >
                  <LuUser size={16} aria-hidden="true" />
                  <span>Mi Perfil</span>
                </Link>

                <div className="header-dropdown-divider" />

                <button
                  type="button"
                  className="header-menu-link logout-link"
                  onClick={handleLogout}
                  role="menuitem"
                >
                  <LuLogOut size={16} aria-hidden="true" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modal de miembros del hogar activo */}
      {activeRoom && isMembersModalOpen && (
        <RoomMembersModal
          roomId={activeRoom.id}
          roomName={activeRoom.nombre}
          isOwner={Boolean(activeRoom.is_owner)}
          myRole={activeRoom.my_role ?? null}
          ownerId={activeRoom.owner_id}
          ownerEmail={activeRoom.owner}
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          onMembersChanged={refreshRooms}
        />
      )}
    </>
  );
};

export default Header;
