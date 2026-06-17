"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SplitStat, type Split } from "@/components/partner/SplitStat";
import MatchesPanel, { type PanelMatch } from "@/components/partner/MatchesPanel";

type Stat = "overview" | "pulse" | "matches" | "analytics" | "visitors";

interface PartnerLite { code: string; name: string | null; active: boolean }

function useList() {
  const [partners, setPartners] = useState<PartnerLite[]>([]);
  useEffect(() => {
    fetch("/api/admin/partner?stat=list", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPartners(j.partners ?? []))
      .catch(() => setPartners([]));
  }, []);
  return partners;
}

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

interface Cells { [k: string]: Split }
interface MatchRow {
  match_id: string; title: string; sport?: string | null; total?: number; his?: number; yours?: number;
  uniqueTotal?: number; uniqueHis?: number; uniqueYours?: number;
  peakTotal: number; peakHis: number; peakYours: number;
}
interface PageRow { path: string; total: number; his: number; yours: number }
interface RosterRow { visitor_id: string; first_seen: string; last_seen: string; visit_count: number; device_type: string | null }

function Triple({ t, h, y }: { t: number; h: number; y: number }) {
  return (
    <span className="tabular-nums">
      <span className="font-bold text-gray-900">{t}</span>
      <span className="text-blue-600 font-semibold ml-2">{h}</span>
      <span className="text-gray-400 ml-1.5">/ {y}</span>
    </span>
  );
}

export default function AdminPartnerView({ stat, title }: { stat: Stat; title: string }) {
  const partners = useList();
  const [code, setCode] = useState("");
  const [range, setRange] = useState("7d");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

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
    try {
      const r = await fetch(url, { cache: "no-store" });
      setData(await r.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    if (stat === "pulse") {
      const id = setInterval(load, 20000);
      return () => clearInterval(id);
    }
  }, [load, stat]);

  const cells = (data || {}) as Cells & Record<string, unknown>;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h1 className="text-xl font-black text-gray-900">
          <span className="text-blue-500">p/</span>{title}
        </h1>
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] font-semibold"
        >
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
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] mb-5" />
      )}

      {loading && !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : stat === "overview" ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SplitStat label="Online now" data={cells.onlineNow} />
            <SplitStat label="Watching live now" data={cells.liveNow} />
            <SplitStat label="Joined today" data={cells.newToday} />
            <SplitStat label="Returned today" data={cells.returnsToday} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            <SplitStat label="Total members (all time)" data={cells.totalVisitors} />
            <SplitStat label="Page views today" data={cells.pageViewsToday} />
            <SplitStat label="Match views today" data={cells.matchViewsToday} />
          </div>
        </>
      ) : stat === "analytics" ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <SplitStat label="Unique visitors" data={cells.unique} />
          <SplitStat label="Joined (new)" data={cells.newVisitors} />
          <SplitStat label="Returning" data={cells.returning} />
          <SplitStat label="Page views" data={cells.pageViews} />
          <SplitStat label="Match views" data={cells.matchViews} />
          <SplitStat label="Unique watchers" data={cells.uniqueWatchers} />
        </div>
      ) : stat === "visitors" ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SplitStat label="Unique that day" data={cells.unique} />
            <SplitStat label="Joined that day" data={cells.newToday} />
            <SplitStat label="Returning" data={cells.returning} />
            <SplitStat label="Total members" data={cells.totalVisitors} />
          </div>
          <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Their referred members (latest 50)</h2>
          <RosterTable rows={(cells.hisRoster as unknown as RosterRow[]) || []} />
        </>
      ) : stat === "pulse" ? (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <SplitStat label="Online now" data={cells.onlineNow} />
            <SplitStat label="Watching live now" data={cells.liveNow} />
          </div>
          <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Live matches now</h2>
          <MatchTable rows={(cells.matches as unknown as MatchRow[]) || []} live />
          <h2 className="text-[13px] font-black text-gray-700 uppercase tracking-wider mt-7 mb-2">Pages now</h2>
          <PageTable rows={(cells.pages as unknown as PageRow[]) || []} />
        </>
      ) : (
        <MatchesPanel matches={((data as { matches?: PanelMatch[] })?.matches) || []} />
      )}
    </div>
  );
}

function MatchTable({ rows, live }: { rows: MatchRow[]; live?: boolean }) {
  if (!rows.length) return <p className="text-sm text-gray-400">No data.</p>;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-[13px] min-w-[560px]">
        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left font-bold px-3 py-2">Match</th>
            <th className="text-right font-bold px-3 py-2">{live ? "Watching now" : "Unique watchers"} (t / his / yours)</th>
            <th className="text-right font-bold px-3 py-2">Peak (t / his / yours)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((m) => (
            <tr key={m.match_id}>
              <td className="px-3 py-2.5 font-semibold text-gray-800">{m.title}</td>
              <td className="px-3 py-2.5 text-right">
                <Triple t={live ? (m.total ?? 0) : (m.uniqueTotal ?? 0)} h={live ? (m.his ?? 0) : (m.uniqueHis ?? 0)} y={live ? (m.yours ?? 0) : (m.uniqueYours ?? 0)} />
              </td>
              <td className="px-3 py-2.5 text-right"><Triple t={m.peakTotal} h={m.peakHis} y={m.peakYours} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageTable({ rows }: { rows: PageRow[] }) {
  if (!rows.length) return <p className="text-sm text-gray-400">Nobody online.</p>;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-[13px] min-w-[420px]">
        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
          <tr><th className="text-left font-bold px-3 py-2">Page</th><th className="text-right font-bold px-3 py-2">t / his / yours</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p) => (
            <tr key={p.path}>
              <td className="px-3 py-2.5 font-mono text-[12px] text-gray-700 truncate max-w-[240px]">{p.path}</td>
              <td className="px-3 py-2.5 text-right"><Triple t={p.total} h={p.his} y={p.yours} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RosterTable({ rows }: { rows: RosterRow[] }) {
  if (!rows.length) return <p className="text-sm text-gray-400">No referred members yet.</p>;
  const fmt = (ts: string) => { try { return new Date(ts).toLocaleString(); } catch { return ts; } };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-[13px] min-w-[520px]">
        <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left font-bold px-3 py-2">Member</th>
            <th className="text-left font-bold px-3 py-2">Joined</th>
            <th className="text-left font-bold px-3 py-2">Last seen</th>
            <th className="text-right font-bold px-3 py-2">Visits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.visitor_id}>
              <td className="px-3 py-2.5 font-mono text-[12px] text-blue-600">{r.visitor_id}…</td>
              <td className="px-3 py-2.5 text-gray-600">{fmt(r.first_seen)}</td>
              <td className="px-3 py-2.5 text-gray-600">{fmt(r.last_seen)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-gray-900">{r.visit_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
