"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LeagueConfig } from "@/lib/leagues";

// Logo path per competition. PL ships in the repo; the rest fall back to a clean
// text monogram until their SVG is dropped at the path below (then it just works).
const LOGOS: Record<number, string> = {
  1: "/icons/brands/premierleague.svg",
  3: "/icons/leagues/laliga.svg",
  4: "/icons/leagues/seriea.svg",
  5: "/icons/leagues/bundesliga.svg",
  6: "/icons/leagues/ligue1.svg",
  7: "/icons/leagues/champions-league.svg",
  8: "/icons/leagues/europa-league.svg",
};

function Chip({
  href,
  label,
  active,
  logo,
}: {
  href: string;
  label: string;
  active: boolean;
  logo?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = logo && !imgFailed;
  const monogram = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 shrink-0 w-[64px]">
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
          active ? "bg-emerald-500 shadow-lg shadow-emerald-500/25" : "bg-gray-100 hover:bg-gray-200"
        }`}
      >
        {showImg ? (
          <img
            src={logo}
            alt={label}
            className={`w-7 h-7 object-contain`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={`text-[12px] font-black ${active ? "text-white" : "text-gray-500"}`}>{monogram}</span>
        )}
      </div>
      <span
        className={`text-[10px] font-bold text-center leading-tight whitespace-nowrap ${
          active ? "text-emerald-600" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

// Football subcategory nav: All → World Cup 2026 → enabled competitions.
export default function LeagueNav({ active }: { active: "all" | "wc" | number }) {
  const [leagues, setLeagues] = useState<LeagueConfig[]>([]);

  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLeagues(Array.isArray(d?.leagues) ? d.leagues : []))
      .catch(() => {});
  }, []);

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 pb-1">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        <Chip href="/" label="All" active={active === "all"} logo="/icons/sports/football.svg" />
        <Chip href="/world-cup" label="World Cup 2026" active={active === "wc"} logo="/icons/brands/fifa.svg" />
        {leagues.map((l) => (
          <Chip
            key={l.league_id}
            href={`/league/${l.league_id}`}
            label={l.label}
            active={active === l.league_id}
            logo={l.logo_url || LOGOS[l.league_id]}
          />
        ))}
      </div>
    </section>
  );
}
