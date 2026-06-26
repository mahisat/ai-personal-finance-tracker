// src/context/AppContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { setAuthToken } from "../api/client";

interface AuthUser {
  id: number;
  name: string;
  email: string;
}

interface AppContextValue {
  userId: number;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const STORAGE_KEY = "finance_auth";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Rehydrate from localStorage on first load
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const { token: t, user: u } = JSON.parse(raw);
      setToken(t);
      setUser(u);
      setAuthToken(t);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function login(newToken: string, newUser: AuthUser) {
    setToken(newToken);
    setUser(newUser);
    setAuthToken(newToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: newUser }));
  }

  function logout() {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AppContext.Provider
      value={{
        userId: user?.id ?? 0,
        user,
        isAuthenticated: token !== null && user !== null,
        login,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
