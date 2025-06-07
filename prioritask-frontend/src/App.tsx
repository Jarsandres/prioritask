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
import History from "./pages/History";
import { TaskUpdateProvider } from "./context/TaskUpdateContext";
import { RoomProvider } from "./context/RoomContext";
import CreateRoom from "./pages/CreateRoom";

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
          <Route path="/history" element={<History />} />
        </Routes>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <TaskUpdateProvider>
        <RoomProvider>
          <AppContent />
        </RoomProvider>
      </TaskUpdateProvider>
    </BrowserRouter>
  );
}

export default App;
