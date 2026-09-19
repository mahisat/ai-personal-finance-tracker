import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colorForIndex } from "./chartTheme";
import type { CategorySpendingPoint } from "./types";
import { formatRupee } from "../../utils/format";

function BarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategorySpendingPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-800">{row.category}</p>
      <p className="text-slate-600">{formatRupee(row.total)}</p>
    </div>
  );
}

function truncateLabel(value: string, max = 14): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function CategorySpendingBar({ data }: { data: CategorySpendingPoint[] }) {
  const chartData = data.map((row, index) => ({
    ...row,
    fill: colorForIndex(index),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickFormatter={(v) => truncateLabel(String(v))}
          interval={0}
          angle={-35}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
          width={72}
        />
        <Tooltip content={<BarTooltip />} cursor={{ fill: "#f8fafc" }} />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
