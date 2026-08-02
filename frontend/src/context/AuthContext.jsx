import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = anon, object = user
  const [token, setToken] = useState(localStorage.getItem("vs_token") || null);

  const loadMe = useCallback(async () => {
    const t = localStorage.getItem("vs_token");
    if (!t) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("vs_token");
      setToken(null);
      setUser(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const applyAuth = (data) => {
    localStorage.setItem("vs_token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    applyAuth(data);
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    applyAuth(data);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("vs_token");
    setToken(null);
    setUser(false);
  };

  const updateUser = (patch) => setUser((u) => (u ? { ...u, ...patch } : u));

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, refresh: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
