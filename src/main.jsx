import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";

// Wrapper component to trigger backend cert check
function AppWrapper() {
  useEffect(() => {
    // Trigger a fetch to your self-signed backend
    fetch("https://65.0.197.48/", { method: "GET", mode: "no-cors" })
      .catch(() => {
        // The error is expected; this triggers the browser certificate prompt
        console.log("Certificate warning triggered for self-signed backend");
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
