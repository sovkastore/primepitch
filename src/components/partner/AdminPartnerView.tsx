"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MatchesPanel, { type PanelMatch } from "@/components/partner/MatchesPanel";
import PulsePanel, { type PulseData } from "@/components/partner/PulsePanel";
import OverviewPanel, { type OverviewData } from "@/components/partner/OverviewPanel";
import AnalyticsPanel, { type AnalyticsData } from "@/components/partner/AnalyticsPanel";
import VisitorsPanel, { type VisitorsData } from "@/components/partner/VisitorsPanel";

type Stat = "overview" | "pulse" | "matches" | "analytics" | "visitors";
interface PartnerLite { code: string; name: string | null; active: boolean }

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];
function rangeQuery(key: string): string {
  const now = new Date();
  const end = now.toISOString();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  if (key === "today") return `start=${startToday}&end=${end}`;
  if (key === "7d") return `start=${new Date(now.getTime() - 7 * 864e5).toISOString()}&end=${end}`;
  if (key === "30d") return `start=${new Date(now.getTime() - 30 * 864e5).toISOString()}&end=${end}`;
  return `start=${new Date(0).toISOString()}&end=${end}`;
}

export default function AdminPartnerView({ stat, title }: { stat: Stat; title: string }) {
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  const [code, setCode] = useState("");
  const [range, setRange] = useState("7d");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/partner?stat=list", { cache: "no-store" })
      .then((r) => r.json()).then((j) => setPartners(j.partners ?? [])).catch(() => setPartners([]));
  }, []);
  useEffect(() => {
    if (!code && partners.length) setCode(partners.find((p) => p.active)?.code || partners[0].code);
  }, [partners, code]);

  const url = useMemo(() => {
    if (!code) return null;
    let u = `/api/admin/partner?stat=${stat}&code=${encodeURIComponent(code)}`;
    if (stat === "analytics") u += `&${rangeQuery(range)}`;
    if (stat === "visitors") u += `&date=${date}`;
    return u;
  }, [stat, code, range, date]);

  const load = useCallback(async () => {
    if (!url) return;
    try { const r = await fetch(url, { cache: "no-store" }); setData(await r.json()); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [url]);

  useEffect(() => {
    load();
    if (stat === "pulse" || stat === "overview") {
      const id = setInterval(load, stat === "pulse" ? 20000 : 30000);
      return () => clearInterval(id);
    }
  }, [load, stat]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-xl font-black text-gray-900"><span className="text-blue-500">p/</span>{title}</h1>
        <select value={code} onChange={(e) => setCode(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-semibold">
          {partners.map((p) => (
            <option key={p.code} value={p.code}>{p.name || p.code}{p.active ? "" : " (off)"}</option>
          ))}
        </select>
      </div>
      <p className="text-[13px] text-gray-400 font-medium mb-5">
        Partner breakdown — <span className="text-blue-600 font-bold">blue = their people</span>, grey = the rest, big = total. Your normal pages are unchanged.
      </p>

      {stat === "analytics" && (
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold ${range === r.key ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {stat === "visitors" && (
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] mb-5" />
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : stat === "overview" ? (
        <OverviewPanel data={data as unknown as OverviewData} />
      ) : stat === "analytics" ? (
        <AnalyticsPanel data={data as unknown as AnalyticsData} />
      ) : stat === "visitors" ? (
        <VisitorsPanel data={data as unknown as VisitorsData} />
      ) : stat === "pulse" ? (
        <PulsePanel data={data as unknown as PulseData} />
      ) : (
        <MatchesPanel matches={((data as { matches?: PanelMatch[] })?.matches) || []} />
      )}
    </div>
  );
}
