import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { colorForIndex } from "./chartTheme";
import type { CategorySpendingPoint } from "./types";
import { formatRupee } from "../../utils/format";

function DonutTooltip({
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
      <p className="text-xs text-slate-400">{row.percent.toFixed(1)}% of spending</p>
    </div>
  );
}

export function CategorySpendingDonut({ data }: { data: CategorySpendingPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={colorForIndex(index)} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<DonutTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
