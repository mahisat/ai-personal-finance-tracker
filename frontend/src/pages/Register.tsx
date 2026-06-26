// src/pages/Register.tsx
import { useState, FormEvent } from "react";
import { api } from "../api/client";
import { useApp } from "../context/AppContext";

interface Props {
  onGoToLogin: () => void;
}

export default function Register({ onGoToLogin }: Props) {
  const { login } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.register({ name, email, password });
      login(res.access_token, {
        id: res.user_id,
        name: res.name,
        email: res.email,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-slate-800 tracking-tight">
            💳 FinanceAI
          </span>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Full name
            </label>
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
              placeholder="Sathish Kumar"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Password{" "}
              <span className="text-slate-400 font-normal">
                (min 8 characters)
              </span>
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl py-2.5 transition"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <button
            onClick={onGoToLogin}
            className="text-indigo-600 hover:underline font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
