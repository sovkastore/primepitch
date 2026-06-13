"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Match, getWatchHref, getBadgeUrl, SPORT_LABELS, showVersus } from "@/lib/api";
import { getCountryFlagUrl } from "@/lib/country-flags";

const HOUR = 60 * 60 * 1000;

// Left cell: static time/date normally, but a live MM:SS countdown in the final hour
// before kickoff (all sports). `now` stays null until mount to avoid hydration mismatch.
function StartCell({ date, timeStr, dateStr }: { date: number; timeStr: string; dateStr: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (date - Date.now() > HOUR) return; // far off — no ticking needed
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [date]);

  const diff = now === null ? Infinity : date - now;

  if (diff > 0 && diff <= HOUR) {
    const total = Math.floor(diff / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return (
      <div className="shrink-0 w-14 sm:w-20 text-center">
        <p className="text-[13px] sm:text-[15px] font-extrabold text-emerald-500 tabular-nums leading-none">{mm}:{ss}</p>
        <p className="text-[7px] sm:text-[8px] font-bold text-emerald-500/80 tracking-widest mt-1 flex items-center justify-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> STARTS IN
        </p>
      </div>
    );
  }

  if (diff <= 0) {
    return (
      <div className="shrink-0 w-14 sm:w-20 text-center">
        <p className="text-[10px] sm:text-[11px] font-extrabold text-emerald-500">STARTING…</p>
      </div>
    );
  }

  return (
    <div className="shrink-0 w-14 sm:w-20 text-center">
      <p className="text-[10px] sm:text-[11px] font-bold text-emerald-500">{timeStr}</p>
      <p className="text-[8px] sm:text-[9px] font-semibold text-gray-400 mt-0.5">{dateStr}</p>
    </div>
  );
}

// Lazy-loaded team badge that shows a neutral placeholder instead of vanishing
// when the image fails — keeps long lists from dropping logos on slow connections.
function RowBadge({ badge, name }: { badge?: string; name?: string }) {
  const [badgeFailed, setBadgeFailed] = useState(false);
  const [flagFailed, setFlagFailed] = useState(false);

  // 1. streamed.pk team badge
  if (badge && !badgeFailed) {
    return (
      <img
        src={getBadgeUrl(badge)}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0"
        onError={() => setBadgeFailed(true)}
      />
    );
  }
  // 2. country flag (national teams that have no badge, e.g. World Cup fixtures)
  const flagUrl = name ? getCountryFlagUrl(name) : null;
  if (flagUrl && !flagFailed) {
    return (
      <img
        src={flagUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0 rounded-sm"
        onError={() => setFlagFailed(true)}
      />
    );
  }
  // 3. No image from the feed — render nothing rather than an empty circle that
  // looks like it's still waiting for a logo/photo. (Real badges keep their
  // fixed w/h via the <img>, so this causes no layout shift.)
  return null;
}

// Admin-toggled HOT badge: red/orange gradient pill with a pulsing glow and a
// flickering flame — deliberately eye-catching for flagship fixtures.
function HotBadge() {
  return (
    <span className="relative inline-flex shrink-0 items-center" aria-label="Hot fixture">
      <span
        className="relative inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-2 py-[3px] text-[9px] font-black uppercase tracking-wider text-white ring-1 ring-red-300/70 animate-hot-glow"
      >
        <span className="animate-hot-flame">🔥</span> HOT
      </span>
    </span>
  );
}

// Shared upcoming-fixture row used by the home page, sport pages and the watch
// page's "MORE UPCOMING" list. Team names stay on a single line at a compact
// size so the full names show instead of collapsing to "I… vs M…".
export default function UpcomingRow({
  match,
  showSport = true,
}: {
  match: Match;
  showSport?: boolean;
}) {
  const d = new Date(match.date);
  const dateStr = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const href = getWatchHref(match);
  const hasTeams = showVersus(match);
  const label = SPORT_LABELS[match.category] || match.category;
  const hot = !!match.hot;

  return (
    <Link href={href} className="group block">
      <div
        className={
          "flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4 rounded-2xl transition-colors border " +
          (hot
            ? "bg-red-50 border-red-200 ring-1 ring-red-200 hover:bg-red-100"
            : "bg-gray-50 hover:bg-gray-100 border-gray-100")
        }
      >
        <StartCell date={match.date} timeStr={timeStr} dateStr={dateStr} />
        <div className={"w-px h-8 shrink-0 " + (hot ? "bg-red-200" : "bg-gray-200")} />
        {hasTeams ? (
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
            <RowBadge badge={match.teams!.home!.badge} name={match.teams!.home!.name} />
            <span className="text-[10px] sm:text-[11px] font-bold text-gray-800 whitespace-nowrap shrink-0">{match.teams!.home!.name}</span>
            <span className="text-[8px] sm:text-[9px] text-gray-400 font-extrabold shrink-0 px-0.5">VS</span>
            <span className="text-[10px] sm:text-[11px] font-bold text-gray-800 whitespace-nowrap shrink-0">{match.teams!.away!.name}</span>
            <RowBadge badge={match.teams!.away!.badge} name={match.teams!.away!.name} />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold text-gray-800 truncate">{match.title}</p>
          </div>
        )}
        {hot && <HotBadge />}
        {showSport && (
          <span className="hidden sm:inline text-[9px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 font-bold">{label}</span>
        )}
      </div>
    </Link>
  );
}
