"use client";

import { useEffect, useState } from "react";
import MatchRow from "@/components/MatchRow";
import { Match } from "@/lib/api";

const HOUR = 60 * 60 * 1000;

// Left cell: static time/date normally, but a live MM:SS countdown in the final hour
// before kickoff (all sports). `now` stays null until mount to avoid hydration mismatch.
export function StartCell({ date, timeStr, dateStr }: { date: number; timeStr: string; dateStr: string }) {
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
      <>
        <p className="text-[13px] sm:text-[15px] font-extrabold text-emerald-500 tabular-nums leading-none">{mm}:{ss}</p>
        <p className="text-[7px] sm:text-[8px] font-bold text-emerald-500/80 tracking-widest mt-1 flex items-center justify-center gap-1">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> STARTS IN
        </p>
      </>
    );
  }

  if (diff <= 0) {
    return <p className="text-[10px] sm:text-[11px] font-extrabold text-emerald-500">STARTING…</p>;
  }

  return (
    <>
      <p className="text-[10px] sm:text-[11px] font-bold text-emerald-500">{timeStr}</p>
      <p className="text-[8px] sm:text-[9px] font-semibold text-gray-400 mt-0.5">{dateStr}</p>
    </>
  );
}

// Upcoming-fixture row used by the home page, sport pages, league pages and the
// watch page's "MORE UPCOMING" list. Layout lives in MatchRow; this only adds
// the kickoff time / countdown in the left cell.
export default function UpcomingRow({
  match,
  showSport = true,
}: {
  match: Match;
  showSport?: boolean;
}) {
  if (!match) return null;
  const d = new Date(match.date || Date.now());
  const dateStr = d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <MatchRow
      match={match}
      showSport={showSport}
      left={<StartCell date={match.date} timeStr={timeStr} dateStr={dateStr} />}
    />
  );
}
