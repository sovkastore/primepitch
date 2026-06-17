"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MatchesPanel from "@/components/partner/MatchesPanel";
import PulsePanel, { type PulseData } from "@/components/partner/PulsePanel";
import OverviewPanel, { type OverviewData } from "@/components/partner/OverviewPanel";
import AnalyticsPanel, { type AnalyticsData } from "@/components/partner/AnalyticsPanel";
import VisitorsPanel, { type VisitorsData } from "@/components/partner/VisitorsPanel";
import RangePicker from "@/components/partner/RangePicker";
import DayPicker from "@/components/partner/DayPicker";
import { rangeFor, type Preset } from "@/components/partner/rangePresets";

type Stat = "overview" | "pulse" | "matches" | "analytics" | "visitors";
interface PartnerLite { code: string; name: string | null; active: boolean }

export default function AdminPartnerView({ stat, title }: { stat: Stat; title: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  const [code, setCode] = useState("");
  const [preset, setPreset] = useState<Preset>("today");
  const [aDate, setADate] = useState(today);
  const [vDate, setVDate] = useState(today);
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
    if (!code || stat === "matches") return null;
    let u = `/api/admin/partner?stat=${stat}&code=${encodeURIComponent(code)}`;
    if (stat === "analytics") {
      const { start, end } = rangeFor(preset, aDate);
      u += `&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    }
    if (stat === "visitors") u += `&date=${vDate || today}`;
    return u;
  }, [stat, code, preset, aDate, vDate, today]);

  const load = useCallback(async () => {
    if (!url) return;
    try { const r = await fetch(url, { cache: "no-store" }); setData(await r.json()); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, [url]);

  useEffect(() => {
    if (stat === "matches") return;
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
        <RangePicker preset={preset} dateStr={aDate} onPreset={setPreset}
          onDate={(d) => { setADate(d); setPreset("date"); }} />
      )}
      {stat === "visitors" && <DayPicker date={vDate} onChange={(d) => setVDate(d || today)} />}

      {stat === "matches" ? (
        code ? <MatchesPanel src={`/api/admin/partner?stat=matches&code=${encodeURIComponent(code)}`} /> : <p className="text-sm text-gray-400">Loading…</p>
      ) : loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : stat === "overview" ? (
        <OverviewPanel data={data as unknown as OverviewData} />
      ) : stat === "analytics" ? (
        <AnalyticsPanel data={data as unknown as AnalyticsData} />
      ) : stat === "visitors" ? (
        <VisitorsPanel data={data as unknown as VisitorsData} />
      ) : (
        <PulsePanel data={data as unknown as PulseData} />
      )}
    </div>
  );
}
