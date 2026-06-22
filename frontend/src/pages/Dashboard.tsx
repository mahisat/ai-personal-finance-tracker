// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import {
  api,
  type BudgetStatus,
  type Insight,
  type Transaction,
} from "../api/client";
import { useApp } from "../context/AppContext";
import { Card, Badge, Spinner, ErrorBanner } from "../components/ui";

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-2xl font-semibold text-slate-800">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </Card>
  );
}

function BudgetBar({ row }: { row: BudgetStatus }) {
  const pct = Math.min(row.percent_used, 100);
  const color =
    row.percent_used >= 100
      ? "bg-rose-500"
      : row.percent_used >= 80
        ? "bg-amber-400"
        : "bg-indigo-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-700 font-medium">{row.category}</span>
        <span className="text-slate-400">
          ${Number(row.spent).toFixed(2)} / $
          {Number(row.monthly_limit).toFixed(2)}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-slate-400">
        {row.percent_used.toFixed(0)}% used
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 border text-sm space-y-1
      ${
        insight.severity === "danger"
          ? "bg-rose-50 border-rose-100"
          : insight.severity === "warning"
            ? "bg-amber-50 border-amber-100"
            : "bg-blue-50 border-blue-100"
      }`}
    >
      <div className="font-semibold text-slate-700">{insight.title}</div>
      <div className="text-slate-500 leading-relaxed">{insight.body}</div>
    </div>
  );
}

export default function Dashboard() {
  const { userId } = useApp();
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.budgets.status(userId),
      api.insights.list(userId),
      api.transactions.list(userId, { page_size: "5" }),
    ])
      .then(([b, i, t]) => {
        setBudgets(b);
        setInsights(i);
        setRecent(t.items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  // Summary metrics
  const totalSpent = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const totalBudget = budgets.reduce((s, b) => s + Number(b.monthly_limit), 0);
  const totalRemaining = totalBudget - totalSpent;

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Spent this month"
          value={`₹${totalSpent.toFixed(2)}`}
          sub={`of ₹${totalBudget.toFixed(2)} budgeted`}
        />
        <MetricCard
          label="Remaining"
          value={`₹${totalRemaining.toFixed(2)}`}
          sub={totalRemaining < 0 ? "Over budget" : "Available"}
        />
        <MetricCard
          label="Active budgets"
          value={String(budgets.length)}
          sub="categories tracked"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Budget progress */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Budget status
          </h2>
          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">
              No budgets set yet. Add one in the Budgets tab.
            </p>
          ) : (
            <div className="space-y-4">
              {budgets.map((b) => (
                <BudgetBar key={b.category} row={b} />
              ))}
            </div>
          )}
        </Card>

        {/* AI Insights */}
        <Card>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            AI insights
          </h2>
          {insights.length === 0 ? (
            <p className="text-sm text-slate-400">
              No insights yet — add some transactions first.
            </p>
          ) : (
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Recent transactions
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {recent.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {tx.description ?? tx.category?.name ?? "Uncategorised"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {tx.date} · {tx.category?.name ?? "—"}
                  </p>
                </div>
                <Badge variant={tx.type}>
                  {tx.type === "income" ? "+" : "−"}$
                  {Number(tx.amount).toFixed(2)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
