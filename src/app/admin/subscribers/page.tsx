import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AlertKey = "startingSoon" | "kickoff" | "goal" | "halftime" | "fulltime";
const ALERT_KEYS: AlertKey[] = ["startingSoon", "kickoff", "goal", "halftime", "fulltime"];
const ALERT_SHORT: Record<AlertKey, string> = {
  startingSoon: "Start", kickoff: "Kickoff", goal: "Goal", halftime: "HT", fulltime: "FT",
};
const ALERT_LONG: Record<AlertKey, string> = {
  startingSoon: "Starting soon", kickoff: "Kicked off", goal: "Goals", halftime: "Half-time", fulltime: "Full-time",
};
const DEFAULT_ALERTS: Record<AlertKey, boolean> = {
  startingSoon: true, kickoff: true, goal: true, halftime: true, fulltime: true,
};

type Row = {
  endpoint: string;
  user_agent: string | null;
  prefs: unknown;
  topics: string[] | null;
  created_at: string;
  last_seen_at: string | null;
  sent_count: number | null;
  open_count: number | null;
  last_opened_at: string | null;
};

function readPrefs(prefs: unknown, topics: string[] | null) {
  const p = (prefs && typeof prefs === "object" ? prefs : {}) as Record<string, unknown>;
  const has = "wcAll" in p || Array.isArray(p.countries) || (p.alerts != null && typeof p.alerts === "object");
  if (!has) {
    const t = topics ?? [];
    const wcAll = t.length === 0 || t.some((x) => x === "football" || x === "football:world-cup");
    return { wcAll, countries: [] as string[], alerts: { ...DEFAULT_ALERTS } };
  }
  const a = (p.alerts && typeof p.alerts === "object" ? p.alerts : {}) as Record<string, unknown>;
  const alerts = { ...DEFAULT_ALERTS };
  for (const k of ALERT_KEYS) if (k in a) alerts[k] = a[k] === true;
  return {
    wcAll: p.wcAll === true,
    countries: Array.isArray(p.countries) ? (p.countries as unknown[]).filter((c): c is string => typeof c === "string") : [],
    alerts,
  };
}

function deviceOf(ua: string | null) {
  const s = (ua || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "iPhone / iPad";
  if (/android/.test(s)) return "Android";
  if (/windows|macintosh|mac os|linux|cros/.test(s)) return "Desktop";
  return "Other";
}
function currentMs(): number {
  return Date.now();
}
function daysAgo(iso: string | null, now: number) {
  if (!iso) return Infinity;
  return (now - Date.parse(iso)) / 86400000;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-[26px] font-extrabold tracking-tight text-gray-900">{value}</p>
      {sub && <p className="text-[12px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1">
        <span className="font-semibold text-gray-700">{label}</span>
        <span className="text-gray-500">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function SubscribersPage() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, user_agent, prefs, topics, created_at, last_seen_at, sent_count, open_count, last_opened_at")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const now = currentMs();

  const total = rows.length;
  const active7 = rows.filter((r) => daysAgo(r.last_seen_at, now) <= 7).length;
  const new7 = rows.filter((r) => daysAgo(r.created_at, now) <= 7).length;
  const totalSent = rows.reduce((s, r) => s + (r.sent_count || 0), 0);
  const totalOpens = rows.reduce((s, r) => s + (r.open_count || 0), 0);
  const openers = rows.filter((r) => (r.open_count || 0) > 0).length;
  const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;

  const devices: Record<string, number> = {};
  const countryTally: Record<string, number> = {};
  let wcAllCount = 0;
  let countryFollowers = 0;
  const alertCounts: Record<AlertKey, number> = { startingSoon: 0, kickoff: 0, goal: 0, halftime: 0, fulltime: 0 };

  const parsed = rows.map((r) => {
    const pr = readPrefs(r.prefs, r.topics);
    const dev = deviceOf(r.user_agent);
    devices[dev] = (devices[dev] || 0) + 1;
    if (pr.wcAll) {
      wcAllCount++;
    } else {
      if (pr.countries.length > 0) countryFollowers++;
      for (const c of pr.countries) countryTally[c] = (countryTally[c] || 0) + 1;
    }
    for (const k of ALERT_KEYS) if (pr.alerts[k]) alertCounts[k]++;
    return { r, pr, dev };
  });

  const deviceList = Object.entries(devices).sort((a, b) => b[1] - a[1]);
  const topCountries = Object.entries(countryTally).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900">Subscribers</h1>
        <p className="text-[13px] text-gray-500">
          Anonymous device subscriptions — web push carries no names or emails. What follows is device, choices and engagement only.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-[13px] text-red-700">
          Couldn&rsquo;t load subscribers right now. Reload in a moment.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total" value={total.toLocaleString()} sub="all-time subscribers" />
        <Stat label="Active (7d)" value={active7.toLocaleString()} sub="seen in last 7 days" />
        <Stat label="New (7d)" value={new7.toLocaleString()} sub="subscribed this week" />
        <Stat label="Open rate" value={`${openRate}%`} sub={`${openers} of ${total} have opened one`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-[14px] font-bold text-gray-900">Devices</h2>
          {deviceList.length === 0 ? (
            <p className="text-[13px] text-gray-400">No data yet.</p>
          ) : (
            <div className="space-y-3">{deviceList.map(([k, v]) => <Bar key={k} label={k} count={v} total={total} />)}</div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-[14px] font-bold text-gray-900">Following</h2>
          <div className="space-y-3">
            <Bar label="World Cup — all matches" count={wcAllCount} total={total} />
            <Bar label="Specific countries only" count={countryFollowers} total={total} />
          </div>
          {topCountries.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Top countries</p>
              <div className="flex flex-wrap gap-1.5">
                {topCountries.map(([c, n]) => (
                  <span key={c} className="text-[12px] font-semibold text-gray-700 bg-gray-100 rounded-full px-2.5 py-1">{c} · {n}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-[14px] font-bold text-gray-900">Alerts switched on</h2>
          <div className="space-y-3">
            {ALERT_KEYS.map((k) => <Bar key={k} label={ALERT_LONG[k]} count={alertCounts[k]} total={total} />)}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-[14px] font-bold text-gray-900">Everyone</h2>
          <span className="text-[12px] text-gray-400">sent {totalSent.toLocaleString()} · opened {totalOpens.toLocaleString()}</span>
        </div>
        {total === 0 ? (
          <p className="p-6 text-center text-[13px] text-gray-400">No subscribers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5 font-bold">Device</th>
                  <th className="px-4 py-2.5 font-bold">Following</th>
                  <th className="px-4 py-2.5 font-bold">Alerts</th>
                  <th className="px-4 py-2.5 font-bold">Joined</th>
                  <th className="px-4 py-2.5 font-bold">Last seen</th>
                  <th className="px-4 py-2.5 font-bold text-right">Sent</th>
                  <th className="px-4 py-2.5 font-bold text-right">Opened</th>
                  <th className="px-4 py-2.5 font-bold">Last open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {parsed.map(({ r, pr, dev }) => {
                  const follow = pr.wcAll ? "World Cup (all)" : pr.countries.length > 0 ? pr.countries.join(", ") : "—";
                  const on = ALERT_KEYS.filter((k) => pr.alerts[k]).map((k) => ALERT_SHORT[k]).join(" · ") || "none";
                  return (
                    <tr key={r.endpoint} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{dev}</td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[220px] truncate" title={follow}>{follow}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{on}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.last_seen_at)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{(r.sent_count || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{(r.open_count || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(r.last_opened_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
