// src/pages/Transactions.tsx
import { useEffect, useState } from "react";
import { api, type TransactionPage } from "../api/client";
import { useApp } from "../context/AppContext";
import { Badge, Card, ErrorBanner, Spinner } from "../components/ui";
import CategorySelect from "../components/CategorySelect";

const EMPTY_FORM = {
  amount: "",
  type: "expense" as "income" | "expense",
  category_id: "",
  description: "",
  date: new Date().toISOString().slice(0, 10),
};

export default function Transactions() {
  const { userId } = useApp();
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {
      page: String(currentPage),
      page_size: "15",
    };
    if (typeFilter) params.type = typeFilter;
    api.transactions
      .list(userId, params)
      .then(setPage)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [userId, currentPage, typeFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.amount || isNaN(Number(form.amount))) {
      setFormError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      await api.transactions.create(userId, {
        amount: Number(form.amount),
        type: form.type,
        category_id: form.category_id ? Number(form.category_id) : null,
        description: form.description || null,
        date: form.date,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setCurrentPage(1);
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (txId: number) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api.transactions.remove(userId, txId);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const totalPages = page ? Math.ceil(page.total / page.page_size) : 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Transactions</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700
            text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Cancel" : "+ Add transaction"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            New transaction
          </h2>
          {formError && <ErrorBanner message={formError} />}
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3"
          >
            {/* Income / Expense toggle */}
            <div className="sm:col-span-2 flex gap-2">
              {(["expense", "income"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                    ${
                      form.type === t
                        ? t === "expense"
                          ? "bg-rose-50 border-rose-200 text-rose-700"
                          : "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                >
                  {t === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">
                Amount (₹)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                placeholder="0.00"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Date</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">
                Category
              </label>
              <CategorySelect
                value={form.category_id}
                onChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                className="w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">
                Description (optional)
              </label>
              <input
                type="text"
                maxLength={500}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="e.g. Lunch at Café"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                  text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {saving ? "Saving…" : "Save transaction"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {["", "expense", "income"].map((t) => (
          <button
            key={t}
            onClick={() => {
              setTypeFilter(t);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${
                typeFilter === t
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
          >
            {t === "" ? "All" : t === "expense" ? "Expenses" : "Income"}
          </button>
        ))}
      </div>

      {/* List */}
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner />
      ) : (
        <Card className="p-0 overflow-hidden">
          {!page || page.items.length === 0 ? (
            <p className="text-sm text-slate-400 p-6">No transactions found.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {page.items.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {tx.description ?? tx.category?.name ?? "Uncategorised"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {tx.date}
                      {tx.category && ` · ${tx.category.name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Badge variant={tx.type}>
                      {tx.type === "income" ? "+" : "−"}₹
                      {Number(tx.amount).toFixed(2)}
                    </Badge>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="text-slate-300 hover:text-rose-400 transition-colors text-lg leading-none"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">
            Page {currentPage} of {totalPages} · {page?.total} total
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500
                hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500
                hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
