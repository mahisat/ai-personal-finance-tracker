export const INPUT_CLASS =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm w-full min-w-0 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-300";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

export function monthToApiParams(monthValue: string): Record<string, string> {
  const [year, monthPart] = monthValue.split("-");
  return { year, month: String(Number(monthPart)) };
}

export function formatMonthLabel(monthValue: string): string {
  const [y, m] = monthValue.split("-").map(Number);
  if (!y || !m) return monthValue;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

export function validateDateRange(
  from: string,
  to: string
): string | null {
  if (!from || !to) return "Choose both start and end dates.";
  if (from > to) return "Start date must be on or before end date.";
  return null;
}
