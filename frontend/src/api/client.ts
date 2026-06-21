// src/api/client.ts
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────
export interface Category {
  id: number;
  name: string;
  icon: string | null;
}

export interface Transaction {
  id: number;
  amount: string;
  type: "income" | "expense";
  category: Category | null;
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
  category: Category;
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
