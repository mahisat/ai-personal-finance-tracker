// src/api/client.ts
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Module-level token — set via setAuthToken() when the user logs in/out
let _token: string | null = null;

export function setAuthToken(token: string | null) {
  _token = token;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (_token) {
    headers["Authorization"] = `Bearer ${_token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────
export interface AuthUser {
  user_id: number;
  name: string;
  email: string;
  access_token: string;
}

export interface SubCategory {
  id: number;
  name: string;
  icon: string | null;
}

export interface Category {
  id: number;
  name: string;
  icon: string | null;
  children: SubCategory[];
}

// Flat category used inside transaction/budget responses
export interface CategoryFlat {
  id: number;
  name: string;
  icon: string | null;
  parent_id: number | null;
}

export interface Transaction {
  id: number;
  amount: string;
  type: "income" | "expense";
  category: CategoryFlat | null;
  description: string | null;
  date: string;
  created_at: string;
}

export interface TransactionPage {
  total: number;
  page: number;
  page_size: number;
  items: Transaction[];
}

export interface Budget {
  id: number;
  category: CategoryFlat;
  monthly_limit: string;
}

export interface BudgetStatus {
  category: string;
  monthly_limit: string;
  spent: string;
  remaining: string;
  percent_used: number;
}

export interface Insight {
  title: string;
  body: string;
  severity: "info" | "warning" | "danger";
}

export interface ChatResponse {
  answer: string;
  sql_used?: string;
}

// ── API calls ──────────────────────────────────────────────────
export const api = {
  auth: {
    register: (body: { email: string; name: string; password: string }) =>
      request<AuthUser>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    login: (body: { email: string; password: string }) =>
      request<AuthUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  categories: {
    list: () => request<Category[]>("/categories"),
  },
  transactions: {
    list: (userId: number, params?: Record<string, string>) => {
      const q = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<TransactionPage>(`/users/${userId}/transactions${q}`);
    },
    create: (userId: number, body: object) =>
      request<Transaction>(`/users/${userId}/transactions`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    remove: (userId: number, txId: number) =>
      request<void>(`/users/${userId}/transactions/${txId}`, {
        method: "DELETE",
      }),
  },
  budgets: {
    upsert: (userId: number, body: object) =>
      request<Budget>(`/users/${userId}/budgets`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    status: (userId: number) =>
      request<BudgetStatus[]>(`/users/${userId}/budgets/status`),
  },
  insights: {
    list: (userId: number) => request<Insight[]>(`/users/${userId}/insights`),
  },
  chat: {
    ask: (userId: number, message: string) =>
      request<ChatResponse>(`/users/${userId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
  },
};
