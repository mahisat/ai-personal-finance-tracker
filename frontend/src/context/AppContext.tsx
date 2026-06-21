// src/context/AppContext.tsx
import { createContext, useContext, useState, ReactNode } from "react";

interface AppContextValue {
  userId: number;
  setUserId: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Default to user 1 for demo — swap for real auth
  const [userId, setUserId] = useState<number>(1);
  return (
    <AppContext.Provider value={{ userId, setUserId }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
