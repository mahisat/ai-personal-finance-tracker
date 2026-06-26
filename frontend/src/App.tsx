// src/App.tsx
import { useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Register from "./pages/Register";

type Page = "dashboard" | "transactions" | "budgets" | "chat";
type AuthView = "login" | "register";

const NAV: { id: Page; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    id: "budgets",
    label: "Budgets",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "AI assistant",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV)[0];
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
        ${active
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        }`}
    >
      <span className={active ? "text-indigo-600" : "text-slate-400"}>{item.icon}</span>
      {item.label}
    </button>
  );
}

const PAGES: Record<Page, React.ReactNode> = {
  dashboard: <Dashboard />,
  transactions: <Transactions />,
  budgets: <Budgets />,
  chat: <Chat />,
};

function AuthenticatedApp() {
  const { user, logout } = useApp();
  const [page, setPage] = useState<Page>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      <div className="px-3 py-3 mb-2">
        <span className="text-base font-bold text-slate-800 tracking-tight">
          💳 FinanceAI
        </span>
      </div>

      {NAV.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          active={page === item.id}
          onClick={() => {
            setPage(item.id);
            setMobileOpen(false);
          }}
        />
      ))}

      {/* User info + logout pushed to bottom */}
      <div className="mt-auto pt-4 border-t border-slate-100">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-medium text-slate-700 truncate">{user?.name}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 p-4 gap-1 fixed h-full">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-100 z-20 flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold text-slate-800">💳 FinanceAI</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-slate-500 hover:text-slate-700"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-10 bg-black/30"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="bg-white w-60 h-full p-4 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 md:ml-60 pt-16 md:pt-0 p-6 max-w-4xl">
        {PAGES[page]}
      </main>
    </div>
  );
}

function AppShell() {
  const { isAuthenticated } = useApp();
  const [authView, setAuthView] = useState<AuthView>("login");

  if (!isAuthenticated) {
    return authView === "login"
      ? <Login onGoToRegister={() => setAuthView("register")} />
      : <Register onGoToLogin={() => setAuthView("login")} />;
  }

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
