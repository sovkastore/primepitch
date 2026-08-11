"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  chipRef,
  invertInactive,
}: {
  href: string;
  label: string;
  active: boolean;
  logo?: string;
  chipRef?: React.Ref<HTMLAnchorElement>;
  invertInactive?: boolean;
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
    <Link ref={chipRef} href={href} className="flex flex-col items-center gap-1 shrink-0 w-[52px]">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
          active ? "bg-emerald-500 shadow-lg shadow-emerald-500/25" : "bg-gray-100 hover:bg-gray-200"
        }`}
      >
        {showImg ? (
          <img
            src={logo}
            alt={label}
            className={`w-5 h-5 object-contain ${invertInactive && !active ? "invert opacity-60" : ""}`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className={`text-[10px] font-black ${active ? "text-white" : "text-gray-500"}`}>{monogram}</span>
        )}
      </div>
      <span
        className={`text-[9px] font-bold text-center leading-tight ${
          active ? "text-emerald-600" : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

// Football subcategory nav: All → Alt → World Cup 2026 → enabled competitions.
export default function LeagueNav({ active }: { active: "all" | "wc" | "alt" | number }) {
  const [leagues, setLeagues] = useState<LeagueConfig[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    fetch("/api/leagues", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLeagues(Array.isArray(d?.leagues) ? d.leagues : []))
      .catch(() => {});
  }, []);

  // Keep the selected chip in view. Without this the row resets to the start on
  // every navigation, hiding the competition you just tapped if it was off-screen.
  useEffect(() => {
    const c = scrollerRef.current;
    const el = activeRef.current;
    if (!c || !el) return;
    const target = el.offsetLeft - c.clientWidth / 2 + el.offsetWidth / 2;
    c.scrollTo({ left: Math.max(0, target), behavior: "auto" });
  }, [active, leagues]);

  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 pb-1">
      <div ref={scrollerRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        <Chip href="/" label="All" active={active === "all"} logo="/icons/sports/football.svg" chipRef={active === "all" ? activeRef : undefined} />
        <Chip href="/alt" label="Alt" active={active === "alt"} logo="/icons/sports/football.svg" chipRef={active === "alt" ? activeRef : undefined} />
        <Chip href="/world-cup" label="World Cup 2026" active={active === "wc"} logo="/icons/brands/fifa.svg" chipRef={active === "wc" ? activeRef : undefined} invertInactive />
        {leagues.map((l) => (
          <Chip
            key={l.league_id}
            href={`/league/${l.league_id}`}
            label={l.label}
            active={active === l.league_id}
            logo={l.logo_url || LOGOS[l.league_id]}
            chipRef={active === l.league_id ? activeRef : undefined}
          />
        ))}
      </div>
    </section>
  );
}
