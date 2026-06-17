export type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "all" | "date";

export const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Identical windows to the main admin analytics page (all UTC days).
export function rangeFor(preset: Preset, dateStr: string): { start: string; end: string } {
  const now = new Date();
  const todayStart = utcMidnight(now);
  switch (preset) {
    case "today": return { start: iso(todayStart), end: iso(now) };
    case "yesterday": {
      const y = new Date(todayStart.getTime() - DAY);
      return { start: iso(y), end: iso(new Date(todayStart.getTime() - 1)) };
    }
    case "7d": return { start: iso(new Date(now.getTime() - 7 * DAY)), end: iso(now) };
    case "30d": return { start: iso(new Date(now.getTime() - 30 * DAY)), end: iso(now) };
    case "month": return { start: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), end: iso(now) };
    case "all": return { start: "2000-01-01T00:00:00.000Z", end: iso(now) };
    case "date": return { start: `${dateStr}T00:00:00.000Z`, end: `${dateStr}T23:59:59.999Z` };
  }
}
