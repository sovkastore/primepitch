"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LeagueConfig } from "@/lib/leagues";

// Football subcategory nav. "All" = the existing streamed.pk home view,
// "World Cup 2026" = the existing WC page, then enabled competitions in order.
export default function LeagueNav({ active }: { active: "all" | "wc" | number }) {
  const [leagues, setLeagues] = useState<LeagueConfig[]>([]);

  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLeagues(Array.isArray(d?.leagues) ? d.leagues : []))
      .catch(() => {});
  }, []);

  const pill = (isActive: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap shrink-0 transition-colors ${
      isActive ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <Link href="/" className={pill(active === "all")}>
          All
        </Link>
        <Link href="/world-cup" className={pill(active === "wc")}>
          World Cup 2026
        </Link>
        {leagues.map((l) => (
          <Link key={l.league_id} href={`/league/${l.league_id}`} className={pill(active === l.league_id)}>
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
