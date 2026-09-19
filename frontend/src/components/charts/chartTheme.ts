/** Shared palette for expense visualizations — extend for new chart types. */
export const CHART_COLORS = [
  "#4F46E5",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#F43F5E",
  "#8B5CF6",
  "#14B8A6",
  "#EC4899",
  "#64748B",
  "#84CC16",
] as const;

export function colorForIndex(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
