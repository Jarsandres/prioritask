import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./auth/Login";
import Register from "./auth/Register";
import Dashboard from "./pages/Dashboard";
import Tags from "./pages/Tags";
import Profile from "./pages/Profile";
import Sidebar from "./components/Sidebar";
import TaskList from "./components/TaskList";
import TaskForm from "./components/TaskForm";
import AssignTaskForm from "./components/AssignTaskForm";

const AppContent = () => {
  const location = useLocation();
  const hideSidebar = location.pathname === "/login" || location.pathname === "/register";

  return (
    <div style={{ display: "flex" }}>
      {!hideSidebar && <Sidebar />}
      <div style={{ marginLeft: !hideSidebar ? "220px" : "0px", flex: 1 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/create" element={<TaskForm />} />
          <Route path="/tasks/edit/:taskId" element={<TaskForm />} />
          <Route path="/tasks/assign" element={<AssignTaskForm />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
