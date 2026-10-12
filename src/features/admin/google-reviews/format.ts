/** Dates for the Google Reviews screen: Central time, because that is where the stores are. */

const DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
const STAMP = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function reviewDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "—" : DATE.format(new Date(parsed));
}

export function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "—" : `${STAMP.format(new Date(parsed))} CT`;
}

export const rating = (value: number | null): string => (value === null ? "—" : value.toFixed(2).replace(/0$/, ""));
