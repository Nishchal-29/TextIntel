import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback
} from "react";
import axios from "axios";

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
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [error, setError] = useState(null);

  const accessTokenRef = useRef();
  const refreshTokenRef = useRef();

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  const authAxios = useRef(
    axios.create({
      baseURL: API_BASE,
      withCredentials: false,
    })
  ).current;

  /** ---------- RESTORE FROM STORAGE ON MOUNT ---------- **/
  useEffect(() => {
    const savedAccess = localStorage.getItem("accessToken");
    const savedRefresh = localStorage.getItem("refreshToken");

    async function initAuth() {
      if (savedRefresh) {
        try {
          // Try refreshing immediately so token is always valid after reload
          const { accessToken: newAccess, refreshToken: newRefresh, user: u } =
            await doRefresh(savedRefresh);

          setAccessToken(newAccess);
          setRefreshToken(newRefresh);
          setUser(u);

          localStorage.setItem("accessToken", newAccess);
          localStorage.setItem("refreshToken", newRefresh);
          localStorage.setItem("user", JSON.stringify(u));

          authAxios.defaults.headers.common["Authorization"] = `Bearer ${newAccess}`;
          scheduleRefresh(newAccess);
        } catch (err) {
          // Refresh failed — clear auth
          logout();
        }
      }
      setLoadingAuth(false);
    }

    initAuth();
  }, []);

  /** ---------- PERSIST WHEN CHANGED ---------- **/
  useEffect(() => {
    if (accessToken && refreshToken && user) {
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
    }
  }, [accessToken, refreshToken, user]);

  /** ---------- REFRESH TOKEN QUEUE ---------- **/
  let isRefreshing = false;
  let failedQueue = [];

  const processQueue = (err, token = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
      if (err) reject(err);
      else resolve(token);
    });
    failedQueue = [];
  };

  authAxios.interceptors.response.use(
    (resp) => resp,
    async (err) => {
      const originalRequest = err.config;
      if (err.response && err.response.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers["Authorization"] = `Bearer ${token}`;
            return authAxios(originalRequest);
          });
        }

        isRefreshing = true;
        try {
          const { accessToken: newAccess } = await refreshTokens();
          processQueue(null, newAccess);
          originalRequest.headers["Authorization"] = `Bearer ${newAccess}`;
          return authAxios(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          logout();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
      return Promise.reject(err);
    }
  );

  /** ---------- TOKEN REFRESH SCHEDULER ---------- **/
  const scheduleRefresh = useCallback(
    (token) => {
      const payload = parseJwt(token);
      if (!payload?.exp) return;
      const expiresAt = payload.exp * 1000;
      const delay = Math.max(expiresAt - Date.now() - 30_000, 0);
      setTimeout(() => {
        if (refreshTokenRef.current) refreshTokens().catch(() => {});
      }, delay);
    },
    []
  );

  /** ---------- LOGIN ---------- **/
  const login = async ({ username, password, role }) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.post(
        `${API_BASE}/api/auth/login`,
        { username, password, roleRequested: role },
        { headers: { "Content-Type": "application/json" } }
      );
      const { accessToken, refreshToken, user: u } = resp.data;

      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      setUser(u);

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("user", JSON.stringify(u));

      authAxios.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
      scheduleRefresh(accessToken);

      return u;
    } catch (e) {
      setError(e.response?.data?.error || "Login failed. Check credentials and role.");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  /** ---------- REGISTER ---------- **/
  async function register({ username, password, role, inviteCode }) {
    setError(null);
    try {
      await axios.post(`${API_BASE}/api/auth/register`,
        { username, password, role, inviteCode },
        { headers: { "Content-Type": "application/json" } }
      );
      return await login({ username, password, role });
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
      throw err;
    }
  }

  /** ---------- REFRESH TOKENS (manual call) ---------- **/
  const refreshTokens = async () => {
    if (!refreshTokenRef.current) throw new Error("No refresh token");
    return await doRefresh(refreshTokenRef.current);
  };

  /** ---------- REFRESH TOKENS (helper) ---------- **/
  const doRefresh = async (refreshTokenValue) => {
    const resp = await axios.post(
      `${API_BASE}/api/auth/refresh`,
      { refreshToken: refreshTokenValue },
      { headers: { "Content-Type": "application/json" } }
    );

    const { accessToken: newAccess, refreshToken: newRefresh, user: u } = resp.data;

    setAccessToken(newAccess);
    setRefreshToken(newRefresh);
    if (u) setUser(u);

    localStorage.setItem("accessToken", newAccess);
    localStorage.setItem("refreshToken", newRefresh);
    if (u) localStorage.setItem("user", JSON.stringify(u));

    authAxios.defaults.headers.common["Authorization"] = `Bearer ${newAccess}`;
    scheduleRefresh(newAccess);

    return { accessToken: newAccess, refreshToken: newRefresh, user: u };
  };

  /** ---------- LOGOUT ---------- **/
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

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  };

  /** ---------- HELPER ---------- **/
  const authRequest = (config) => {
    return authAxios({
      ...config,
      headers: { Authorization: `Bearer ${accessTokenRef.current}`, ...(config.headers || {}) }
    });
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
        loadingAuth,
        error,
        authAxios,
        authRequest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
