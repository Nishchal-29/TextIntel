import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import UserDashboard from "./pages/UserDashboard";
import CommanderDashboard from "./pages/CommanderDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Register from "./pages/Register";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/register" element={<Register />} />

      <Route
        path="/user"
        element={
          <ProtectedRoute allowedRoles={["user", "commander", "admin"]}>
            <UserDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/commander"
        element={
          <ProtectedRoute allowedRoles={["commander", "admin"]}>
            <CommanderDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* catch-all fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
