"use client";

import { useEffect, useState } from "react";
import { Match, getMatchKey } from "@/lib/api";
import { visibleInterval } from "@/lib/poll";

export interface LiveScore {
  home: number;
  away: number;
  minute: number | null;
  status?: string;
  period: string;
  league?: string | null;
}

/**
 * Fetches live scores for a whole list of matches with ONE request every
 * `ms` (default 90s), instead of each match card polling on its own.
 * Returns a map keyed by getMatchKey(match).
 */
export function useBatchScores(matches: Match[], ms = 90_000): Record<string, LiveScore> {
  const [scores, setScores] = useState<Record<string, LiveScore>>({});

  // A stable signature so the effect only restarts when the set of matches changes.
  const signature = matches
    .filter((m) => m.teams?.home?.name && m.teams?.away?.name)
    .map((m) => getMatchKey(m))
    .sort()
    .join("|");

  useEffect(() => {
    const withTeams = matches.filter((m) => m.teams?.home?.name && m.teams?.away?.name);
    if (withTeams.length === 0) {
      setScores({});
      return;
    }

    const pairs = withTeams.map((m) => ({
      key: getMatchKey(m),
      home: m.teams!.home!.name,
      away: m.teams!.away!.name,
    }));

    const fetchScores = () => {
      fetch("/api/live-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.scores) setScores(d.scores); })
        .catch(() => {});
    };

    return visibleInterval(fetchScores, ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ms]);

  return scores;
}
