import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

// Utility to parse JWT payload (no dependency)
function parseJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, username, role }
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Refs so interceptors always see latest token
  const accessTokenRef = useRef();
  const refreshTokenRef = useRef();

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  // Axios instance for authenticated requests
  const authAxios = useRef(
    axios.create({
      baseURL: API_BASE,
      withCredentials: false, // if you later move refresh token to httponly cookie, enable as needed
    })
  ).current;

  // Queue to avoid multiple simultaneous refreshes
  let isRefreshing = false;
  let failedQueue = [];

  const processQueue = (err, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
      if (err) reject(err);
      else resolve(token);
    });
    failedQueue = [];
  };

  // Response interceptor for auto-refresh
  authAxios.interceptors.response.use(
    (resp) => resp,
    async (err) => {
      const originalRequest = err.config;
      if (
        err.response &&
        err.response.status === 401 &&
        !originalRequest._retry
      ) {
        originalRequest._retry = true;

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              originalRequest.headers["Authorization"] = `Bearer ${token}`;
              return authAxios(originalRequest);
            })
            .catch((e) => Promise.reject(e));
        }

        isRefreshing = true;
        try {
          const { accessToken: newAccess, refreshToken: newRefresh } =
            await refreshTokens(); // uses current refreshTokenRef

          processQueue(null, newAccess);
          originalRequest.headers["Authorization"] = `Bearer ${newAccess}`;
          return authAxios(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          logout(); // break session
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
      return Promise.reject(err);
    }
  );

  // Schedule access token refresh before expiry
  const scheduleRefresh = useCallback(
    (token) => {
      const payload = parseJwt(token);
      if (!payload || !payload.exp) return;
      const expiresAt = payload.exp * 1000; // ms
      const now = Date.now();
      const delay = Math.max(expiresAt - now - 30_000, 0); // refresh 30s before expiry
      setTimeout(() => {
        if (refreshTokenRef.current) refreshTokens().catch(() => {});
      }, delay);
    },
    [refreshTokenRef]
  );

  // Login function
  const login = async ({ username, password, role }) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.post(
        `${API_BASE}/api/auth/login`,
        {
          username,
          password,
          roleRequested: role,
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      const { accessToken, refreshToken, user: u } = resp.data;
      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      setUser(u);
      scheduleRefresh(accessToken);
      return u;
    } catch (e) {
      setError(
        e.response?.data?.error || "Login failed. Check credentials and role."
      );
      throw e;
    } finally {
      setLoading(false);
    }
  };

  async function register({ username, password, role, inviteCode }) {
    setError(null);
    try {
      await axios.post(`${API_BASE}/api/auth/register`, {
        username, password, role, inviteCode
      }, {
        headers: { "Content-Type": "application/json" }
      });

      // Automatically login after successful registration
      const u = await login({ username, password, role });
      return u;
    } catch (err) {
      // Log, then surface error
      if (err.response) {
        console.error("Register error:", err.response.status, err.response.data);
        setError(err.response.data.error || "Registration failed");
      } else {
        console.error("Register error:", err.message);
        setError("Registration failed");
      }
      throw err;
    }
  }

  // Refresh token pair
  const refreshTokens = async () => {
    if (!refreshTokenRef.current) throw new Error("No refresh token");
    const resp = await axios.post(
      `${API_BASE}/api/auth/refresh`,
      { refreshToken: refreshTokenRef.current },
      { headers: { "Content-Type": "application/json" } }
    );
    const { accessToken: newAccess, refreshToken: newRefresh } = resp.data;
    setAccessToken(newAccess);
    setRefreshToken(newRefresh);
    scheduleRefresh(newAccess);
    return { accessToken: newAccess, refreshToken: newRefresh };
  };

  const logout = async () => {
    try {
      if (refreshTokenRef.current) {
        await axios.post(
          `${API_BASE}/api/auth/logout`,
          { refreshToken: refreshTokenRef.current },
          { headers: { "Content-Type": "application/json" } }
        );
      }
    } catch {}
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setError(null);
  };

  // Helper to make authenticated calls externally if needed
  const authRequest = (config) => {
    // If you need custom calls outside of internal interceptor
    return authAxios({ ...config, headers: { Authorization: `Bearer ${accessTokenRef.current}`, ...(config.headers || {}) } });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        login,
        logout,
        register,
        loading,
        error,
        authAxios, // use this for any protected API calls
        authRequest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook
export function useAuth() {
  return useContext(AuthContext);
}
