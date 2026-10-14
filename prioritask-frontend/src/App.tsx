import { useState, useEffect, useCallback, Suspense, lazy } from "react";
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
import { SettingsProvider, useSettings } from "./context/SettingsContext";
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
const GlobalQuickAddModal = lazy(() => import("./components/tasks/GlobalQuickAddModal"));
import type { QuickAddPrefill } from "./components/tasks/GlobalQuickAddModal";

export const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeRoom } = useRoom();
  const { settings } = useSettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddPrefill, setQuickAddPrefill] = useState<QuickAddPrefill | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const { theme, toggleTheme } = useTheme();
  const hideSidebar = location.pathname === "/login" || location.pathname === "/register";

  // Soporte de invocación por URL / Deep-link (?quickAdd=1&content=...&description=...&date=...&priority=...&roomId=...)
  useEffect(() => {
    if (!location.search || hideSidebar) return;
    const params = new URLSearchParams(location.search);
    if (params.get("quickAdd") === "1" || params.get("quick_add") === "1") {
      const rawPrio = params.get("priority")?.toLowerCase();
      let parsedPrio: number | undefined;
      if (rawPrio) {
        const asNum = Number(rawPrio);
        if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= 5) {
          parsedPrio = asNum;
        } else if (rawPrio === "urgent" || rawPrio === "urgente" || rawPrio === "p1") {
          parsedPrio = 5;
        } else if (rawPrio === "high" || rawPrio === "alta" || rawPrio === "p2") {
          parsedPrio = 4;
        } else if (rawPrio === "medium" || rawPrio === "media" || rawPrio === "p3") {
          parsedPrio = 3;
        } else if (rawPrio === "low" || rawPrio === "baja" || rawPrio === "p5") {
          parsedPrio = 1;
        }
      }

      setQuickAddPrefill({
        content: params.get("content") || params.get("text") || undefined,
        description: params.get("description") || params.get("comment") || undefined,
        date: params.get("date") || undefined,
        priority: parsedPrio,
        categoria: params.get("categoria")?.toUpperCase() || undefined,
        roomId: params.get("roomId") || params.get("room_id") || undefined,
      });
      setIsQuickAddOpen(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, location.pathname, hideSidebar, navigate]);

  const openGlobalQuickAdd = useCallback(() => {
    setQuickAddPrefill(null);
    setIsQuickAddOpen(true);
  }, []);

  // Listener global de atajos de teclado (Ctrl+K, Ctrl+,, Ctrl+Space / Alt+Space / Ctrl+Shift+A, ?, c / q)
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

      // Atajos Globales para ventana flotante de Captura Rápida (Todoist Desktop quick_add)
      // Ctrl+Space, Alt+Space, o Ctrl+Shift+A / Cmd+Shift+A
      const isAltSpace =
        e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "Space" || e.key === " ");
      const isCtrlSpace =
        (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === "Space" || e.key === " ");
      const isCtrlShiftA =
        (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "a" || e.key === "A");

      if (isCtrlSpace || isAltSpace || isCtrlShiftA) {
        if (!hideSidebar) {
          e.preventDefault();
          setQuickAddPrefill(null);
          setIsQuickAddOpen((prev) => !prev);
        }
        return;
      }

      // Ctrl+, o Cmd+, para abrir Configuración y Perfil (Todoist Desktop)
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        navigate("/profile");
        return;
      }

      // Si el foco está dentro de un campo de texto o los atajos de una tecla están desactivados, ignorar
      if (isInput || !settings.general.enableSingleKeyShortcuts) return;

      // ? para ventana de ayuda de atajos
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      // 'c' o 'q' para abrir Captura Rápida Global sin desmontar la vista activa (Todoist canonical single-key)
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "c" || e.key === "C" || e.key === "q" || e.key === "Q")
      ) {
        if (!hideSidebar) {
          e.preventDefault();
          openGlobalQuickAdd();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, hideSidebar, settings.general.enableSingleKeyShortcuts, openGlobalQuickAdd]);

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
          onOpenQuickAdd={openGlobalQuickAdd}
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
            <Route path="/analytics" element={<Dashboard />} />
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
        <MobileBottomNav
          onOpenMenu={() => setMobileOpen(true)}
          onOpenQuickAdd={openGlobalQuickAdd}
        />
      )}

      {/* Banner flotante de conectividad Offline-First */}
      <OfflineBanner />

      {/* Anunciador universal para lectores de pantalla (NVDA / TalkBack / VoiceOver) */}
      <ScreenReaderAnnouncer />

      {/* Modal Flotante de Captura Rápida Global (Todoist Desktop quick_add) */}
      {!hideSidebar && isQuickAddOpen && (
        <Suspense fallback={<ModalSkeleton />}>
          <GlobalQuickAddModal
            isOpen={isQuickAddOpen}
            onClose={() => {
              setIsQuickAddOpen(false);
              setQuickAddPrefill(null);
            }}
            prefill={quickAddPrefill}
          />
        </Suspense>
      )}

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
            onOpenQuickAdd={openGlobalQuickAdd}
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
        <SettingsProvider>
          <ToastProvider>
            <TaskUpdateProvider>
              <RoomProvider>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </RoomProvider>
            </TaskUpdateProvider>
          </ToastProvider>
        </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
