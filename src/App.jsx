import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/login";
import UserDashboard from "./pages/UserDashboard";
import CommanderDashboard from "./pages/CommanderDashboard";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import "bootstrap/dist/css/bootstrap.min.css";

function App() {
  const backendBase =
    import.meta.env.VITE_FASTAPI_BASE || "http://localhost:8000";

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${backendBase}/health`, { method: "GET" });
        if (!res.ok) throw new Error("Backend unhealthy");
      } catch (err) {
        window.location.href = `${backendBase}/warmup?redirect=https://textintel.onrender.com`;
      }
    };
    checkBackend();
  }, [backendBase]);

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/user"
        element={<ProtectedRoute element={<UserDashboard />} />}
      />
      <Route
        path="/commander"
        element={<ProtectedRoute element={<CommanderDashboard />} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
