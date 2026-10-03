import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card } from "../components/ui";
import { SpendingByCategoryCharts } from "../components/charts/SpendingByCategoryCharts";
import {
  SpendingChartDateFilter,
  chartFilterPeriodLabel,
  chartFilterToApiParams,
  initialChartDateFilter,
  type ChartDateFilterValue,
} from "../components/charts/SpendingChartDateFilter";

export default function Analytics() {
  const { userId } = useApp();
  const [filter, setFilter] = useState<ChartDateFilterValue>(initialChartDateFilter);

  const { params, error: filterError } = useMemo(
    () => chartFilterToApiParams(filter),
    [filter]
  );

  const periodLabel = useMemo(() => chartFilterPeriodLabel(filter), [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
          Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Explore spending by category with a monthly or custom date range.
        </p>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
          Period
        </h2>
        <SpendingChartDateFilter value={filter} onChange={setFilter} />
      </Card>

      {filterError ? (
        <Card>
          <p className="text-sm text-amber-700">{filterError}</p>
        </Card>
      ) : (
        <SpendingByCategoryCharts
          userId={userId}
          apiParams={params}
          periodLabel={periodLabel}
        />
      )}
    </div>
  );
}
