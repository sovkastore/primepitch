"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { visibleInterval } from "@/lib/poll";

// Launchpad / home. Headline live numbers + links to the five core pages.
// Detailed analytics live on Analytics, Matches, Visitors; real-time on Pulse.

interface OverviewData {
  uniqueToday: number;
  onlineNow: number;
  liveViewers: number;
  todayViews: number;
}

const CARDS = [
  { href: "/admin/analytics", title: "Analytics", desc: "People & activity for any date range — today, a month, all time.", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/admin/matches", title: "Matches", desc: "Every match's history — views & unique, split live vs before kickoff.", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/admin/visitors", title: "Visitors", desc: "People over time — new vs returning, devices, trends.", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-9a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/admin/live", title: "Pulse", desc: "What's happening right now — live viewers, active pages.", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" },
  { href: "/admin/streams", title: "Streams", desc: "Control streams — fallbacks, force-live, hide, health alerts.", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
];

function Stat({ label, value, sub, people }: { label: string; value: number; sub: string; people?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
      <p className={`text-3xl font-black tabular-nums ${people ? "text-yellow-600" : "text-gray-900"}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 font-medium">{label}</p>
      <p className="text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}

export default function AdminHome() {
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    const fetchData = () => {
      fetch("/api/admin/overview").then((r) => r.json()).then(setData).catch(() => {});
    };
    return visibleInterval(fetchData, 30_000);
  }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-gray-900">PrimePitch Admin</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">Live snapshot — jump into any section below.</p>
      </div>

      {/* Live snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Online Now" value={data?.onlineNow ?? 0} sub="on the site" people />
        <Stat label="Watching Live" value={data?.liveViewers ?? 0} sub="on a stream" people />
        <Stat label="Today's Visitors" value={data?.uniqueToday ?? 0} sub="unique people" people />
        <Stat label="Page Views Today" value={data?.todayViews ?? 0} sub="incl. repeats" />
      </div>

      {/* Section launchpad */}
      <div className="grid sm:grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="group bg-white rounded-2xl border border-gray-200 p-4 flex items-start gap-3 hover:border-gray-300 hover:shadow-sm transition">
            <span className="shrink-0 w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {c.icon.split(" M").map((d, i) => (
                  <path key={i} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={i === 0 ? d : "M" + d} />
                ))}
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-gray-900 group-hover:text-black">{c.title}</span>
              <span className="block text-[12px] text-gray-500 mt-0.5">{c.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
