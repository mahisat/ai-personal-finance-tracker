import { useEffect, useState } from "react";
import { api, type CategorySpending } from "../../api/client";
import { Card, EmptyState, ErrorBanner, Spinner } from "../ui";
import { CategorySpendingBar } from "./CategorySpendingBar";
import { CategorySpendingDonut } from "./CategorySpendingDonut";
import { colorForIndex } from "./chartTheme";
import type { CategorySpendingPoint } from "./types";
import { formatRupee } from "../../utils/format";
import { currentMonthValue, formatMonthLabel } from "../../utils/dateRange";

function toChartPoints(rows: CategorySpending[]): CategorySpendingPoint[] {
  return rows.map((r) => ({
    category: r.category,
    category_id: r.category_id,
    total: Number(r.total),
    percent: r.percent,
  }));
}

function paramsKey(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return "default-month";
  return JSON.stringify(params);
}

export interface SpendingByCategoryChartsProps {
  userId: number;
  apiParams?: Record<string, string>;
  periodLabel?: string;
  showSectionTitle?: boolean;
}

export function SpendingByCategoryCharts({
  userId,
  apiParams,
  periodLabel,
  showSectionTitle = true,
}: SpendingByCategoryChartsProps) {
  const [data, setData] = useState<CategorySpendingPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const resolvedLabel =
    periodLabel ?? formatMonthLabel(currentMonthValue());
  const queryKey = paramsKey(apiParams);

  useEffect(() => {
    setLoading(true);
    setError("");
    api.analytics
      .spendingByCategory(userId, apiParams)
      .then((rows) => setData(toChartPoints(rows)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId, queryKey, apiParams]);

  const total = data.reduce((s, d) => s + d.total, 0);
  const emptyMessage = `No expenses in ${resolvedLabel} — try another period or add transactions.`;

  const titleBlock = showSectionTitle ? (
    <>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
        Spending by category
      </h2>
      {!loading && !error && data.length > 0 && (
        <p className="text-sm text-slate-500">
          {resolvedLabel} · {formatRupee(total)} total across {data.length}{" "}
          {data.length === 1 ? "category" : "categories"}
        </p>
      )}
    </>
  ) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {titleBlock}
        <Card>
          <Spinner />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {titleBlock}
        <Card>
          <ErrorBanner message={error} />
        </Card>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="space-y-4">
        {titleBlock}
        <Card>
          <EmptyState message={emptyMessage} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {titleBlock}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Distribution
          </h3>
          <p className="text-xs text-slate-400 mb-2">
            Share of spending by category (%)
          </p>
          <CategorySpendingDonut data={data} />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {data.map((row, i) => (
              <li key={row.category} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: colorForIndex(i) }}
                />
                {row.category} ({row.percent.toFixed(0)}%)
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            By amount
          </h3>
          <p className="text-xs text-slate-400 mb-2">
            Compare spending between categories
          </p>
          <CategorySpendingBar data={data} />
        </Card>
      </div>
    </div>
  );
}
