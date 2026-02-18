"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api } from "./api";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan?: string;
};

type AuthState = {
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, tenantName: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api
        .get<{ user: User; tenant: Tenant }>("/api/auth/me")
        .then(({ user, tenant }) => {
          setUser(user);
          setTenant(tenant);
        })
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User; tenant: Tenant }>("/api/auth/login", {
      email,
      password,
    });
    api.setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, tenantName: string) => {
    const data = await api.post<{ token: string; user: User; tenant: Tenant }>("/api/auth/register", {
      email,
      password,
      name,
      tenantName,
    });
    api.setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
    setTenant(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
