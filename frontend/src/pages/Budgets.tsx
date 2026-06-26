// src/pages/Budgets.tsx
import { useEffect, useState } from "react";
import { api, type BudgetStatus } from "../api/client";
import { useApp } from "../context/AppContext";
import { Card, ErrorBanner, Spinner } from "../components/ui";
import CategorySelect from "../components/CategorySelect";

export default function Budgets() {
  const { userId } = useApp();
  const [statuses, setStatuses] = useState<BudgetStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ category_id: "", monthly_limit: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true);
    api.budgets
      .status(userId)
      .then(setStatuses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSuccess("");
    if (!form.category_id) {
      setFormError("Select a category.");
      return;
    }
    if (!form.monthly_limit || Number(form.monthly_limit) <= 0) {
      setFormError("Enter a positive limit.");
      return;
    }
    setSaving(true);
    try {
      await api.budgets.upsert(userId, {
        category_id: Number(form.category_id),
        monthly_limit: Number(form.monthly_limit),
      });
      setSuccess("Budget saved.");
      setForm({ category_id: "", monthly_limit: "" });
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const colorFor = (pct: number) =>
    pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-400" : "bg-indigo-500";

  const badgeFor = (pct: number) =>
    pct >= 100
      ? "bg-rose-100 text-rose-700"
      : pct >= 80
        ? "bg-amber-100 text-amber-700"
        : "bg-indigo-100 text-indigo-700";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Budgets</h1>

      {/* Set / update budget */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Set monthly budget
        </h2>
        {formError && <ErrorBanner message={formError} />}
        {success && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700 mb-3">
            {success}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-3 mt-3"
        >
          <CategorySelect
            value={form.category_id}
            onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
            placeholder="Select category…"
            className="flex-1"
          />
          <input
            type="number"
            min="1"
            step="0.01"
            placeholder="Monthly limit (₹)"
            value={form.monthly_limit}
            onChange={(e) =>
              setForm((f) => ({ ...f, monthly_limit: e.target.value }))
            }
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white
              text-sm font-medium px-5 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {saving ? "Saving…" : "Save budget"}
          </button>
        </form>
      </Card>

      {/* Budget cards */}
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner />
      ) : statuses.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            No budgets yet. Set one above.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {statuses.map((b) => (
            <Card key={b.category} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">
                  {b.category}
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeFor(b.percent_used)}`}
                >
                  {b.percent_used.toFixed(0)}%
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colorFor(b.percent_used)}`}
                  style={{ width: `${Math.min(b.percent_used, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>
                  Spent:{" "}
                  <span className="text-slate-600 font-medium">
                    ₹{Number(b.spent).toFixed(2)}
                  </span>
                </span>
                <span>
                  Limit:{" "}
                  <span className="text-slate-600 font-medium">
                    ₹{Number(b.monthly_limit).toFixed(2)}
                  </span>
                </span>
                <span>
                  Left:{" "}
                  <span
                    className={`font-medium ${Number(b.remaining) < 0 ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    ₹{Number(b.remaining).toFixed(2)}
                  </span>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
