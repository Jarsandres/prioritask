import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./auth/Login";
import Register from "./auth/Register";
import Dashboard from "./pages/Dashboard";
import Tags from "./pages/Tags";
import Profile from "./pages/Profile";
import GroupedTasks from "./pages/GroupedTasks";
import RewriteTitles from "./pages/RewriteTitles";
import History from "./pages/History";
import Sidebar from "./components/Sidebar";
import TaskList from "./components/TaskList";
import TaskForm from "./components/TaskForm";
import AssignTaskForm from "./components/AssignTaskForm";
import RoomTasks from "./pages/RoomTasks";
import { TaskUpdateProvider } from "./context/TaskUpdateContext";
import { RoomProvider } from "./context/RoomContext";
import CreateRoom from "./pages/CreateRoom";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

const AppContent = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const hideSidebar = location.pathname === "/login" || location.pathname === "/register";

  return (
    <div className="app-layout">
      {/* Cabecera superior solo visible en teléfonos y tablets pequeñas (<=768px) */}
      {!hideSidebar && (
        <header className="mobile-header">
          <button
            className="hamburger-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú de navegación"
          >
            ☰
          </button>
          <span className="mobile-title">Prioritask</span>
        </header>
      )}

      {!hideSidebar && (
        <Sidebar
          isOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
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
  );
};

function App() {
  return (
    <BrowserRouter>
      <TaskUpdateProvider>
        <RoomProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </RoomProvider>
      </TaskUpdateProvider>
    </BrowserRouter>
  );
}

export default App;

