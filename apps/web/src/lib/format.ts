/** Indian formats by default (UX principle 8): DD-MM-YYYY dates, lakh/crore grouping through Intl en-IN. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Group a decimal string the Indian way without converting it to a float: "1234567.50" → "12,34,567.50". */
export function groupIndian(decimal: string): string {
  const negative = decimal.startsWith("-");
  const [whole = "0", fraction] = (negative ? decimal.slice(1) : decimal).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  return `${negative ? "-" : ""}${grouped}${fraction !== undefined ? `.${fraction}` : ""}`;
}
