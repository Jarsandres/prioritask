import { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LuMenu, LuSun, LuMoon, LuSearch } from "react-icons/lu";
import Login from "./auth/Login";
import Register from "./auth/Register";
import Dashboard from "./pages/Dashboard";
import Tags from "./pages/Tags";
import Profile from "./pages/Profile";
import GroupedTasks from "./pages/GroupedTasks";
import RewriteTitles from "./pages/RewriteTitles";
import History from "./pages/History";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import MobileBottomNav from "./components/MobileBottomNav";
import TaskList from "./components/TaskList";
import TaskForm from "./components/TaskForm";
import AssignTaskForm from "./components/AssignTaskForm";
import RoomTasks from "./pages/RoomTasks";
import { TaskUpdateProvider } from "./context/TaskUpdateContext";
import { RoomProvider, useRoom } from "./context/RoomContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import CreateRoom from "./pages/CreateRoom";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineBanner from "./components/common/OfflineBanner";
import ScreenReaderAnnouncer from "./components/common/ScreenReaderAnnouncer";
import ModalSkeleton from "./components/ui/ModalSkeleton";
import "./App.css";

// Lazy loading diferido de modales pesados globales (Sprint 10 Code-Splitting)
const CommandPaletteModal = lazy(() => import("./components/common/CommandPaletteModal"));
const KeyboardShortcutsModal = lazy(() => import("./components/common/KeyboardShortcutsModal"));

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeRoom } = useRoom();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const { theme, toggleTheme } = useTheme();
  const hideSidebar = location.pathname === "/login" || location.pathname === "/register";

  // Listener global de atajos de teclado (Ctrl+K, ?, c)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Ctrl+K o Cmd+K para Command Palette Global
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Si el foco está dentro de un campo de texto, ignorar atajos simples
      if (isInput) return;

      // ? para ventana de ayuda de atajos
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      // 'c' para crear nueva tarea rápidamente
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        navigate("/tasks/create");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  return (
    <div className={`app-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Cabecera superior solo visible en teléfonos y tablets pequeñas (<=768px) */}
      {!hideSidebar && (
        <header className="mobile-header">
          <div className="mobile-header-left">
            <button
              className="hamburger-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de navegación"
            >
              <LuMenu size={20} aria-hidden="true" />
            </button>
            <span className="mobile-title">Prioritask</span>
          </div>
          <div className="mobile-header-right d-flex align-items-center">
            <button
              type="button"
              className="theme-toggle-btn me-1"
              onClick={() => setIsCommandPaletteOpen(true)}
              aria-label="Abrir buscador global (Ctrl+K)"
              title="Buscar (Ctrl+K)"
            >
              <LuSearch size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="theme-toggle-btn"
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
          </div>
        </header>
      )}

      {!hideSidebar && (
        <Sidebar
          isOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />
      )}

      <div className={`app-main-area ${hideSidebar ? "no-sidebar" : ""}`}>
        {!hideSidebar && (
          <Header
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        )}
        <main className={`main-content ${hideSidebar ? "no-sidebar" : ""}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/rooms/create" element={<CreateRoom />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/create" element={<TaskForm />} />
            <Route path="/tasks/edit/:taskId" element={<TaskForm />} />
            <Route path="/tasks/assign" element={<AssignTaskForm />} />
            <Route path="/tasks/grouped" element={<GroupedTasks />} />
            <Route path="/tasks/rewrite" element={<RewriteTitles />} />
            <Route path="/history" element={<History />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/rooms/:roomId/tasks" element={<RoomTasks />} />
          </Routes>
        </main>
      </div>

      {/* Navegación ergonómica inferior en móvil (Thumb Zone) */}
      {!hideSidebar && (
        <MobileBottomNav onOpenMenu={() => setMobileOpen(true)} />
      )}

      {/* Banner flotante de conectividad Offline-First */}
      <OfflineBanner />

      {/* Anunciador universal para lectores de pantalla (NVDA / TalkBack / VoiceOver) */}
      <ScreenReaderAnnouncer />

      {/* Modales Globales de Paleta de Comandos y Atajos (Lazy Loaded) */}
      {isCommandPaletteOpen && (
        <Suspense fallback={<ModalSkeleton />}>
          <CommandPaletteModal
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            onOpenGamification={() => {
              if (activeRoom) {
                navigate(`/rooms/${activeRoom.id}/tasks`);
              } else {
                navigate("/dashboard");
              }
            }}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />
        </Suspense>
      )}

      {isShortcutsOpen && (
        <Suspense fallback={<ModalSkeleton />}>
          <KeyboardShortcutsModal
            isOpen={isShortcutsOpen}
            onClose={() => setIsShortcutsOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <TaskUpdateProvider>
            <RoomProvider>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </RoomProvider>
          </TaskUpdateProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
