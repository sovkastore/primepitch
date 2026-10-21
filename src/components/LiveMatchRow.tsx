"use client";

import { useEffect, useState } from "react";
import MatchRow from "@/components/MatchRow";
import { Match, isFinishedStatus } from "@/lib/api";
import type { LiveScore } from "@/lib/use-batch-scores";

// Left cell of a live row. Three states:
//   • kickoff still ahead (the match joined the live list early) → MM:SS countdown
//   • live → pulsing LIVE, with the score and minute when the feed has them
//   • finished → grey FT with the final score
function LiveCell({ match, score, ended }: { match: Match; score: LiveScore | null; ended: boolean }) {
  const kickoff = match.date || 0;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!kickoff || kickoff <= Date.now()) return; // already started — nothing to count down
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [kickoff]);

  const hasScore = !!score && Number.isFinite(score.home) && Number.isFinite(score.away);
  const scoreText = hasScore ? `${score!.home}-${score!.away}` : "";

  if (ended) {
    return (
      <>
        <p className="text-[10px] sm:text-[11px] font-extrabold text-gray-400 tracking-wide">FT</p>
        {hasScore && <p className="text-[10px] font-bold text-gray-500 tabular-nums mt-0.5">{scoreText}</p>}
      </>
    );
  }

  const diff = now === null || !kickoff ? 0 : kickoff - now;
  if (diff > 0) {
    const total = Math.floor(diff / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");
    return (
      <>
        <p className="text-[13px] sm:text-[15px] font-extrabold text-red-500 tabular-nums leading-none">{mm}:{ss}</p>
        <p className="text-[7px] sm:text-[8px] font-bold text-red-500/80 tracking-widest mt-1 flex items-center justify-center gap-1">
          <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" /> STARTS IN
        </p>
      </>
    );
  }

  const detail = hasScore
    ? score!.period === "HT"
      ? `${scoreText} · HT`
      : score!.minute
        ? `${scoreText} · ${score!.minute}'`
        : scoreText
    : "";

  return (
    <>
      <p className="text-[10px] sm:text-[11px] font-extrabold text-red-500 tracking-wide flex items-center justify-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE
      </p>
      {detail && <p className="text-[10px] font-bold text-gray-700 tabular-nums mt-0.5 whitespace-nowrap">{detail}</p>}
    </>
  );
}

// Live-fixture row: the same compact row as Upcoming, with LIVE / score / FT in
// the left cell. Ended rows are not clickable — an honest "this finished".
export default function LiveMatchRow({
  match,
  score = null,
  showSport = true,
}: {
  match: Match;
  score?: LiveScore | null;
  showSport?: boolean;
}) {
  if (!match) return null;
  // Ended = admin forced it (manual "End now"), or the score feed reports the
  // match finished (extra-time / penalties safe).
  const ended = match.ended === true || isFinishedStatus(score?.status);

  return (
    <MatchRow
      match={match}
      tone={ended ? "ended" : "live"}
      showSport={showSport}
      clickable={!ended}
      left={<LiveCell match={match} score={score} ended={ended} />}
    />
  );
}
