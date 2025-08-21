import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/login";
import UserDashboard from "./pages/UserDashboard";
import CommanderDashboard from "./pages/CommanderDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Register from "./pages/Register";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_FASTAPI_BASE || "http://localhost:8000"}/health`,
          {
            method: "GET",
          }
        );
        if (!res.ok) throw new Error("Backend unhealthy");
      } catch (err) {
        window.location.href = `${
          import.meta.env.VITE_FASTAPI_BASE || "http://localhost:8000"
        }/warmup?redirect=https://textintel.onrender.com`;
      }
    };

    checkBackend();
  }, []);

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
