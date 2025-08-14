import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "react-bootstrap";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loadingAuth } = useAuth();
  const location = useLocation();

  // 🔹 Show loading spinner while authentication is being restored
  if (loadingAuth) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <div className="text-center">
          <Spinner animation="border" className="mb-3" />
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  // 🔹 Only check authentication after loading is complete
  if (!user) {
    // Not logged in
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    return <div className="p-4 text-center text-danger">Forbidden: insufficient role</div>;
  }

  return children;
}