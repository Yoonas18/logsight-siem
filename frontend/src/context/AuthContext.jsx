import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const TOKEN_KEY = "logsight_token";
const USER_KEY = "logsight_user";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(USER_KEY);
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  });
  const [booting, setBooting] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }

    api
      .me()
      .then((result) => {
        setUser(result.user);
        localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, [token]);

  async function login(username, password) {
    const result = await api.login(username, password);
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Local logout should still clear browser state if the API is unavailable.
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      booting,
      isAuthenticated: Boolean(token && user),
      canIngest: ["admin", "analyst"].includes(user?.role),
      login,
      logout,
    }),
    [token, user, booting]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
