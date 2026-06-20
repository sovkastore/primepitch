"use client";

import { useEffect, useMemo, useState } from "react";

type Follow = { teamKey: string; title: string; count: number };

// Same accent-folding + alias rules as the push-sender, so a fixture's date from
// the World Cup feed lines up with the stored follow key. Cabo Verde is added
// because the feed spells it "Cabo Verde" while follows stored "Cape Verde".
const TEAM_ALIASES: Record<string, string> = {
  southkorea: "korearepublic", korea: "korearepublic",
  usa: "unitedstates", us: "unitedstates", unitedstatesofamerica: "unitedstates",
  ivorycoast: "cotedivoire", czechrepublic: "czechia", holland: "netherlands", turkey: "turkiye",
  caboverde: "capeverde",
};
const fold = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const canonFold = (x: string) => { const n = fold(x); return TEAM_ALIASES[n] || n; };
const keyOf = (home: string, away: string) => [canonFold(home), canonFold(away)].sort().join("|");

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}

type WcFixture = { home?: { name?: string }; away?: { name?: string }; date?: number };

export default function NotifyMatchesCard({ follows, totalFollows }: { follows: Follow[]; totalFollows: number }) {
  const [dateMap, setDateMap] = useState<Map<string, number>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [day, setDay] = useState<string>(""); // "" = all days; "__none" = undated

  useEffect(() => {
    let alive = true;
    fetch("/api/world-cup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const fixtures: WcFixture[] = Array.isArray(d?.fixtures) ? d.fixtures : [];
        const m = new Map<string, number>();
        for (const f of fixtures) {
          const h = f.home?.name || "";
          const a = f.away?.name || "";
          const ms = typeof f.date === "number" ? f.date : Number(f.date);
          if (h && a && Number.isFinite(ms)) m.set(keyOf(h, a), ms);
        }
        setDateMap(m);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const withDates = useMemo(
    () => follows.map((f) => ({ ...f, ms: dateMap.get(f.teamKey) })),
    [follows, dateMap]
  );

  const days = useMemo(() => {
    const s = new Set<string>();
    for (const f of withDates) if (typeof f.ms === "number") s.add(dayKey(f.ms));
    return [...s].sort();
  }, [withDates]);

  const filtered = useMemo(() => {
    if (!day) return withDates;
    if (day === "__none") return withDates.filter((f) => typeof f.ms !== "number");
    return withDates.filter((f) => typeof f.ms === "number" && dayKey(f.ms) === day);
  }, [withDates, day]);

  const hasUndated = withDates.some((f) => typeof f.ms !== "number");

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-bold text-gray-900">&ldquo;Notify me&rdquo; matches</h2>
        <span className="text-[12px] text-gray-500">{follows.length} fixtures · {totalFollows} follows</span>
      </div>
      <p className="text-[12px] text-gray-500">
        Fixtures people asked to be alerted about individually. Each follower gets that match&rsquo;s
        start / kick-off / goals / half-time / full-time alerts.
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => setDay("")}
          className={`text-[12px] font-semibold rounded-full px-3 py-1 border transition-colors ${day === "" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
        >
          All days
        </button>
        {loaded && days.length > 0 && (
          <select
            value={day && day !== "__none" ? day : ""}
            onChange={(e) => setDay(e.target.value)}
            className="text-[12px] font-semibold rounded-full px-3 py-1 border border-gray-200 bg-white text-gray-700"
          >
            <option value="">Pick a match day…</option>
            {days.map((d) => {
              const ms = Date.parse(`${d}T00:00:00`);
              return <option key={d} value={d}>{dayLabel(ms)}</option>;
            })}
          </select>
        )}
        {hasUndated && (
          <button
            onClick={() => setDay("__none")}
            className={`text-[12px] font-semibold rounded-full px-3 py-1 border transition-colors ${day === "__none" ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
          >
            No date
          </button>
        )}
        {day && (
          <span className="text-[12px] text-gray-400">{filtered.length} of {follows.length}</span>
        )}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-[13px] text-gray-400">No followed matches on this day.</p>
        ) : (
          filtered.map((f) => (
            <div key={f.teamKey} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-gray-800 truncate">{f.title}</span>
                {typeof f.ms === "number" && (
                  <span className="text-[11px] text-gray-400">{dayLabel(f.ms)}</span>
                )}
              </span>
              <span className="shrink-0 text-[12px] font-bold text-emerald-600">
                {f.count} {f.count === 1 ? "person" : "people"}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
