import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LuMenu, LuSun, LuMoon } from "react-icons/lu";
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
import { RoomProvider } from "./context/RoomContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import CreateRoom from "./pages/CreateRoom";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

const AppContent = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const { theme, toggleTheme } = useTheme();
  const hideSidebar = location.pathname === "/login" || location.pathname === "/register";

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
        {!hideSidebar && <Header />}
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
