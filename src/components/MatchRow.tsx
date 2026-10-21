"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Match, getWatchHref, getBadgeUrl, SPORT_LABELS, showVersus } from "@/lib/api";
import { getCountryFlagUrl } from "@/lib/country-flags";

// Lazy-loaded team badge that falls back to a country flag (national teams
// without a badge) and renders nothing at all when neither exists — never an
// empty placeholder that looks like it's still loading.
export function RowBadge({ badge, name }: { badge?: string; name?: string }) {
  const [badgeFailed, setBadgeFailed] = useState(false);
  const [flagFailed, setFlagFailed] = useState(false);

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
  return null;
}

// Admin-toggled HOT badge: red/orange gradient pill with a pulsing glow and a
// flickering flame — deliberately eye-catching for flagship fixtures.
export function HotBadge() {
  return (
    <span className="relative inline-flex shrink-0 items-center" aria-label="Hot fixture">
      <span className="relative inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-orange-500 px-2 py-[3px] text-[9px] font-black uppercase tracking-wider text-white ring-1 ring-red-300/70 animate-hot-glow">
        <span className="animate-hot-flame">🔥</span> HOT
      </span>
    </span>
  );
}

export type RowTone = "upcoming" | "live" | "ended" | "hot";

const TONE_CLASS: Record<RowTone, string> = {
  upcoming: "bg-gray-50 hover:bg-gray-100 border-gray-100",
  live: "bg-white hover:bg-red-50/40 border-red-100",
  ended: "bg-gray-50 border-gray-100 opacity-70",
  hot: "bg-red-50 border-red-300 ring-1 ring-red-200 hover:bg-red-100 animate-hot-glow",
};

// The one compact fixture row used everywhere (home, sport pages, league pages,
// live and upcoming alike). The caller supplies the left cell (time, countdown,
// LIVE + score, FT…); the row owns the rest: badges, names, HOT, sport label.
//
// Team names are allowed to wrap onto a second line instead of being clipped,
// so the full names always show — on Chrome as well as Firefox. The `match-row`
// class also switches off mobile Chrome's automatic text boosting, which was
// enlarging the names past the width we lay out for.
export default function MatchRow({
  match,
  left,
  tone = "upcoming",
  showSport = true,
  clickable = true,
  ariaPrefix = "Watch",
}: {
  match: Match;
  left: ReactNode;
  tone?: RowTone;
  showSport?: boolean;
  clickable?: boolean;
  ariaPrefix?: string;
}) {
  if (!match) return null;
  const href = getWatchHref(match);
  const hasTeams = showVersus(match);
  const homeName = match.teams?.home?.name || "";
  const awayName = match.teams?.away?.name || "";
  const twoTeams = !!(hasTeams && homeName && awayName);
  const label = (match.category && SPORT_LABELS[match.category]) || match.category || "";
  const hot = !!match.hot && tone !== "ended";
  const toneClass = TONE_CLASS[hot ? "hot" : tone];
  const title = twoTeams ? `${homeName} vs ${awayName}` : (match.title || "Match");

  return (
    <div className={"match-row group relative rounded-2xl transition-colors border " + toneClass}>
      {/* Stretched link: the whole row opens the stream. */}
      {clickable && (
        <Link href={href} aria-label={`${ariaPrefix} ${title}`} className="absolute inset-0 z-0 rounded-2xl" />
      )}
      <div className="relative z-10 pointer-events-none flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4">
        <div className="shrink-0 w-[52px] sm:w-20 text-center">{left}</div>
        <div className={"w-px h-8 shrink-0 " + (hot ? "bg-red-200" : tone === "live" ? "bg-red-100" : "bg-gray-200")} />
        {twoTeams ? (
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <RowBadge badge={match.teams?.home?.badge} name={homeName} />
            <span className="min-w-0 text-[11px] font-bold text-gray-800 leading-tight break-words">{homeName}</span>
            <span className="text-[8px] sm:text-[9px] text-gray-400 font-extrabold shrink-0 px-0.5">VS</span>
            <span className="min-w-0 text-[11px] font-bold text-gray-800 leading-tight break-words">{awayName}</span>
            <RowBadge badge={match.teams?.away?.badge} name={awayName} />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-gray-800 leading-tight break-words">{match.title || "Match"}</p>
          </div>
        )}
        {hot && <HotBadge />}
        {showSport && (
          <span className="hidden sm:inline text-[9px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg shrink-0 font-bold">{label}</span>
        )}
      </div>
    </div>
  );
}
