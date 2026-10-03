import {
  INPUT_CLASS,
  currentMonthValue,
  todayIso,
  validateDateRange,
} from "../../utils/dateRange";

export type ChartDateMode = "month" | "range";

export interface ChartDateFilterValue {
  mode: ChartDateMode;
  monthValue: string;
  fromDate: string;
  toDate: string;
}

function firstDayOfMonth(monthValue: string): string {
  const [y, m] = monthValue.split("-");
  return `${y}-${m}-01`;
}

export const initialChartDateFilter = (): ChartDateFilterValue => {
  const monthValue = currentMonthValue();
  return {
    mode: "month",
    monthValue,
    fromDate: firstDayOfMonth(monthValue),
    toDate: todayIso(),
  };
};

export function chartFilterToApiParams(
  filter: ChartDateFilterValue
): { params: Record<string, string>; error: string | null } {
  if (filter.mode === "month") {
    const [year, monthPart] = filter.monthValue.split("-");
    if (!year || !monthPart) {
      return { params: {}, error: "Choose a valid month." };
    }
    return {
      params: { year, month: String(Number(monthPart)) },
      error: null,
    };
  }
  const error = validateDateRange(filter.fromDate, filter.toDate);
  if (error) return { params: {}, error };
  return {
    params: { from_date: filter.fromDate, to_date: filter.toDate },
    error: null,
  };
}

export function chartFilterPeriodLabel(filter: ChartDateFilterValue): string {
  if (filter.mode === "month") {
    const [y, m] = filter.monthValue.split("-").map(Number);
    if (!y || !m) return "Selected period";
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }
  const fmt = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(filter.fromDate)} – ${fmt(filter.toDate)}`;
}

const MODE_BTN =
  "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors";

export function SpendingChartDateFilter({
  value,
  onChange,
}: {
  value: ChartDateFilterValue;
  onChange: (next: ChartDateFilterValue) => void;
}) {
  const rangeError =
    value.mode === "range"
      ? validateDateRange(value.fromDate, value.toDate)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "month" })}
          className={`${MODE_BTN} ${
            value.mode === "month"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          By month
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "range" })}
          className={`${MODE_BTN} ${
            value.mode === "range"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          Custom range
        </button>
      </div>

      {value.mode === "month" ? (
        <div className="flex flex-col gap-1 max-w-xs">
          <label className="text-xs font-medium text-slate-500">Month</label>
          <input
            type="month"
            value={value.monthValue}
            onChange={(e) =>
              onChange({ ...value, monthValue: e.target.value })
            }
            className={INPUT_CLASS}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={value.fromDate}
              onChange={(e) =>
                onChange({ ...value, fromDate: e.target.value })
              }
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={value.toDate}
              onChange={(e) => onChange({ ...value, toDate: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
        </div>
      )}

      {rangeError && (
        <p className="text-sm text-amber-700">{rangeError}</p>
      )}
    </div>
  );
}
