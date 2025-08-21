import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

const backendBase =
  import.meta.env.VITE_FASTAPI_BASE || "http://localhost:8000";

// Wrapper component to trigger backend cert check
function AppWrapper() {
  useEffect(() => {
    fetch(backendBase, { method: "GET", mode: "no-cors" }).catch(() => {
      console.log("Cert/local backend check triggered");
    });
  }, []);

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppWrapper />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
