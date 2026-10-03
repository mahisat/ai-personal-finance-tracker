/** Consistent INR display matching the rest of the app (₹ + 2 decimals). */
export function formatRupee(amount: number | string): string {
  return `₹${Number(amount).toFixed(2)}`;
}

export function formatRupeeSigned(
  amount: number | string,
  type: "income" | "expense"
): string {
  const prefix = type === "income" ? "+" : "−";
  return `${prefix}${formatRupee(amount)}`;
}
